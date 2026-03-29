import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get all active service requests (not completed)
    const activeStatuses = ['new_lead', 'pending', 'whatsapp_message_to_check', 'in_review', 'paid', 'scheduled'];
    const allRequests = await base44.asServiceRole.entities.ServiceRequest.list('-updated_date', 200);

    // Filter to only active requests that haven't been updated in 24h
    const staleRequests = allRequests.filter(r => 
      activeStatuses.includes(r.status) &&
      r.contact_id &&
      r.conversation_id &&
      new Date(r.updated_date) < twentyFourHoursAgo
    );

    if (staleRequests.length === 0) {
      console.log('24h Reminder: no stale requests found');
      return Response.json({ ok: true, sent: 0, skipped: 0, details: [] });
    }

    // Get reminder message from BotContent
    const reminderContent = await base44.asServiceRole.entities.BotContent.filter({ key: 'system_reminder_24h' });
    const reminderMessage = reminderContent.length > 0
      ? reminderContent[0].content
      : 'היי, רק רצינו לוודא שקיבלת את ההודעה שלנו. האם תרצה להמשיך?';

    let sentCount = 0;
    let skippedCount = 0;
    const results = [];

    for (const request of staleRequests) {
      const conversationId = request.conversation_id;

      // Validate conversation_id format (should be 24-char hex)
      if (!/^[a-f0-9]{24}$/i.test(conversationId)) {
        skippedCount++;
        continue;
      }

      let conversation;
      try {
        conversation = await base44.asServiceRole.agents.getConversation(conversationId);
      } catch {
        skippedCount++;
        results.push({ requestId: request.id, contactName: request.contact_name, status: 'conversation_not_found' });
        continue;
      }

      const messages = conversation.messages || [];
      if (messages.length === 0) {
        skippedCount++;
        continue;
      }

      const lastMessage = messages[messages.length - 1];

      // Only remind if last message was from bot (user hasn't responded)
      if (lastMessage.role !== 'assistant') {
        skippedCount++;
        continue;
      }

      // Check if last message was sent more than 24 hours ago
      const lastMessageDate = new Date(lastMessage.created_at || lastMessage.timestamp || conversation.updated_date);
      if (lastMessageDate > twentyFourHoursAgo) {
        skippedCount++;
        continue;
      }

      // Avoid spamming — skip if last message is already a reminder
      if (lastMessage.content && lastMessage.content.includes('רצינו לוודא')) {
        skippedCount++;
        results.push({ requestId: request.id, contactName: request.contact_name, status: 'already_reminded' });
        continue;
      }

      // Send reminder
      const personalizedMessage = reminderMessage.replace('{שם}', request.contact_name || '');
      await base44.asServiceRole.agents.addMessage(conversation, {
        role: 'assistant',
        content: personalizedMessage,
      });

      // Log in timeline
      await base44.asServiceRole.entities.ServiceRequestTimeline.create({
        service_request_id: request.id,
        event_type: 'message_sent',
        description: `תזכורת 24 שעות נשלחה אוטומטית ל${request.contact_name || 'איש קשר'}`,
      });

      sentCount++;
      results.push({ requestId: request.id, contactName: request.contact_name, status: 'reminder_sent' });
    }

    console.log(`24h Reminder: sent=${sentCount}, skipped=${skippedCount}, checked=${staleRequests.length}`);

    return Response.json({ ok: true, sent: sentCount, skipped: skippedCount, details: results });
  } catch (error) {
    console.error('Error in send24HourReminder:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});