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
    const localPhone = phone.startsWith('972') ? '0' + phone.substring(3) : phone;

    // ===== BLOCK LIST + BOT ENABLED + IDEMPOTENCY — all checked BEFORE any message is sent =====
    const [botEnabledSettings, cachedConvSetting, blockList, idempotencyCheck] = await Promise.all([
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' }),
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'phone_conv_' + phone }),
      base44.asServiceRole.entities.WhatsAppBlockList.list(),
      idMessage ? base44.asServiceRole.entities.WhatsAppMessageLog.filter({ id_message: idMessage }) : Promise.resolve([]),
    ]);

    // --- Block list (checked first — no messages sent to blocked phones!) ---
    const blockedPhones = blockList.map(b => b.phone.replace(/[\s\-\+]/g, ''));
    if (blockedPhones.includes(phone) || blockedPhones.includes(localPhone)) {
      console.log(`Phone ${phone} is blocked`);
      if (idMessage) {
        await base44.asServiceRole.entities.WhatsAppMessageLog.create({
          id_message: idMessage, phone, direction: 'incoming',
          text: text.substring(0, 500), status: 'skipped', chat_id: chatId,
        });
      }
      return Response.json({ ok: true, skipped: true, reason: 'blocked' });
    }

    // --- Idempotency ---
    if (idMessage && idempotencyCheck.length > 0) {
      console.log(`Duplicate message ${idMessage}, skipping`);
      return Response.json({ ok: true, skipped: true, reason: 'duplicate' });
    }

    // --- Bot enabled check ---
    const botEnabled = botEnabledSettings.length > 0 && botEnabledSettings[0].value === 'true';
    if (!botEnabled) {
      const testPhoneSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_test_phones' });
      const testPhonesStr = testPhoneSettings.length > 0 ? testPhoneSettings[0].value : '';
      const testPhones = testPhonesStr.split(',').map(p => p.trim().replace(/[\s\-\+]/g, '')).filter(Boolean);
      const normalizedTestPhones = testPhones.map(p => p.startsWith('0') ? '972' + p.substring(1) : p);
      if (!normalizedTestPhones.includes(phone)) {
        console.log(`WhatsApp bot is disabled and ${phone} is not a test phone. Skipping.`);
        return Response.json({ ok: true, skipped: true, reason: 'bot_disabled' });
      }
      console.log(`WhatsApp bot is disabled but ${phone} is a test phone — processing.`);
    }

    // ===== RATE LIMITER — max 10 outgoing messages per phone per hour =====
    const RATE_LIMIT_PER_HOUR = 10;
    const phoneLogsPromise = base44.asServiceRole.entities.WhatsAppMessageLog.filter({ phone }, '-created_date', 30);
    const recentOutgoing = (await phoneLogsPromise).filter(l =>
      l.direction === 'outgoing' &&
      (Date.now() - new Date(l.created_date).getTime()) < 60 * 60 * 1000
    );
    if (recentOutgoing.length >= RATE_LIMIT_PER_HOUR) {
      console.log(`RATE_LIMIT: ${phone} has ${recentOutgoing.length} outgoing msgs in last hour (limit ${RATE_LIMIT_PER_HOUR}). Blocking.`);
      await base44.asServiceRole.entities.WhatsAppMessageLog.create({
        id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming',
        text: text.substring(0, 500), status: 'skipped', chat_id: chatId,
      });
      return Response.json({ ok: true, skipped: true, reason: 'rate_limited' });
    }

    // ===== TYPING INDICATOR — only after all safety checks pass =====
    fetch(`https://api.green-api.com/waInstance${instanceId}/sendTyping/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, typingTime: 15000 }) }).catch(() => {});

    // ===== FIND CONTACT =====
    console.log('Q4 start', Date.now());
    let contacts = await base44.asServiceRole.entities.Contact.filter({ phone: phone });
    console.log('Q4 done', Date.now());
    if (contacts.length === 0 && phone.startsWith('972')) {
      contacts = await base44.asServiceRole.entities.Contact.filter({ phone: localPhone });
    }
    let contact = contacts.length > 0 ? contacts[0] : null;

    // ===== CONTACT COMPLETENESS CHECK — if missing fields, treat as no contact (LLM will collect) =====
    if (contact && (!contact.full_name || !contact.phone || !contact.email)) {
      console.log(`Contact ${contact.id} missing fields (name=${!!contact.full_name}, phone=${!!contact.phone}, email=${!!contact.email}) — falling to LLM for collection`);
      contact = null;
    }

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

    // ===== FALLBACK: load ServiceRequest by conversation_id if not found via contact =====
    if (!serviceRequest && conversationId) {
      try {
        const _srByConv = await base44.asServiceRole.entities.ServiceRequest.filter({ conversation_id: conversationId });
        if (_srByConv.length > 0) {
          serviceRequest = _srByConv[_srByConv.length - 1];
          console.log('ServiceRequest found via conversation_id fallback:', serviceRequest.id, serviceRequest.service_type);
        }
      } catch (_srFbErr) {
        console.warn('ServiceRequest fallback lookup failed:', _srFbErr.message);
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
    // ===== TYPING INDICATOR before LLM (no text message — just typing bubble) =====
    fetch(`https://api.green-api.com/waInstance${instanceId}/sendTyping/${token}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ chatId, typingTime: 15000 }) }).catch(() => {});

    // ===== FAST PATH: FP-PL-QR — post_lecture QR message → send PDF immediately (no details first!) =====
    {
      const _plqNorm = text.trim();
      const _plqMatch = _plqNorm.match(/אשמח לקבל את הסיכום של ההרצאה[\s\-–—]*(.+)/i) ||
                         _plqNorm.match(/סיכום.*הרצאה[\s\-–—]*(.+)/i);
      if (_plqMatch) {
        const _plqLectureName = _plqMatch[1].replace(/[״"']/g, '').trim();
        console.log(`FAST_PATH: FP-PL-QR detected post_lecture for "${_plqLectureName}"`);
        try {
          const _plqMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
          const _plqFu = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;

          // Find PDF in ServiceContent by partial match on sub_type
          const _plqAllPdfs = await base44.asServiceRole.entities.ServiceContent.filter({
            service_type: 'post_lecture', content_type: 'pdf',
          });
          const _plqNameLower = _plqLectureName.toLowerCase();
          let _plqPdf = _plqAllPdfs.find(p => p.sub_type && p.sub_type.toLowerCase() === _plqNameLower);
          if (!_plqPdf) _plqPdf = _plqAllPdfs.find(p => p.sub_type && (_plqNameLower.includes(p.sub_type.toLowerCase()) || p.sub_type.toLowerCase().includes(_plqNameLower)));
          if (!_plqPdf) _plqPdf = _plqAllPdfs.find(p => {
            const words = _plqNameLower.split(/\s+/);
            return words.some(w => w.length > 2 && p.sub_type && p.sub_type.toLowerCase().includes(w));
          });

          if (_plqPdf && _plqPdf.url) {
            // Create ServiceRequest (without contact — will be collected later)
            let _plqSr = serviceRequest;
            if (!_plqSr || _plqSr.service_type !== 'post_lecture') {
              const _plqSrData = {
                contact_id: contact?.id || 'pending',
                contact_name: contact?.full_name || '',
                contact_phone: localPhone || phone,
                service_type: 'post_lecture',
                status: 'new_lead',
                conversation_id: conversationId,
                sub_type: _plqPdf.sub_type,
              };
              _plqSr = await base44.asServiceRole.entities.ServiceRequest.create(_plqSrData);
              console.log(`Created ServiceRequest ${_plqSr.id} for post_lecture`);
            }

            // Send BotContent post_lecture_pdf_sent
            const _plqBc = await base44.asServiceRole.entities.BotContent.filter({ key: 'post_lecture_pdf_sent' });
            const _plqMsg = _plqBc.length > 0
              ? _plqBc[0].content.replace('{שם_הרצאה}', _plqPdf.sub_type)
              : `הנה הסיכום של ההרצאה ${_plqPdf.sub_type} 🌸\nלאחר שקראת, אנא רשמ/י "קראתי".`;
            await fetch(_plqMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _plqMsg }) });

            // Send PDF file
            await new Promise(r => setTimeout(r, 1500));
            const _plqIsDirect = /\.pdf(\?.*)?$/i.test(_plqPdf.url);
            if (_plqIsDirect) {
              await fetch(_plqFu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, urlFile: _plqPdf.url, fileName: `סיכום הרצאה - ${_plqPdf.sub_type}.pdf`, caption: '' }) });
            } else {
              await fetch(_plqMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, message: _plqPdf.url }) });
            }

            await base44.asServiceRole.entities.ServiceRequest.update(_plqSr.id, { current_step: 'awaiting_post_lecture_karati' });

            // Log
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming',
              text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: `out_${Date.now()}_fp_plq`, phone, direction: 'outgoing',
              text: `[fast_path_pl_qr_pdf_sent] ${_plqPdf.sub_type}`, status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            try {
              await base44.asServiceRole.agents.addMessage(conversation, { role: 'user', content: text });
              await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: _plqMsg });
            } catch (_) {}
            return Response.json({ ok: true, fast_path: 'pl_qr_pdf_sent', lecture: _plqPdf.sub_type });
          }
          console.log(`FAST_PATH FP-PL-QR: no PDF found for "${_plqLectureName}", falling to LLM`);
        } catch (plqErr) {
          console.warn(`FAST_PATH FP-PL-QR error: ${plqErr.message} — falling to LLM`);
        }
      }
    }

    // ===== FAST PATH: FP-0 — welcome message for new user (first message ever) =====
    // Condition: no Contact yet + no cached conversation (cachedConvSetting empty = truly first message)
    if (!contact && (!cachedConvSetting || cachedConvSetting.length === 0)) {
      console.log('FAST_PATH: FP-0 welcome for new user');
      try {
        const _fp0Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
        const _fp0Contents = await base44.asServiceRole.entities.BotContent.filter({ key: 'greeting' });
        if (_fp0Contents.length > 0) {
          await fetch(_fp0Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, message: _fp0Contents[0].content }) });
          await base44.asServiceRole.entities.WhatsAppMessageLog.create({
            id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming',
            text: text.substring(0, 500), status: 'replied', chat_id: chatId,
            conversation_id: conversationId,
          });
          await base44.asServiceRole.entities.WhatsAppMessageLog.create({
            id_message: `out_${Date.now()}_fp0`, phone, direction: 'outgoing',
            text: '[fast_path_fp0_greeting]', status: 'replied', chat_id: chatId,
            conversation_id: conversationId,
          });
          // Add user message so LLM has context on next turn (avoids re-sending greeting)
          try {
            await base44.asServiceRole.agents.addMessage(conversation, { role: 'user', content: text });
          } catch (_) {}
          return Response.json({ ok: true, fast_path: 'fp0_greeting' });
        }
        console.log('FAST_PATH FP-0: BotContent not found, falling to LLM');
      } catch (fp0Err) {
        console.warn(`FAST_PATH FP-0 error: ${fp0Err.message} — falling to LLM`);
      }
    }

    // ===== FAST PATH: FP-Details — parse name+phone+email and send confirmation =====
    {
      const _detMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _detNeedsContact = !contact || !contact.full_name || !contact.email || !contact.phone;
      if (_detNeedsContact) {
        const _detEmailMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
        const _detPhoneMatch = text.replace(/[\-\s]/g, '').match(/0[5]\d{8}/);
        if (_detEmailMatch && _detPhoneMatch) {
          const _detEmail = _detEmailMatch[0].toLowerCase().trim();
          const _detPhone = _detPhoneMatch[0];
          const _detName = text
            .replace(_detEmailMatch[0], '')
            .replace(/0[5][\d\-\s]{8,12}/g, '')
            .replace(/שמי?\s*/gi, '').replace(/מספרי?\s*/gi, '')
            .replace(/טלפון:?\s*/gi, '').replace(/מייל:?\s*/gi, '').replace(/email:?\s*/gi, '')
            .replace(/[,;:]/g, ' ').replace(/\s+/g, ' ').trim();
          if (_detName.length >= 2) {
            console.log(`FAST_PATH: FP-Details parsed name="${_detName}" phone="${_detPhone}" email="${_detEmail}"`);
            const _detKey = `pending_contact_${phone}`;
            const _detData = JSON.stringify({ name: _detName, phone: _detPhone, email: _detEmail });
            const _detExisting = await base44.asServiceRole.entities.SystemSetting.filter({ key: _detKey });
            if (_detExisting.length > 0) {
              await base44.asServiceRole.entities.SystemSetting.update(_detExisting[0].id, { value: _detData });
            } else {
              await base44.asServiceRole.entities.SystemSetting.create({ key: _detKey, value: _detData, category: 'whatsapp' });
            }
            const _detConfirmMsg = `הפרטים שלך:\n📛 שם: ${_detName}\n📱 טלפון: ${_detPhone}\n📧 מייל: ${_detEmail}\n\nהאם הכל נכון? כתוב/י *כן* לאישור או תקנ/י את הפרט השגוי.`;
            await fetch(_detMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _detConfirmMsg }) });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming',
              text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: `out_${Date.now()}_fp_det`, phone, direction: 'outgoing',
              text: '[fast_path_details_confirm]', status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            try {
              await base44.asServiceRole.agents.addMessage(conversation, { role: 'user', content: text });
              await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: _detConfirmMsg });
            } catch (_) {}
            return Response.json({ ok: true, fast_path: 'fp_details_confirm' });
          }
        }
      }
    }

    // ===== FAST PATH: FP-DetailsConfirm — "כן" after details → create Contact + send welcome =====
    {
      const _dcMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _dcNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      const _dcPositive = ['כן', 'נכון', 'הכל נכון', 'כן נכון', 'בטח', 'כמובן', 'אוקי', 'ok', 'סבבה', '👍', '✅'].includes(_dcNorm);
      if (_dcPositive && !contact) {
        const _dcKey = `pending_contact_${phone}`;
        const _dcSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: _dcKey });
        if (_dcSettings.length > 0) {
          try {
            const _dcData = JSON.parse(_dcSettings[0].value);
            console.log(`FAST_PATH: FP-DetailsConfirm saving Contact for ${_dcData.name}`);
            // Check if contact already exists (prevent duplicates)
            const _dcExisting = await base44.asServiceRole.entities.Contact.filter({ phone: _dcData.phone });
            if (_dcExisting.length === 0) {
              await base44.asServiceRole.entities.Contact.create({
                full_name: _dcData.name, phone: _dcData.phone, email: _dcData.email, source: 'whatsapp',
              });
            } else {
              console.log(`Contact with phone ${_dcData.phone} already exists, skipping create`);
            }
            await base44.asServiceRole.entities.SystemSetting.delete(_dcSettings[0].id).catch(() => {});
            const _dcWelcomeContents = await base44.asServiceRole.entities.BotContent.filter({ key: 'welcome' });
            const _dcWelcomeMsg = _dcWelcomeContents.length > 0 ? _dcWelcomeContents[0].content : 'ברוכ/ה הבא/ה! 😊';
            await fetch(_dcMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _dcWelcomeMsg }) });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming',
              text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: `out_${Date.now()}_fp_dc`, phone, direction: 'outgoing',
              text: '[fast_path_details_saved_welcome]', status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            try {
              await base44.asServiceRole.agents.addMessage(conversation, { role: 'user', content: text });
              await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: _dcWelcomeMsg });
            } catch (_) {}
            return Response.json({ ok: true, fast_path: 'fp_details_saved' });
          } catch (dcErr) {
            console.warn(`FP-DetailsConfirm error: ${dcErr.message} — falling to LLM`);
            await base44.asServiceRole.entities.SystemSetting.delete(_dcSettings[0].id).catch(() => {});
          }
        }
      }
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
      const isAtDiseaseMenu = serviceRequest?.service_type === 'consultation' &&
        serviceRequest?.current_step === 'awaiting_disease_selection';
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
              let fpPdfs = [];
              if (!isAutism) {
                fpPdfs = await base44.asServiceRole.entities.ServiceContent.filter({
                  service_type: 'consultation', content_type: 'pdf', sub_type: subType,
                });
                if (fpPdfs.length > 0 && fpPdfs[0].url) {
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
              const confirmMsg = (fpPdfs.length > 0 && fpPdfs[0].url)
                ? 'לאחר שצפית וקראת, אנא כתוב/י *"צפיתי וקראתי"* 🌸'
                : 'לאחר שצפית, אנא כתוב/י *"צפיתי"* 🌸';
              await fetch(_mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, message: confirmMsg }) });
              if (serviceRequest) {
                await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { sub_type: subType, current_step: '' });
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
    // ===== FAST PATH: FP-C2 — consultation "1"/autism choice → autism video =====
    {
      const _c2Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _c2Fu = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;
      const _c2Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      const _c2Choices = ['1', 'אוטיזם', 'אוטיזם ותסמונות גנטיות'];
      if (
        serviceRequest?.service_type === 'consultation' &&
        serviceRequest?.current_step === 'awaiting_topic_choice' &&
        _c2Choices.includes(_c2Norm)
      ) {
        console.log('FAST_PATH: FP-C2 autism topic selected');
        try {
          const _c2Videos = await base44.asServiceRole.entities.ServiceContent.filter({
            service_type: 'consultation', content_type: 'video', sub_type: 'אוטיזם',
          });
          if (_c2Videos.length > 0) {
            const _c2Url = _c2Videos[0].url;
            const _c2IsDirect = /\.(mp4|mov|avi|mkv|webm)(\?.*)?$/i.test(_c2Url);
            await fetch(_c2Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: 'מיד שולחת לך את הסרטון על אוטיזם 💜' }) });
            if (_c2IsDirect) {
              await fetch(_c2Fu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, urlFile: _c2Url, fileName: 'אוטיזם.mp4', caption: '' }) });
            } else {
              await fetch(_c2Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, message: _c2Url }) });
            }
            await fetch(_c2Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: 'לאחר שצפית, אנא כתוב/י *"צפיתי"* 🌸' }) });
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, {
              sub_type: 'אוטיזם', current_step: 'awaiting_tsafiti_autism',
            });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming',
              text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: `out_${Date.now()}_fp_c2`, phone, direction: 'outgoing',
              text: '[fast_path_c2_autism]', status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            return Response.json({ ok: true, fast_path: 'c2_autism' });
          }
          console.log('FAST_PATH FP-C2: ServiceContent not found, falling to LLM');
        } catch (fpC2Err) {
          console.warn(`FAST_PATH FP-C2 error: ${fpC2Err.message} — falling to LLM`);
        }
      }
    }
    // ===== FAST PATH: FP-C3 — consultation "2"/chronic → chronic diseases menu =====
    {
      const _c3Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _c3Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      const _c3Choices = ['2', 'מחלות', 'מחלות כרוניות', 'מחלות כרוניות אחרות'];
      if (
        serviceRequest?.service_type === 'consultation' &&
        serviceRequest?.current_step === 'awaiting_topic_choice' &&
        _c3Choices.includes(_c3Norm)
      ) {
        console.log('FAST_PATH: FP-C3 chronic diseases menu');
        try {
          const _c3Contents = await base44.asServiceRole.entities.BotContent.filter({ key: 'consultation_chronic_diseases' });
          if (_c3Contents.length > 0) {
            await fetch(_c3Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _c3Contents[0].content }) });
            // Set current_step so disease selection FP can fire
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, {
              current_step: 'awaiting_disease_selection',
            });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming',
              text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: `out_${Date.now()}_fp_c3`, phone, direction: 'outgoing',
              text: '[fast_path_c3_chronic_menu]', status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            return Response.json({ ok: true, fast_path: 'c3_chronic_menu' });
          }
          console.log('FAST_PATH FP-C3: BotContent not found, falling to LLM');
        } catch (fpC3Err) {
          console.warn(`FAST_PATH FP-C3 error: ${fpC3Err.message} — falling to LLM`);
        }
      }
    }
    // ===== FAST PATH: FP-C4 — consultation autism tsafiti → additional reading =====
    {
      const _c4Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _c4Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (
        serviceRequest?.service_type === 'consultation' &&
        serviceRequest?.sub_type === 'אוטיזם' &&
        _c4Norm === 'צפיתי'
      ) {
        console.log('FAST_PATH: FP-C4 autism tsafiti → additional reading');
        try {
          const _c4Contents = await base44.asServiceRole.entities.BotContent.filter({ key: 'additional_reading_offer' });
          if (_c4Contents.length > 0) {
            await fetch(_c4Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _c4Contents[0].content }) });
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_additional_reading_response' });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming',
              text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: `out_${Date.now()}_fp_c4`, phone, direction: 'outgoing',
              text: '[fast_path_c4_additional_reading]', status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            return Response.json({ ok: true, fast_path: 'c4_additional_reading' });
          }
          console.log('FAST_PATH FP-C4: BotContent not found, falling to LLM');
        } catch (fpC4Err) {
          console.warn(`FAST_PATH FP-C4 error: ${fpC4Err.message} — falling to LLM`);
        }
      }
    }
    // ===== FAST PATH: FP-C6 — awaiting_additional_reading_response + "כן" → send URL + continue_process_question =====
    {
      const _c6Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _c6Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      const _c6Positive = ['כן','בטח','אשמח','כמובן','יאללה','קדימה','סבבה','אוקי','ok','בוא נמשיך','רוצה','מעוניינת'].includes(_c6Norm);
      if (
        serviceRequest?.service_type === 'consultation' &&
        serviceRequest?.current_step === 'awaiting_additional_reading_response' &&
        _c6Positive
      ) {
        console.log('FAST_PATH: FP-C6 additional reading yes → send URL + continue_process_question');
        try {
          const _c6Sc = await base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'consultation', content_type: 'external_link', sub_type: 'additional_reading' });
          const _c6Cq = await base44.asServiceRole.entities.BotContent.filter({ key: 'continue_process_question' });
          if (_c6Sc.length > 0 && _c6Sc[0].url && _c6Cq.length > 0) {
            await fetch(_c6Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _c6Sc[0].url }) });
            await fetch(_c6Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _c6Cq[0].content }) });
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_continue_process' });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming',
              text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: `out_${Date.now()}_fp_c6`, phone, direction: 'outgoing',
              text: '[fast_path_c6_additional_reading_url]', status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            return Response.json({ ok: true, fast_path: 'c6_additional_reading_yes' });
          }
          console.log('FAST_PATH FP-C6: content not found, falling to LLM');
        } catch (fpC6Err) {
          console.warn(`FAST_PATH FP-C6 error: ${fpC6Err.message} — falling to LLM`);
        }
      }
    }

    // ===== FAST PATH: FP-C7 — awaiting_additional_reading_response + "לא" → privacy message (step 5) =====
    {
      const _c7Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _c7Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      const _c7Negative = ['לא','לא תודה','לא עכשיו','לא צריך','לא רוצה'].includes(_c7Norm);
      if (
        serviceRequest?.service_type === 'consultation' &&
        serviceRequest?.current_step === 'awaiting_additional_reading_response' &&
        _c7Negative
      ) {
        console.log('FAST_PATH: FP-C7 additional reading no → privacy message');
        try {
          const _c7Contents = await base44.asServiceRole.entities.BotContent.filter({ key: 'consultation_privacy_message' });
          if (_c7Contents.length > 0) {
            await fetch(_c7Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _c7Contents[0].content }) });
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_privacy_response' });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming',
              text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: `out_${Date.now()}_fp_c7`, phone, direction: 'outgoing',
              text: '[fast_path_c7_privacy]', status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            return Response.json({ ok: true, fast_path: 'c7_skip_reading_to_privacy' });
          }
          console.log('FAST_PATH FP-C7: content not found, falling to LLM');
        } catch (fpC7Err) {
          console.warn(`FAST_PATH FP-C7 error: ${fpC7Err.message} — falling to LLM`);
        }
      }
    }

    // ===== FAST PATH: FP-C8 — awaiting_continue_process + "כן" → privacy message (step 5) =====
    {
      const _c8Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _c8Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      const _c8Positive = ['כן','בטח','אשמח','כמובן','יאללה','קדימה','סבבה','אוקי','ok','בוא נמשיך','רוצה','מעוניינת'].includes(_c8Norm);
      if (
        serviceRequest?.service_type === 'consultation' &&
        serviceRequest?.current_step === 'awaiting_continue_process' &&
        _c8Positive
      ) {
        console.log('FAST_PATH: FP-C8 continue process yes → privacy message');
        try {
          const _c8Contents = await base44.asServiceRole.entities.BotContent.filter({ key: 'consultation_privacy_message' });
          if (_c8Contents.length > 0) {
            await fetch(_c8Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _c8Contents[0].content }) });
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_privacy_response' });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming',
              text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: `out_${Date.now()}_fp_c8`, phone, direction: 'outgoing',
              text: '[fast_path_c8_privacy]', status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            return Response.json({ ok: true, fast_path: 'c8_continue_to_privacy' });
          }
          console.log('FAST_PATH FP-C8: content not found, falling to LLM');
        } catch (fpC8Err) {
          console.warn(`FAST_PATH FP-C8 error: ${fpC8Err.message} — falling to LLM`);
        }
      }
    }
    // ===== FAST PATH: FP-C9 — awaiting_privacy_response + "כן" → send questionnaire link =====
    {
      const _c9Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _c9Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      const _c9Positive = ['כן','בטח','אשמח','כמובן','יאללה','קדימה','סבבה','אוקי','ok','כו','בוא נמשיך','רוצה','מעוניינת'].includes(_c9Norm);
      if (
        serviceRequest?.service_type === 'consultation' &&
        serviceRequest?.current_step === 'awaiting_privacy_response' &&
        _c9Positive
      ) {
        console.log('FAST_PATH: FP-C9 privacy confirmed → send questionnaire link');
        try {
          const _c9Contents = await base44.asServiceRole.entities.BotContent.filter({ key: 'consultation_questionnaire_only' });
          const _c9Sc = await base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'consultation', content_type: 'questionnaire' });
          if (_c9Contents.length > 0 && _c9Sc.length > 0) {
            const _c9Msg = _c9Contents[0].content.replace('{קישור_שאלון}', _c9Sc[0].url);
            await fetch(_c9Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _c9Msg }) });
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_questionnaire_completion' });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming',
              text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: `out_${Date.now()}_fp_c9`, phone, direction: 'outgoing',
              text: '[fast_path_c9_questionnaire_link]', status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            return Response.json({ ok: true, fast_path: 'c9_questionnaire_link' });
          }
          console.log('FAST_PATH FP-C9: content not found, falling to LLM');
        } catch (fpC9Err) {
          console.warn(`FAST_PATH FP-C9 error: ${fpC9Err.message} — falling to LLM`);
        }
      }
    }
    // ===== FAST PATH: FP-C5 — consultation chronic disease "צפיתי וקראתי" → additional_reading_offer =====
    {
      const _c5Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _c5Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (
        serviceRequest?.service_type === 'consultation' &&
        serviceRequest?.sub_type &&
        serviceRequest?.sub_type !== 'אוטיזם' &&
        (_c5Norm === 'צפיתי וקראתי' || _c5Norm.startsWith('צפיתי וקרא'))
      ) {
        console.log('FAST_PATH: FP-C5 chronic disease tsafiti-v-karati → additional reading offer');
        try {
          const _c5Contents = await base44.asServiceRole.entities.BotContent.filter({ key: 'additional_reading_offer' });
          if (_c5Contents.length > 0) {
            await fetch(_c5Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _c5Contents[0].content }) });
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_additional_reading_response' });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming',
              text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: `out_${Date.now()}_fp_c5`, phone, direction: 'outgoing',
              text: '[fast_path_c5_additional_reading_offer]', status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            return Response.json({ ok: true, fast_path: 'c5_additional_reading_offer' });
          }
          console.log('FAST_PATH FP-C5: BotContent not found, falling to LLM');
        } catch (fpC5Err) {
          console.warn(`FAST_PATH FP-C5 error: ${fpC5Err.message} — falling to LLM`);
        }
      }
    }
    // ===== FAST PATH: FP-U1 — "המשך" (non-post_lecture) → location_directions + post_directions_prompt =====
    {
      const _u1Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _u1Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (
        _u1Norm === 'המשך' &&
        serviceRequest?.service_type !== 'post_lecture' && 
        serviceRequest?.service_type !== 'legal' &&
        serviceRequest?.status === 'scheduled'
      ) {
        console.log('FAST_PATH: FP-U1 המשך → location_directions');
        try {
          const _u1Dir = await base44.asServiceRole.entities.BotContent.filter({ key: 'location_directions' });
          const _u1Prompt = await base44.asServiceRole.entities.BotContent.filter({ key: 'post_directions_prompt' });
          if (_u1Dir.length > 0 && _u1Prompt.length > 0) {
            await fetch(_u1Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _u1Dir[0].content }) });
            await fetch(_u1Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _u1Prompt[0].content }) });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming',
              text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: `out_${Date.now()}_fp_u1`, phone, direction: 'outgoing',
              text: '[fast_path_u1_directions]', status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            return Response.json({ ok: true, fast_path: 'u1_location_directions' });
          }
          console.log('FAST_PATH FP-U1: BotContent not found, falling to LLM');
        } catch (fpU1Err) {
          console.warn(`FAST_PATH FP-U1 error: ${fpU1Err.message} — falling to LLM`);
        }
      }
    }

    // ===== FAST PATH: FP-U2 — "קבעתי" → appointment_confirmed =====
    {
      const _u2Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _u2Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (_u2Norm === 'קבעתי') {
        console.log('FAST_PATH: FP-U2 קבעתי → appointment_confirmed');
        try {
          const _u2Contents = await base44.asServiceRole.entities.BotContent.filter({ key: 'appointment_confirmed' });
          if (_u2Contents.length > 0) {
            await fetch(_u2Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _u2Contents[0].content }) });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming',
              text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: `out_${Date.now()}_fp_u2`, phone, direction: 'outgoing',
              text: '[fast_path_u2_appointment_confirmed]', status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            return Response.json({ ok: true, fast_path: 'u2_appointment_confirmed' });
          }
          console.log('FAST_PATH FP-U2: BotContent not found, falling to LLM');
        } catch (fpU2Err) {
          console.warn(`FAST_PATH FP-U2 error: ${fpU2Err.message} — falling to LLM`);
        }
      }
    }





    // ===== FAST PATH: FP-L-Agreement — legal "כן" after agreement question → send agreement PDF =====
    {
      const _lAgMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _lAgFu = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;
      const _lAgNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      const _lAgYes = ['כן','בטח','אשמח','כמובן','יאללה','קדימה','סבבה','אוקי','ok','רוצה','מעוניינת'].includes(_lAgNorm);
      if (
        serviceRequest?.service_type === 'legal' &&
        serviceRequest?.current_step === 'awaiting_legal_reading_response' &&
        _lAgYes
      ) {
        console.log('FAST_PATH: FP-L-Agreement legal yes → send agreement');
        try {
          const _lAgSc = await base44.asServiceRole.entities.ServiceContent.filter({
            service_type: 'legal', content_type: 'agreement',
          });
          if (_lAgSc.length > 0) {
            const _lAgUrl = _lAgSc[0].url;
            const _lAgIsPdf = /\.pdf(\?.*)?$/i.test(_lAgUrl);
            await fetch(_lAgMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: 'הנה ההסכם לקריאה 📋\nלאחר שקראת, אנא רשמי *"קראתי"*.' }) });
            if (_lAgIsPdf) {
              await fetch(_lAgFu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, urlFile: _lAgUrl, fileName: 'הסכם שירות משפטי.pdf', caption: '' }) });
            } else {
              await fetch(_lAgMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, message: _lAgUrl }) });
            }
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_legal_karati_agreement' });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_l_ag`, phone, direction: 'outgoing', text: '[fast_path_l_agreement]', status: 'replied', chat_id: chatId, conversation_id: conversationId });
            return Response.json({ ok: true, fast_path: 'l_agreement' });
          }
          console.log('FAST_PATH FP-L-Agreement: agreement not found, falling to LLM');
        } catch (e) { console.warn('FP-L-Agreement error:', e.message); }
      }
    }

    // ===== FAST PATH: FP-L-Karati-Agreement — legal "קראתי" after agreement → payment request + Bit QR =====
    {
      const _lKaMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _lKaFu = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;
      const _lKaNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (
        serviceRequest?.service_type === 'legal' &&
        serviceRequest?.current_step === 'awaiting_legal_karati_agreement' &&
        _lKaNorm === 'קראתי'
      ) {
        console.log('FAST_PATH: FP-L-Karati-Agreement → payment request + Bit QR');
        try {
          const [_lKaBc, _lKaPay, _lKaBit] = await Promise.all([
            base44.asServiceRole.entities.BotContent.filter({ key: 'legal_payment_request' }),
            base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'legal', content_type: 'payment_link' }),
            base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'general', content_type: 'image', sub_type: 'bit_qr' }),
          ]);
          if (_lKaBc.length > 0 && _lKaPay.length > 0) {
            const _lKaMsg = _lKaBc[0].content.replace('{קישור}', _lKaPay[0].url).replace('[קישור]', _lKaPay[0].url);
            await fetch(_lKaMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _lKaMsg }) });
            // Send Bit QR as follow-up
            if (_lKaBit.length > 0 && _lKaBit[0].url) {
              await new Promise(r => setTimeout(r, 1000));
              await fetch(_lKaFu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, urlFile: _lKaBit[0].url, fileName: 'ברקוד ביט לתשלום.png', caption: '' }) });
            }
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, {
              agreement_confirmed: true, current_step: 'awaiting_legal_payment',
            });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_l_ka`, phone, direction: 'outgoing', text: '[fast_path_l_karati_agreement_payment]', status: 'replied', chat_id: chatId, conversation_id: conversationId });
            return Response.json({ ok: true, fast_path: 'l_karati_agreement_payment' });
          }
          console.log('FAST_PATH FP-L-Karati-Agreement: content not found, falling to LLM');
        } catch (e) { console.warn('FP-L-Karati-Agreement error:', e.message); }
      }
    }

    // ===== FAST PATH: FP-L-Docs — legal "שלחתי"/"המשך" → send meeting scheduling link =====
    {
      const _lDMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _lDNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      const _lDTriggers = ['שלחתי', 'המשך', 'שלחתי את המסמכים', 'שלחתי מסמכים'];
      if (
        serviceRequest?.service_type === 'legal' &&
        _lDTriggers.some(t => _lDNorm === t || _lDNorm.startsWith('שלח'))
      ) {
        console.log('FAST_PATH: FP-L-Docs legal documents sent → meeting link');
        try {
          const _lDMeeting = await base44.asServiceRole.entities.BotContent.filter({ key: 'legal_meeting' });
          const _lDCal = await base44.asServiceRole.entities.ServiceContent.filter({
            service_type: 'legal', content_type: 'external_link', sub_type: 'legal_calendar'
          });
          if (_lDMeeting.length > 0 && _lDCal.length > 0) {
            const _lDMsg = _lDMeeting[0].content + '\n' + _lDCal[0].url;
            await fetch(_lDMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _lDMsg }) });
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, {
              current_step: 'awaiting_legal_meeting_booking'
            });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming',
              text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: `out_${Date.now()}_fp_l_docs`, phone, direction: 'outgoing',
              text: '[fast_path_l_docs_meeting_link]', status: 'replied', chat_id: chatId, conversation_id: conversationId,
            });
            return Response.json({ ok: true, fast_path: 'l_docs_meeting_link' });
          }
          console.log('FAST_PATH FP-L-Docs: content not found, falling to LLM');
        } catch (fpLDocsErr) {
          console.warn(`FAST_PATH FP-L-Docs error: ${fpLDocsErr.message} — falling to LLM`);
        }
      }
    }

    // ===== FAST PATH: FP-L1 — legal "שלחתי" → documents_received + in_review =====
    {
      const _l1Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _l1Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      const _l1Vars = ['שלחתי','שלחתי מסמכים','שלחתי את המסמכים','שלחתי הכל','נשלח'];
      if (
        serviceRequest?.service_type === 'legal' &&
        serviceRequest?.payment_confirmed === true &&
        !serviceRequest?.documents_received &&
        _l1Vars.includes(_l1Norm)
      ) {
        console.log('FAST_PATH: FP-L1 legal שלחתי → in_review');
        try {
          await fetch(_l1Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, message: 'תודה! קיבלנו את המסמכים 📁\nנבדוק ונחזור אליך בהקדם 🙏' }) });
          const _l1Old = serviceRequest.status;
          await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, {
            documents_received: true, status: 'in_review', current_step: 'legal_documents_received',
          });
          await base44.asServiceRole.entities.ServiceRequestTimeline.create({
            service_request_id: serviceRequest.id, event_type: 'status_change',
            description: 'מסמכים התקבלו — זוהה אוטומטית מ-WhatsApp',
            old_value: _l1Old, new_value: 'in_review',
          });
          await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId });
          await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_l1`, phone, direction: 'outgoing', text: '[fast_path_l1_docs_received]', status: 'replied', chat_id: chatId, conversation_id: conversationId });
          return Response.json({ ok: true, fast_path: 'l1_documents_received' });
        } catch (e) { console.warn('FP-L1 error:', e.message); }
      }
    }

    // ===== FAST PATH: FP-Clinic-Room — clinic room type selection =====
    {
      const _crMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _crFu = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;
      const _crNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      const _crRoomMap = {
        '1': 'חדר שיחה', 'שיחה': 'חדר שיחה', 'חדר שיחה': 'חדר שיחה',
        '2': 'חדר טיפול', 'טיפול': 'חדר טיפול', 'חדר טיפול': 'חדר טיפול',
        '3': 'חדר רופא', 'רופא': 'חדר רופא', 'חדר רופא': 'חדר רופא', 'חדר עם רופא': 'חדר רופא',
      };
      const _crSubType = _crRoomMap[_crNorm];
      if (
        serviceRequest?.service_type === 'clinic' &&
        serviceRequest?.current_step === 'awaiting_clinic_room_type' &&
        _crSubType
      ) {
        console.log('FAST_PATH: FP-Clinic-Room:', _crSubType);
        try {
          const [_crImages, _crVideos] = await Promise.all([
            base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'clinic', content_type: 'image', sub_type: _crSubType }),
            base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'clinic', content_type: 'video', sub_type: _crSubType }),
          ]);
          if (_crImages.length > 0 || _crVideos.length > 0) {
            await fetch(_crMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: `מיד שולחת לך מידע על ${_crSubType} 💜` }) });
            if (_crImages.length > 0) {
              await fetch(_crFu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, urlFile: _crImages[0].url, fileName: `תמונת ${_crSubType}.jpg`, caption: '' }) });
            }
            if (_crVideos.length > 0) {
              await new Promise(r => setTimeout(r, 1000));
              await fetch(_crMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, message: `הנה סרטון של ${_crSubType}:\n${_crVideos[0].url}` }) });
            }
            await new Promise(r => setTimeout(r, 1000));
            await fetch(_crMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: 'לאחר שצפית, כתוב/י *"צפיתי"* 🌸' }) });
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, {
              sub_type: _crSubType, current_step: 'awaiting_clinic_tsafiti',
            });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_cr`, phone, direction: 'outgoing', text: '[fast_path_clinic_room]', status: 'replied', chat_id: chatId, conversation_id: conversationId });
            return Response.json({ ok: true, fast_path: 'clinic_room' });
          }
          console.log('FAST_PATH FP-Clinic-Room: content not found, falling to LLM');
        } catch (e) { console.warn('FP-Clinic-Room error:', e.message); }
      }
    }

    // ===== FAST PATH: FP-Clinic-Tsafiti — clinic "צפיתי" → info + pricing text =====
    {
      const _ctMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _ctNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (
        serviceRequest?.service_type === 'clinic' &&
        serviceRequest?.current_step === 'awaiting_clinic_tsafiti' &&
        _ctNorm === 'צפיתי'
      ) {
        console.log('FAST_PATH: FP-Clinic-Tsafiti → info + pricing text');
        try {
          const [_ctInfo, _ctPrice] = await Promise.all([
            base44.asServiceRole.entities.BotContent.filter({ key: 'clinic_info' }),
            base44.asServiceRole.entities.BotContent.filter({ key: 'clinic_price_message' }),
          ]);
          if (_ctInfo.length > 0 && _ctPrice.length > 0) {
            await fetch(_ctMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _ctInfo[0].content }) });
            await new Promise(r => setTimeout(r, 1000));
            await fetch(_ctMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _ctPrice[0].content }) });
            await new Promise(r => setTimeout(r, 1000));
            await fetch(_ctMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: 'לאחר שקראת, כתוב/י *"קראתי"* 🌸' }) });
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_clinic_karati' });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_ct`, phone, direction: 'outgoing', text: '[fast_path_clinic_tsafiti]', status: 'replied', chat_id: chatId, conversation_id: conversationId });
            return Response.json({ ok: true, fast_path: 'clinic_tsafiti' });
          }
          console.log('FAST_PATH FP-Clinic-Tsafiti: BotContent not found, falling to LLM');
        } catch (e) { console.warn('FP-Clinic-Tsafiti error:', e.message); }
      }
    }

    // ===== FAST PATH: FP-Clinic-Karati — clinic "קראתי" → calendar =====
    {
      const _ckMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _ckNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (
        serviceRequest?.service_type === 'clinic' &&
        serviceRequest?.current_step === 'awaiting_clinic_karati' &&
        _ckNorm === 'קראתי'
      ) {
        console.log('FAST_PATH: FP-Clinic-Karati → calendar');
        try {
          const _ckSc = await base44.asServiceRole.entities.ServiceContent.filter({
            service_type: 'clinic', content_type: 'external_link',
          });
          if (_ckSc.length > 0) {
            await fetch(_ckMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: 'מעולה! הנה הקישור לתיאום פגישה 📅\n\n' + _ckSc[0].url }) });
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_clinic_appointment' });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_ck`, phone, direction: 'outgoing', text: '[fast_path_clinic_karati]', status: 'replied', chat_id: chatId, conversation_id: conversationId });
            return Response.json({ ok: true, fast_path: 'clinic_karati' });
          }
          console.log('FAST_PATH FP-Clinic-Karati: calendar not found, falling to LLM');
        } catch (e) { console.warn('FP-Clinic-Karati error:', e.message); }
      }
    }

    // ===== FAST PATH: FP-Lectures-Type — lectures type selection =====
    {
      const _ltMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _ltFu = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;
      const _ltNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (
        serviceRequest?.service_type === 'lectures' &&
        serviceRequest?.current_step === 'awaiting_lectures_type'
      ) {
        const _ltIsSeries = ['1','סדרה','הרצאות סדרה','סדרת הרצאות'].includes(_ltNorm);
        const _ltIsSingle = ['2','בודדת','הרצאה בודדת','הרצאה'].includes(_ltNorm);
        const _ltIsBio = ['3','ביופידבק','ביופידבק/ניהול כאב','ניהול כאב','סדנה','סדנת ביופידבק'].includes(_ltNorm);
        if (_ltIsSeries || _ltIsSingle || _ltIsBio) {
          console.log('FAST_PATH: FP-Lectures-Type:', _ltNorm);
          try {
            if (_ltIsSeries) {
              const _ltSc = await base44.asServiceRole.entities.ServiceContent.filter({
                service_type: 'lectures', content_type: 'external_link', sub_type: 'series_page',
              });
              if (!_ltSc.length) throw new Error('series_page_not_found');
              await fetch(_ltMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, message: 'מיד שולחת לך את עמוד סדרת ההרצאות 📚\n\n' + _ltSc[0].url }) });
              await fetch(_ltMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, message: 'לאחר שקראת, כתוב/י *"קראתי"* 🌸' }) });
              await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, {
                sub_type: 'series', current_step: 'awaiting_lectures_series_karati',
              });
            } else if (_ltIsSingle) {
              const _ltBc = await base44.asServiceRole.entities.BotContent.filter({ key: 'lectures_single_list' });
              if (!_ltBc.length) throw new Error('lectures_single_list_not_found');
              await fetch(_ltMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, message: _ltBc[0].content }) });
              await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, {
                sub_type: 'single', current_step: 'awaiting_lecture_single_selection',
              });
            } else {
              const _ltBioLectures = await base44.asServiceRole.entities.Lecture.filter({ lecture_type: 'workshop' });
              const _ltBioLecture = _ltBioLectures.length > 0 ? _ltBioLectures[0] : null;
              if (!_ltBioLecture) throw new Error('biofeedback_lecture_not_found');
              await fetch(_ltMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, message: 'מיד שולחת לך מידע על סדנת הביופידבק 💜' }) });
              if (_ltBioLecture.video_url) {
                await fetch(_ltMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chatId, message: _ltBioLecture.video_url }) });
              }
              if (_ltBioLecture.pdf_url) {
                await new Promise(r => setTimeout(r, 1000));
                await fetch(_ltFu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chatId, urlFile: _ltBioLecture.pdf_url, fileName: 'סדנת ביופידבק.pdf', caption: '' }) });
              }
              await new Promise(r => setTimeout(r, 1000));
              await fetch(_ltMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, message: 'לאחר שצפית וקראת, כתוב/י *"קראתי"* 🌸' }) });
              await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, {
                sub_type: 'biofeedback', current_step: 'awaiting_lectures_biofeedback_karati',
              });
            }
            const _ltLabel = _ltIsSeries ? 'series' : _ltIsSingle ? 'single' : 'biofeedback';
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_lt`, phone, direction: 'outgoing', text: `[fast_path_lectures_type_${_ltLabel}]`, status: 'replied', chat_id: chatId, conversation_id: conversationId });
            return Response.json({ ok: true, fast_path: `lectures_type_${_ltLabel}` });
          } catch (e) { console.warn('FP-Lectures-Type error:', e.message, '— falling to LLM'); }
        }
      }
    }

    // ===== FAST PATH: FP-Lectures-Single-Selection — single lecture by number =====
    {
      const _lsMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _lsFu = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;
      const _lsNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      const _lsNum = parseInt(_lsNorm, 10);
      if (
        serviceRequest?.service_type === 'lectures' &&
        serviceRequest?.current_step === 'awaiting_lecture_single_selection' &&
        !isNaN(_lsNum) && _lsNum >= 1 && _lsNum <= 9
      ) {
        console.log('FAST_PATH: FP-Lectures-Single-Selection:', _lsNum);
        try {
          const _lsAll = await base44.asServiceRole.entities.Lecture.filter({ lecture_type: 'single' });
          _lsAll.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
          const _lsLecture = _lsAll[_lsNum - 1];
          if (_lsLecture) {
            await fetch(_lsMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: `מיד שולחת לך: ${_lsLecture.title} 💜` }) });
            if (_lsLecture.video_url) {
              await fetch(_lsMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, message: _lsLecture.video_url }) });
            }
            if (_lsLecture.pdf_url) {
              await new Promise(r => setTimeout(r, 1000));
              await fetch(_lsFu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, urlFile: _lsLecture.pdf_url, fileName: `${_lsLecture.title}.pdf`, caption: '' }) });
            }
            await new Promise(r => setTimeout(r, 1000));
            const _lsHasVideo = !!_lsLecture.video_url;
            const _lsHasPdf = !!_lsLecture.pdf_url;
            const _lsConfirm = _lsHasVideo && _lsHasPdf ? 'לאחר שצפית וקראת, כתוב/י *"קראתי"* 🌸'
              : _lsHasVideo ? 'לאחר שצפית, כתוב/י *"קראתי"* 🌸'
              : 'לאחר שקראת, כתוב/י *"קראתי"* 🌸';
            await fetch(_lsMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _lsConfirm }) });
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, {
              sub_type: _lsLecture.title, current_step: 'awaiting_lecture_single_karati',
            });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_ls`, phone, direction: 'outgoing', text: `[fast_path_lecture_single_${_lsNum}]`, status: 'replied', chat_id: chatId, conversation_id: conversationId });
            return Response.json({ ok: true, fast_path: `lecture_single_${_lsNum}` });
          }
          console.log('FAST_PATH FP-Lectures-Single-Selection: lecture', _lsNum, 'not found');
        } catch (e) { console.warn('FP-Lectures-Single error:', e.message); }
      }
    }

    // ===== FAST PATH: FP-Lectures-Karati — lectures "קראתי" → calendar (always lecture_calendar) =====
    {
      const _lkMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _lkNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      const _lkSteps = ['awaiting_lectures_series_karati','awaiting_lectures_biofeedback_karati','awaiting_lecture_single_karati'];
      if (
        serviceRequest?.service_type === 'lectures' &&
        _lkSteps.includes(serviceRequest?.current_step) &&
        _lkNorm === 'קראתי'
      ) {
        console.log('FAST_PATH: FP-Lectures-Karati, step:', serviceRequest.current_step);
        try {
          const _lkSc = await base44.asServiceRole.entities.ServiceContent.filter({
            service_type: 'lectures', content_type: 'external_link', sub_type: 'lecture_calendar',
          });
          if (_lkSc.length > 0) {
            await fetch(_lkMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: 'מעולה! הנה הקישור לתיאום 📅\n\n' + _lkSc[0].url }) });
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_lectures_appointment' });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_lk`, phone, direction: 'outgoing', text: '[fast_path_lectures_karati]', status: 'replied', chat_id: chatId, conversation_id: conversationId });
            return Response.json({ ok: true, fast_path: 'lectures_karati' });
          }
          console.log('FAST_PATH FP-Lectures-Karati: calendar not found, falling to LLM');
        } catch (e) { console.warn('FP-Lectures-Karati error:', e.message); }
      }
    }

    // ===== FAST PATH: FP-PL-Karati — post_lecture "קראתי" → ask for details (if no contact) or book offer =====
    {
      const _plkMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _plkNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (
        serviceRequest?.service_type === 'post_lecture' &&
        serviceRequest?.current_step === 'awaiting_post_lecture_karati' &&
        _plkNorm === 'קיבלתי'
      ) {
        console.log('FAST_PATH: FP-PL-Karati post_lecture karati');
        try {
          if (!contact || !contact.full_name || !contact.email || !contact.phone) {
            // No contact yet → ask for details
            const _plkDetBc = await base44.asServiceRole.entities.BotContent.filter({ key: 'post_lecture_details_request' });
            const _plkDetMsg = _plkDetBc.length > 0 ? _plkDetBc[0].content
              : 'תודה שהיית איתנו בהרצאה! כדי שנוכל לשלוח לך עדכונים ולהישאר בקשר, בבקשה כתוב/י את הפרטים הבאים - שם מלא, מייל וטלפון.';
            await fetch(_plkMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _plkDetMsg }) });
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_post_lecture_details' });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_plk_det`, phone, direction: 'outgoing', text: '[fast_path_pl_karati_details_request]', status: 'replied', chat_id: chatId, conversation_id: conversationId });
            return Response.json({ ok: true, fast_path: 'pl_karati_details_request' });
          } else {
            // Contact exists → go straight to book offer
            const [_plkBc, _plkBook] = await Promise.all([
              base44.asServiceRole.entities.BotContent.filter({ key: 'post_lecture_book_offer' }),
              base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'post_lecture', content_type: 'external_link', sub_type: 'book' }),
            ]);
            if (_plkBc.length > 0 && _plkBook.length > 0) {
              await fetch(_plkMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, message: _plkBc[0].content + '\n\n' + _plkBook[0].url }) });
              await fetch(_plkMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, message: 'אנא רשמ/י *"הזמנתי"* או *"המשך"*' }) });
              await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_book_response' });
              await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId });
              await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_plk`, phone, direction: 'outgoing', text: '[fast_path_pl_karati_book]', status: 'replied', chat_id: chatId, conversation_id: conversationId });
              return Response.json({ ok: true, fast_path: 'pl_karati_book_offer' });
            }
          }
          console.log('FAST_PATH FP-PL-Karati: content not found, falling to LLM');
        } catch (e) { console.warn('FP-PL-Karati error:', e.message); }
      }
    }

    // ===== FAST PATH: FP-PL-Details — post_lecture "קיבלתי" details collection → save contact + book offer =====
    {
      const _pldMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      if (
        serviceRequest?.service_type === 'post_lecture' &&
        serviceRequest?.current_step === 'awaiting_post_lecture_karati' &&
        (!contact || !contact.full_name || !contact.email || !contact.phone)
      ) {
        // Try to parse name + email + phone from the message
        const _pldEmailMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
        const _pldPhoneMatch = text.replace(/[\-\s]/g, '').match(/0[5]\d{8}/);
        if (_pldEmailMatch && _pldPhoneMatch) {
          const _pldEmail = _pldEmailMatch[0].toLowerCase().trim();
          const _pldPhone = _pldPhoneMatch[0];
          const _pldName = text
            .replace(_pldEmailMatch[0], '')
            .replace(/0[5][\d\-\s]{8,12}/g, '')
            .replace(/שמי?\s*/gi, '').replace(/מספרי?\s*/gi, '')
            .replace(/טלפון:?\s*/gi, '').replace(/מייל:?\s*/gi, '').replace(/email:?\s*/gi, '')
            .replace(/[,;:]/g, ' ').replace(/\s+/g, ' ').trim();
          if (_pldName.length >= 2) {
            console.log(`FAST_PATH: FP-PL-Details parsed name="${_pldName}" phone="${_pldPhone}" email="${_pldEmail}"`);
            try {
              // Create or update Contact
              const _pldExisting = await base44.asServiceRole.entities.Contact.filter({ phone: _pldPhone });
              let _pldContactId;
              if (_pldExisting.length === 0) {
                const _pldNewContact = await base44.asServiceRole.entities.Contact.create({
                  full_name: _pldName, phone: _pldPhone, email: _pldEmail, source: 'qr',
                });
                _pldContactId = _pldNewContact.id;
              } else {
                _pldContactId = _pldExisting[0].id;
              }

              // Update ServiceRequest with contact info
              await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, {
                contact_id: _pldContactId, contact_name: _pldName, contact_phone: _pldPhone, contact_email: _pldEmail,
              });

              // Send confirmation + book offer
              await fetch(_pldMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, message: `תודה ${_pldName}! 🌸 הפרטים נשמרו.` }) });

              await new Promise(r => setTimeout(r, 1000));

              const [_pldBc, _pldBook] = await Promise.all([
                base44.asServiceRole.entities.BotContent.filter({ key: 'post_lecture_book_offer' }),
                base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'post_lecture', content_type: 'external_link', sub_type: 'book' }),
              ]);
              if (_pldBc.length > 0 && _pldBook.length > 0) {
                await fetch(_pldMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chatId, message: _pldBc[0].content + '\n\n' + _pldBook[0].url }) });
                await fetch(_pldMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chatId, message: 'אנא רשמ/י *"הזמנתי"* או *"המשך"*' }) });
              }
              await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_book_response' });

              await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId });
              await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_pld`, phone, direction: 'outgoing', text: '[fast_path_pl_details_saved]', status: 'replied', chat_id: chatId, conversation_id: conversationId });
              return Response.json({ ok: true, fast_path: 'pl_details_saved_book_offer' });
            } catch (pldErr) {
              console.warn(`FP-PL-Details save error: ${pldErr.message} — falling to LLM`);
            }
          }
        }
        // If we couldn't parse — fall to LLM to handle incomplete details
        console.log('FAST_PATH FP-PL-Details: could not parse all 3 fields, falling to LLM');
      }
    }

    // ===== FAST PATH: FP-PL-Book-Response — post_lecture "הזמנתי"/"המשך" → more lectures =====
    {
      const _plbMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _plbNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      const _plbOrdered = _plbNorm === 'הזמנתי';
      const _plbContinue = ['המשך','לא','לא עכשיו'].includes(_plbNorm);
      if (
        serviceRequest?.service_type === 'post_lecture' &&
        serviceRequest?.current_step === 'awaiting_book_response' &&
        (_plbOrdered || _plbContinue)
      ) {
        console.log('FAST_PATH: FP-PL-Book-Response:', _plbNorm);
        try {
          if (_plbOrdered) {
            await fetch(_plbMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: 'מעולה! שמחה שהזמנת 📖' }) });
          }
          const _plbMoreBc = await base44.asServiceRole.entities.BotContent.filter({ key: 'post_lecture_more_lectures' });
          if (_plbMoreBc.length > 0) {
            await new Promise(r => setTimeout(r, 500));
            await fetch(_plbMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _plbMoreBc[0].content }) });
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_more_lectures' });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_plb`, phone, direction: 'outgoing', text: '[fast_path_pl_book_response]', status: 'replied', chat_id: chatId, conversation_id: conversationId });
            return Response.json({ ok: true, fast_path: 'pl_book_response' });
          }
          console.log('FAST_PATH FP-PL-Book-Response: content not found, falling to LLM');
        } catch (e) { console.warn('FP-PL-Book-Response error:', e.message); }
      }
    }

    // ===== FAST PATH: FP-PL-More — post_lecture more lectures yes/no =====
    {
      const _plmMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _plmNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      const _plmYes = ['כן','בטח','אשמח','כמובן'].includes(_plmNorm);
      const _plmNo = ['לא','לא תודה','לא עכשיו'].includes(_plmNorm);
      if (
        serviceRequest?.service_type === 'post_lecture' &&
        serviceRequest?.current_step === 'awaiting_more_lectures' &&
        (_plmYes || _plmNo)
      ) {
        console.log('FAST_PATH: FP-PL-More:', _plmNorm);
        try {
          if (_plmYes) {
            const _plmWelcome = await base44.asServiceRole.entities.BotContent.filter({ key: 'lectures_welcome' });
            const _plmMsg = _plmWelcome.length > 0 ? _plmWelcome[0].content : 'נשמח לספר לך על סדרת ההרצאות שלנו! 📚';
            await fetch(_plmMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _plmMsg }) });
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_lectures_type' });
          } else {
            const _plmBye = await base44.asServiceRole.entities.BotContent.filter({ key: 'goodbye' });
            const _plmMsg = _plmBye.length > 0 ? _plmBye[0].content : 'שמחתי לשוחח, שיהיה לך יום נפלא 🌸';
            await fetch(_plmMu, { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: _plmMsg }) });
            await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'post_lecture_completed', status: 'completed' });
          }
          await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId });
          await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_plm`, phone, direction: 'outgoing', text: `[fast_path_pl_more_${_plmYes ? 'yes' : 'no'}]`, status: 'replied', chat_id: chatId, conversation_id: conversationId });
          return Response.json({ ok: true, fast_path: `pl_more_${_plmYes ? 'yes' : 'no'}` });
        } catch (e) { console.warn('FP-PL-More error:', e.message); }
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

    while (Date.now() - pollStart < 25000) {
      await new Promise(r => setTimeout(r, 500)); // wait 500ms between checks

      // Refresh typing indicator every 6s (typing bubble only — no text messages!)
      if (Date.now() - lastTypingRefresh > 6000) {
        lastTypingRefresh = Date.now();
        fetch(`https://api.green-api.com/waInstance${instanceId}/sendTyping/${token}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, typingTime: 8000 }),
        }).catch(() => {});
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

    // Bot didn't reply in 25s — processWhatsAppReplies will send it later. NO fallback text message.
    console.log(`No bot reply within 25s for ${idMessage}. Left as pending_reply for processWhatsAppReplies.`);
    return Response.json({ ok: true, queued: true });
  } catch (error) {
    console.error('greenApiWebhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});