import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Check if WhatsApp bot is enabled
    const botSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' });
    const botEnabled = botSettings.length > 0 && botSettings[0].value === 'true';
    if (!botEnabled) {
      console.log('sendFollowup48h: bot disabled, skipping');
      return Response.json({ ok: true, skipped: true, reason: 'bot_disabled' });
    }

    const now = new Date();
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Get all pending_human requests
    const allRequests = await base44.asServiceRole.entities.ServiceRequest.list('-updated_date', 200);
    const pendingHuman = allRequests.filter(r =>
      r.status === 'pending_human' &&
      r.contact_id &&
      r.conversation_id &&
      new Date(r.updated_date) < fortyEightHoursAgo
    );

    if (pendingHuman.length === 0) {
      console.log('sendFollowup48h: no eligible requests');
      return Response.json({ ok: true, sent: 0 });
    }

    // Get followup message
    const followupContent = await base44.asServiceRole.entities.BotContent.filter({ key: 'followup_48h' });
    const followupMessage = followupContent.length > 0
      ? followupContent[0].content
      : 'שלום {שם}, האם קיבלת מענה מד״ר ליאת אדרי? אשמח לתשובתך 🙏\nכן / לא';

    let sentCount = 0;
    const results = [];

    for (const request of pendingHuman) {
      // Check if followup was already sent
      const timeline = await base44.asServiceRole.entities.ServiceRequestTimeline.filter(
        { service_request_id: request.id, event_type: 'message_sent' },
        '-created_date', 10
      );
      const alreadySent = timeline.some(t => t.description && t.description.includes('followup_48h'));
      if (alreadySent) {
        continue;
      }

      const conversationId = request.conversation_id;
      if (!/^[a-f0-9]{24}$/i.test(conversationId)) continue;

      let conversation;
      try {
        conversation = await base44.asServiceRole.agents.getConversation(conversationId);
      } catch {
        continue;
      }

      const personalizedMessage = followupMessage.replace('{שם}', request.contact_name || '');

      // Send to bot conversation
      await base44.asServiceRole.agents.addMessage(conversation, {
        role: 'assistant',
        content: personalizedMessage,
      });

      // Send via WhatsApp with protection (delay + daily limit)
      if (request.contact_phone) {
        try {
          const protResult = await base44.asServiceRole.functions.invoke('sendWithProtection', {
            phone: request.contact_phone,
            message: personalizedMessage,
          });
          if (protResult.sent) {
            console.log(`48h followup sent via WhatsApp to ${request.contact_phone} (${protResult.count}/${protResult.limit})`);
          } else {
            console.log(`48h followup skipped for ${request.contact_name}: ${protResult.reason}`);
            if (protResult.reason === 'daily_limit_reached') continue;
          }
        } catch (waErr) {
          console.warn('sendFollowup48h: WhatsApp error:', waErr.message);
        }
      }

      // Log
      await base44.asServiceRole.entities.ServiceRequestTimeline.create({
        service_request_id: request.id,
        event_type: 'message_sent',
        description: 'הודעת followup_48h נשלחה אוטומטית',
      });

      sentCount++;
      results.push({ requestId: request.id, contactName: request.contact_name });
    }

    console.log(`sendFollowup48h: sent=${sentCount}`);
    return Response.json({ ok: true, sent: sentCount, details: results });
  } catch (error) {
    console.error('sendFollowup48h error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});