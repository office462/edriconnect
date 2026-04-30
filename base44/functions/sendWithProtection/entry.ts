import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { phone, message } = body;
    if (!phone || !message) {
      return Response.json({ error: 'phone and message are required' }, { status: 400 });
    }

    // --- Check daily limit ---
    const limitSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_daily_limit' });
    const dailyLimit = limitSettings.length > 0 ? parseInt(limitSettings[0].value, 10) : 30;

    // Count today's outgoing messages (Israel timezone)
    const now = new Date();
    const israelTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
    const todayStart = new Date(israelTime);
    todayStart.setHours(0, 0, 0, 0);
    // Convert back to UTC for query
    const offsetMs = now.getTime() - israelTime.getTime();
    const todayStartUTC = new Date(todayStart.getTime() + offsetMs);

    const todayOutgoing = await base44.asServiceRole.entities.WhatsAppMessageLog.filter(
      { direction: 'outgoing' },
      '-created_date',
      200
    );
    const todayCount = todayOutgoing.filter(m => new Date(m.created_date) >= todayStartUTC).length;

    if (todayCount >= dailyLimit) {
      console.log(`Daily limit reached: ${todayCount}/${dailyLimit}. Skipping send to ${phone}`);
      // Log the blocked message
      await base44.asServiceRole.entities.WhatsAppMessageLog.create({
        id_message: `limit_${Date.now()}`,
        phone,
        direction: 'outgoing',
        text: message.substring(0, 500),
        status: 'daily_limit_reached',
      });
      return Response.json({ sent: false, reason: 'daily_limit_reached', count: todayCount, limit: dailyLimit });
    }

    // --- Random delay 8-25 seconds ---
    const delayMs = Math.floor(Math.random() * (25000 - 8000 + 1)) + 8000;
    console.log(`sendWithProtection: waiting ${Math.round(delayMs / 1000)}s before sending to ${phone}`);
    await new Promise(r => setTimeout(r, delayMs));

    // --- Send via Green API ---
    const instanceId = Deno.env.get('GREEN_API_INSTANCE_ID');
    const token = Deno.env.get('GREEN_API_TOKEN');

    let cleanPhone = phone.replace(/[\s\-\+]/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '972' + cleanPhone.substring(1);
    }
    const chatId = `${cleanPhone}@c.us`;

    const url = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message }),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error('Green API error:', result);
      return Response.json({ sent: false, reason: 'green_api_error', error: result });
    }

    // Log outgoing message
    await base44.asServiceRole.entities.WhatsAppMessageLog.create({
      id_message: result.idMessage || `out_${Date.now()}`,
      phone: cleanPhone,
      direction: 'outgoing',
      text: message.substring(0, 500),
      status: 'replied',
      chat_id: chatId,
    });

    console.log(`sendWithProtection: sent to ${chatId} (delay ${Math.round(delayMs / 1000)}s, count ${todayCount + 1}/${dailyLimit})`);
    return Response.json({ sent: true, result, count: todayCount + 1, limit: dailyLimit });
  } catch (error) {
    console.error('sendWithProtection error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});