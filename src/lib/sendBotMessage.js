import { base44 } from '@/api/base44Client';
import { findAndSaveConversationId } from '@/lib/findConversationId';

// In-memory lock to prevent parallel sends for same request
const _sendingLock = new Set();

/**
 * Checks if a message with the same trigger was already sent in the last 5 minutes.
 * Prevents duplicate bot messages.
 */
async function wasTriggerRecentlySent(requestId, trigger) {
  const timeline = await base44.entities.ServiceRequestTimeline.filter(
    { service_request_id: requestId, event_type: 'message_sent' },
    '-created_date',
    10
  );
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  return timeline.some(t => {
    if (!t.description || !t.description.includes(trigger)) return false;
    const createdAt = new Date(t.created_date).getTime();
    return createdAt > fiveMinutesAgo;
  });
}

export async function handleBotMessage(requestId, { skipIfNoTrigger = false } = {}) {
  // Prevent parallel sends for same request (from onSuccess + Hook running simultaneously)
  if (_sendingLock.has(requestId)) {
    console.log('handleBotMessage: SKIPPING — already processing', requestId);
    return null;
  }
  _sendingLock.add(requestId);

  try {
    return await _handleBotMessageInternal(requestId, skipIfNoTrigger);
  } finally {
    // Release lock after a delay so the second caller also gets blocked
    setTimeout(() => _sendingLock.delete(requestId), 10000);
  }
}

async function _handleBotMessageInternal(requestId, skipIfNoTrigger = false) {
  // Wait for entity automation to finish writing its updates to DB
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Fetch fresh request data
  const requests = await base44.entities.ServiceRequest.filter({ id: requestId });
  const req = requests[0];
  if (!req) {
    console.log('handleBotMessage: request not found', requestId);
    return null;
  }

  // Find conversation_id if missing
  let conversationId = req.conversation_id;
  const isValid = (id) => /^[a-f0-9]{24}$/i.test(id || '') && id !== req.contact_id;
  if (!isValid(conversationId) && req.contact_phone) {
    conversationId = await findAndSaveConversationId(requestId, req.contact_phone);
  }

  // Check if automation already set pending_bot_message
  const trigger = req.pending_bot_message;
  if (trigger) {
    console.log('handleBotMessage: found existing trigger', trigger);

    // Dedupe: check if this trigger was already sent recently
    const alreadySent = await wasTriggerRecentlySent(requestId, trigger);
    if (alreadySent) {
      console.log('handleBotMessage: SKIPPING — trigger', trigger, 'was already sent in last 5 minutes');
      await base44.entities.ServiceRequest.update(requestId, { pending_bot_message: '' });
      return null;
    }

    await base44.entities.ServiceRequest.update(requestId, { pending_bot_message: '' });

    // Get the message from backend
    const botResult = await base44.functions.invoke('onServiceRequestUpdate', {
      event: { type: 'update', entity_name: 'ServiceRequest', entity_id: requestId },
      data: { ...req, status: trigger, conversation_id: conversationId },
      old_data: { ...req, status: 'previous' },
    });

    return await sendMessage(botResult?.data, requestId, trigger, conversationId);
  }

  // No trigger set yet — the entity automation hasn't run.
  // Call the backend directly with old_data.status='previous' and data.status=current status
  // The backend already supports this pattern for frontend-initiated triggers.
  const currentStatus = req.status;
  if (skipIfNoTrigger) {
    console.log('handleBotMessage: no trigger found and skipIfNoTrigger=true, aborting');
    return null;
  }

  console.log('handleBotMessage: no trigger yet, calling backend with status', currentStatus, 'for', requestId);
  
  const botResult = await base44.functions.invoke('onServiceRequestUpdate', {
    event: { type: 'update', entity_name: 'ServiceRequest', entity_id: requestId },
    data: { ...req, status: currentStatus, conversation_id: conversationId },
    old_data: { ...req, status: 'previous' },
  });

  const botTrigger = botResult?.data?.botTrigger;
  if (botTrigger) {
    // Dedupe: check if this trigger was already sent recently
    const alreadySent = await wasTriggerRecentlySent(requestId, botTrigger);
    if (alreadySent) {
      console.log('handleBotMessage: SKIPPING — trigger', botTrigger, 'was already sent in last 5 minutes');
      return null;
    }
    return await sendMessage(botResult?.data, requestId, botTrigger, conversationId);
  }

  console.log('handleBotMessage: no message needed for status', currentStatus);
  return null;
}

async function sendMessage(resultData, requestId, trigger, conversationId) {
  const pending = resultData?.pendingBotMessage;
  const effectiveConvId = pending?.conversationId || conversationId;

  console.log('sendMessage: start', { trigger, effectiveConvId, hasMessage: !!pending?.message, pendingConvId: pending?.conversationId, fallbackConvId: conversationId });

  if (!effectiveConvId || !pending?.message) {
    console.log('sendMessage: ABORT - no conversation or message');
    return null;
  }

  console.log('sendMessage: getting conversation', effectiveConvId);
  const conv = await base44.agents.getConversation(effectiveConvId);
  console.log('sendMessage: got conversation, sending message...');
  await base44.agents.addMessage(conv, { role: 'assistant', content: pending.message });
  console.log('sendMessage: message sent successfully!');

  await base44.entities.ServiceRequestTimeline.create({
    service_request_id: requestId,
    event_type: 'message_sent',
    description: `הודעת ${trigger} נשלחה אוטומטית`,
  });

  // Clear pending flag after successful send
  await base44.entities.ServiceRequest.update(requestId, { pending_bot_message: '' });

  console.log('sendMessage: completed', trigger, 'to', effectiveConvId);
  return { trigger, conversationId: effectiveConvId };
}