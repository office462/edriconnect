import { base44 } from '@/api/base44Client';
import { findAndSaveConversationId } from '@/lib/findConversationId';

/**
 * After a status change, checks if the backend set a pending_bot_message,
 * fetches the bot message from onServiceRequestUpdate, and sends it via WhatsApp.
 * Called from the frontend (which has permission to access conversations).
 */
export async function handleBotMessage(requestId) {
  // Wait a moment for the entity automation to run and set pending_bot_message
  await new Promise(r => setTimeout(r, 2000));

  // Re-fetch the request to see if pending_bot_message was set
  const [updatedReq] = await base44.entities.ServiceRequest.filter({ id: requestId });
  if (!updatedReq?.pending_bot_message) {
    console.log('handleBotMessage: no pending_bot_message for', requestId);
    return null;
  }

  const trigger = updatedReq.pending_bot_message;
  console.log('handleBotMessage: found trigger', trigger, 'for', requestId);

  // Clear flag immediately to prevent duplicate sends
  await base44.entities.ServiceRequest.update(requestId, { pending_bot_message: null });

  // Find conversation_id
  let conversationId = updatedReq.conversation_id;
  const isValid = (id) => /^[a-f0-9]{24}$/i.test(id || '') && id !== updatedReq.contact_id;
  if (!isValid(conversationId) && updatedReq.contact_phone) {
    conversationId = await findAndSaveConversationId(requestId, updatedReq.contact_phone);
  }
  if (!conversationId) {
    console.log('handleBotMessage: no conversation_id found for', requestId);
    return null;
  }

  // Call onServiceRequestUpdate with 'previous' trick to get the bot message
  const botResult = await base44.functions.invoke('onServiceRequestUpdate', {
    event: { type: 'update', entity_name: 'ServiceRequest', entity_id: requestId },
    data: { ...updatedReq, status: trigger, conversation_id: conversationId },
    old_data: { ...updatedReq, status: 'previous' },
  });

  const pending = botResult?.data?.pendingBotMessage;
  if (!pending?.conversationId || !pending?.message) {
    console.log('handleBotMessage: no message returned from backend', botResult?.data);
    return null;
  }

  // Send the message (frontend has permission)
  const conv = await base44.agents.getConversation(pending.conversationId);
  await base44.agents.addMessage(conv, { role: 'assistant', content: pending.message });

  // Log in timeline
  await base44.entities.ServiceRequestTimeline.create({
    service_request_id: requestId,
    event_type: 'message_sent',
    description: `הודעת ${trigger} נשלחה אוטומטית`,
  });

  console.log('handleBotMessage: sent', trigger, 'to', pending.conversationId);
  return { trigger, conversationId: pending.conversationId };
}