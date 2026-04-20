import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Check if WhatsApp bot is enabled
    const botSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' });
    const botEnabled = botSettings.length > 0 && botSettings[0].value === 'true';
    if (!botEnabled) {
      console.log('processWhatsAppReplies: bot disabled, skipping');
      return Response.json({ ok: true, processed: 0, reason: 'bot_disabled' });
    }

    // ===== PROCESS PENDING BOT MESSAGES — clear flags but don't send (bot already confirmed enabled above) =====
    const instanceId = Deno.env.get('GREEN_API_INSTANCE_ID');
    const token = Deno.env.get('GREEN_API_TOKEN');

    const allRequests = await base44.asServiceRole.entities.ServiceRequest.list('-updated_date', 50);
    const pendingBotRequests = allRequests.filter(r => r.pending_bot_message && r.pending_bot_message.length > 0);

    for (const sr of pendingBotRequests) {
      try {
        console.log(`processWhatsAppReplies: found pending_bot_message=${sr.pending_bot_message} for ${sr.id}`);

        // Call onServiceRequestUpdate to generate the message
        const botResult = await base44.asServiceRole.functions.invoke('onServiceRequestUpdate', {
          event: { type: 'update', entity_name: 'ServiceRequest', entity_id: sr.id },
          data: { ...sr, status: sr.pending_bot_message, conversation_id: sr.conversation_id },
          old_data: { ...sr, status: 'previous' },
        });

        const pendingMsg = botResult?.pendingBotMessage;
        if (pendingMsg?.message && pendingMsg?.contactPhone) {
          // Send via WhatsApp
          let cleanPhone = pendingMsg.contactPhone.replace(/[\s\-\+]/g, '');
          if (cleanPhone.startsWith('0')) cleanPhone = '972' + cleanPhone.substring(1);
          const sendUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
          const sendResp = await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: `${cleanPhone}@c.us`, message: pendingMsg.message }),
          });
          if (sendResp.ok) {
            console.log(`processWhatsAppReplies: sent pending bot message to ${cleanPhone}`);
          }

          // Also add to bot conversation if available
          if (pendingMsg.conversationId && /^[a-f0-9]{24}$/i.test(pendingMsg.conversationId)) {
            try {
              const conv = await base44.asServiceRole.agents.getConversation(pendingMsg.conversationId);
              await base44.asServiceRole.agents.addMessage(conv, { role: 'assistant', content: pendingMsg.message });
            } catch (convErr) {
              console.warn('processWhatsAppReplies: conv error:', convErr.message);
            }
          }

          // Log in timeline
          await base44.asServiceRole.entities.ServiceRequestTimeline.create({
            service_request_id: sr.id,
            event_type: 'message_sent',
            description: `הודעת ${pendingMsg.botTrigger || sr.pending_bot_message} נשלחה אוטומטית (processWhatsAppReplies)`,
          });
        }

        // Clear the flag
        await base44.asServiceRole.entities.ServiceRequest.update(sr.id, { pending_bot_message: '' });
      } catch (pendErr) {
        console.warn('processWhatsAppReplies: pending bot error:', pendErr.message);
      }
    }

    // ===== PROCESS PENDING WHATSAPP REPLIES =====
    // Find all pending messages
    const pending = await base44.asServiceRole.entities.WhatsAppMessageLog.filter({ status: 'pending_reply' });

    if (pending.length === 0) {
      return Response.json({ ok: true, processed: 0 });
    }

    console.log(`Processing ${pending.length} pending WhatsApp replies`);

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