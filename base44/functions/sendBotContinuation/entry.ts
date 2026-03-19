import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { requestId, contactId, contactName, contactPhone, serviceType, triggerType } = await req.json();

    if (!contactId || !triggerType) {
      return Response.json({ ok: false, reason: 'missing params' });
    }

    console.log(`sendBotContinuation: trigger=${triggerType}, contact=${contactName}, phone=${contactPhone}`);

    // Build the message based on trigger type
    let botMessage = '';

    if (triggerType === 'paid_consultation') {
      const settings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'consultation_payment_confirmed' });
      if (settings.length > 0) {
        botMessage = settings[0].value.replace('{שם פרטי}', contactName).replace('{שם}', contactName);
      } else {
        botMessage = `היי ${contactName}, קיבלתי את התשלום והשאלון ואעבור עליו בהקדם!`;
      }

      const appointmentSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'consultation_appointments' });
      if (appointmentSettings.length > 0) {
        botMessage += '\n\n' + appointmentSettings[0].value;
      }

      const calendarSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'calendar_link' });
      if (calendarSettings.length > 0) {
        botMessage += '\n\nקישור ליומן: ' + calendarSettings[0].value;
      }

    } else if (triggerType === 'paid_legal') {
      const paymentConfirmContent = await base44.asServiceRole.entities.BotContent.filter({ key: 'legal_payment_confirmed' });
      if (paymentConfirmContent.length > 0) {
        botMessage = paymentConfirmContent[0].content;
      } else {
        botMessage = `היי ${contactName}, ראינו ששילמת! תודה רבה.`;
      }

      const privacyContent = await base44.asServiceRole.entities.BotContent.filter({ key: 'privacy_message' });
      if (privacyContent.length > 0) {
        botMessage += '\n\n' + privacyContent[0].content;
      }

      const docContent = await base44.asServiceRole.entities.BotContent.filter({ key: 'legal_documents_request' });
      if (docContent.length > 0) {
        botMessage += '\n\n' + docContent[0].content;
      }

    } else if (triggerType === 'paid_post_lecture') {
      const paymentContent = await base44.asServiceRole.entities.BotContent.filter({ key: 'post_lecture_payment_confirmed' });
      if (paymentContent.length > 0) {
        botMessage = paymentContent[0].content.replace('{שם}', contactName).replace('{שם פרטי}', contactName);
      } else {
        botMessage = `היי ${contactName}, קיבלנו את התשלום! תודה רבה. ניצור איתך קשר בהקדם להמשך התהליך.`;
      }

    } else if (triggerType === 'paid_lectures') {
      const paymentContent = await base44.asServiceRole.entities.BotContent.filter({ key: 'lectures_payment_confirmed' });
      if (paymentContent.length > 0) {
        botMessage = paymentContent[0].content.replace('{שם}', contactName).replace('{שם פרטי}', contactName);
      } else {
        botMessage = `היי ${contactName}, קיבלנו את התשלום! תודה רבה. ניצור איתך קשר בהקדם.`;
      }

    } else if (triggerType === 'scheduled_consultation') {
      const locationSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'location_directions' });
      if (locationSettings.length > 0) {
        botMessage = locationSettings[0].value;
      } else {
        botMessage = 'הגעה ל-MedWork\n• מרכז מסחרי רננים, מודיעין מכבים רעות\n• כיתוב ענק על הבניין\n• 2 חניונים במקביל\n• קומה 2 (מעל הפיצה, מול Remax וחב"ד)\n• מעלית ושני גרמי מדרגות\n• חפשו את הלוגו';
      }
    }

    if (!botMessage) {
      console.log('No message to send for trigger:', triggerType);
      return Response.json({ ok: true, reason: 'no_message' });
    }

    console.log(`Bot message ready (${botMessage.length} chars), searching for conversation...`);

    // Find existing conversation for this contact
    const conversations = await base44.agents.listConversations({ agent_name: 'dr_adri_bot' });
    console.log(`Found ${conversations.length} total conversations`);

    let targetConversation = null;
    for (const conv of conversations) {
      // Check metadata first
      const meta = conv.metadata || {};
      if (meta.contact_id === contactId || meta.phone === contactPhone) {
        targetConversation = conv;
        console.log(`Found matching conversation via metadata: ${conv.id}`);
        break;
      }
      // Check tool_calls in messages for contact references
      const msgs = conv.messages || [];
      let found = false;
      for (const msg of msgs) {
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            const args = tc.arguments_string || '';
            if (args.includes(contactId) || (contactPhone && args.includes(contactPhone))) {
              found = true;
              break;
            }
          }
        }
        if (found) break;
      }
      if (found) {
        targetConversation = conv;
        console.log(`Found matching conversation via tool_calls: ${conv.id}`);
        break;
      }
    }

    if (targetConversation) {
      await base44.agents.addMessage(targetConversation, {
        role: 'assistant',
        content: botMessage,
      });
      console.log('Bot message sent successfully');

      await base44.asServiceRole.entities.ServiceRequestTimeline.create({
        service_request_id: requestId,
        event_type: 'message_sent',
        description: `הודעת ${triggerType} נשלחה ל${contactName} בשיחת הבוט`,
      });
    } else {
      console.log('No conversation found for contact:', contactId, contactPhone);
      await base44.asServiceRole.entities.ServiceRequestTimeline.create({
        service_request_id: requestId,
        event_type: 'system_note',
        description: `הודעת המשך תהליך (${triggerType}) לא נשלחה - לא נמצאה שיחה פעילה עבור ${contactName}. יש לשלוח ידנית.`,
      });
    }

    return Response.json({ ok: true, sent: !!targetConversation });
  } catch (error) {
    console.error('Error in sendBotContinuation:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});