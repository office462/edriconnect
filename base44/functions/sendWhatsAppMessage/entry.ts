import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { phone, message, force } = body;
    if (!phone || !message) {
      return Response.json({ error: 'phone and message are required' }, { status: 400 });
    }

    // Check if WhatsApp bot is enabled (skip check if force=true for test messages)
    if (!force) {
      const botSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' });
      const botEnabled = botSettings.length > 0 && botSettings[0].value === 'true';
      if (!botEnabled) {
        console.log('sendWhatsAppMessage: bot disabled, skipping');
        return Response.json({ ok: true, skipped: true, reason: 'bot_disabled' });
      }
    }

    const result = await sendViaGreenApi(phone, message);
    return Response.json({ ok: true, result });
  } catch (error) {
    console.error('sendWhatsAppMessage error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function sendViaGreenApi(phone, message) {
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
    throw new Error(`Green API error: ${JSON.stringify(result)}`);
  }

  console.log(`WhatsApp sent to ${chatId}`);
  return result;
}