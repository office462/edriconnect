import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Find all pending messages
    const pending = await base44.asServiceRole.entities.WhatsAppMessageLog.filter({ status: 'pending_reply' });

    if (pending.length === 0) {
      return Response.json({ ok: true, processed: 0 });
    }

    console.log(`Processing ${pending.length} pending WhatsApp replies`);

    const instanceId = Deno.env.get('GREEN_API_INSTANCE_ID');
    const token = Deno.env.get('GREEN_API_TOKEN');
    let processed = 0;
    let errors = 0;

    for (const msg of pending) {
      try {
        // Timeout: if message is older than 5 minutes, mark as timeout
        const createdAt = new Date(msg.created_date);
        const ageMs = Date.now() - createdAt.getTime();
        if (ageMs > 5 * 60 * 1000) {
          console.log(`Message ${msg.id_message} timed out (${Math.round(ageMs / 1000)}s old)`);
          await base44.asServiceRole.entities.WhatsAppMessageLog.update(msg.id, { status: 'timeout' });
          continue;
        }

        if (!msg.conversation_id || !msg.chat_id) {
          await base44.asServiceRole.entities.WhatsAppMessageLog.update(msg.id, { status: 'error' });
          continue;
        }

        // Get conversation and look for bot reply
        const conversation = await base44.asServiceRole.agents.getConversation(msg.conversation_id);
        const messages = conversation.messages || [];
        const expectedCount = msg.message_count_at_send || 0;

        // Look for assistant message AFTER our user message
        let botReply = '';
        if (messages.length > expectedCount) {
          for (let i = messages.length - 1; i >= expectedCount; i--) {
            if (messages[i].role === 'assistant' && messages[i].content) {
              botReply = messages[i].content;
              break;
            }
          }
        }

        if (!botReply) {
          // Bot hasn't replied yet — will try again next run
          console.log(`No reply yet for ${msg.id_message} (${Math.round(ageMs / 1000)}s old)`);
          continue;
        }

        // Send reply via Green API
        const sendUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
        const sendResponse = await fetch(sendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: msg.chat_id, message: botReply }),
        });

        if (sendResponse.ok) {
          await base44.asServiceRole.entities.WhatsAppMessageLog.update(msg.id, { status: 'replied' });
          console.log(`Reply sent to ${msg.chat_id} for message ${msg.id_message}`);
          processed++;
        } else {
          const err = await sendResponse.json();
          console.error(`Failed to send to ${msg.chat_id}:`, err);
          await base44.asServiceRole.entities.WhatsAppMessageLog.update(msg.id, { status: 'error' });
          errors++;
        }
      } catch (err) {
        console.error(`Error processing message ${msg.id_message}:`, err.message);
        errors++;
      }
    }

    return Response.json({ ok: true, processed, errors, total: pending.length });
  } catch (error) {
    console.error('processWhatsAppReplies error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});