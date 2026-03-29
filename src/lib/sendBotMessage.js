import { base44 } from '@/api/base44Client';
import { findAndSaveConversationId } from '@/lib/findConversationId';

/**
 * After a status change, waits for the entity automation to set pending_bot_message,
 * then fetches the bot message and sends it via WhatsApp.
 */
export async function handleBotMessage(requestId) {
  // Wait for the entity automation to run and set pending_bot_message
  await new Promise(r => setTimeout(r, 3000));

  // Fetch fresh request data
  const requests = await base44.entities.ServiceRequest.filter({ id: requestId });
  const req = requests[0];
  if (!req) {
    console.log('handleBotMessage: request not found', requestId);
    return null;
  }

  const trigger = req.pending_bot_message;
  if (!trigger) {
    console.log('handleBotMessage: no pending_bot_message for', requestId, '- checking raw data:', JSON.stringify({ status: req.status, pending_bot_message: req.pending_bot_message }));
    return null;
  }

  console.log('handleBotMessage: found trigger', trigger, 'for', requestId);

  // Clear flag immediately
  await base44.entities.ServiceRequest.update(requestId, { pending_bot_message: '' });

  // Find conversation_id
  let conversationId = req.conversation_id;
  const isValid = (id) => /^[a-f0-9]{24}$/i.test(id || '') && id !== req.contact_id;
  if (!isValid(conversationId) && req.contact_phone) {
    conversationId = await findAndSaveConversationId(requestId, req.contact_phone);
  }
  if (!conversationId) {
    console.log('handleBotMessage: no conversation_id for', requestId);
    return null;
  }

  // Get the bot message from onServiceRequestUpdate
  const botResult = await base44.functions.invoke('onServiceRequestUpdate', {
    event: { type: 'update', entity_name: 'ServiceRequest', entity_id: requestId },
    data: { ...req, status: trigger, conversation_id: conversationId },
    old_data: { ...req, status: 'previous' },
  });

  const pending = botResult?.data?.pendingBotMessage;
  if (!pending?.conversationId || !pending?.message) {
    console.log('handleBotMessage: no message from backend', JSON.stringify(botResult?.data));
    return null;
  }

  // Send message via frontend (which has permission)
  const conv = await base44.agents.getConversation(pending.conversationId);
  await base44.agents.addMessage(conv, { role: 'assistant', content: pending.message });

  await base44.entities.ServiceRequestTimeline.create({
    service_request_id: requestId,
    event_type: 'message_sent',
    description: `הודעת ${trigger} נשלחה אוטומטית`,
  });

  console.log('handleBotMessage: sent', trigger, 'to', pending.conversationId);
  return { trigger, conversationId: pending.conversationId };
}