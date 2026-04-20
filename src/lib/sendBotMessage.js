import { base44 } from '@/api/base44Client';
import { findAndSaveConversationId } from '@/lib/findConversationId';

// Permanent set of triggers already sent (requestId:trigger) — never retry
const _sentTriggers = new Set();
// In-memory lock per requestId
const _sendingLock = new Map();

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

export async function handleBotMessage(requestId, { skipIfNoTrigger = false, trigger = null } = {}) {
  // Lock per requestId:trigger — prevents duplicate sends for same trigger,
  // but allows different triggers for the same request (e.g. paid then questionnaire)
  const lockKey = trigger ? `${requestId}:${trigger}` : requestId;
  if (_sendingLock.has(lockKey)) {
    console.log('handleBotMessage: SKIPPING — locked for', lockKey);
    return null;
  }
  _sendingLock.set(lockKey, Date.now());

  try {
    return await _handleBotMessageInternal(requestId, skipIfNoTrigger);
  } finally {
    // Keep lock for 30s (enough to prevent rapid duplicates, short enough for next steps)
    setTimeout(() => _sendingLock.delete(lockKey), 30000);
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
    const triggerKey = `${requestId}:${trigger}`;

    // Permanent dedupe: never send same trigger twice
    if (_sentTriggers.has(triggerKey)) {
      console.log('handleBotMessage: SKIPPING — already sent', triggerKey);
      // Still clear the flag
      await base44.entities.ServiceRequest.update(requestId, { pending_bot_message: '' }).catch(() => {});
      return null;
    }

    console.log('handleBotMessage: found existing trigger', trigger);

    // Dedupe: check if this trigger was already sent recently
    const alreadySent = await wasTriggerRecentlySent(requestId, trigger);
    if (alreadySent) {
      console.log('handleBotMessage: SKIPPING — trigger', trigger, 'was already sent in last 5 minutes');
      _sentTriggers.add(triggerKey);
      await base44.entities.ServiceRequest.update(requestId, { pending_bot_message: '' }).catch(() => {});
      return null;
    }

    // Clear flag BEFORE processing to prevent re-triggers
    await base44.entities.ServiceRequest.update(requestId, { pending_bot_message: '' }).catch(() => {});

    // Get the message from backend
    const botResult = await base44.functions.invoke('onServiceRequestUpdate', {
      event: { type: 'update', entity_name: 'ServiceRequest', entity_id: requestId },
      data: { ...req, status: trigger, conversation_id: conversationId },
      old_data: { ...req, status: 'previous' },
    });

    const result = await sendMessage(botResult?.data, requestId, trigger, conversationId);
    if (result) _sentTriggers.add(triggerKey);
    return result;
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
    const result2 = await sendMessage(botResult?.data, requestId, botTrigger, conversationId);
    if (result2) _sentTriggers.add(`${requestId}:${botTrigger}`);
    return result2;
  }

  console.log('handleBotMessage: no message needed for status', currentStatus);
  return null;
}

async function isWhatsAppBotEnabled() {
  try {
    const settings = await base44.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' });
    const setting = settings[0];
    if (!setting) return false;
    return setting.value === 'true' || setting.value === true;
  } catch {
    return false;
  }
}

async function sendMessage(resultData, requestId, trigger, conversationId) {
  // Check if WhatsApp bot is enabled FIRST — before any sending
  const botEnabled = await isWhatsAppBotEnabled();
  if (!botEnabled) {
    console.log('sendMessage: SKIPPING ALL — WhatsApp bot is disabled (demo mode)');
    return null;
  }

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

  // Also send via WhatsApp if contact has phone
  const contactPhone = pending.contactPhone;
  if (contactPhone) {
    try {
      await base44.functions.invoke('sendWhatsAppMessage', {
        phone: contactPhone,
        message: pending.message,
      });
      console.log('sendMessage: WhatsApp copy also sent');
    } catch (waErr) {
      console.warn('sendMessage: Failed to send WhatsApp copy:', waErr.message);
    }
  }

  await base44.entities.ServiceRequestTimeline.create({
    service_request_id: requestId,
    event_type: 'message_sent',
    description: `הודעת ${trigger} נשלחה אוטומטית`,
  });

  console.log('sendMessage: completed', trigger, 'to', effectiveConvId);
  return { trigger, conversationId: effectiveConvId };
}