import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { requestId, contactId, contactName, contactPhone, serviceType, triggerType, conversationId } = await req.json();

    if (!requestId || !triggerType) {
      return Response.json({ ok: false, reason: 'missing params' });
    }

    console.log(`sendBotContinuation: trigger=${triggerType}, contact=${contactName}, phone=${contactPhone}`);

    // Build the message based on trigger type
    let botMessage = '';

    if (triggerType === 'paid_consultation') {
      const settings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'consultation_payment_confirmed' });
      botMessage = settings.length > 0
        ? settings[0].value.replace('{שם פרטי}', contactName).replace('{שם}', contactName)
        : `היי ${contactName}, קיבלתי את התשלום והשאלון ואעבור עליו בהקדם!`;

      const appointmentSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'consultation_appointments' });
      if (appointmentSettings.length > 0) botMessage += '\n\n' + appointmentSettings[0].value;

      const calendarSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'calendar_link' });
      if (calendarSettings.length > 0) botMessage += '\n\nקישור ליומן: ' + calendarSettings[0].value;

    } else if (triggerType === 'paid_legal') {
      const paymentConfirmContent = await base44.asServiceRole.entities.BotContent.filter({ key: 'legal_payment_confirmed' });
      botMessage = paymentConfirmContent.length > 0
        ? paymentConfirmContent[0].content
        : `היי ${contactName}, ראינו ששילמת! תודה רבה.`;

      const privacyContent = await base44.asServiceRole.entities.BotContent.filter({ key: 'privacy_message' });
      if (privacyContent.length > 0) botMessage += '\n\n' + privacyContent[0].content;

      const docContent = await base44.asServiceRole.entities.BotContent.filter({ key: 'legal_documents_request' });
      if (docContent.length > 0) botMessage += '\n\n' + docContent[0].content;

    } else if (triggerType === 'paid_post_lecture') {
      const paymentContent = await base44.asServiceRole.entities.BotContent.filter({ key: 'post_lecture_payment_confirmed' });
      botMessage = paymentContent.length > 0
        ? paymentContent[0].content.replace('{שם}', contactName).replace('{שם פרטי}', contactName)
        : `היי ${contactName}, קיבלנו את התשלום! תודה רבה.`;

    } else if (triggerType === 'paid_lectures') {
      const paymentContent = await base44.asServiceRole.entities.BotContent.filter({ key: 'lectures_payment_confirmed' });
      botMessage = paymentContent.length > 0
        ? paymentContent[0].content.replace('{שם}', contactName).replace('{שם פרטי}', contactName)
        : `היי ${contactName}, קיבלנו את התשלום! תודה רבה.`;

    } else if (triggerType === 'scheduled_consultation') {
      const locationSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'location_directions' });
      botMessage = locationSettings.length > 0
        ? locationSettings[0].value
        : 'הגעה ל-MedWork\n• מרכז מסחרי רננים, מודיעין מכבים רעות';
    }

    if (!botMessage) {
      console.log('No message to send for trigger:', triggerType);
      return Response.json({ ok: true, sent: false, reason: 'no_message' });
    }

    // Find conversation - use provided ID or search
    let targetConversation = null;

    if (conversationId) {
      targetConversation = await base44.asServiceRole.agents.getConversation(conversationId);
      console.log(`Using provided conversation_id: ${conversationId}`);
    }

    // Fallback: search by phone in recent conversations
    if (!targetConversation && contactPhone) {
      console.log('Searching for conversation by phone...');
      const conversations = await base44.asServiceRole.agents.listConversations({
        agent_name: 'dr_adri_bot',
        sort: '-created_date',
        limit: 50,
      });

      for (const conv of conversations) {
        const msgs = conv.messages || [];
        for (const msg of msgs) {
          if (msg.tool_calls) {
            for (const tc of msg.tool_calls) {
              const args = tc.arguments_string || '';
              if (args.includes(contactPhone)) {
                targetConversation = conv;
                // Save conversation_id on the request for future use
                await base44.asServiceRole.entities.ServiceRequest.update(requestId, { conversation_id: conv.id });
                console.log(`Found and saved conversation: ${conv.id}`);
                break;
              }
            }
            if (targetConversation) break;
          }
        }
        if (targetConversation) break;
      }
    }

    if (targetConversation) {
      await base44.asServiceRole.agents.addMessage(targetConversation, {
        role: 'assistant',
        content: botMessage,
      });
      console.log('Bot message sent successfully');

      await base44.asServiceRole.entities.ServiceRequestTimeline.create({
        service_request_id: requestId,
        event_type: 'message_sent',
        description: `הודעת ${triggerType} נשלחה ל${contactName} בשיחת הבוט`,
      });

      return Response.json({ ok: true, sent: true });
    } else {
      console.log('No conversation found for contact:', contactId, contactPhone);
      await base44.asServiceRole.entities.ServiceRequestTimeline.create({
        service_request_id: requestId,
        event_type: 'system_note',
        description: `הודעת המשך תהליך (${triggerType}) לא נשלחה - לא נמצאה שיחה פעילה עבור ${contactName}. יש לשלוח ידנית.`,
      });

      return Response.json({ ok: true, sent: false, reason: 'no_conversation' });
    }
  } catch (error) {
    console.error('Error in sendBotContinuation:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});