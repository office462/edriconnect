import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
// Post-lecture details fix: skip FP-Details confirm loop for post_lecture — 2026-06-04

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const secretParam = url.searchParams.get('secret') || '';
    const expectedSecret = Deno.env.get('GREEN_API_WEBHOOK_SECRET') || '';
    if (expectedSecret && secretParam !== expectedSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await req.json();
    const expectedInstanceId = Deno.env.get('GREEN_API_INSTANCE_ID');
    const incomingInstanceId = String(body.instanceData?.idInstance || '');
    if (incomingInstanceId !== expectedInstanceId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (body.typeWebhook !== 'incomingMessageReceived') {
      return Response.json({ ok: true, skipped: true });
    }
    const messageData = body.messageData;
    const senderInfo = body.senderData;
    const chatId = senderInfo?.chatId || '';
    if (chatId.endsWith('@g.us') || chatId.includes('@g.us')) {
      return Response.json({ ok: true, skipped: true, reason: 'group_message' });
    }
    const phone = chatId.replace('@c.us', '');
    const idMessage = body.idMessage || '';
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

    const [botEnabledSettings, cachedConvSetting, blockList, idempotencyCheck] = await Promise.all([
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' }),
      base44.asServiceRole.entities.SystemSetting.filter({ key: 'phone_conv_' + phone }),
      base44.asServiceRole.entities.WhatsAppBlockList.list(),
      idMessage ? base44.asServiceRole.entities.WhatsAppMessageLog.filter({ id_message: idMessage }) : Promise.resolve([]),
    ]);

    const blockedPhones = blockList.map(b => b.phone.replace(/[\s\-\+]/g, ''));
    if (blockedPhones.includes(phone) || blockedPhones.includes(localPhone)) {
      if (idMessage) {
        await base44.asServiceRole.entities.WhatsAppMessageLog.create({
          id_message: idMessage, phone, direction: 'incoming',
          text: text.substring(0, 500), status: 'skipped', chat_id: chatId,
        });
      }
      return Response.json({ ok: true, skipped: true, reason: 'blocked' });
    }
    if (idMessage && idempotencyCheck.length > 0) {
      return Response.json({ ok: true, skipped: true, reason: 'duplicate' });
    }
    const botEnabled = botEnabledSettings.length > 0 && botEnabledSettings[0].value === 'true';
    if (!botEnabled) {
      const testPhoneSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_test_phones' });
      const testPhonesStr = testPhoneSettings.length > 0 ? testPhoneSettings[0].value : '';
      const testPhones = testPhonesStr.split(',').map(p => p.trim().replace(/[\s\-\+]/g, '')).filter(Boolean);
      const normalizedTestPhones = testPhones.map(p => p.startsWith('0') ? '972' + p.substring(1) : p);
      if (!normalizedTestPhones.includes(phone)) {
        return Response.json({ ok: true, skipped: true, reason: 'bot_disabled' });
      }
    }

    const RATE_LIMIT_PER_HOUR = 10;
    const phoneLogsPromise = base44.asServiceRole.entities.WhatsAppMessageLog.filter({ phone }, '-created_date', 30);
    const recentOutgoing = (await phoneLogsPromise).filter(l =>
      l.direction === 'outgoing' &&
      (Date.now() - new Date(l.created_date).getTime()) < 60 * 60 * 1000
    );
    if (recentOutgoing.length >= RATE_LIMIT_PER_HOUR) {
      await base44.asServiceRole.entities.WhatsAppMessageLog.create({
        id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming',
        text: text.substring(0, 500), status: 'skipped', chat_id: chatId,
      });
      return Response.json({ ok: true, skipped: true, reason: 'rate_limited' });
    }

    fetch(`https://api.green-api.com/waInstance${instanceId}/sendTyping/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, typingTime: 15000 }) }).catch(() => {});

    let contacts = await base44.asServiceRole.entities.Contact.filter({ phone: phone });
    if (contacts.length === 0 && phone.startsWith('972')) {
      contacts = await base44.asServiceRole.entities.Contact.filter({ phone: localPhone });
    }
    if (contacts.length > 1) {
      contacts.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
      deduplicateContact(base44, phone).catch(() => {});
    }
    let contact = contacts.length > 0 ? contacts[0] : null;
    if (contact && (!contact.full_name || !contact.phone || !contact.email)) {
      contact = null;
    }

    let serviceRequest = null;
    if (contact) {
      const allRequests = await base44.asServiceRole.entities.ServiceRequest.filter({ contact_id: contact.id });
      if (allRequests.length > 0) {
        allRequests.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
        serviceRequest = allRequests[0];
      }
    }

    if (serviceRequest && (serviceRequest.status === 'whatsapp_message_to_check' || serviceRequest.status === 'pending_human')) {
      await base44.asServiceRole.entities.WhatsAppMessageLog.create({
        id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming',
        text: text.substring(0, 500), status: 'skipped', chat_id: chatId,
      });
      let replyText = 'הפנייה שלך נמצאת בטיפול הצוות 🙏 ברגע שנאשר — נמשיך אוטומטית. אין צורך לשלוח הודעות נוספות.';
      try {
        const pendingContent = await base44.asServiceRole.entities.BotContent.filter({ key: 'pending_admin_check_reply' });
        if (pendingContent.length > 0 && pendingContent[0].content) replyText = pendingContent[0].content;
      } catch (e) {}
      const sendUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      await fetch(sendUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: replyText }) });
      await base44.asServiceRole.entities.WhatsAppMessageLog.create({
        id_message: `out_${Date.now()}_blocked`, phone, direction: 'outgoing',
        text: replyText.substring(0, 500), status: 'replied', chat_id: chatId,
      });
      return Response.json({ ok: true, blocked: true, reason: 'pending_admin_check' });
    }

    try {
      const existingLogs = await phoneLogsPromise;
      const isFirstMessage = existingLogs.length === 0;
      if (isFirstMessage) {
        const firstMessages = ['תודה שפנית! 🌸 אני על זה, חוזרת אליך מיד','שלום וברוכ/ה הבא/ה! 💜 מיד ממשיכה','נעים להכיר! ✨ עוד שנייה איתך','היי! קיבלתי 😊 רגע ואחזור אליך'];
        const thinkingMsg = firstMessages[Math.floor(Math.random() * firstMessages.length)];
        const sendUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
        await fetch(sendUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: thinkingMsg }) });
      } else {
        fetch(`https://api.green-api.com/waInstance${instanceId}/sendTyping/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, typingTime: 15000 }) }).catch(() => {});
      }
    } catch (typErr) {}

    const agentName = 'dr_adri_bot';
    let conversationId = null;
    let conversation;
    if (serviceRequest?.conversation_id) conversationId = serviceRequest.conversation_id;
    if (!conversationId && cachedConvSetting?.length > 0 && cachedConvSetting[0].value) {
      conversationId = cachedConvSetting[0].value;
    }
    if (!conversationId) {
      const recentLogs = await phoneLogsPromise;
      const withConv = recentLogs.filter(l => l.conversation_id);
      if (withConv.length > 0) {
        withConv.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
        conversationId = withConv[0].conversation_id;
        if (!cachedConvSetting?.length) {
          base44.asServiceRole.entities.SystemSetting.create({ key: 'phone_conv_' + phone, value: conversationId, category: 'whatsapp' }).catch(() => {});
        }
      }
    }
    if (!serviceRequest && conversationId) {
      try {
        const _srByConv = await base44.asServiceRole.entities.ServiceRequest.filter({ conversation_id: conversationId });
        if (_srByConv.length > 0) serviceRequest = _srByConv[_srByConv.length - 1];
      } catch (_srFbErr) {}
    }
    if (conversationId) {
      try {
        conversation = await base44.asServiceRole.agents.getConversation(conversationId);
      } catch (e) {
        conversationId = null;
        if (serviceRequest) {
          try { await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { conversation_id: '' }); } catch (_) {}
        }
      }
    }
    if (!conversationId) {
      try {
        conversation = await base44.asServiceRole.agents.createConversation({
          agent_name: agentName,
          metadata: { name: contact?.full_name || phone, phone, source: 'whatsapp' },
        });
        conversationId = conversation.id;
        base44.asServiceRole.entities.SystemSetting.create({ key: 'phone_conv_' + phone, value: conversationId, category: 'whatsapp' }).catch(() => {});
      } catch (createErr) {
        return Response.json({ error: 'Failed to create conversation' }, { status: 500 });
      }
      if (serviceRequest) {
        await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { conversation_id: conversationId });
      }
    }
    if (serviceRequest && serviceRequest.conversation_id !== conversationId) {
      await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { conversation_id: conversationId });
    }

    const msgCountBefore = (conversation.messages || []).length;
    fetch(`https://api.green-api.com/waInstance${instanceId}/sendTyping/${token}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ chatId, typingTime: 15000 }) }).catch(() => {});

    // ===== FAST PATH: FP-PL-QR — post_lecture QR message → send PDF immediately =====
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
          const _plqAllPdfs = await base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'post_lecture', content_type: 'pdf' });
          const _plqNameLower = _plqLectureName.toLowerCase();
          let _plqPdf = _plqAllPdfs.find(p => p.sub_type && p.sub_type.toLowerCase() === _plqNameLower);
          if (!_plqPdf) _plqPdf = _plqAllPdfs.find(p => p.sub_type && (_plqNameLower.includes(p.sub_type.toLowerCase()) || p.sub_type.toLowerCase().includes(_plqNameLower)));
          if (!_plqPdf) _plqPdf = _plqAllPdfs.find(p => {
            const words = _plqNameLower.split(/\s+/);
            return words.some(w => w.length > 2 && p.sub_type && p.sub_type.toLowerCase().includes(w));
          });
          if (_plqPdf && _plqPdf.url) {
            let _plqSr = serviceRequest;
            if (!_plqSr || _plqSr.service_type !== 'post_lecture') {
              _plqSr = await base44.asServiceRole.entities.ServiceRequest.create({
                contact_id: contact?.id || 'pending', contact_name: contact?.full_name || '',
                contact_phone: localPhone || phone, service_type: 'post_lecture',
                status: 'new_lead', conversation_id: conversationId, sub_type: _plqPdf.sub_type,
              });
            }
            const _plqBlog = await base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'post_lecture', content_type: 'external_link', sub_type: 'blog' });
            const _plqBlogUrl = _plqBlog.length > 0 ? _plqBlog[0].url : '';
            const _plqBc = await base44.asServiceRole.entities.BotContent.filter({ key: 'post_lecture_pdf_sent' });
            const _plqMsg = _plqBc.length > 0
              ? _plqBc[0].content.replace('{שם_הרצאה}', _plqPdf.sub_type).replace('{קישור_בלוג}', _plqBlogUrl)
              : `הנה הסיכום של ההרצאה ${_plqPdf.sub_type} 🌸`;
            await fetch(_plqMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _plqMsg }) });
            await new Promise(r => setTimeout(r, 1500));
            const _plqIsDirect = /\.pdf(\?.*)?$/i.test(_plqPdf.url);
            if (_plqIsDirect) {
              await fetch(_plqFu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, urlFile: _plqPdf.url, fileName: `סיכום הרצאה - ${_plqPdf.sub_type}.pdf`, caption: '' }) });
            } else {
              await fetch(_plqMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _plqPdf.url }) });
            }
            const _plqMailBc = await base44.asServiceRole.entities.BotContent.filter({ key: 'post_lecture_mailing_list' });
            if (_plqMailBc.length > 0) {
              await new Promise(r => setTimeout(r, 2000));
              await fetch(_plqMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _plqMailBc[0].content }) });
            }
            const _plqDetBc = await base44.asServiceRole.entities.BotContent.filter({ key: 'post_lecture_details_request' });
            if (_plqDetBc.length > 0) {
              await new Promise(r => setTimeout(r, 2000));
              await fetch(_plqMu, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({chatId, message: _plqDetBc[0].content}) });
            }
            await base44.asServiceRole.entities.ServiceRequest.update(_plqSr.id, { current_step: 'awaiting_post_lecture_details' });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_plq`, phone, direction: 'outgoing', text: `[fast_path_pl_qr_pdf_sent] ${_plqPdf.sub_type}`, status: 'replied', chat_id: chatId, conversation_id: conversationId });
            try {
              await base44.asServiceRole.agents.addMessage(conversation, { role: 'user', content: text });
              await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: _plqMsg });
              if (_plqMailBc.length > 0) await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: _plqMailBc[0].content });
            } catch (_) {}
            return Response.json({ ok: true, fast_path: 'pl_qr_pdf_sent', lecture: _plqPdf.sub_type });
          }
        } catch (plqErr) { console.warn(`FP-PL-QR error: ${plqErr.message}`); }
      }
    }

    // ===== FAST PATH: FP-0 — welcome message for new user =====
    if (!contact && (!cachedConvSetting || cachedConvSetting.length === 0)) {
      try {
        const _fp0Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
        const _fp0Contents = await base44.asServiceRole.entities.BotContent.filter({ key: 'greeting' });
        if (_fp0Contents.length > 0) {
          await fetch(_fp0Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _fp0Contents[0].content }) });
          await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId });
          await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp0`, phone, direction: 'outgoing', text: '[fast_path_fp0_greeting]', status: 'replied', chat_id: chatId, conversation_id: conversationId });
          try { await base44.asServiceRole.agents.addMessage(conversation, { role: 'user', content: text }); } catch (_) {}
          return Response.json({ ok: true, fast_path: 'fp0_greeting' });
        }
      } catch (fp0Err) {}
    }

    // ===== FAST PATH: FP-PL-Details — MUST be BEFORE FP-Details to catch post_lecture details =====
    { const _pldMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      // Find post_lecture SR by conversation_id even if serviceRequest is null/different type
      let _pldSr = (serviceRequest?.service_type === 'post_lecture') ? serviceRequest : null;
      if (!_pldSr && conversationId) {
        try {
          const _pldByConv = await base44.asServiceRole.entities.ServiceRequest.filter({ conversation_id: conversationId, service_type: 'post_lecture' });
          if (_pldByConv.length > 0) {
            _pldByConv.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
            if (_pldByConv[0].status !== 'completed') _pldSr = _pldByConv[0];
          }
        } catch (_) {}
      }
      if (_pldSr && (_pldSr.current_step === 'awaiting_post_lecture_details' || _pldSr.current_step === 'awaiting_mailing_list_response') && (!contact || !contact.full_name || !contact.email || !contact.phone)) {
        const _pldEmailMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
        const _pldPhoneMatch = text.replace(/[\-\s]/g, '').match(/0[5]\d{8}/);
        if (_pldEmailMatch && _pldPhoneMatch) {
          const _pldEmail = _pldEmailMatch[0].toLowerCase().trim(); const _pldPhone = _pldPhoneMatch[0];
          const _pldName = text.replace(_pldEmailMatch[0], '').replace(/0[5][\d\-\s]{8,12}/g, '').replace(/שמי?\s*/gi, '').replace(/מספרי?\s*/gi, '').replace(/טלפון:?\s*/gi, '').replace(/מייל:?\s*/gi, '').replace(/email:?\s*/gi, '').replace(/[,;:]/g, ' ').replace(/\s+/g, ' ').trim();
          if (_pldName.length >= 2) {
            try {
              const _pldExisting = await base44.asServiceRole.entities.Contact.filter({ phone: _pldPhone });
              let _pldContactId;
              if (_pldExisting.length === 0) { const _pldNewContact = await base44.asServiceRole.entities.Contact.create({ full_name: _pldName, phone: _pldPhone, email: _pldEmail, source: 'qr' }); _pldContactId = _pldNewContact.id; deduplicateContact(base44, _pldPhone).catch(() => {}); }
              else { _pldContactId = _pldExisting[0].id; }
              await base44.asServiceRole.entities.ServiceRequest.update(_pldSr.id, { contact_id: _pldContactId, contact_name: _pldName, contact_phone: _pldPhone, contact_email: _pldEmail });
              await fetch(_pldMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: `תודה ${_pldName}! 🌸 הפרטים נשמרו.` }) });
              const [_pldRec, _pldBye, _pldSer] = await Promise.all([base44.asServiceRole.entities.BotContent.filter({ key: 'post_lecture_recommend' }), base44.asServiceRole.entities.BotContent.filter({ key: 'post_lecture_final_goodbye' }), base44.asServiceRole.entities.Lecture.filter({ lecture_type: 'series' })]);
              if (_pldRec.length > 0) { await new Promise(r => setTimeout(r, 1500)); await fetch(_pldMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _pldRec[0].content }) }); }
              if (_pldSer.length > 0 && _pldSer[0].image_url) { await new Promise(r => setTimeout(r, 1500)); const _pldFu = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`; await fetch(_pldFu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, urlFile: _pldSer[0].image_url, fileName: 'סדרת הרצאות.jpg', caption: '' }) }); }
              if (_pldBye.length > 0) { await new Promise(r => setTimeout(r, 1500)); await fetch(_pldMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _pldBye[0].content }) }); }
              await base44.asServiceRole.entities.ServiceRequest.update(_pldSr.id, { current_step: 'post_lecture_completed', status: 'completed' });
              await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId });
              await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_pld`, phone, direction: 'outgoing', text: '[fp_pl_details_recommend_bye]', status: 'replied', chat_id: chatId, conversation_id: conversationId });
              try { await base44.asServiceRole.agents.addMessage(conversation, { role: 'user', content: text }); await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: `תודה ${_pldName}! 🌸 הפרטים נשמרו.` }); } catch (_) {}
              return Response.json({ ok: true, fast_path: 'pl_details_recommend_goodbye' });
            } catch (pldErr) { console.warn(`FP-PL-Details error: ${pldErr.message}`); }
          }
        }
      }
    }

    // ===== FAST PATH: FP-Details — parse name+phone+email and send confirmation =====
    // SKIP for post_lecture — details are handled by FP-PL-Details above
    {
      const _detMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _detNeedsContact = !contact || !contact.full_name || !contact.email || !contact.phone;
      const _detIsPostLecture = serviceRequest?.service_type === 'post_lecture';
      if (_detNeedsContact && !_detIsPostLecture) {
        const _detEmailMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
        const _detPhoneMatch = text.replace(/[\-\s]/g, '').match(/0[5]\d{8}/);
        if (_detEmailMatch && _detPhoneMatch) {
          const _detEmail = _detEmailMatch[0].toLowerCase().trim();
          const _detPhone = _detPhoneMatch[0];
          const _detName = text.replace(_detEmailMatch[0], '').replace(/0[5][\d\-\s]{8,12}/g, '')
            .replace(/שמי?\s*/gi, '').replace(/מספרי?\s*/gi, '').replace(/טלפון:?\s*/gi, '').replace(/מייל:?\s*/gi, '').replace(/email:?\s*/gi, '')
            .replace(/[,;:]/g, ' ').replace(/\s+/g, ' ').trim();
          if (_detName.length >= 2) {
            const _detKey = `pending_contact_${phone}`;
            const _detData = JSON.stringify({ name: _detName, phone: _detPhone, email: _detEmail });
            const _detExisting = await base44.asServiceRole.entities.SystemSetting.filter({ key: _detKey });
            if (_detExisting.length > 0) { await base44.asServiceRole.entities.SystemSetting.update(_detExisting[0].id, { value: _detData }); }
            else { await base44.asServiceRole.entities.SystemSetting.create({ key: _detKey, value: _detData, category: 'whatsapp' }); }
            const _detConfirmMsg = `הפרטים שלך:\n📛 שם: ${_detName}\n📱 טלפון: ${_detPhone}\n📧 מייל: ${_detEmail}\n\nהאם הכל נכון? כתוב/י *כן* לאישור או תקנ/י את הפרט השגוי.`;
            await fetch(_detMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _detConfirmMsg }) });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_det`, phone, direction: 'outgoing', text: '[fast_path_details_confirm]', status: 'replied', chat_id: chatId, conversation_id: conversationId });
            try { await base44.asServiceRole.agents.addMessage(conversation, { role: 'user', content: text }); await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: _detConfirmMsg }); } catch (_) {}
            return Response.json({ ok: true, fast_path: 'fp_details_confirm' });
          }
        }
      }
    }

    // ===== FAST PATH: FP-DetailsConfirm — "כן" after details → create Contact + send welcome =====
    // SKIP for post_lecture — no confirm loop needed
    {
      const _dcMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const _dcNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      const _dcPositive = ['כן', 'נכון', 'הכל נכון', 'כן נכון', 'בטח', 'כמובן', 'אוקי', 'ok', 'סבבה', '👍', '✅'].includes(_dcNorm);
      const _dcIsPostLecture = serviceRequest?.service_type === 'post_lecture';
      if (_dcPositive && !contact && !_dcIsPostLecture) {
        const _dcKey = `pending_contact_${phone}`;
        const _dcSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: _dcKey });
        if (_dcSettings.length > 0) {
          try {
            const _dcData = JSON.parse(_dcSettings[0].value);
            const _dcExisting = await base44.asServiceRole.entities.Contact.filter({ phone: _dcData.phone });
            if (_dcExisting.length === 0) {
              await base44.asServiceRole.entities.Contact.create({ full_name: _dcData.name, phone: _dcData.phone, email: _dcData.email, source: 'whatsapp' });
              deduplicateContact(base44, _dcData.phone).catch(() => {});
            }
            await base44.asServiceRole.entities.SystemSetting.delete(_dcSettings[0].id).catch(() => {});
            try {
              const _dcSrByConv = conversationId ? await base44.asServiceRole.entities.ServiceRequest.filter({ conversation_id: conversationId }) : [];
              for (const sr of _dcSrByConv) {
                if (!sr.contact_name || sr.contact_name === '' || sr.contact_id === 'pending') {
                  const _dcNewContact = await base44.asServiceRole.entities.Contact.filter({ phone: _dcData.phone });
                  const _dcCid = _dcNewContact.length > 0 ? _dcNewContact[0].id : sr.contact_id;
                  await base44.asServiceRole.entities.ServiceRequest.update(sr.id, { contact_id: _dcCid, contact_name: _dcData.name, contact_phone: _dcData.phone, contact_email: _dcData.email });
                }
              }
            } catch (syncErr) {}
            const _dcWelcomeContents = await base44.asServiceRole.entities.BotContent.filter({ key: 'welcome' });
            const _dcWelcomeMsg = _dcWelcomeContents.length > 0 ? _dcWelcomeContents[0].content : 'ברוכ/ה הבא/ה! 😊';
            await fetch(_dcMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _dcWelcomeMsg }) });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId });
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_dc`, phone, direction: 'outgoing', text: '[fast_path_details_saved_welcome]', status: 'replied', chat_id: chatId, conversation_id: conversationId });
            try { await base44.asServiceRole.agents.addMessage(conversation, { role: 'user', content: text }); await base44.asServiceRole.agents.addMessage(conversation, { role: 'assistant', content: _dcWelcomeMsg }); } catch (_) {}
            return Response.json({ ok: true, fast_path: 'fp_details_saved' });
          } catch (dcErr) {
            await base44.asServiceRole.entities.SystemSetting.delete(_dcSettings[0].id).catch(() => {});
          }
        }
      }
    }

    // ===== FAST PATH: consultation disease selection =====
    {
      const DISEASE_MAP = { '1': 'פוריות', 'פוריות': 'פוריות', '2': 'הריון', 'הריון': 'הריון', '3': 'גיל המעבר', 'גיל המעבר': 'גיל המעבר', 'גיל': 'גיל המעבר', '4': 'סוכרת', 'סוכרת': 'סוכרת', '5': 'דיכאון', 'דיכאון': 'דיכאון', '6': 'מחלות מעי', 'מחלות מעי': 'מחלות מעי', 'מעי': 'מחלות מעי', '7': 'סרטן', 'סרטן': 'סרטן', '8': 'אוטיזם', 'אוטיזם': 'אוטיזם', 'אוטיזם ותסמונות גנטיות': 'אוטיזם' };
      if (serviceRequest?.service_type === 'consultation' && serviceRequest?.current_step === 'awaiting_disease_selection') {
        const normalized = text.trim();
        const subType = DISEASE_MAP[normalized] || DISEASE_MAP[normalized.split(/[\s,\.]/)[0]];
        if (subType) {
          let fastPathDone = false;
          try {
            const fpVideos = await base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'consultation', content_type: 'video', sub_type: subType });
            if (fpVideos.length > 0) {
              await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', conversation_id: conversationId, chat_id: chatId });
              const _mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
              await fetch(_mu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: `מיד שולחת לך את המידע על ${subType} 💜` }) });
              const _fu = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;
              const _fpVideoUrl = fpVideos[0].url;
              if (/\.(mp4|mov|avi|mkv|webm)(\?.*)?$/i.test(_fpVideoUrl)) {
                await fetch(_fu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, urlFile: _fpVideoUrl, fileName: `${subType}.mp4`, caption: '' }) });
              } else {
                await fetch(_mu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _fpVideoUrl }) });
              }
              const isAutism = subType === 'אוטיזם';
              let fpPdfs = [];
              if (!isAutism) {
                fpPdfs = await base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'consultation', content_type: 'pdf', sub_type: subType });
                if (fpPdfs.length > 0 && fpPdfs[0].url) {
                  await new Promise(r => setTimeout(r, 1000));
                  if (/\.pdf(\?.*)?$/i.test(fpPdfs[0].url)) { await fetch(_fu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, urlFile: fpPdfs[0].url, fileName: `${subType}.pdf`, caption: '' }) }); }
                  else { await fetch(_mu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: fpPdfs[0].url }) }); }
                }
              }
              await new Promise(r => setTimeout(r, 1000));
              const confirmMsg = (fpPdfs.length > 0 && fpPdfs[0].url) ? 'לאחר שצפית וקראת, אנא כתוב/י *"צפיתי וקראתי"* 🌸' : 'לאחר שצפית, אנא כתוב/י *"צפיתי"* 🌸';
              await fetch(_mu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: confirmMsg }) });
              if (serviceRequest) await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { sub_type: subType, current_step: '' });
              await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp`, phone, direction: 'outgoing', text: `[fast_path] ${subType}`, status: 'replied', chat_id: chatId });
              fastPathDone = true;
            }
          } catch (fpErr) {}
          if (fastPathDone) return Response.json({ ok: true, fast_path: true, subType });
        }
      }
    }
    // ===== FP-C1 consultation "צפיתי" → topic selection =====
    { const _c1Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _c1Norm = text.trim().replace(/[*"'״]/g, '');
      if (serviceRequest?.service_type === 'consultation' && !serviceRequest?.sub_type && !serviceRequest?.current_step && _c1Norm === 'צפיתי') {
        try { const _c1Contents = await base44.asServiceRole.entities.BotContent.filter({ key: 'consultation_topic_selection' });
          if (_c1Contents.length > 0) { await fetch(_c1Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _c1Contents[0].content }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_topic_choice' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_c1`, phone, direction: 'outgoing', text: '[fast_path_c1_topic_selection]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'c1_topic_selection' }); }
        } catch (e) {} } }
    // ===== FP-C2 autism choice =====
    { const _c2Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _c2Fu = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`; const _c2Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (serviceRequest?.service_type === 'consultation' && serviceRequest?.current_step === 'awaiting_topic_choice' && ['1', 'אוטיזם', 'אוטיזם ותסמונות גנטיות'].includes(_c2Norm)) {
        try { const _c2Videos = await base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'consultation', content_type: 'video', sub_type: 'אוטיזם' });
          if (_c2Videos.length > 0) { const _c2Url = _c2Videos[0].url; await fetch(_c2Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: 'מיד שולחת לך את הסרטון על אוטיזם 💜' }) }); if (/\.(mp4|mov|avi|mkv|webm)(\?.*)?$/i.test(_c2Url)) { await fetch(_c2Fu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, urlFile: _c2Url, fileName: 'אוטיזם.mp4', caption: '' }) }); } else { await fetch(_c2Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _c2Url }) }); } await fetch(_c2Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: 'לאחר שצפית, אנא כתוב/י *"צפיתי"* 🌸' }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { sub_type: 'אוטיזם', current_step: 'awaiting_tsafiti_autism' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_c2`, phone, direction: 'outgoing', text: '[fast_path_c2_autism]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'c2_autism' }); }
        } catch (e) {} } }
    // ===== FP-C3 chronic diseases menu =====
    { const _c3Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _c3Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (serviceRequest?.service_type === 'consultation' && serviceRequest?.current_step === 'awaiting_topic_choice' && ['2', 'מחלות', 'מחלות כרוניות', 'מחלות כרוניות אחרות'].includes(_c3Norm)) {
        try { const _c3Contents = await base44.asServiceRole.entities.BotContent.filter({ key: 'consultation_chronic_diseases' });
          if (_c3Contents.length > 0) { await fetch(_c3Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _c3Contents[0].content }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_disease_selection' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_c3`, phone, direction: 'outgoing', text: '[fast_path_c3_chronic_menu]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'c3_chronic_menu' }); }
        } catch (e) {} } }
    // ===== FP-C4 autism tsafiti → additional reading =====
    { const _c4Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _c4Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (serviceRequest?.service_type === 'consultation' && serviceRequest?.sub_type === 'אוטיזם' && _c4Norm === 'צפיתי') {
        try { const _c4Contents = await base44.asServiceRole.entities.BotContent.filter({ key: 'additional_reading_offer' });
          if (_c4Contents.length > 0) { await fetch(_c4Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _c4Contents[0].content }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_additional_reading_response' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_c4`, phone, direction: 'outgoing', text: '[fast_path_c4_additional_reading]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'c4_additional_reading' }); }
        } catch (e) {} } }
    // ===== FP-C6 additional reading yes =====
    { const _c6Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _c6Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (serviceRequest?.service_type === 'consultation' && serviceRequest?.current_step === 'awaiting_additional_reading_response' && ['כן','בטח','אשמח','כמובן','יאללה','קדימה','סבבה','אוקי','ok','בוא נמשיך','רוצה','מעוניינת'].includes(_c6Norm)) {
        try { const [_c6Sc, _c6Cq] = await Promise.all([base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'consultation', content_type: 'external_link', sub_type: 'additional_reading' }), base44.asServiceRole.entities.BotContent.filter({ key: 'continue_process_question' })]);
          if (_c6Sc.length > 0 && _c6Sc[0].url && _c6Cq.length > 0) { await fetch(_c6Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _c6Sc[0].url }) }); await fetch(_c6Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _c6Cq[0].content }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_continue_process' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_c6`, phone, direction: 'outgoing', text: '[fast_path_c6_additional_reading_url]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'c6_additional_reading_yes' }); }
        } catch (e) {} } }
    // ===== FP-C7 additional reading no → privacy =====
    { const _c7Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _c7Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (serviceRequest?.service_type === 'consultation' && serviceRequest?.current_step === 'awaiting_additional_reading_response' && ['לא','לא תודה','לא עכשיו','לא צריך','לא רוצה'].includes(_c7Norm)) {
        try { const _c7Contents = await base44.asServiceRole.entities.BotContent.filter({ key: 'consultation_privacy_message' });
          if (_c7Contents.length > 0) { await fetch(_c7Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _c7Contents[0].content }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_privacy_response' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_c7`, phone, direction: 'outgoing', text: '[fast_path_c7_privacy]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'c7_skip_reading_to_privacy' }); }
        } catch (e) {} } }
    // ===== FP-C8 continue process yes → privacy =====
    { const _c8Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _c8Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (serviceRequest?.service_type === 'consultation' && serviceRequest?.current_step === 'awaiting_continue_process' && ['כן','בטח','אשמח','כמובן','יאללה','קדימה','סבבה','אוקי','ok','בוא נמשיך','רוצה','מעוניינת'].includes(_c8Norm)) {
        try { const _c8Contents = await base44.asServiceRole.entities.BotContent.filter({ key: 'consultation_privacy_message' });
          if (_c8Contents.length > 0) { await fetch(_c8Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _c8Contents[0].content }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_privacy_response' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_c8`, phone, direction: 'outgoing', text: '[fast_path_c8_privacy]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'c8_continue_to_privacy' }); }
        } catch (e) {} } }
    // ===== FP-C9 privacy confirmed → questionnaire =====
    { const _c9Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _c9Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (serviceRequest?.service_type === 'consultation' && serviceRequest?.current_step === 'awaiting_privacy_response' && ['כן','בטח','אשמח','כמובן','יאללה','קדימה','סבבה','אוקי','ok','כו','בוא נמשיך','רוצה','מעוניינת'].includes(_c9Norm)) {
        try { const [_c9Contents, _c9Sc] = await Promise.all([base44.asServiceRole.entities.BotContent.filter({ key: 'consultation_questionnaire_only' }), base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'consultation', content_type: 'questionnaire' })]);
          if (_c9Contents.length > 0 && _c9Sc.length > 0) { const _c9Msg = _c9Contents[0].content.replace('{קישור_שאלון}', _c9Sc[0].url); await fetch(_c9Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _c9Msg }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_questionnaire_completion' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_c9`, phone, direction: 'outgoing', text: '[fast_path_c9_questionnaire_link]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'c9_questionnaire_link' }); }
        } catch (e) {} } }
    // ===== FP-C5 chronic disease tsafiti-v-karati =====
    { const _c5Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _c5Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (serviceRequest?.service_type === 'consultation' && serviceRequest?.sub_type && serviceRequest?.sub_type !== 'אוטיזם' && (_c5Norm === 'צפיתי וקראתי' || _c5Norm.startsWith('צפיתי וקרא'))) {
        try { const _c5Contents = await base44.asServiceRole.entities.BotContent.filter({ key: 'additional_reading_offer' });
          if (_c5Contents.length > 0) { await fetch(_c5Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _c5Contents[0].content }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_additional_reading_response' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_c5`, phone, direction: 'outgoing', text: '[fast_path_c5_additional_reading_offer]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'c5_additional_reading_offer' }); }
        } catch (e) {} } }
    // ===== FP-U1 "המשך" → location_directions =====
    { const _u1Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _u1Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (_u1Norm === 'המשך' && serviceRequest?.service_type !== 'post_lecture' && serviceRequest?.service_type !== 'legal' && serviceRequest?.status === 'scheduled') {
        try { const [_u1Dir, _u1Prompt] = await Promise.all([base44.asServiceRole.entities.BotContent.filter({ key: 'location_directions' }), base44.asServiceRole.entities.BotContent.filter({ key: 'post_directions_prompt' })]);
          if (_u1Dir.length > 0 && _u1Prompt.length > 0) { await fetch(_u1Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _u1Dir[0].content }) }); await fetch(_u1Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _u1Prompt[0].content }) }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_u1`, phone, direction: 'outgoing', text: '[fast_path_u1_directions]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'u1_location_directions' }); }
        } catch (e) {} } }
    // ===== FP-U2 "קבעתי" =====
    { const _u2Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _u2Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (_u2Norm === 'קבעתי') { try { const _u2Contents = await base44.asServiceRole.entities.BotContent.filter({ key: 'appointment_confirmed' }); if (_u2Contents.length > 0) { await fetch(_u2Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _u2Contents[0].content }) }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_u2`, phone, direction: 'outgoing', text: '[fast_path_u2_appointment_confirmed]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'u2_appointment_confirmed' }); } } catch (e) {} } }
    // ===== FP-Goodbye =====
    { const _gbMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _gbNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (['סיום','סיום שיחה','ביי','להתראות','תודה סיום','יאללה ביי','סיימנו','סיימתי','זהו','תודה רבה סיום'].includes(_gbNorm) && serviceRequest) {
        try { const _gbBye = await base44.asServiceRole.entities.BotContent.filter({ key: 'goodbye' }); const _gbMsg = _gbBye.length > 0 ? _gbBye[0].content : 'שמחתי לשוחח, שיהיה לך יום נפלא 🌸'; await fetch(_gbMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _gbMsg }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { status: 'completed', current_step: 'completed' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_gb`, phone, direction: 'outgoing', text: '[fast_path_goodbye]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'goodbye' }); } catch (e) {} } }
    // ===== FP-L-Agreement =====
    { const _lAgMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _lAgFu = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`; const _lAgNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (serviceRequest?.service_type === 'legal' && serviceRequest?.current_step === 'awaiting_legal_reading_response' && ['כן','בטח','אשמח','כמובן','יאללה','קדימה','סבבה','אוקי','ok','רוצה','מעוניינת'].includes(_lAgNorm)) {
        try { const _lAgSc = await base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'legal', content_type: 'agreement' });
          if (_lAgSc.length > 0) { const _lAgUrl = _lAgSc[0].url; await fetch(_lAgMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: 'הנה ההסכם לקריאה 📋\nלאחר שקראת, אנא רשמי *"קראתי"*.' }) }); if (/\.pdf(\?.*)?$/i.test(_lAgUrl)) { await fetch(_lAgFu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, urlFile: _lAgUrl, fileName: 'הסכם שירות משפטי.pdf', caption: '' }) }); } else { await fetch(_lAgMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _lAgUrl }) }); } await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_legal_karati_agreement' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_l_ag`, phone, direction: 'outgoing', text: '[fast_path_l_agreement]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'l_agreement' }); }
        } catch (e) {} } }
    // ===== FP-L-Karati-Agreement =====
    { const _lKaMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _lKaNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (serviceRequest?.service_type === 'legal' && serviceRequest?.current_step === 'awaiting_legal_karati_agreement' && _lKaNorm === 'קראתי') {
        try { const _lKaBc = await base44.asServiceRole.entities.BotContent.filter({ key: 'legal_payment_request' });
          if (_lKaBc.length > 0) { await fetch(_lKaMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _lKaBc[0].content }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { agreement_confirmed: true, current_step: 'awaiting_legal_payment' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_l_ka`, phone, direction: 'outgoing', text: '[fast_path_l_karati_agreement_bank_transfer]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'l_karati_agreement_bank_transfer' }); }
        } catch (e) {} } }
    // ===== FP-L-Receipt =====
    { const _lRcMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      if (serviceRequest?.service_type === 'legal' && serviceRequest?.current_step === 'awaiting_legal_payment') {
        try { const _lRcBc = await base44.asServiceRole.entities.BotContent.filter({ key: 'legal_receipt_received' }); const _lRcMsg = _lRcBc.length > 0 ? _lRcBc[0].content : 'תודה! קיבלנו את ההודעה. הצוות יבדוק ויאשר בהקדם 🙏'; await fetch(_lRcMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _lRcMsg }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { status: 'pending_human', current_step: 'awaiting_admin_payment_approval' }); base44.asServiceRole.functions.invoke('notifyAdmin', { service_request_id: serviceRequest.id, reason: 'אישור תשלום העברה בנקאית — מסלול Legal', context_message: `לקוח: ${serviceRequest.contact_name || phone}\nהודעה: ${text.substring(0, 200)}` }).catch(() => {}); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_l_rc`, phone, direction: 'outgoing', text: '[fast_path_l_receipt_pending_human]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.ServiceRequestTimeline.create({ service_request_id: serviceRequest.id, event_type: 'status_change', description: 'לקוח שלח אישור העברה — ממתין לאישור אדמין', old_value: 'awaiting_legal_payment', new_value: 'pending_human' }); return Response.json({ ok: true, fast_path: 'l_receipt_pending_human' }); } catch (e) {} } }
    // ===== FP-L-AdminApproval =====
    { const _lAdMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _lAdNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (['כן', 'אישור', 'מאושר', 'אושר'].includes(_lAdNorm)) {
        try { const _lAdSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'admin_whatsapp_phone' }); const _lAdAdminPhone = _lAdSettings.length > 0 ? _lAdSettings[0].value : '';
          if (_lAdAdminPhone && (phone === _lAdAdminPhone || localPhone === _lAdAdminPhone.replace('972', '0'))) { const _lAdPending = await base44.asServiceRole.entities.ServiceRequest.filter({ status: 'pending_human', service_type: 'legal' }); const _lAdReq = _lAdPending.length > 0 ? _lAdPending.sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date))[0] : null;
            if (_lAdReq) { await base44.asServiceRole.entities.ServiceRequest.update(_lAdReq.id, { status: 'paid', payment_confirmed: true, current_step: 'send_privacy_message', pending_bot_message: 'paid_legal' }); await fetch(_lAdMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: `✅ תשלום אושר עבור ${_lAdReq.contact_name || 'לקוח'}. ההודעה הבאה נשלחת ללקוח.` }) }); await base44.asServiceRole.entities.ServiceRequestTimeline.create({ service_request_id: _lAdReq.id, event_type: 'payment', description: 'תשלום אושר ידנית על ידי אדמין (WhatsApp)', old_value: 'pending_human', new_value: 'paid' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_l_ad`, phone, direction: 'outgoing', text: '[fast_path_l_admin_approval]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'l_admin_approval', approved_request: _lAdReq.id }); } }
        } catch (e) {} } }
    // ===== FP-L-Docs =====
    { const _lDMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _lDNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (serviceRequest?.service_type === 'legal' && ['שלחתי', 'המשך', 'שלחתי את המסמכים', 'שלחתי מסמכים'].some(t => _lDNorm === t || _lDNorm.startsWith('שלח'))) {
        try { const [_lDMeeting, _lDCal] = await Promise.all([base44.asServiceRole.entities.BotContent.filter({ key: 'legal_meeting' }), base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'legal', content_type: 'external_link', sub_type: 'legal_calendar' })]);
          if (_lDMeeting.length > 0 && _lDCal.length > 0) { await fetch(_lDMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _lDMeeting[0].content + '\n' + _lDCal[0].url }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_legal_meeting_booking' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_l_docs`, phone, direction: 'outgoing', text: '[fast_path_l_docs_meeting_link]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'l_docs_meeting_link' }); }
        } catch (e) {} } }
    // ===== FP-L1 legal שלחתי → in_review =====
    { const _l1Mu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _l1Norm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (serviceRequest?.service_type === 'legal' && serviceRequest?.payment_confirmed === true && !serviceRequest?.documents_received && ['שלחתי','שלחתי מסמכים','שלחתי את המסמכים','שלחתי הכל','נשלח'].includes(_l1Norm)) {
        try { await fetch(_l1Mu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: 'תודה! קיבלנו את המסמכים 📁\nנבדוק ונחזור אליך בהקדם 🙏' }) }); const _l1Old = serviceRequest.status; await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { documents_received: true, status: 'in_review', current_step: 'legal_documents_received' }); await base44.asServiceRole.entities.ServiceRequestTimeline.create({ service_request_id: serviceRequest.id, event_type: 'status_change', description: 'מסמכים התקבלו — זוהה אוטומטית מ-WhatsApp', old_value: _l1Old, new_value: 'in_review' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_l1`, phone, direction: 'outgoing', text: '[fast_path_l1_docs_received]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'l1_documents_received' }); } catch (e) {} } }
    // ===== FP-Clinic-Room =====
    { const _crMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _crFu = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`; const _crNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase(); const _crRoomMap = { '1': 'חדר שיחה', 'שיחה': 'חדר שיחה', 'חדר שיחה': 'חדר שיחה', '2': 'חדר טיפול', 'טיפול': 'חדר טיפול', 'חדר טיפול': 'חדר טיפול', '3': 'חדר רופא', 'רופא': 'חדר רופא', 'חדר רופא': 'חדר רופא', 'חדר עם רופא': 'חדר רופא' }; const _crSubType = _crRoomMap[_crNorm];
      if (serviceRequest?.service_type === 'clinic' && serviceRequest?.current_step === 'awaiting_clinic_room_type' && _crSubType) {
        try { const [_crImages, _crVideos] = await Promise.all([base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'clinic', content_type: 'image', sub_type: _crSubType }), base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'clinic', content_type: 'video', sub_type: _crSubType })]);
          if (_crImages.length > 0 || _crVideos.length > 0) { await fetch(_crMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: `מיד שולחת לך מידע על ${_crSubType} 💜` }) }); if (_crImages.length > 0) { await fetch(_crFu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, urlFile: _crImages[0].url, fileName: `תמונת ${_crSubType}.jpg`, caption: '' }) }); } if (_crVideos.length > 0) { await new Promise(r => setTimeout(r, 1000)); await fetch(_crMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: `הנה סרטון של ${_crSubType}:\n${_crVideos[0].url}` }) }); } await new Promise(r => setTimeout(r, 1000)); await fetch(_crMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: 'לאחר שצפית, כתוב/י *"צפיתי"* 🌸' }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { sub_type: _crSubType, current_step: 'awaiting_clinic_tsafiti' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_cr`, phone, direction: 'outgoing', text: '[fast_path_clinic_room]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'clinic_room' }); }
        } catch (e) {} } }
    // ===== FP-Clinic-Tsafiti =====
    { const _ctMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _ctNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (serviceRequest?.service_type === 'clinic' && serviceRequest?.current_step === 'awaiting_clinic_tsafiti' && _ctNorm === 'צפיתי') {
        try { const [_ctInfo, _ctPrice] = await Promise.all([base44.asServiceRole.entities.BotContent.filter({ key: 'clinic_info' }), base44.asServiceRole.entities.BotContent.filter({ key: 'clinic_price_message' })]);
          if (_ctInfo.length > 0 && _ctPrice.length > 0) { await fetch(_ctMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _ctInfo[0].content }) }); await new Promise(r => setTimeout(r, 1000)); await fetch(_ctMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _ctPrice[0].content }) }); await new Promise(r => setTimeout(r, 1000)); await fetch(_ctMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: 'לאחר שקראת, כתוב/י *"קראתי"* 🌸' }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_clinic_karati' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_ct`, phone, direction: 'outgoing', text: '[fast_path_clinic_tsafiti]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'clinic_tsafiti' }); }
        } catch (e) {} } }
    // ===== FP-Clinic-Karati =====
    { const _ckMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _ckNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (serviceRequest?.service_type === 'clinic' && serviceRequest?.current_step === 'awaiting_clinic_karati' && _ckNorm === 'קראתי') {
        try { const _ckSc = await base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'clinic', content_type: 'external_link' });
          if (_ckSc.length > 0) { await fetch(_ckMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: 'מעולה! הנה הקישור לתיאום פגישה 📅\n\n' + _ckSc[0].url }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_clinic_appointment' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_ck`, phone, direction: 'outgoing', text: '[fast_path_clinic_karati]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'clinic_karati' }); }
        } catch (e) {} } }
    // ===== FP-Clinic-Veteran =====
    { const _cvMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _cvNorm = text.trim().replace(/[*"'\u05F4]/g, '').toLowerCase();
      if (serviceRequest?.service_type === 'clinic' && (!serviceRequest?.current_step || serviceRequest?.current_step === '' || serviceRequest?.current_step === 'awaiting_clinic_choice') && ['1', 'ותיק', 'שוכר ותיק', 'שוכרת ותיקה'].includes(_cvNorm)) {
        try { const _cvBc = await base44.asServiceRole.entities.BotContent.filter({ key: 'clinic_existing_code_question' });
          if (_cvBc.length > 0) { await fetch(_cvMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _cvBc[0].content }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_clinic_code_response' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_cv`, phone, direction: 'outgoing', text: '[fast_path_clinic_veteran]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'clinic_veteran' }); }
        } catch (e) {} } }
    // ===== FP-Clinic-Code =====
    { const _ccrMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _ccrNorm = text.trim().replace(/[*"'\u05F4]/g, '').toLowerCase(); const _ccrYes = ['כן','בטח','כמובן','אשמח','סבבה','אוקי','ok'].includes(_ccrNorm); const _ccrNo = ['לא','לא תודה','לא צריך'].includes(_ccrNorm);
      if (serviceRequest?.service_type === 'clinic' && serviceRequest?.current_step === 'awaiting_clinic_code_response' && (_ccrYes || _ccrNo)) {
        try { if (_ccrYes) { const _ccrCode = await base44.asServiceRole.entities.BotContent.filter({ key: 'clinic_secret_code' }); if (_ccrCode.length > 0) await fetch(_ccrMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _ccrCode[0].content }) }); } await new Promise(r => setTimeout(r, 1000)); const _ccrAnything = await base44.asServiceRole.entities.BotContent.filter({ key: 'clinic_anything_else' }); if (_ccrAnything.length > 0) await fetch(_ccrMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _ccrAnything[0].content }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_clinic_anything_else' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_ccr`, phone, direction: 'outgoing', text: `[fast_path_clinic_code_${_ccrYes ? 'yes' : 'no'}]`, status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: `clinic_code_${_ccrYes ? 'yes' : 'no'}` }); } catch (e) {} } }
    // ===== FP-Clinic-WantToPay =====
    { const _cwpMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _cwpNorm = text.trim().replace(/[*"'\u05F4]/g, '').toLowerCase(); const _cwpWantPay = (_cwpNorm.includes('מעוניין') || _cwpNorm.includes('מעוניינת') || _cwpNorm.includes('רוצה')) && _cwpNorm.includes('לשלם');
      if (serviceRequest?.service_type === 'clinic' && _cwpWantPay) {
        try { const [_cwpBc, _cwpPay, _cwpBit] = await Promise.all([base44.asServiceRole.entities.BotContent.filter({ key: 'clinic_payment_request' }), base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'clinic', content_type: 'payment_link' }), base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'general', content_type: 'image', sub_type: 'bit_qr' })]);
          if (_cwpBc.length > 0 && _cwpPay.length > 0) { const _cwpMsg = _cwpBc[0].content.replace('{קישור_תשלום}', _cwpPay[0].url); await fetch(_cwpMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _cwpMsg }) }); if (_cwpBit.length > 0 && _cwpBit[0].url) { await new Promise(r => setTimeout(r, 1500)); const _cwpFu = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`; await fetch(_cwpFu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, urlFile: _cwpBit[0].url, fileName: 'ברקוד ביט לתשלום.png', caption: '' }) }); } await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_clinic_payment' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_cwp`, phone, direction: 'outgoing', text: '[fast_path_clinic_want_to_pay]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'clinic_want_to_pay' }); }
        } catch (e) {} } }
    // ===== FP-Lectures-Type =====
    { const _ltMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _ltFu = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`; const _ltNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (serviceRequest?.service_type === 'lectures' && serviceRequest?.current_step === 'awaiting_lectures_type') {
        const _ltIsSeries = ['1','סדרה','הרצאות סדרה','סדרת הרצאות'].includes(_ltNorm); const _ltIsSingle = ['2','בודדת','הרצאה בודדת','הרצאה'].includes(_ltNorm); const _ltIsBio = ['3','ביופידבק','ביופידבק/ניהול כאב','ניהול כאב','סדנה','סדנת ביופידבק'].includes(_ltNorm);
        if (_ltIsSeries || _ltIsSingle || _ltIsBio) { try {
          if (_ltIsSeries) { const _ltSc = await base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'lectures', content_type: 'external_link', sub_type: 'series_page' }); if (!_ltSc.length) throw new Error('nf'); await fetch(_ltMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: 'מיד שולחת לך את עמוד סדרת ההרצאות 📚\n\n' + _ltSc[0].url }) }); await fetch(_ltMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: 'לאחר שקראת, כתוב/י *"קראתי"* 🌸' }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { sub_type: 'series', current_step: 'awaiting_lectures_series_karati' }); }
          else if (_ltIsSingle) { const _ltBc = await base44.asServiceRole.entities.BotContent.filter({ key: 'lectures_single_list' }); if (!_ltBc.length) throw new Error('nf'); await fetch(_ltMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _ltBc[0].content }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { sub_type: 'single', current_step: 'awaiting_lecture_single_selection' }); }
          else { const _ltBioLectures = await base44.asServiceRole.entities.Lecture.filter({ lecture_type: 'workshop' }); if (!_ltBioLectures.length) throw new Error('nf'); const _ltBioLecture = _ltBioLectures[0]; await fetch(_ltMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: 'מיד שולחת לך מידע על סדנת הביופידבק 💜' }) }); if (_ltBioLecture.video_url) await fetch(_ltMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _ltBioLecture.video_url }) }); if (_ltBioLecture.pdf_url) { await new Promise(r => setTimeout(r, 1000)); await fetch(_ltFu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, urlFile: _ltBioLecture.pdf_url, fileName: 'סדנת ביופידבק.pdf', caption: '' }) }); } await new Promise(r => setTimeout(r, 1000)); await fetch(_ltMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: 'לאחר שצפית וקראת, כתוב/י *"קראתי"* 🌸' }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { sub_type: 'biofeedback', current_step: 'awaiting_lectures_biofeedback_karati' }); }
          const _ltLabel = _ltIsSeries ? 'series' : _ltIsSingle ? 'single' : 'biofeedback'; await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_lt`, phone, direction: 'outgoing', text: `[fast_path_lectures_type_${_ltLabel}]`, status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: `lectures_type_${_ltLabel}` }); } catch (e) {} } } }
    // ===== FP-Lectures-Single-Selection =====
    { const _lsMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _lsFu = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`; const _lsNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase(); const _lsNum = parseInt(_lsNorm, 10);
      if (serviceRequest?.service_type === 'lectures' && serviceRequest?.current_step === 'awaiting_lecture_single_selection' && !isNaN(_lsNum) && _lsNum >= 1 && _lsNum <= 9) {
        try { const _lsAll = await base44.asServiceRole.entities.Lecture.filter({ lecture_type: 'single' }); _lsAll.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)); const _lsLecture = _lsAll[_lsNum - 1];
          if (_lsLecture) { await fetch(_lsMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: `מיד שולחת לך: ${_lsLecture.title} 💜` }) }); if (_lsLecture.video_url) await fetch(_lsMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _lsLecture.video_url }) }); if (_lsLecture.pdf_url) { await new Promise(r => setTimeout(r, 1000)); await fetch(_lsFu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, urlFile: _lsLecture.pdf_url, fileName: `${_lsLecture.title}.pdf`, caption: '' }) }); } await new Promise(r => setTimeout(r, 1000)); const _lsConfirm = (_lsLecture.video_url && _lsLecture.pdf_url) ? 'לאחר שצפית וקראת, כתוב/י *"קראתי"* 🌸' : _lsLecture.video_url ? 'לאחר שצפית, כתוב/י *"קראתי"* 🌸' : 'לאחר שקראת, כתוב/י *"קראתי"* 🌸'; await fetch(_lsMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _lsConfirm }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { sub_type: _lsLecture.title, current_step: 'awaiting_lecture_single_karati' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_ls`, phone, direction: 'outgoing', text: `[fast_path_lecture_single_${_lsNum}]`, status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: `lecture_single_${_lsNum}` }); }
        } catch (e) {} } }
    // ===== FP-Lectures-Karati =====
    { const _lkMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _lkNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (serviceRequest?.service_type === 'lectures' && ['awaiting_lectures_series_karati','awaiting_lectures_biofeedback_karati','awaiting_lecture_single_karati'].includes(serviceRequest?.current_step) && _lkNorm === 'קראתי') {
        try { const _lkSc = await base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'lectures', content_type: 'external_link', sub_type: 'lecture_calendar' });
          if (_lkSc.length > 0) { await fetch(_lkMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: 'מעולה! הנה הקישור לתיאום 📅\n\n' + _lkSc[0].url }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_lectures_appointment' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_lk`, phone, direction: 'outgoing', text: '[fast_path_lectures_karati]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'lectures_karati' }); }
        } catch (e) {} } }
    // ===== FP-PL-Karati =====
    { const _plkMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _plkNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (serviceRequest?.service_type === 'post_lecture' && serviceRequest?.current_step === 'awaiting_post_lecture_karati' && _plkNorm === 'קיבלתי') {
        try { if (!contact || !contact.full_name || !contact.email || !contact.phone) { const _plkDetBc = await base44.asServiceRole.entities.BotContent.filter({ key: 'post_lecture_details_request' }); const _plkDetMsg = _plkDetBc.length > 0 ? _plkDetBc[0].content : 'תודה שהיית איתנו בהרצאה! בבקשה כתוב/י שם מלא, מייל וטלפון.'; await fetch(_plkMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _plkDetMsg }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_post_lecture_details' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_plk_det`, phone, direction: 'outgoing', text: '[fast_path_pl_karati_details_request]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'pl_karati_details_request' }); }
          else { const [_plkBc, _plkBook] = await Promise.all([base44.asServiceRole.entities.BotContent.filter({ key: 'post_lecture_book_offer' }), base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'post_lecture', content_type: 'external_link', sub_type: 'book' })]); if (_plkBc.length > 0 && _plkBook.length > 0) { await fetch(_plkMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _plkBc[0].content + '\n\n' + _plkBook[0].url }) }); await fetch(_plkMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: 'אנא רשמ/י *"הזמנתי"* או *"המשך"*' }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_book_response' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_plk`, phone, direction: 'outgoing', text: '[fast_path_pl_karati_book]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'pl_karati_book_offer' }); } }
        } catch (e) {} } }
    // ===== FP-PL-Book-Response =====
    { const _plbMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _plbNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase();
      if (serviceRequest?.service_type === 'post_lecture' && serviceRequest?.current_step === 'awaiting_book_response' && (_plbNorm === 'הזמנתי' || ['המשך','לא','לא עכשיו'].includes(_plbNorm))) {
        try { if (_plbNorm === 'הזמנתי') await fetch(_plbMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: 'מעולה! שמחה שהזמנת 📖' }) }); const _plbMoreBc = await base44.asServiceRole.entities.BotContent.filter({ key: 'post_lecture_more_lectures' });
          if (_plbMoreBc.length > 0) { await new Promise(r => setTimeout(r, 500)); await fetch(_plbMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _plbMoreBc[0].content }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_more_lectures' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_plb`, phone, direction: 'outgoing', text: '[fast_path_pl_book_response]', status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: 'pl_book_response' }); }
        } catch (e) {} } }
    // ===== FP-PL-More =====
    { const _plmMu = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`; const _plmNorm = text.trim().replace(/[*"'״]/g, '').toLowerCase(); const _plmYes = ['כן','בטח','אשמח','כמובן'].includes(_plmNorm); const _plmNo = ['לא','לא תודה','לא עכשיו'].includes(_plmNorm);
      if (serviceRequest?.service_type === 'post_lecture' && serviceRequest?.current_step === 'awaiting_more_lectures' && (_plmYes || _plmNo)) {
        try { if (_plmYes) { const _plmWelcome = await base44.asServiceRole.entities.BotContent.filter({ key: 'lectures_welcome' }); await fetch(_plmMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _plmWelcome.length > 0 ? _plmWelcome[0].content : 'נשמח לספר לך על סדרת ההרצאות שלנו! 📚' }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'awaiting_lectures_type' }); }
          else { const _plmBye = await base44.asServiceRole.entities.BotContent.filter({ key: 'goodbye' }); await fetch(_plmMu, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: _plmBye.length > 0 ? _plmBye[0].content : 'שמחתי לשוחח, שיהיה לך יום נפלא 🌸' }) }); await base44.asServiceRole.entities.ServiceRequest.update(serviceRequest.id, { current_step: 'post_lecture_completed', status: 'completed' }); }
          await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}_fp_plm`, phone, direction: 'outgoing', text: `[fast_path_pl_more_${_plmYes ? 'yes' : 'no'}]`, status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, fast_path: `pl_more_${_plmYes ? 'yes' : 'no'}` }); } catch (e) {} } }

    // ===== END FAST PATH — SEND TO BOT =====
    await base44.asServiceRole.agents.addMessage(conversation, { role: 'user', content: text });
    const expectedIndex = msgCountBefore + 1;
    const logRecord = await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: idMessage || `wa_${Date.now()}`, phone, direction: 'incoming', text: text.substring(0, 500), status: 'pending_reply', conversation_id: conversationId, chat_id: chatId, message_count_at_send: expectedIndex });

    let botReply = '';
    const pollStart = Date.now();
    let lastTypingRefresh = pollStart;
    let sentReassurance = false;
    while (Date.now() - pollStart < 25000) {
      await new Promise(r => setTimeout(r, 500));
      if (!sentReassurance && Date.now() - pollStart > 15000) { sentReassurance = true; const rMsgs = ['עוד קצת סבלנות, כמעט שם 💜', 'עוד רגע ואני חוזרת 🌸', 'ממש בדרך! ✨']; fetch(`https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: rMsgs[Math.floor(Math.random() * rMsgs.length)] }) }).catch(() => {}); }
      if (Date.now() - lastTypingRefresh > 6000) { lastTypingRefresh = Date.now(); fetch(`https://api.green-api.com/waInstance${instanceId}/sendTyping/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, typingTime: 8000 }) }).catch(() => {}); }
      const freshConv = await base44.asServiceRole.agents.getConversation(conversationId);
      const msgs = freshConv.messages || [];
      if (msgs.length > expectedIndex) { for (let i = msgs.length - 1; i >= expectedIndex; i--) { if (msgs[i].role === 'assistant' && msgs[i].content && msgs[i].content !== '<empty message>') { botReply = msgs[i].content; break; } } if (botReply) break; }
    }

    if (botReply) {
      const fileTagRegex = /\[FILE:(https?:\/\/[^\]:]+):([^\]]+)\]/g; const filesToSend = []; let cleanText = botReply; let match;
      while ((match = fileTagRegex.exec(botReply)) !== null) { filesToSend.push({ url: match[1], fileName: match[2] }); cleanText = cleanText.replace(match[0], ''); }
      cleanText = cleanText.replace(/\n{3,}/g, '\n\n').trim();
      let sendOk = true;
      if (cleanText) { const sendResp = await fetch(`https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message: cleanText }) }); if (!sendResp.ok) sendOk = false; }
      for (const file of filesToSend) { try { await fetch(`https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, urlFile: file.url, fileName: file.fileName, caption: '' }) }); } catch (fileErr) {} }
      if (sendOk) { await base44.asServiceRole.entities.WhatsAppMessageLog.update(logRecord.id, { status: 'replied' }); await base44.asServiceRole.entities.WhatsAppMessageLog.create({ id_message: `out_${Date.now()}`, phone, direction: 'outgoing', text: botReply.substring(0, 500), status: 'replied', chat_id: chatId, conversation_id: conversationId }); return Response.json({ ok: true, replied: true, files: filesToSend.length }); }
    }
    return Response.json({ ok: true, queued: true });
  } catch (error) {
    console.error('greenApiWebhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function deduplicateContact(base44, phone) {
  try {
    const normalizedPhone = phone.replace(/[\s\-\+]/g, '');
    const intlPhone = normalizedPhone.startsWith('972') ? normalizedPhone : '972' + normalizedPhone.substring(1);
    const localPhone = normalizedPhone.startsWith('0') ? normalizedPhone : '0' + normalizedPhone.substring(3);
    const [contactsIntl, contactsLocal] = await Promise.all([base44.asServiceRole.entities.Contact.filter({ phone: intlPhone }), base44.asServiceRole.entities.Contact.filter({ phone: localPhone })]);
    const allMap = new Map(); [...contactsIntl, ...contactsLocal].forEach(c => allMap.set(c.id, c)); const allContacts = Array.from(allMap.values());
    if (allContacts.length <= 1) return;
    allContacts.sort((a, b) => { const aComplete = (a.full_name ? 1 : 0) + (a.email ? 1 : 0) + (a.phone ? 1 : 0); const bComplete = (b.full_name ? 1 : 0) + (b.email ? 1 : 0) + (b.phone ? 1 : 0); if (bComplete !== aComplete) return bComplete - aComplete; return new Date(b.created_date) - new Date(a.created_date); });
    for (let i = 1; i < allContacts.length; i++) { await base44.asServiceRole.entities.Contact.delete(allContacts[i].id); }
  } catch (dedupErr) {}
}