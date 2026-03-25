import { base44 } from '@/api/base44Client';

/**
 * Sends a pending bot message for a ServiceRequest from the frontend.
 * The backend sets pending_bot_message flag, frontend picks it up and sends
 * because only the frontend has permissions to interact with agent conversations.
 */
export async function sendPendingBotMessage(request) {
  if (!request?.pending_bot_message || !request?.conversation_id) return;

  const isValidConvId = /^[a-f0-9]{24}$/i.test(request.conversation_id) &&
                        request.conversation_id !== request.contact_id;
  if (!isValidConvId) return;

  try {
    console.log('Sending pending bot message:', request.pending_bot_message, 'for request:', request.id);

    // Trigger onServiceRequestUpdate to generate the bot message
    const botResult = await base44.functions.invoke('onServiceRequestUpdate', {
      event: { type: 'update', entity_name: 'ServiceRequest', entity_id: request.id },
      data: {
        ...request,
        status: request.pending_bot_message === 'questionnaire_completed' ? 'questionnaire_completed' : request.status,
      },
      old_data: {
        ...request,
        status: request.pending_bot_message === 'questionnaire_completed' ? 'pending' : request.status,
      },
    });

    console.log('Bot trigger result for pending message:', botResult?.data);

    // Send the bot message via agent conversation (frontend has permissions)
    const pending = botResult?.data?.pendingBotMessage;
    if (pending?.conversationId && pending?.message) {
      const conv = await base44.agents.getConversation(pending.conversationId);
      await base44.agents.addMessage(conv, { role: 'assistant', content: pending.message });
      await base44.entities.ServiceRequestTimeline.create({
        service_request_id: request.id,
        event_type: 'message_sent',
        description: `הודעת ${pending.botTrigger} נשלחה ל${pending.contactName} בשיחת הבוט`,
      });
      console.log('Pending bot message sent successfully');
    }

    // Clear the pending flag
    await base44.entities.ServiceRequest.update(request.id, { pending_bot_message: null });
    console.log('Cleared pending_bot_message flag');

  } catch (err) {
    console.error('Failed to send pending bot message:', err.message);
    // Don't clear the flag on error — will retry next time
  }
}