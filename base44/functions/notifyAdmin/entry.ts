import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { service_request_id, reason, context_message } = body;

    if (!service_request_id || !reason) {
      return Response.json({ error: 'service_request_id and reason are required' }, { status: 400 });
    }

    // 1. שלוף פרטי הפנייה
    const sr = await base44.asServiceRole.entities.ServiceRequest.get(service_request_id);
    if (!sr) {
      return Response.json({ error: 'ServiceRequest not found' }, { status: 404 });
    }

    // 2. שלוף מספר וואטסאפ של האדמין מ-SystemSetting
    const allSettings = await base44.asServiceRole.entities.SystemSetting.list();
    const adminPhone = allSettings.find(s => s.key === 'admin_whatsapp_phone')?.value || '';

    // 3. Green API credentials מ-env vars
    const instanceId = Deno.env.get('GREEN_API_INSTANCE_ID');
    const token = Deno.env.get('GREEN_API_TOKEN');

    // 4. בנה הודעה לליאת
    const serviceTypeMap = {
      consultation: 'ייעוץ',
      legal: 'חוות דעת משפטית',
      lectures: 'הרצאות',
      clinic: 'קליניקה',
      post_lecture: 'פוסט-הרצאה',
    };
    const serviceTypeHe = serviceTypeMap[sr.service_type] || sr.service_type;
    const contextLine = context_message ? `\nפרטים: ${context_message}` : '';

    const alertMessage = [
      '🔔 *התראה מהבוט*',
      `👤 פונה: ${sr.contact_name || 'לא ידוע'} | ${sr.contact_phone || ''}`,
      `📋 מסלול: ${serviceTypeHe}`,
      `📍 שלב: ${sr.current_step || 'לא ידוע'}`,
      `⚠️ סיבה: ${reason}`,
      contextLine,
    ].filter(Boolean).join('\n');

    // 5. שלח ווצאפ לליאת דרך Green API
    let whatsappSent = false;
    if (adminPhone && instanceId && token) {
      const chatId = `${adminPhone}@c.us`;
      const apiUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
      const waResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message: alertMessage }),
      });
      whatsappSent = waResponse.ok;
      console.log('notifyAdmin: WhatsApp sent =', whatsappSent, 'to', adminPhone);
    } else {
      console.warn('notifyAdmin: missing config — adminPhone:', !!adminPhone, 'instanceId:', !!instanceId, 'token:', !!token);
    }

    // 6. עדכן סטטוס הפנייה
    await base44.asServiceRole.entities.ServiceRequest.update(service_request_id, {
      status: 'pending_human',
    });

    // 7. רשום בטיימליין
    await base44.asServiceRole.entities.ServiceRequestTimeline.create({
      service_request_id,
      event_type: 'system_note',
      description: `התראה נשלחה לאדמין: ${reason}${whatsappSent ? ' ✓ ווצאפ נשלח' : ' ⚠ ווצאפ לא נשלח — בדוק הגדרות'}`,
      metadata: JSON.stringify({ reason, context_message, whatsappSent }),
    });

    console.log(`notifyAdmin: done for request ${service_request_id}, reason="${reason}", whatsappSent=${whatsappSent}`);

    return Response.json({
      ok: true,
      whatsappSent,
      newStatus: 'pending_human',
    });
  } catch (error) {
    console.error('notifyAdmin error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});