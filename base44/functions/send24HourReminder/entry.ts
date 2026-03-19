import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Get all active service requests (not completed)
    const activeStatuses = ['new_lead', 'pending', 'whatsapp_message_to_check', 'in_review', 'paid', 'scheduled'];
    const allRequests = await base44.asServiceRole.entities.ServiceRequest.list('-updated_date', 200);

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get reminder message from BotContent
    const reminderContent = await base44.asServiceRole.entities.BotContent.filter({ key: 'system_reminder_24h' });
    const reminderMessage = reminderContent.length > 0
      ? reminderContent[0].content
      : 'היי, רק רצינו לוודא שקיבלת את ההודעה שלנו. האם תרצה להמשיך?';

    // Get all bot conversations (user scope - service role doesn't see conversations)
    const conversations = await base44.agents.listConversations({ agent_name: 'dr_adri_bot' });

    let sentCount = 0;
    let skippedCount = 0;
    const results = [];

    for (const request of allRequests) {
      // Only process active requests
      if (!activeStatuses.includes(request.status)) {
        continue;
      }

      // Skip if status is completed
      if (request.status === 'completed') {
        continue;
      }

      // Check if last update was more than 24 hours ago
      const lastUpdate = new Date(request.updated_date);
      if (lastUpdate > twentyFourHoursAgo) {
        // Updated within 24 hours, skip
        skippedCount++;
        continue;
      }

      const contactId = request.contact_id;
      if (!contactId) {
        skippedCount++;
        continue;
      }

      // Find conversation for this contact
      let targetConversation = null;
      for (const conv of conversations) {
        if (conv.metadata?.contact_id === contactId) {
          targetConversation = conv;
          break;
        }
      }

      if (!targetConversation) {
        // No conversation found, log it
        skippedCount++;
        results.push({
          requestId: request.id,
          contactName: request.contact_name,
          status: 'no_conversation',
        });
        continue;
      }

      // Check if the last message in the conversation was from the bot (assistant)
      // If so, it means the user hasn't responded yet - send reminder
      const messages = targetConversation.messages || [];
      if (messages.length === 0) {
        skippedCount++;
        continue;
      }

      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role !== 'assistant') {
        // Last message was from user, skip (they responded)
        skippedCount++;
        continue;
      }

      // Check if last message was sent more than 24 hours ago
      const lastMessageDate = new Date(lastMessage.created_at || lastMessage.timestamp || targetConversation.updated_date);
      if (lastMessageDate > twentyFourHoursAgo) {
        // Last bot message was within 24 hours, skip
        skippedCount++;
        continue;
      }

      // Check if we already sent a reminder recently (avoid spamming)
      const isLastMessageReminder = lastMessage.content && lastMessage.content.includes('רצינו לוודא');
      if (isLastMessageReminder) {
        skippedCount++;
        results.push({
          requestId: request.id,
          contactName: request.contact_name,
          status: 'already_reminded',
        });
        continue;
      }

      // Send reminder
      const personalizedMessage = reminderMessage.replace('{שם}', request.contact_name || '');
      await base44.asServiceRole.agents.addMessage(targetConversation, {
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
      results.push({
        requestId: request.id,
        contactName: request.contact_name,
        status: 'reminder_sent',
      });
    }

    console.log(`24h Reminder: sent=${sentCount}, skipped=${skippedCount}`);

    return Response.json({
      ok: true,
      sent: sentCount,
      skipped: skippedCount,
      details: results,
    });
  } catch (error) {
    console.error('Error in send24HourReminder:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});