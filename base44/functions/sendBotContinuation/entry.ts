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

    } else if (triggerType === 'questionnaire_completed') {
      const settings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'questionnaire_completed_message' });
      botMessage = settings.length > 0
        ? settings[0].value.replace('{שם פרטי}', contactName).replace('{שם}', contactName)
        : `היי ${contactName}, ראינו שמילאת את השאלון! תודה רבה, אעבור עליו בהקדם.`;
    }

    if (!botMessage) {
      console.log('No message to send for trigger:', triggerType);
      return Response.json({ ok: true, sent: false, reason: 'no_message' });
    }

    // Return message to frontend for sending (service role cannot access WhatsApp conversations)
    console.log('Returning bot message for frontend to send, trigger:', triggerType);
    return Response.json({
      ok: true,
      sent: false,
      pendingMessage: {
        conversationId: conversationId || null,
        message: botMessage,
        triggerType,
        contactName,
      }
    });

  } catch (error) {
    console.error('Error in sendBotContinuation:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});