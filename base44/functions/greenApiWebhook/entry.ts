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

    // ===== IGNORE GROUP MESSAGES =====
    if (chatId.endsWith('@g.us') || chatId.includes('@g.us')) {
      return Response.json({ ok: true, skipped: true, reason: 'group_message' });
    }

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
    const instanceId = Deno.env.get('GREEN_API_INSTANCE_ID');
    const token = Deno.env.get('GREEN_API_TOKEN');

    // ===== CHECK IF WHATSAPP BOT IS ENABLED (or test phone) =====
    const botEnabledSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' });
    const botEnabled = botEnabledSettings.length > 0 && botEnabledSettings[0].value === 'true';
    
    if (!botEnabled) {
      // Check if this phone is in the test list
      const testPhoneSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_test_phones' });
      const testPhonesStr = testPhoneSettings.length > 0 ? testPhoneSettings[0].value : '';
      const testPhones = testPhonesStr.split(',').map(p => p.trim().replace(/[\s\-\+]/g, '')).filter(Boolean);
      // Normalize test phones to 972 format
      const normalizedTestPhones = testPhones.map(p => p.startsWith('0') ? '972' + p.substring(1) : p);
      
      if (!normalizedTestPhones.includes(phone)) {
        console.log(`WhatsApp bot is disabled and ${phone} is not a test phone. Skipping.`);
        return Response.json({ ok: true, skipped: true, reason: 'bot_disabled' });
      }
      console.log(`WhatsApp bot is disabled but ${phone} is a test phone — processing.`);
    }

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

    // ===== SEND FRIENDLY THINKING MESSAGE (skip for farewell/greeting messages) =====
    const farewellPatterns = [
      'תודה', 'תודה רבה', 'יום טוב', 'יום נפלא', 'שבוע טוב', 'שבוע נהדר',
      'גם לך', 'גם לך תודה', 'לילה טוב', 'ערב טוב', 'בוקר טוב',
      'שמחתי', 'שמחתי לשוחח', 'להתראות', 'ביי', 'bye', 'thanks',
      'חג שמח', 'שבת שלום', 'סופ"ש נעים', 'סוף שבוע טוב',
    ];
    const textLower = text.trim().replace(/[!?.،,\u200f\u200e]/g, '').trim();
    const isFarewellMessage = farewellPatterns.some(p => textLower === p || textLower.startsWith(p + ' '));

    if (!isFarewellMessage) {
      try {
        const existingLogs = await base44.asServiceRole.entities.WhatsAppMessageLog.filter({ phone: phone });
        const isFirstMessage = existingLogs.length === 0;

        let thinkingMsg;
        if (isFirstMessage) {
          const firstMessages = [
            'נעים מאוד! 🌸 איתך עוד רגע קט',
            'שלום וברוכ/ה הבא/ה! 💜 רגע ואחזור אליך',
            'נעים להכיר! ✨ עוד שנייה איתך',
          ];
          thinkingMsg = firstMessages[Math.floor(Math.random() * firstMessages.length)];
        } else {
          const returningMessages = [
            'היי! קיבלתי 🙌 רגע בודקת ואחזור אליך מיד',
            'קיבלתי את ההודעה! ⏳ רגע מכינה לך תשובה...',
            'שנייה אחת! 💫 מטפלת בזה עכשיו',
            'הודעה התקבלה ✨ עוד רגע קט חוזרת אליך!',
            'רגע, אני כאן! 🌸 מעבדת את המידע...',
            'קיבלתי! 😊 תן/י לי רגע ואחזור עם תשובה',
            'אני על זה! 💜 חוזרת אליך תיכף',
            'מעולה, התקבל! 🎯 רגע מכינה תשובה מותאמת',
          ];
          thinkingMsg = returningMessages[Math.floor(Math.random() * returningMessages.length)];
        }

        const typingUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
        await fetch(typingUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, message: thinkingMsg }),
        });
      } catch (typErr) {
        console.warn('Thinking message failed:', typErr.message);
      }
    } else {
      console.log(`Farewell message detected ("${text}"), skipping thinking message`);
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
        allRequests.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
        serviceRequest = allRequests[0];
      }
    }

    // ===== FIND OR CREATE CONVERSATION =====
    const agentName = 'dr_adri_bot';
    let conversationId = null;
    let conversation;

    // 1. Try from ServiceRequest
    if (serviceRequest?.conversation_id) {
      conversationId = serviceRequest.conversation_id;
    }

    // 2. Fallback: find recent conversation for this phone from message logs
    if (!conversationId) {
      const recentLogs = await base44.asServiceRole.entities.WhatsAppMessageLog.filter({ phone: phone });
      const withConv = recentLogs.filter(l => l.conversation_id);
      if (withConv.length > 0) {
        withConv.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
        conversationId = withConv[0].conversation_id;
        console.log(`Found conversation ${conversationId} from message logs`);
      }
    }

    // 3. Try to load existing conversation
    if (conversationId) {
      try {
        conversation = await base44.asServiceRole.agents.getConversation(conversationId);
      } catch (e) {
        console.log('Could not load existing conversation, creating new one');
        conversationId = null;
        // Clear stale conversation_id from ServiceRequest so it doesn't block future attempts
        if (serviceRequest) {
          try {
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { conversation_id: '' });
          } catch (clearErr) {
            console.warn('Failed to clear stale conversation_id:', clearErr.message);
          }
        }
      }
    }

    // 4. Create new if needed
    if (!conversationId) {
      try {
        conversation = await base44.asServiceRole.agents.createConversation({
          agent_name: agentName,
          metadata: { name: contact?.full_name || phone, phone, source: 'whatsapp' },
        });
        conversationId = conversation.id;
      } catch (createErr) {
        console.error('Failed to create conversation:', createErr.message);
        return Response.json({ error: 'Failed to create conversation' }, { status: 500 });
      }

      if (serviceRequest) {
        await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, {
          conversation_id: conversationId,
        });
      }
    }

    // Ensure ServiceRequest has conversation_id synced
    if (serviceRequest && serviceRequest.conversation_id !== conversationId) {
      await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, {
        conversation_id: conversationId,
      });
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
    let botReply = '';
    const pollStart = Date.now();

    while (Date.now() - pollStart < 15000) {
      await new Promise(r => setTimeout(r, 800)); // wait 800ms between checks

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
      // Parse [FILE:url:filename] tags from bot reply
      const fileTagRegex = /\[FILE:(https?:\/\/[^\]:]+):([^\]]+)\]/g;
      const filesToSend = [];
      let cleanText = botReply;
      let match;
      while ((match = fileTagRegex.exec(botReply)) !== null) {
        filesToSend.push({ url: match[1], fileName: match[2] });
        cleanText = cleanText.replace(match[0], '');
      }
      cleanText = cleanText.replace(/\n{3,}/g, '\n\n').trim();

      // 1. Send clean text message
      let sendOk = true;
      if (cleanText) {
        const sendUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
        const sendResp = await fetch(sendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, message: cleanText }),
        });
        if (!sendResp.ok) {
          console.error('Failed to send text:', await sendResp.text());
          sendOk = false;
        }
      }

      // 2. Send each file as a separate message
      for (const file of filesToSend) {
        try {
          const fileUrl = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;
          const fileResp = await fetch(fileUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, urlFile: file.url, fileName: file.fileName, caption: '' }),
          });
          if (fileResp.ok) {
            console.log(`File sent: ${file.fileName}`);
          } else {
            console.error(`Failed to send file ${file.fileName}:`, await fileResp.text());
          }
        } catch (fileErr) {
          console.error(`File send error: ${fileErr.message}`);
        }
      }

      if (sendOk) {
        await base44.asServiceRole.entities.WhatsAppMessageLog.update(logRecord.id, { status: 'replied' });
        await base44.asServiceRole.entities.WhatsAppMessageLog.create({
          id_message: `out_${Date.now()}`,
          phone,
          direction: 'outgoing',
          text: botReply.substring(0, 500),
          status: 'replied',
          chat_id: chatId,
          conversation_id: conversationId,
        });
        console.log(`Bot reply sent to ${chatId} (${filesToSend.length} files, ${Math.round((Date.now() - pollStart) / 1000)}s)`);
        return Response.json({ ok: true, replied: true, files: filesToSend.length });
      } else {
        console.error('Failed to send immediate reply');
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