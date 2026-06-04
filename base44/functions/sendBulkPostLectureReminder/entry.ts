import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check time window — stop after 19:00 Israel time
    const now = new Date();
    const israelHour = parseInt(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }));
    if (israelHour >= 19) {
      console.log('Past 19:00 Israel time — skipping');
      return Response.json({ ok: true, skipped: true, reason: 'past_19' });
    }

    const instanceId = Deno.env.get('GREEN_API_INSTANCE_ID');
    const token = Deno.env.get('GREEN_API_TOKEN');

    // Skip list — עדי שלום + test phones
    const SKIP_PHONES = ['0526044748', '0546888587'];

    // Find next eligible SR
    const allSRs = await base44.asServiceRole.entities.ServiceRequest.filter({
      service_type: 'post_lecture',
      status: 'new_lead',
    });

    // Filter: today (04.06), has real phone, not already sent, not in skip list
    const today = new Date('2026-06-04T00:00:00Z');
    const tomorrow = new Date('2026-06-05T00:00:00Z');

    const eligible = allSRs.filter(sr => {
      const created = new Date(sr.created_date);
      if (created < today || created >= tomorrow) return false;
      const phone = (sr.contact_phone || '').replace(/[\s\-\+]/g, '');
      if (!phone || phone === 'לא ידוע' || phone.length < 9) return false;
      // Normalize for skip check
      let cleanPhone = phone;
      if (cleanPhone.startsWith('972')) cleanPhone = '0' + cleanPhone.substring(3);
      if (SKIP_PHONES.includes(cleanPhone)) return false;
      // Already sent?
      if (sr.notes && sr.notes.includes('bulk_reminder_sent')) return false;
      return true;
    });

    // Sort by created_date ascending (oldest first)
    eligible.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

    if (eligible.length === 0) {
      console.log('No more eligible SRs to send');
      return Response.json({ ok: true, done: true, reason: 'no_more_eligible' });
    }

    // Take the first one
    const sr = eligible[0];
    let phone = (sr.contact_phone || '').replace(/[\s\-\+]/g, '');
    if (phone.startsWith('0')) phone = '972' + phone.substring(1);
    const chatId = `${phone}@c.us`;

    console.log(`Sending bulk reminder to ${phone} (SR: ${sr.id}, remaining: ${eligible.length - 1})`);

    // Fetch content
    const [recBc, byeBc, seriesLectures] = await Promise.all([
      base44.asServiceRole.entities.BotContent.filter({ key: 'post_lecture_recommend' }),
      base44.asServiceRole.entities.BotContent.filter({ key: 'post_lecture_final_goodbye' }),
      base44.asServiceRole.entities.Lecture.filter({ lecture_type: 'series' }),
    ]);

    const msgUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
    const fileUrl = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;
    let allOk = true;

    // 1. Recommend text
    if (recBc.length > 0) {
      const resp = await fetch(msgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message: recBc[0].content }),
      });
      if (!resp.ok) allOk = false;
      console.log(`Recommend text sent: ${resp.ok}`);
    }

    // 2. Series image
    if (seriesLectures.length > 0 && seriesLectures[0].image_url) {
      await new Promise(r => setTimeout(r, 1500));
      const resp = await fetch(fileUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          urlFile: seriesLectures[0].image_url,
          fileName: 'סדרת הרצאות.jpg',
          caption: '',
        }),
      });
      if (!resp.ok) allOk = false;
      console.log(`Series image sent: ${resp.ok}`);
    }

    // 3. Goodbye text
    if (byeBc.length > 0) {
      await new Promise(r => setTimeout(r, 1500));
      const resp = await fetch(msgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message: byeBc[0].content }),
      });
      if (!resp.ok) allOk = false;
      console.log(`Goodbye text sent: ${resp.ok}`);
    }

    // Mark as sent
    if (allOk) {
      const existingNotes = sr.notes || '';
      await base44.asServiceRole.entities.ServiceRequest.update(sr.id, {
        notes: (existingNotes ? existingNotes + ' | ' : '') + 'bulk_reminder_sent',
        status: 'completed',
        current_step: 'bulk_reminder_completed',
      });

      // Log to timeline
      await base44.asServiceRole.entities.ServiceRequestTimeline.create({
        service_request_id: sr.id,
        event_type: 'message_sent',
        description: 'שליחת תזכורת המלצה+סדרה+סיום (שליחה המונית)',
      });

      // Log outgoing message
      await base44.asServiceRole.entities.WhatsAppMessageLog.create({
        id_message: `out_${Date.now()}_bulk`,
        phone,
        direction: 'outgoing',
        text: '[bulk_post_lecture_reminder]',
        status: 'replied',
        chat_id: chatId,
      });
    }

    return Response.json({
      ok: true,
      sent: allOk,
      phone,
      sr_id: sr.id,
      remaining: eligible.length - 1,
    });
  } catch (error) {
    console.error('sendBulkPostLectureReminder error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});