import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { event, data, old_data } = body;

    // Only handle update events
    if (event?.type !== 'update' || !data || !old_data) {
      return Response.json({ ok: true, skipped: true });
    }

    const newStatus = data.status;
    const oldStatus = old_data.status;
    const requestId = event.entity_id;

    // Skip if status didn't change
    if (newStatus === oldStatus) {
      return Response.json({ ok: true, skipped: true, reason: 'status_unchanged' });
    }

    console.log(`Status changed: ${oldStatus} -> ${newStatus} for request ${requestId}, type: ${data.service_type}`);

    const updates = {};
    const timelineEntries = [];

    // Handle status -> paid
    if (newStatus === 'paid' && oldStatus !== 'paid') {
      updates.payment_confirmed = true;

      timelineEntries.push({
        service_request_id: requestId,
        event_type: 'system_note',
        description: 'תשלום אושר אוטומטית - הבוט ימשיך בתהליך',
        old_value: oldStatus,
        new_value: 'paid',
      });

      // Determine next step based on service type
      const serviceType = data.service_type;
      if (serviceType === 'consultation') {
        updates.current_step = 'confirm_payment';
        await sendBotContinuation(base44, data, requestId, 'paid_consultation');
      } else if (serviceType === 'legal') {
        updates.current_step = 'send_privacy_message';
        await sendBotContinuation(base44, data, requestId, 'paid_legal');
      } else if (serviceType === 'post_lecture') {
        updates.current_step = 'confirm_payment';
        await sendBotContinuation(base44, data, requestId, 'paid_post_lecture');
      } else if (serviceType === 'lectures') {
        updates.current_step = 'confirm_payment';
        await sendBotContinuation(base44, data, requestId, 'paid_lectures');
      }
    }

    // Handle status -> in_review
    if (newStatus === 'in_review' && oldStatus !== 'in_review') {
      if (!data.processing_start_date) {
        updates.processing_start_date = new Date().toISOString();
      }

      timelineEntries.push({
        service_request_id: requestId,
        event_type: 'status_change',
        description: 'תחילת טיפול - תאריך עיבוד נשמר אוטומטית',
        old_value: oldStatus,
        new_value: 'in_review',
      });
    }

    // Handle status -> scheduled
    if (newStatus === 'scheduled' && oldStatus !== 'scheduled') {
      timelineEntries.push({
        service_request_id: requestId,
        event_type: 'status_change',
        description: 'תור נקבע',
        old_value: oldStatus,
        new_value: 'scheduled',
      });

      if (data.service_type === 'consultation') {
        await sendBotContinuation(base44, data, requestId, 'scheduled_consultation');
      }
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      await base44.asServiceRole.entities.ServiceRequest.update(requestId, updates);
      console.log('Applied updates:', updates);
    }

    // Create timeline entries
    for (const entry of timelineEntries) {
      await base44.asServiceRole.entities.ServiceRequestTimeline.create(entry);
    }

    // If status changed to whatsapp_message_to_check, log it
    if (newStatus === 'whatsapp_message_to_check') {
      await base44.asServiceRole.entities.ServiceRequestTimeline.create({
        service_request_id: requestId,
        event_type: 'system_note',
        description: 'הבוט הועבר לבדיקה אנושית - הבוט עצר',
        old_value: oldStatus,
        new_value: 'whatsapp_message_to_check',
      });
    }

    return Response.json({ ok: true, updates, timelineCount: timelineEntries.length });
  } catch (error) {
    console.error('Error in onServiceRequestUpdate:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function sendBotContinuation(base44, requestData, requestId, triggerType) {
  try {
    const contactId = requestData.contact_id;
    const contactName = requestData.contact_name || '';
    const contactPhone = requestData.contact_phone || '';

    if (!contactId) {
      console.log('No contact_id found, skipping bot continuation');
      return;
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
      return;
    }

    console.log(`Bot message ready (${botMessage.length} chars), searching for conversation...`);

    // Find existing conversation for this contact
    const conversations = await base44.asServiceRole.agents.listConversations({ q: { agent_name: 'dr_adri_bot' }, limit: 100 });
    console.log(`Found ${conversations.length} total conversations`);

    let targetConversation = null;
    for (const conv of conversations) {
      const meta = conv.metadata || {};
      if (meta.contact_id === contactId || meta.phone === contactPhone) {
        targetConversation = conv;
        console.log(`Found matching conversation: ${conv.id}`);
        break;
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
    } else {
      console.log('No conversation found for contact:', contactId, contactPhone);
      await base44.asServiceRole.entities.ServiceRequestTimeline.create({
        service_request_id: requestId,
        event_type: 'system_note',
        description: `הודעת המשך תהליך (${triggerType}) לא נשלחה - לא נמצאה שיחה פעילה עבור ${contactName}. יש לשלוח ידנית.`,
      });
    }
  } catch (error) {
    console.error('Error sending bot continuation:', error);
    await base44.asServiceRole.entities.ServiceRequestTimeline.create({
      service_request_id: requestId,
      event_type: 'system_note',
      description: `שגיאה בשליחת הודעת המשך: ${error.message}`,
    });
  }
}