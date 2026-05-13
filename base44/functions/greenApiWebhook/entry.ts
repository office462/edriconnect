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

    // ===== TYPING INDICATOR — sent immediately, before any DB queries =====
    fetch(`https://api.green-api.com/waInstance${instanceId}/sendTyping/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, typingTime: 15000 }) }).catch(() => {});
    // Pre-fetch phone logs in background — runs parallel with all DB queries below
    const phoneLogsPromise = base44.asServiceRole.entities.WhatsAppMessageLog.filter({ phone }, '-created_date', 30);

    // ===== CHECK IF WHATSAPP BOT IS ENABLED (or test phone) =====
    console.log('Q1 start', Date.now());
    const [botEnabledSettings, cachedConvSetting] = await Promise.all([
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' }),
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'phone_conv_' + phone }),
    ]);
    console.log('Q1 done', Date.now());
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
      console.log('Q2 start', Date.now());
      const existing = await base44.asServiceRole.entities.WhatsAppMessageLog.filter({ id_message: idMessage });
      console.log('Q2 done', Date.now());
      if (existing.length > 0) {
        console.log(`Duplicate message ${idMessage}, skipping`);
        return Response.json({ ok: true, skipped: true, reason: 'duplicate' });
      }
    }

    // ===== BLOCK LIST =====
    console.log('Q3 start', Date.now());
    const blockList = await base44.asServiceRole.entities.WhatsAppBlockList.list();
    console.log('Q3 done', Date.now());
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
    console.log('Q4 start', Date.now());
    let contacts = await base44.asServiceRole.entities.Contact.filter({ phone: phone });
    console.log('Q4 done', Date.now());
    if (contacts.length === 0 && phone.startsWith('972')) {
      contacts = await base44.asServiceRole.entities.Contact.filter({ phone: localPhone });
    }
    const contact = contacts.length > 0 ? contacts[0] : null;

    // ===== FIND SERVICE REQUEST =====
    let serviceRequest = null;
    if (contact) {
      console.log('Q5 start', Date.now());
      const allRequests = await base44.asServiceRole.entities.ServiceRequest.filter({ contact_id: contact.id });
      console.log('Q5 done', Date.now());
      if (allRequests.length > 0) {
        allRequests.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
        serviceRequest = allRequests[0];
      }
    }

    // ===== BLOCK BOT IF PENDING ADMIN CHECK =====
    if (serviceRequest && serviceRequest.status === 'whatsapp_message_to_check') {
      console.log(`ServiceRequest ${serviceRequest.id} is pending admin check — blocking bot, sending fixed reply`);

      // Log incoming message
      await base44.asServiceRole.entities.WhatsAppMessageLog.create({
        id_message: idMessage || `wa_${Date.now()}`,
        phone, direction: 'incoming',
        text: text.substring(0, 500), status: 'skipped',
        chat_id: chatId,
      });

      // Fetch fixed reply from BotContent
      let replyText = 'הפנייה שלך נמצאת בטיפול הצוות 🙏 ברגע שנאשר — נמשיך אוטומטית. אין צורך לשלוח הודעות נוספות.';
      try {
        const pendingContent = await base44.asServiceRole.entities.BotContent.filter({ key: 'pending_admin_check_reply' });
        if (pendingContent.length > 0 && pendingContent[0].content) {
          replyText = pendingContent[0].content;
        }
      } catch (e) {
        console.warn('Could not fetch pending_admin_check_reply BotContent:', e.message);
      }

      // Send reply
      const sendUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message: replyText }),
      });

      // Log outgoing
      await base44.asServiceRole.entities.WhatsAppMessageLog.create({
        id_message: `out_${Date.now()}_blocked`,
        phone, direction: 'outgoing',
        text: replyText.substring(0, 500), status: 'replied',
        chat_id: chatId,
      });

      return Response.json({ ok: true, blocked: true, reason: 'pending_admin_check' });
    }

    // ===== SEND THINKING INDICATOR =====
    try {
      const existingLogs = await phoneLogsPromise;
      const isFirstMessage = existingLogs.length === 0;

      if (isFirstMessage) {
        // First message ever — send a warm greeting
        const firstMessages = [
          'תודה שפנית! 🌸 אני על זה, חוזרת אליך מיד',
          'שלום וברוכ/ה הבא/ה! 💜 מיד ממשיכה',
          'נעים להכיר! ✨ עוד שנייה איתך',
          'היי! קיבלתי 😊 רגע ואחזור אליך',
        ];
        const thinkingMsg = firstMessages[Math.floor(Math.random() * firstMessages.length)];
        const sendUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
        await fetch(sendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, message: thinkingMsg }),
        });
      } else {
        // Subsequent messages — just show typing indicator (no text)
        const typingUrl = `https://api.green-api.com/waInstance${instanceId}/sendTyping/${token}`;
        fetch(typingUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, typingTime: 15000 }),
        }).catch(() => {});
      }
    } catch (typErr) {
      console.warn('Thinking indicator failed:', typErr.message);
    }

    // ===== FIND OR CREATE CONVERSATION =====
    const agentName = 'dr_adri_bot';
    let conversationId = null;
    let conversation;

    // 1. Try from ServiceRequest
    if (serviceRequest?.conversation_id) {
      conversationId = serviceRequest.conversation_id;
    }

    // 2a. Fast cache check — avoids slow phone log scan
    if (!conversationId && cachedConvSetting?.length > 0 && cachedConvSetting[0].value) {
      conversationId = cachedConvSetting[0].value;
      console.log('Found conversation from phone cache:', conversationId);
    }
    // 2b. Fallback: find recent conversation for this phone from message logs
    if (!conversationId) {
      const recentLogs = await phoneLogsPromise;
      const withConv = recentLogs.filter(l => l.conversation_id);
      if (withConv.length > 0) {
        withConv.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
        conversationId = withConv[0].conversation_id;
        console.log(`Found conversation ${conversationId} from message logs`);
        // Cache for fast future lookups
        if (!cachedConvSetting?.length) {
          base44.asServiceRole.entities.SystemSetting.create({ key: 'phone_conv_' + phone, value: conversationId, category: 'whatsapp' }).catch(() => {});
        }
      }
    }

    // 3. Try to load existing conversation
    if (conversationId) {
      try {
        console.log('DIAG getConv start', Date.now());
        conversation = await base44.asServiceRole.agents.getConversation(conversationId);
        console.log('DIAG getConv done', Date.now());
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
        // Cache for fast future lookups
        base44.asServiceRole.entities.SystemSetting.create({ key: 'phone_conv_' + phone, value: conversationId, category: 'whatsapp' }).catch(() => {});
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
    // ===== REASSURANCE MESSAGE before LLM (user sees activity during long wait) =====
    if ((conversation.messages || []).length > 1) {
      const rMsgs = ['רגע קטן 💜', 'אני כבר על זה ✨', 'כמעט שם 🌸', 'ממש בדרך 🙏'];
      const rMsg = rMsgs[Math.floor(Math.random() * rMsgs.length)];
      const _su = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      await fetch(_su, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({chatId, message: rMsg}) }).catch(() => {});
            const _tu = `https://api.green-api.com/waInstance${instanceId}/sendTyping/${token}`;
          fetch(_tu, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ chatId, typingTime: 15000 }) }).then(r => r.text().then(t => console.log('TYPING_DIAG', r.status, t))).catch(e => console.error('TYPING_ERROR:', e.message));
    }

    // ===== FAST PATH: consultation disease selection (no LLM needed) =====
    {
      const DISEASE_MAP = {
        '1': 'פוריות', 'פוריות': 'פוריות',
        '2': 'הריון', 'הריון': 'הריון',
        '3': 'גיל המעבר', 'גיל המעבר': 'גיל המעבר', 'גיל': 'גיל המעבר',
        '4': 'סוכרת', 'סוכרת': 'סוכרת',
        '5': 'דיכאון', 'דיכאון': 'דיכאון',
        '6': 'מחלות מעי', 'מחלות מעי': 'מחלות מעי', 'מעי': 'מחלות מעי',
        '7': 'סרטן', 'סרטן': 'סרטן',
        '8': 'אוטיזם', 'אוטיזם': 'אוטיזם', 'אוטיזם ותסמונות גנטיות': 'אוטיזם',
      };
      const convMsgs = conversation.messages || [];
      const lastBotMsg = [...convMsgs].reverse().find(m => m.role === 'assistant')?.content || '';
      const isAtDiseaseMenu = serviceRequest?.service_type === 'consultation' && lastBotMsg.includes('פוריות');
      if (isAtDiseaseMenu) {
        const normalized = text.trim();
        const subType = DISEASE_MAP[normalized] || DISEASE_MAP[normalized.split(/[\s,\.]/)[0]];
        if (subType) {
          console.log(`FAST_PATH: disease selection "${subType}"`);
          let fastPathDone = false;
          try {
            const fpVideos = await base44.asServiceRole.entities.ServiceContent.filter({
              service_type: 'consultation', content_type: 'video', sub_type: subType,
            });
            if (fpVideos.length > 0) {
              await base44.asServiceRole.entities.WhatsAppMessageLog.create({
                id_message: idMessage || `wa_${Date.now()}`,
                phone, direction: 'incoming',
                text: text.substring(0, 500), status: 'replied',
                conversation_id: conversationId, chat_id: chatId,
              });
              const _mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
              await fetch(_mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, message: `מיד שולחת לך את המידע על ${subType} 💜` }) });
              const _fu = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;
              const _fpVideoUrl = fpVideos[0].url;
              const _fpVideoIsDirect = /\.(mp4|mov|avi|mkv|webm)(\?.*)?$/i.test(_fpVideoUrl);
              if (_fpVideoIsDirect) {
                await fetch(_fu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chatId, urlFile: _fpVideoUrl, fileName: `${subType}.mp4`, caption: '' }) });
              } else {
                await fetch(_mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chatId, message: _fpVideoUrl }) });
              }
              const isAutism = subType === 'אוטיזם';
              if (!isAutism) {
                const fpPdfs = await base44.asServiceRole.entities.ServiceContent.filter({
                  service_type: 'consultation', content_type: 'pdf', sub_type: subType,
                });
                if (fpPdfs.length > 0) {
                  await new Promise(r => setTimeout(r, 1000));
                  const _fpPdfUrl = fpPdfs[0].url;
                  const _fpPdfIsDirect = /\.pdf(\?.*)?$/i.test(_fpPdfUrl);
                  if (_fpPdfIsDirect) {
                    await fetch(_fu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ chatId, urlFile: _fpPdfUrl, fileName: `${subType}.pdf`, caption: '' }) });
                  } else {
                    await fetch(_mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ chatId, message: _fpPdfUrl }) });
                  }
                }
              }
              await new Promise(r => setTimeout(r, 1000));
              const confirmMsg = isAutism
                ? 'לאחר שצפית, אנא כתוב/י *"צפיתי"* 🌸'
                : 'לאחר שצפית וקראת, אנא כתוב/י *"צפיתי וקראתי"* 🌸';
              await fetch(_mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, message: confirmMsg }) });
              if (serviceRequest) {
                await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { sub_type: subType });
              }
              await base44.asServiceRole.entities.WhatsAppMessageLog.create({
                id_message: `out_${Date.now()}_fp`, phone, direction: 'outgoing',
                text: `[fast_path] ${subType}`, status: 'replied', chat_id: chatId,
              });
              fastPathDone = true;
            } else {
              console.log(`FAST_PATH: no video for "${subType}", falling to LLM`);
            }
          } catch (fpErr) {
            console.warn(`FAST_PATH error: ${fpErr.message} — falling to LLM`);
          }
          if (fastPathDone) return Response.json({ ok: true, fast_path: true, subType });
        }
      }
    }
    // ===== FAST PATH: FP-C1 — consultation "צפיתי" → topic selection =====
    {
      const _c1Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _c1Norm = text.trim().replace(/[*"'״]/g, '');
      console.log('FP-C1-DEBUG:', JSON.stringify({ stype: serviceRequest?.service_type, sub: serviceRequest?.sub_type, step: serviceRequest?.current_step, norm: _c1Norm }));
      if (
        serviceRequest?.service_type === 'consultation' &&
        !serviceRequest?.sub_type &&
        !serviceRequest?.current_step &&
        _c1Norm === 'צפיתי'
      ) {
        console.log('FAST_PATH: FP-C1 consultation tsafiti → topic selection');
        try {
          const _c1Contents = await base44.asServiceRole.entities.BotContent.filter({ key: 'consultation_topic_selection' });
          if (_c1Contents.length > 0) {
            await fetch(_c1Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _c1Contents[0].content }) });
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_topic_choice' });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming',
              text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: `out_${Date.now()}_fp_c1`, phone, direction: 'outgoing',
              text: '[fast_path_c1_topic_selection]', status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            return Response.json({ ok: true, fast_path: 'c1_topic_selection' });
          }
          console.log('FAST_PATH FP-C1: BotContent not found, falling to LLM');
        } catch (fpC1Err) {
          console.warn(`FAST_PATH FP-C1 error: ${fpC1Err.message} — falling to LLM`);
        }
      }
    }
    // ===== END FAST PATH =====

    // ===== SEND TO BOT =====
    console.log('DIAG addMsg start', Date.now());
    await base44.asServiceRole.agents.addMessage(conversation, {
      role: 'user',
      content: text,
    });

    console.log('DIAG addMsg done', Date.now());
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

    // ===== POLL FOR BOT REPLY (max 25 seconds) =====
    let botReply = '';
    const pollStart = Date.now();
    let lastTypingRefresh = pollStart;
    let sentReassurance = false;

    while (Date.now() - pollStart < 25000) {
      await new Promise(r => setTimeout(r, 500)); // wait 500ms between checks

      // Send reassurance after 15s if no reply yet (once only)
      if (!sentReassurance && Date.now() - pollStart > 15000) {
        sentReassurance = true;
        const rMsgs = ['אל דאגה, אני עוד כאן ✨', 'אני עובד/ת, את/ה יכול/ה לשתות קפה בינתיים ☕', 'עוד קצת סבלנות, כמעט שם 💜', 'זה לוקח רגע, אבל ממש בדרך! 🌸'];
        const rMsg = rMsgs[Math.floor(Math.random() * rMsgs.length)];
        fetch(`https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: rMsg }) }).catch(() => {});
      }

      // Refresh typing indicator every 4s with short 5s bursts (avoids blocking Green API queue)
      if (Date.now() - lastTypingRefresh > 4000) {
        lastTypingRefresh = Date.now();
        try {
          const typingUrl = `https://api.green-api.com/waInstance${instanceId}/sendTyping/${token}`;
          fetch(typingUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, typingTime: 5000 }),
          }).catch(() => {});
        } catch (_) {}
      }

      const freshConv = await base44.asServiceRole.agents.getConversation(conversationId);
      const msgs = freshConv.messages || [];

      if (msgs.length > expectedIndex) {
        for (let i = msgs.length - 1; i >= expectedIndex; i--) {
          if (msgs[i].role === 'assistant' && msgs[i].content && msgs[i].content !== '<empty message>') {
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

    // If we got here, bot didn't reply in time — send a friendly fallback message
    console.log(`No bot reply within 25s for ${idMessage}. Sending fallback message.`);
    try {
      const fallbackMessages = [
        'עדיין עובד/ת על זה, אל דאגה! ⏳ תגובה בדרך',
        'עוד רגע קט! 🌸 כמעט שם',
        'עדיין מטפלת בזה, תיכף חוזרת! 💜',
        'רגע נוסף, ממש בדרך! ✨',
      ];
      const fallbackMsg = fallbackMessages[Math.floor(Math.random() * fallbackMessages.length)];
      const sendUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message: fallbackMsg }),
      });
      console.log(`Fallback message sent to ${chatId}: "${fallbackMsg}"`);
    } catch (fallbackErr) {
      console.warn('Fallback message failed:', fallbackErr.message);
    }

    // processWhatsAppReplies will send the actual bot reply later
    return Response.json({ ok: true, queued: true });
  } catch (error) {
    console.error('greenApiWebhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});