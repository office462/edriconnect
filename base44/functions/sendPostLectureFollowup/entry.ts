import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const botSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' });
    const botEnabled = botSettings.length > 0 && botSettings[0].value === 'true';
    if (!botEnabled) {
      return Response.json({ ok: true, skipped: true, reason: 'bot_disabled' });
    }

    const FOLLOWUP_DELAY_MS = 30 * 60 * 1000; // 30 minutes
    const now = Date.now();

    const allRequests = await base44.asServiceRole.entities.ServiceRequest.filter({ service_type: 'post_lecture' });
    const eligible = allRequests.filter(r => {
      const step = r.current_step;
      return (step === 'awaiting_mailing_list_response' || step === 'post_lecture_details_saved') &&
        r.status !== 'completed' &&
        (now - new Date(r.updated_date).getTime()) >= FOLLOWUP_DELAY_MS;
    });

    if (eligible.length === 0) {
      return Response.json({ ok: true, processed: 0 });
    }

    const instanceId = Deno.env.get('GREEN_API_INSTANCE_ID');
    const token = Deno.env.get('GREEN_API_TOKEN');
    const msgUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
    const fileUrl = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;

    const [recommendBc, goodbyeBc, seriesLectures] = await Promise.all([
      base44.asServiceRole.entities.BotContent.filter({ key: 'post_lecture_recommend' }),
      base44.asServiceRole.entities.BotContent.filter({ key: 'post_lecture_final_goodbye' }),
      base44.asServiceRole.entities.Lecture.filter({ lecture_type: 'series' }),
    ]);

    const recommendMsg = recommendBc.length > 0 ? recommendBc[0].content : '';
    const goodbyeMsg = goodbyeBc.length > 0 ? goodbyeBc[0].content : '';
    const seriesImageUrl = seriesLectures.length > 0 ? seriesLectures[0].image_url : '';

    let processed = 0;

    for (const sr of eligible) {
      const phone = (sr.contact_phone || '').replace(/[\s\-\+]/g, '');
      if (!phone) continue;

      const cleanPhone = phone.startsWith('0') ? '972' + phone.substring(1) : phone;
      const chatId = `${cleanPhone}@c.us`;

      try {
        if (recommendMsg) {
          await fetch(msgUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, message: recommendMsg }) });
        }

        if (seriesImageUrl) {
          await new Promise(r => setTimeout(r, 1500));
          await fetch(fileUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, urlFile: seriesImageUrl, fileName: 'סדרת הרצאות מלאה.jpg', caption: '' }) });
        }

        if (goodbyeMsg) {
          await new Promise(r => setTimeout(r, 1500));
          await fetch(msgUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, message: goodbyeMsg }) });
        }

        await base44.asServiceRole.entities.ServiceRequest.update(sr.id, {
          status: 'completed', current_step: 'post_lecture_completed',
        });

        await base44.asServiceRole.entities.WhatsAppMessageLog.create({
          id_message: `out_${Date.now()}_pl_followup`, phone: cleanPhone, direction: 'outgoing',
          text: '[post_lecture_30min_followup]', status: 'replied', chat_id: chatId,
        });

        if (sr.conversation_id) {
          try {
            const conv = await base44.asServiceRole.agents.getConversation(sr.conversation_id);
            if (recommendMsg) await base44.asServiceRole.agents.addMessage(conv, { role: 'assistant', content: recommendMsg });
            if (goodbyeMsg) await base44.asServiceRole.agents.addMessage(conv, { role: 'assistant', content: goodbyeMsg });
          } catch (_) {}
        }

        processed++;
        console.log(`Post-lecture followup sent to ${cleanPhone} for SR ${sr.id}`);
      } catch (e) {
        console.error(`Followup failed for SR ${sr.id}:`, e.message);
      }
    }

    return Response.json({ ok: true, processed });
  } catch (error) {
    console.error('sendPostLectureFollowup error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});