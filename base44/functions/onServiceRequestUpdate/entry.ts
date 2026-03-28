import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { event, data, old_data } = body;

    if (event?.type !== 'update' || !data || !old_data) {
      return Response.json({ ok: true, skipped: true });
    }

    const newStatus = data.status;
    const oldStatus = old_data.status;
    const requestId = event.entity_id;

    if (newStatus === oldStatus) {
      return Response.json({ ok: true, skipped: true, reason: 'status_unchanged' });
    }

    console.log(`Status changed: ${oldStatus} -> ${newStatus} for request ${requestId}, type: ${data.service_type}`);

    const updates = {};
    const timelineEntries = [];
    let botTrigger = null;

    // Handle status -> paid
    if (newStatus === 'paid' && oldStatus !== 'paid') {
      updates.payment_confirmed = true;

      // Fetch latest request to check questionnaire status
      const latestReq = await base44.asServiceRole.entities.ServiceRequest.get(requestId);
      const questionnaireAlreadyDone = latestReq.questionnaire_completed === true;

      timelineEntries.push({
        service_request_id: requestId,
        event_type: 'system_note',
        description: 'תשלום אושר אוטומטית',
        old_value: oldStatus,
        new_value: 'paid',
      });

      const serviceType = data.service_type;

      if (serviceType === 'consultation') {
        if (questionnaireAlreadyDone) {
          // Both conditions met — ready to schedule
          updates.current_step = 'ready_to_schedule';
          botTrigger = 'ready_to_schedule';
        } else {
          // Paid but questionnaire missing
          updates.current_step = 'payment_confirmed_awaiting_questionnaire';
          botTrigger = 'payment_confirmed_awaiting_questionnaire';
        }
      } else if (serviceType === 'legal') {
        updates.current_step = 'send_privacy_message';
        botTrigger = 'paid_legal';
      } else if (serviceType === 'post_lecture') {
        updates.current_step = 'confirm_payment';
        botTrigger = 'paid_post_lecture';
      } else if (serviceType === 'lectures') {
        updates.current_step = 'confirm_payment';
        botTrigger = 'paid_lectures';
      }
    }

    // Handle status -> questionnaire_completed
    if (newStatus === 'questionnaire_completed' && oldStatus !== 'questionnaire_completed') {
      updates.questionnaire_completed = true;

      // Fetch latest request to check payment status
      const latestReqQ = await base44.asServiceRole.entities.ServiceRequest.get(requestId);
      const paymentAlreadyDone = latestReqQ.payment_confirmed === true;

      timelineEntries.push({
        service_request_id: requestId,
        event_type: 'system_note',
        description: 'שאלון מולא',
        old_value: oldStatus,
        new_value: 'questionnaire_completed',
      });

      if (paymentAlreadyDone) {
        // Both conditions met — ready to schedule
        updates.current_step = 'ready_to_schedule';
        botTrigger = 'ready_to_schedule';
      } else {
        // Questionnaire done but payment missing
        updates.current_step = 'questionnaire_completed_awaiting_payment';
        botTrigger = 'questionnaire_completed_awaiting_payment';
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
      // Verify conditions are met before allowing scheduling
      const latestReqSched = await base44.asServiceRole.entities.ServiceRequest.get(requestId);

      // Legal: require payment + agreement
      if (data.service_type === 'legal' && (!latestReqSched.payment_confirmed || !latestReqSched.agreement_confirmed)) {
        const missing = [];
        if (!latestReqSched.payment_confirmed) missing.push('תשלום');
        if (!latestReqSched.agreement_confirmed) missing.push('הסכם');
        console.log('Cannot schedule legal: missing ' + missing.join(', '));
        timelineEntries.push({
          service_request_id: requestId,
          event_type: 'system_note',
          description: `ניסיון קביעת תור נחסם - חסר: ${missing.join(', ')}`,
          old_value: oldStatus,
          new_value: 'scheduled',
        });
      // Consultation: require payment + questionnaire
      } else if (data.service_type === 'consultation' && (!latestReqSched.payment_confirmed || !latestReqSched.questionnaire_completed)) {
        console.log('Cannot schedule: payment_confirmed=' + latestReqSched.payment_confirmed + ', questionnaire_completed=' + latestReqSched.questionnaire_completed);
        timelineEntries.push({
          service_request_id: requestId,
          event_type: 'system_note',
          description: 'ניסיון קביעת תור נחסם - לא כל התנאים מולאו',
          old_value: oldStatus,
          new_value: 'scheduled',
        });
      } else {
        timelineEntries.push({
          service_request_id: requestId,
          event_type: 'status_change',
          description: 'תור נקבע',
          old_value: oldStatus,
          new_value: 'scheduled',
        });

        if (data.service_type === 'consultation') {
          if (data.pending_bot_message === 'both_appointments_scheduled') {
            botTrigger = 'both_appointments_scheduled';
          } else {
            botTrigger = 'scheduled_consultation';
          }
        }
      }
    }

    // Handle appointment trigger values passed as newStatus (from pending_bot_message polling)
    if (newStatus === 'whatsapp_appointment_scheduled') {
      botTrigger = 'whatsapp_appointment_scheduled';
    }
    if (newStatus === 'clinic_appointment_scheduled') {
      botTrigger = 'clinic_appointment_scheduled';
    }
    if (newStatus === 'both_appointments_scheduled') {
      botTrigger = 'both_appointments_scheduled';
    }

    // Handle Cal.com appointment triggers (when status doesn't change but pending_bot_message is set)
    if (!botTrigger && data.pending_bot_message && ['whatsapp_appointment_scheduled', 'clinic_appointment_scheduled', 'both_appointments_scheduled'].includes(data.pending_bot_message)) {
      botTrigger = data.pending_bot_message;
    }

    // Handle status -> whatsapp_message_to_check
    if (newStatus === 'whatsapp_message_to_check') {
      botTrigger = 'waiting_for_admin_approval';
      timelineEntries.push({
        service_request_id: requestId,
        event_type: 'system_note',
        description: 'הבוט הועבר לבדיקה אנושית - הבוט עצר',
        old_value: oldStatus,
        new_value: 'whatsapp_message_to_check',
      });
    }

    // Apply updates
    if (Object.keys(updates).length > 0) {
      await base44.asServiceRole.entities.ServiceRequest.update(requestId, updates);
      console.log('Applied updates:', updates);
    }

    // Create timeline entries
    for (const entry of timelineEntries) {
      await base44.asServiceRole.entities.ServiceRequestTimeline.create(entry);
    }

    // Send bot message directly (instead of calling sendBotContinuation separately)
    let botSent = false;
    if (botTrigger) {
      // Fetch full request from DB to ensure we have all fields
      const fullRequest = await base44.asServiceRole.entities.ServiceRequest.get(requestId);
      let contactName = fullRequest.contact_name || '';
      let contactPhone = fullRequest.contact_phone || '';
      // Ignore conversation_id if it equals contact_id (bot sometimes saves wrong value)
      const rawConversationId = fullRequest.conversation_id || null;
      const conversationId = (rawConversationId && rawConversationId !== fullRequest.contact_id) ? rawConversationId : null;

      // If contact_name/phone missing, fetch from Contact entity
      if ((!contactName || !contactPhone) && fullRequest.contact_id) {
        const contact = await base44.asServiceRole.entities.Contact.get(fullRequest.contact_id);
        if (contact) {
          if (!contactName) contactName = contact.full_name || '';
          if (!contactPhone) contactPhone = contact.phone || '';
          // Save back to request for future use
          await base44.asServiceRole.entities.ServiceRequest.update(requestId, { contact_name: contactName, contact_phone: contactPhone });
          console.log('Fetched contact details from Contact entity and saved to request');
        }
      }

      console.log(`Processing bot trigger: ${botTrigger}`, { contactName, contactPhone, conversationId });

      let botMessage = '';

      // Admin approval wait — stop here, don't continue to next steps
      if (botTrigger === 'waiting_for_admin_approval') {
        botMessage = `תודה על העדכון. התשלום ייבדק על ידי הצוות ויאושר בהקדם. נמשיך בתהליך ברגע שהתשלום יאושר. אנא המתן/י לעדכון מאיתנו.`;

      // Ready to schedule — both payment and questionnaire confirmed
      } else if (botTrigger === 'ready_to_schedule') {
        botMessage = `היי ${contactName}, קיבלתי את התשלום והשאלון ואעבור עליו בהקדם!\n\nחשוב מאוד! יש לזמן 2 תורים:\n\n1. תור לזמינות בווצאפ (קוד קופ״ח) - 10 דקות:\nhttps://cal.com/dr-liat-edry/whatsapp-availability\n\n2. תור לייעוץ מלא - שעה וחצי:\nhttps://cal.com/dr-liat-edry/full-consultation\n\nלאחר קביעת התורים, אנא רשום/י \"קבעתי תור\". אעדכן אותך על אישור התור, יום ושעה.`;

      } else if (botTrigger === 'payment_confirmed_awaiting_questionnaire') {
        // Paid but questionnaire not done yet
        const questionnaireContent = await base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'consultation', content_type: 'questionnaire' });
        const questionnaireUrl = questionnaireContent.length > 0 ? questionnaireContent[0].url : '';
        botMessage = `היי ${contactName}, ראינו שהעברת את התשלום, תודה רבה! 🙏\n\nכדי שנוכל להתקדם לזימון תורים, יש למלא את השאלון הבא:\n${questionnaireUrl ? 'שאלון: ' + questionnaireUrl : ''}\n\nלאחר שתמלא/י את השאלון, אנא רשום/י \"מילאתי\". אנו נעדכן אותך לאחר שנקבל את השאלון.`;

      } else if (botTrigger === 'questionnaire_completed_awaiting_payment') {
        // Questionnaire done but payment not confirmed yet
        const paymentContent = await base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'consultation', content_type: 'payment_link' });
        const paymentUrl = paymentContent.length > 0 ? paymentContent[0].url : '';
        botMessage = `היי ${contactName}, ראינו שמילאת את השאלון, תודה רבה! 🙏\n\nכדי שנוכל להתקדם לזימון תורים, יש לבצע תשלום כאן:\n${paymentUrl ? 'תשלום: ' + paymentUrl : ''}\n\nלאחר ביצוע התשלום, אנא רשום/י \"ביצעתי\". התשלום ייבדק על ידי הצוות ויאושר בהקדם, ואז נמשיך בתהליך.`;

      } else if (botTrigger === 'paid_consultation') {
        // Legacy fallback
        const settings = await base44.asServiceRole.entities.BotContent.filter({ key: 'consultation_payment_confirmed' });
        const openingText = settings.length > 0
          ? settings[0].content.replace('{שם פרטי}', contactName).replace('{שם}', contactName)
          : `היי ${contactName}, קיבלתי את התשלום והשאלון ואעבור עליו בהקדם!`;

        botMessage = openingText + `\n\nיש לזמן 2 תורים:\n\n1. תור לזמינות בווצאפ (קוד קופ״ח) - 10 דקות:\nhttps://cal.com/dr-liat-edry/whatsapp-availability\n\n2. תור לייעוץ מלא - שעה וחצי:\nhttps://cal.com/dr-liat-edry/full-consultation\n\nלאחר קביעת התורים, אנא רשום/י \"קבעתי תור\". אעדכן אותך על אישור התור, יום ושעה.`;

        } else if (botTrigger === 'paid_legal') {
        const settings = await base44.asServiceRole.entities.BotContent.filter({ key: 'consultation_payment_confirmed' });
        botMessage = settings.length > 0
          ? settings[0].content.replace('{שם פרטי}', contactName).replace('{שם}', contactName)
          : `היי ${contactName}, ראינו ששילמת! תודה רבה.`;

        const privacySettings = await base44.asServiceRole.entities.BotContent.filter({ key: 'privacy_message' });
        if (privacySettings.length > 0) botMessage += '\n\n' + privacySettings[0].content;

        // Fetch legal email from BotContent or fallback
        const emailSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'legal_email' });
        const legalEmail = emailSettings.length > 0 ? emailSettings[0].value : 'office@drliatedry.co.il';

        const docSettings = await base44.asServiceRole.entities.BotContent.filter({ key: 'legal_documents_request' });
        const docText = docSettings.length > 0 ? docSettings[0].content : 'אילו חומרים נדרשים?\n• תיאור המקרה הרפואי\n• תוצאות בדיקות ותיקים רפואיים\n• דוחות רלוונטיים\n• כל מידע נוסף רלוונטי';
        botMessage += `\n\n${docText}\n\n📧 יש לשלוח את המסמכים למייל: ${legalEmail}\n\nלאחר השליחה, אנא רשום/י \"שלחתי\".\nכדי להמשיך בתהליך, אנא רשום/י \"המשך\".`;

      } else if (botTrigger === 'paid_post_lecture') {
        botMessage = `היי ${contactName}, קיבלנו את התשלום! תודה רבה.`;

      } else if (botTrigger === 'paid_lectures') {
        botMessage = `היי ${contactName}, קיבלנו את התשלום! תודה רבה.`;

      } else if (botTrigger === 'scheduled_consultation') {
        const locationSettings = await base44.asServiceRole.entities.BotContent.filter({ key: 'location_directions' });
        botMessage = locationSettings.length > 0
          ? locationSettings[0].content
          : 'הגעה ל-MedWork\n• מרכז מסחרי רננים, מודיעין מכבים רעות';

      } else if (botTrigger === 'questionnaire_completed') {
        // Legacy fallback for questionnaire_completed without payment check
        const settings = await base44.asServiceRole.entities.BotContent.filter({ key: 'questionnaire_completed_message' });
        botMessage = settings.length > 0
          ? settings[0].content.replace('{שם פרטי}', contactName).replace('{שם}', contactName)
          : `היי ${contactName}, ראינו שמילאת את השאלון! תודה רבה, אעבור עליו בהקדם.`;

      } else if (botTrigger === 'whatsapp_appointment_scheduled') {
        const timeStr = fullRequest.last_appointment_time_str || '';
        botMessage = `✅ נקבע תור לזמינות בווצאפ!\nיום ושעה: ${timeStr}\nנשמח לדבר אז! 😊`;

      } else if (botTrigger === 'clinic_appointment_scheduled') {
        const timeStr = fullRequest.last_appointment_time_str || '';
        const locationSettings = await base44.asServiceRole.entities.BotContent.filter({ key: 'location_directions' });
        const location = locationSettings.length > 0 ? locationSettings[0].content : 'הגעה ל-MedWork\nמרכז מסחרי רננים, מודיעין מכבים רעות\nקומה 2 (מעל הפיצה, מול Remax וחב"ד)';
        botMessage = `✅ נקבע תור לייעוץ מלא!\nיום ושעה: ${timeStr}\n\n📍 ${location}`;

      } else if (botTrigger === 'both_appointments_scheduled') {
        const whatsappTime = fullRequest.scheduled_date_whatsapp
          ? new Date(fullRequest.scheduled_date_whatsapp).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
          : '';
        const clinicTime = fullRequest.scheduled_date_clinic
          ? new Date(fullRequest.scheduled_date_clinic).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
          : '';
        const locationSettings = await base44.asServiceRole.entities.BotContent.filter({ key: 'location_directions' });
        const location = locationSettings.length > 0 ? locationSettings[0].content : 'הגעה ל-MedWork\nמרכז מסחרי רננים, מודיעין מכבים רעות\nקומה 2 (מעל הפיצה, מול Remax וחב"ד)';
        botMessage = `🎉 מעולה! שני התורים נקבעו:\n1. זמינות בווצאפ — ${whatsappTime}\n2. ייעוץ מלא — ${clinicTime}\n\n📍 ${location}\n\nשמחתי, נתראה! 😊`;
      }

      if (botMessage) {
        const isValidObjectId = (id) => /^[a-f0-9]{24}$/i.test(id);

        // Also check if conversation_id was passed directly from the frontend
        // But ignore it if it equals contact_id (bot sometimes saves wrong value)
        const passedConversationId = data.conversation_id || null;
        const contactId = fullRequest.contact_id || data.contact_id || null;
        const effectiveConversationId = (conversationId && isValidObjectId(conversationId)) 
          ? conversationId 
          : (passedConversationId && isValidObjectId(passedConversationId) && passedConversationId !== contactId) 
            ? passedConversationId 
            : null;

        // Return bot message to frontend for sending (service role can't access WhatsApp conversations)
        return Response.json({ 
          ok: true, 
          updates, 
          timelineCount: timelineEntries.length, 
          botTrigger, 
          botSent: false,
          pendingBotMessage: {
            conversationId: effectiveConversationId,
            message: botMessage,
            contactName,
            botTrigger,
          }
        });
      }
    }

    return Response.json({ ok: true, updates, timelineCount: timelineEntries.length, botTrigger, botSent });
  } catch (error) {
    console.error('Error in onServiceRequestUpdate:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});