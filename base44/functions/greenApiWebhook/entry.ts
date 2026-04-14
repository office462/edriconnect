import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    // ===== SECURITY: Validate webhook secret =====
    const url = new URL(req.url);
    const secretParam = url.searchParams.get('secret') || '';
    const expectedSecret = Deno.env.get('GREEN_API_WEBHOOK_SECRET') || '';
    if (expectedSecret && secretParam !== expectedSecret) {
      console.error('Invalid webhook secret');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    // Validate instance ID
    const expectedInstanceId = Deno.env.get('GREEN_API_INSTANCE_ID');
    const incomingInstanceId = String(body.instanceData?.idInstance || '');
    if (incomingInstanceId !== expectedInstanceId) {
      console.error(`Invalid instance ID: ${incomingInstanceId}`);
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Only handle incoming text messages
    if (body.typeWebhook !== 'incomingMessageReceived') {
      return Response.json({ ok: true, skipped: true });
    }

    const messageData = body.messageData;
    const senderInfo = body.senderData;
    const chatId = senderInfo?.chatId || '';
    const phone = chatId.replace('@c.us', '');
    const idMessage = body.idMessage || '';

    // Extract text
    let text = '';
    if (messageData?.typeMessage === 'textMessage') {
      text = messageData.textMessageData?.textMessage || '';
    } else if (messageData?.typeMessage === 'extendedTextMessage') {
      text = messageData.extendedTextMessageData?.text || '';
    } else {
      return Response.json({ ok: true, skipped: true, reason: 'non-text' });
    }

    if (!text || !phone) {
      return Response.json({ ok: true, skipped: true });
    }

    console.log(`Incoming WhatsApp from ${phone}: "${text}"`);

    const base44 = createClientFromRequest(req);

    // ===== IDEMPOTENCY =====
    if (idMessage) {
      const existing = await base44.asServiceRole.entities.WhatsAppMessageLog.filter({ id_message: idMessage });
      if (existing.length > 0) {
        console.log(`Duplicate message ${idMessage}, skipping`);
        return Response.json({ ok: true, skipped: true, reason: 'duplicate' });
      }
    }

    // ===== BLOCK LIST =====
    const blockList = await base44.asServiceRole.entities.WhatsAppBlockList.list();
    const blockedPhones = blockList.map(b => b.phone.replace(/[\s\-\+]/g, ''));
    const normalizedPhone = phone;
    const localPhone = phone.startsWith('972') ? '0' + phone.substring(3) : phone;

    if (blockedPhones.includes(normalizedPhone) || blockedPhones.includes(localPhone)) {
      console.log(`Phone ${phone} is blocked`);
      if (idMessage) {
        await base44.asServiceRole.entities.WhatsAppMessageLog.create({
          id_message: idMessage, phone, direction: 'incoming',
          text: text.substring(0, 500), status: 'skipped', chat_id: chatId,
        });
      }
      return Response.json({ ok: true, skipped: true, reason: 'blocked' });
    }

    // ===== FIND CONTACT =====
    let contacts = await base44.asServiceRole.entities.Contact.filter({ phone: phone });
    if (contacts.length === 0 && phone.startsWith('972')) {
      contacts = await base44.asServiceRole.entities.Contact.filter({ phone: localPhone });
    }
    const contact = contacts.length > 0 ? contacts[0] : null;

    // ===== FIND SERVICE REQUEST =====
    let serviceRequest = null;
    if (contact) {
      const allRequests = await base44.asServiceRole.entities.ServiceRequest.filter({ contact_id: contact.id });
      if (allRequests.length > 0) {
        // Sort by created_date descending and take first
        allRequests.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
        serviceRequest = allRequests[0];
      }
    }

    // ===== FIND OR CREATE CONVERSATION =====
    const agentName = 'dr_adri_bot';
    let conversationId = serviceRequest?.conversation_id || null;
    let conversation;

    if (conversationId) {
      try {
        conversation = await base44.asServiceRole.agents.getConversation(conversationId);
      } catch (e) {
        console.log('Could not load existing conversation, creating new one');
        conversationId = null;
      }
    }

    if (!conversationId) {
      conversation = await base44.asServiceRole.agents.createConversation({
        agent_name: agentName,
        metadata: { name: contact?.full_name || phone, phone, source: 'whatsapp' },
      });
      conversationId = conversation.id;

      if (serviceRequest) {
        await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, {
          conversation_id: conversationId,
        });
      }
    }

    // Count messages BEFORE sending
    const msgCountBefore = (conversation.messages || []).length;

    // ===== SEND TO BOT =====
    await base44.asServiceRole.agents.addMessage(conversation, {
      role: 'user',
      content: text,
    });

    const expectedIndex = msgCountBefore + 1; // user message is at msgCountBefore, bot reply expected after

    // ===== LOG MESSAGE =====
    const logRecord = await base44.asServiceRole.entities.WhatsAppMessageLog.create({
      id_message: idMessage || `wa_${Date.now()}`,
      phone,
      direction: 'incoming',
      text: text.substring(0, 500),
      status: 'pending_reply',
      conversation_id: conversationId,
      chat_id: chatId,
      message_count_at_send: expectedIndex,
    });

    // ===== POLL FOR BOT REPLY (max 15 seconds) =====
    const instanceId = Deno.env.get('GREEN_API_INSTANCE_ID');
    const token = Deno.env.get('GREEN_API_TOKEN');
    let botReply = '';
    const pollStart = Date.now();

    while (Date.now() - pollStart < 15000) {
      await new Promise(r => setTimeout(r, 2000)); // wait 2s between checks

      const freshConv = await base44.asServiceRole.agents.getConversation(conversationId);
      const msgs = freshConv.messages || [];

      if (msgs.length > expectedIndex) {
        for (let i = msgs.length - 1; i >= expectedIndex; i--) {
          if (msgs[i].role === 'assistant' && msgs[i].content) {
            botReply = msgs[i].content;
            break;
          }
        }
        if (botReply) break;
      }
    }

    if (botReply) {
      // Send reply immediately via Green API
      const sendUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const sendResp = await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message: botReply }),
      });

      if (sendResp.ok) {
        await base44.asServiceRole.entities.WhatsAppMessageLog.update(logRecord.id, { status: 'replied' });
        console.log(`Bot reply sent immediately to ${chatId} (${Math.round((Date.now() - pollStart) / 1000)}s)`);
        return Response.json({ ok: true, replied: true });
      } else {
        console.error('Failed to send immediate reply:', await sendResp.text());
      }
    }

    // If we got here, bot didn't reply in time — processWhatsAppReplies will handle it
    console.log(`No bot reply within 15s for ${idMessage}. processWhatsAppReplies will handle.`);
    return Response.json({ ok: true, queued: true });
  } catch (error) {
    console.error('greenApiWebhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});