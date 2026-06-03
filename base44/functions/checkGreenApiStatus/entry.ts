import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const instanceId = Deno.env.get('GREEN_API_INSTANCE_ID');
    const token = Deno.env.get('GREEN_API_TOKEN');

    // Check instance state
    const stateResp = await fetch(`https://api.green-api.com/waInstance${instanceId}/getStateInstance/${token}`);
    const stateData = await stateResp.json();

    // Check webhook settings
    const settingsResp = await fetch(`https://api.green-api.com/waInstance${instanceId}/getSettings/${token}`);
    const settingsData = await settingsResp.json();

    // Check incoming notification queue
    const queueResp = await fetch(`https://api.green-api.com/waInstance${instanceId}/receiveNotification/${token}`);
    let queueData = null;
    try {
      queueData = await queueResp.json();
    } catch (_) {}

    // Get recent incoming messages
    const journalResp = await fetch(`https://api.green-api.com/waInstance${instanceId}/lastIncomingMessages/${token}`);
    let recentMessages = [];
    try {
      recentMessages = await journalResp.json();
      if (Array.isArray(recentMessages)) {
        recentMessages = recentMessages.slice(0, 15).map(m => ({
          chatId: m.chatId,
          type: m.typeMessage,
          text: (m.textMessage || m.extendedTextMessage?.text || '').substring(0, 80),
          timestamp: m.timestamp,
        }));
      }
    } catch (_) {}

    // Get recent outgoing messages
    const outResp = await fetch(`https://api.green-api.com/waInstance${instanceId}/lastOutgoingMessages/${token}`);
    let recentOutgoing = [];
    try {
      recentOutgoing = await outResp.json();
      if (Array.isArray(recentOutgoing)) {
        recentOutgoing = recentOutgoing.slice(0, 10).map(m => ({
          chatId: m.chatId,
          type: m.typeMessage,
          text: (m.textMessage || m.extendedTextMessage?.text || '').substring(0, 80),
          timestamp: m.timestamp,
        }));
      }
    } catch (_) {}

    return Response.json({
      instance_state: stateData,
      webhook_url: settingsData.webhookUrl || 'NOT SET',
      webhook_enabled: settingsData.incomingWebhook || false,
      outgoing_webhook: settingsData.outgoingWebhook || false,
      delaySendMessagesMilliseconds: settingsData.delaySendMessagesMilliseconds,
      notification_queue_item: queueData,
      recent_incoming_messages: recentMessages,
      recent_outgoing_messages: recentOutgoing,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});