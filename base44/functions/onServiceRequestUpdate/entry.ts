import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

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

    // --- Frontend pending message handler ---
    // When frontend calls with old_data.status === 'previous', it means the DB update
    // was already done by the entity automation. We just need to generate the bot message.
    const knownTriggers = [
      'ready_to_schedule', 'paid_consultation', 'paid_legal', 'paid_lectures', 'paid_clinic', 'paid_post_lecture',
      'payment_confirmed_awaiting_questionnaire', 'questionnaire_completed_awaiting_payment',
      'waiting_for_admin_approval',
      'whatsapp_appointment_scheduled', 'clinic_appointment_scheduled', 'both_appointments_scheduled',
      'scheduled_consultation', 'scheduled_legal', 'scheduled_lectures', 'scheduled_clinic', 'scheduled_post_lecture',
      // Also support raw entity statuses so the frontend can trigger directly
      'paid', 'questionnaire_completed', 'scheduled', 'whatsapp_message_to_check', 'in_review'
    ];

    // Raw entity statuses (paid, questionnaire_completed, etc.) need to be
    // processed through the normal automation logic first to determine the actual trigger
    const rawStatuses = ['paid', 'questionnaire_completed', 'scheduled', 'whatsapp_message_to_check', 'in_review'];
    const isRawStatus = rawStatuses.includes(newStatus);

    if (oldStatus === 'previous' && knownTriggers.includes(newStatus)) {
      console.log(`Frontend pending message request: trigger=${newStatus}, request=${requestId}, isRaw=${isRawStatus}`);

      const fullRequest = await base44.asServiceRole.entities.ServiceRequest.get(requestId);
      let contactName = fullRequest.contact_name || '';
      let contactPhone = fullRequest.contact_phone || '';
      const rawConversationId = data.conversation_id || fullRequest.conversation_id || null;
      const conversationId = (rawConversationId && rawConversationId !== fullRequest.contact_id) ? rawConversationId : null;

      if ((!contactName || !contactPhone) && fullRequest.contact_id) {
        const contact = await base44.asServiceRole.entities.Contact.get(fullRequest.contact_id);
        if (contact) {
          if (!contactName) contactName = contact.full_name || '';
          if (!contactPhone) contactPhone = contact.phone || '';
        }
      }

      // For raw statuses, compute the actual trigger like the automation would
      let effectiveTrigger = newStatus;
      if (isRawStatus) {
        effectiveTrigger = computeTriggerForStatus(newStatus, fullRequest);
        console.log(`Raw status ${newStatus} resolved to trigger: ${effectiveTrigger}`);
        if (!effectiveTrigger) {
          return Response.json({ ok: true, botTrigger: null, reason: 'no_trigger_for_status' });
        }
      }

      const botMessage = await buildBotMessage(base44, effectiveTrigger, fullRequest, contactName);

      if (botMessage) {
        const isValidObjectId = (id) => /^[a-f0-9]{24}$/i.test(id);
        const effectiveConversationId = (conversationId && isValidObjectId(conversationId)) ? conversationId : null;

        return Response.json({
          ok: true,
          botTrigger: effectiveTrigger,
          botSent: false,
          pendingBotMessage: {
            conversationId: effectiveConversationId,
            message: botMessage,
            contactName,
            botTrigger: effectiveTrigger,
          }
        });
      }

      return Response.json({ ok: true, botTrigger: effectiveTrigger, botSent: false, reason: 'no_message' });
    }

    // --- Normal entity automation path ---
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

      timelineEntries.push({
        service_request_id: requestId,
        event_type: 'system_note',
        description: 'תשלום אושר אוטומטית',
        old_value: oldStatus,
        new_value: 'paid',
      });

      const serviceType = data.service_type;

      if (serviceType === 'consultation') {
        // Always send questionnaire after payment in consultation flow
        updates.current_step = 'paid_consultation';
        botTrigger = 'paid_consultation';
      } else if (serviceType === 'legal') {
        updates.current_step = 'send_privacy_message';
        botTrigger = 'paid_legal';
      } else if (serviceType === 'post_lecture') {
        updates.current_step = 'confirm_payment';
        botTrigger = 'paid_post_lecture';
      } else if (serviceType === 'lectures') {
        updates.current_step = 'confirm_payment';
        botTrigger = 'paid_lectures';
      } else if (serviceType === 'clinic') {
        updates.current_step = 'confirm_payment';
        botTrigger = 'paid_clinic';
      }
    }

    // Handle status -> questionnaire_completed
    if (newStatus === 'questionnaire_completed' && oldStatus !== 'questionnaire_completed') {
      updates.questionnaire_completed = true;

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
        updates.current_step = 'ready_to_schedule';
        botTrigger = 'ready_to_schedule';
      } else {
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
      const latestReqSched = await base44.asServiceRole.entities.ServiceRequest.get(requestId);
      const isAlreadyScheduledInDB = latestReqSched.status === 'scheduled';
      const skipChecks = isAlreadyScheduledInDB;

      if (!skipChecks && data.service_type === 'legal' && (!latestReqSched.payment_confirmed || !latestReqSched.agreement_confirmed)) {
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
      } else if (!skipChecks && data.service_type === 'consultation' && (!latestReqSched.payment_confirmed || !latestReqSched.questionnaire_completed)) {
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
        } else if (data.service_type === 'legal') {
          botTrigger = 'scheduled_legal';
        } else if (data.service_type === 'lectures') {
          botTrigger = 'scheduled_lectures';
        } else if (data.service_type === 'clinic') {
          botTrigger = 'scheduled_clinic';
        } else if (data.service_type === 'post_lecture') {
          botTrigger = 'scheduled_post_lecture';
        }
      }
    }

    // Handle appointment triggers
    const appointmentTriggers = ['whatsapp_appointment_scheduled', 'clinic_appointment_scheduled', 'both_appointments_scheduled'];
    if (!botTrigger) {
      if (appointmentTriggers.includes(newStatus)) {
        botTrigger = newStatus;
      } else if (data.pending_bot_message && appointmentTriggers.includes(data.pending_bot_message)) {
        botTrigger = data.pending_bot_message;
      }
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

    // Save pending_bot_message to DB so frontend can pick it up
    if (botTrigger) {
      updates.pending_bot_message = botTrigger;
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

    // Build and return bot message
    let botSent = false;
    if (botTrigger) {
      const fullRequest = await base44.asServiceRole.entities.ServiceRequest.get(requestId);
      let contactName = fullRequest.contact_name || '';
      let contactPhone = fullRequest.contact_phone || '';
      const rawConversationId = fullRequest.conversation_id || null;
      const conversationId = (rawConversationId && rawConversationId !== fullRequest.contact_id) ? rawConversationId : null;

      if ((!contactName || !contactPhone) && fullRequest.contact_id) {
        const contact = await base44.asServiceRole.entities.Contact.get(fullRequest.contact_id);
        if (contact) {
          if (!contactName) contactName = contact.full_name || '';
          if (!contactPhone) contactPhone = contact.phone || '';
          await base44.asServiceRole.entities.ServiceRequest.update(requestId, { contact_name: contactName, contact_phone: contactPhone });
        }
      }

      console.log(`Processing bot trigger: ${botTrigger}`, { contactName, contactPhone, conversationId });

      const botMessage = await buildBotMessage(base44, botTrigger, fullRequest, contactName);

      if (botMessage) {
        const isValidObjectId = (id) => /^[a-f0-9]{24}$/i.test(id);
        const passedConversationId = data.conversation_id || null;
        const contactId = fullRequest.contact_id || data.contact_id || null;
        const effectiveConversationId = (conversationId && isValidObjectId(conversationId))
          ? conversationId
          : (passedConversationId && isValidObjectId(passedConversationId) && passedConversationId !== contactId)
            ? passedConversationId
            : null;

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

// --- Compute trigger from raw status (for frontend-initiated calls) ---
function computeTriggerForStatus(status, req) {
  if (status === 'paid') {
    const serviceType = req.service_type;
    if (serviceType === 'consultation') return 'paid_consultation';
    if (serviceType === 'legal') return 'paid_legal';
    if (serviceType === 'lectures') return 'paid_lectures';
    if (serviceType === 'clinic') return 'paid_clinic';
    if (serviceType === 'post_lecture') return 'paid_post_lecture';
    return null;
  }
  if (status === 'questionnaire_completed') {
    if (req.payment_confirmed) return 'ready_to_schedule';
    return 'questionnaire_completed_awaiting_payment';
  }
  if (status === 'scheduled') {
    const serviceType = req.service_type;
    if (req.pending_bot_message === 'both_appointments_scheduled') return 'both_appointments_scheduled';
    const triggerMap = {
      consultation: 'scheduled_consultation',
      legal: 'scheduled_legal',
      lectures: 'scheduled_lectures',
      clinic: 'scheduled_clinic',
      post_lecture: 'scheduled_post_lecture',
    };
    return triggerMap[serviceType] || null;
  }
  if (status === 'whatsapp_message_to_check') return 'waiting_for_admin_approval';
  if (status === 'in_review') return null; // no bot message for in_review
  return null;
}

// --- Bot message builder (shared between both paths) ---
async function buildBotMessage(base44, trigger, fullRequest, contactName) {
  if (trigger === 'waiting_for_admin_approval') {
    return `תודה על העדכון. התשלום ייבדק על ידי הצוות ויאושר בהקדם. נמשיך בתהליך ברגע שהתשלום יאושר. אנא המתן/י לעדכון מאיתנו.`;
  }

  if (trigger === 'ready_to_schedule') {
    const whatsappLinkContent = await base44.asServiceRole.entities.ServiceContent.filter({
      service_type: 'consultation', content_type: 'external_link', sub_type: 'whatsapp_appointment'
    });
    const clinicLinkContent = await base44.asServiceRole.entities.ServiceContent.filter({
      service_type: 'consultation', content_type: 'external_link', sub_type: 'clinic_appointment'
    });
    const whatsappUrl = whatsappLinkContent[0]?.url || '';
    const clinicUrl = clinicLinkContent[0]?.url || '';
    return `היי ${contactName}, קיבלתי את התשלום והשאלון ואעבור עליו בהקדם!\n\nחשוב מאוד! יש לזמן 2 תורים:\n\n1. תור לזמינות בווצאפ (קוד קופ״ח) - 10 דקות:\n${whatsappUrl}\n\n2. תור לייעוץ מלא - שעה וחצי:\n${clinicUrl}\n\nלאחר קביעת שני התורים, כתוב/י "קבעתי" ✓`;
  }

  if (trigger === 'paid_consultation') {
    const questionnaireContent = await base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'consultation', content_type: 'questionnaire' });
    const questionnaireUrl = questionnaireContent.length > 0 ? questionnaireContent[0].url : '';
    return `היי ${contactName}, קיבלנו את התשלום — תודה רבה! 🙏\n\nכדי להתקדם, בבקשה למלא את השאלון הבא:\n${questionnaireUrl ? questionnaireUrl : ''}\n\nלאחר שתמלא/י, אנא רשום/י "מילאתי".`;
  }

  if (trigger === 'payment_confirmed_awaiting_questionnaire') {
    const questionnaireContent = await base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'consultation', content_type: 'questionnaire' });
    const questionnaireUrl = questionnaireContent.length > 0 ? questionnaireContent[0].url : '';
    return `היי ${contactName}, ראינו שהעברת את התשלום, תודה רבה! 🙏\n\nכדי שנוכל להתקדם לזימון תורים, יש למלא את השאלון הבא:\n${questionnaireUrl ? questionnaireUrl : ''}\n\nלאחר שתמלא/י את השאלון, אנא רשום/י "מילאתי".`;
  }

  if (trigger === 'questionnaire_completed_awaiting_payment') {
    const paymentContent = await base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'consultation', content_type: 'payment_link' });
    const paymentUrl = paymentContent.length > 0 ? paymentContent[0].url : '';
    return `היי ${contactName}, ראינו שמילאת את השאלון, תודה רבה! 🙏\n\nכדי שנוכל להתקדם לזימון תורים, יש לבצע תשלום כאן:\n${paymentUrl ? paymentUrl : ''}\n\nלאחר ביצוע התשלום, אנא רשום/י "ביצעתי". התשלום ייבדק על ידי הצוות ויאושר בהקדם, ואז נמשיך בתהליך.`;
  }

  if (trigger === 'paid_legal') {
    const settings = await base44.asServiceRole.entities.BotContent.filter({ key: 'legal_payment_confirmed' });
    let msg = settings.length > 0
      ? settings[0].content.replace('{שם פרטי}', contactName).replace('{שם}', contactName)
      : `היי ${contactName}, ראינו ששילמת! תודה רבה.`;

    const privacySettings = await base44.asServiceRole.entities.BotContent.filter({ key: 'privacy_message' });
    if (privacySettings.length > 0) msg += '\n\n' + privacySettings[0].content;

    const emailSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'legal_email' });
    const legalEmail = emailSettings.length > 0 ? emailSettings[0].value : 'office@drliatedry.co.il';

    const docSettings = await base44.asServiceRole.entities.BotContent.filter({ key: 'legal_documents_request' });
    const docText = docSettings.length > 0 ? docSettings[0].content : 'אילו חומרים נדרשים?\n• תיאור המקרה הרפואי\n• תוצאות בדיקות ותיקים רפואיים\n• דוחות רלוונטיים\n• כל מידע נוסף רלוונטי';
    msg += `\n\n${docText}\n\n📧 יש לשלוח את המסמכים למייל: ${legalEmail}\n\nלאחר השליחה, אנא רשום/י "שלחתי".\nכדי להמשיך בתהליך, אנא רשום/י "המשך".`;
    return msg;
  }

  if (trigger === 'paid_lectures') {
    const linkContent = await base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'lectures', content_type: 'external_link' });
    const linkUrl = linkContent.length > 0 ? linkContent[0].url : '';
    return `היי ${contactName}, קיבלנו את התשלום — תודה רבה! 🙏\n\nהנה קישור לתיאום ההרצאה:\n${linkUrl}\n\nלאחר קביעת מועד נשלח אישור.`;
  }

  if (trigger === 'paid_clinic') {
    const linkContent = await base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'clinic', content_type: 'external_link' });
    const linkUrl = linkContent.length > 0 ? linkContent[0].url : '';
    return `היי ${contactName}, קיבלנו את התשלום — תודה רבה! 🙏\n\nהנה קישור לתיאום השכרת הקליניקה:\n${linkUrl}\n\nלאחר קביעת מועד נשלח אישור.`;
  }

  if (trigger === 'paid_post_lecture') {
    const linkContent = await base44.asServiceRole.entities.ServiceContent.filter({ service_type: 'post_lecture', content_type: 'external_link' });
    if (linkContent.length > 0 && linkContent[0].url) {
      return `היי ${contactName}, קיבלנו את התשלום — תודה רבה! 🙏\n\nהנה קישור:\n${linkContent[0].url}`;
    }
    return `היי ${contactName}, קיבלנו את התשלום! תודה רבה. 🙏`;
  }

  if (trigger === 'scheduled_consultation') {
    const timeStr = fullRequest.last_appointment_time_str || '';
    return `✅ נקבע תור לייעוץ!\nיום ושעה: ${timeStr}\n\nנשמח לראותך! 😊\n\nלהמשך, כתוב/י "המשך".`;
  }

  if (trigger === 'scheduled_legal') {
    const timeStr = fullRequest.last_appointment_time_str || '';
    return `✅ נקבע תור לשיחה עם ד"ר אדרי!\nיום ושעה: ${timeStr}\n\nנשמח לדבר אז! 😊\n\nלהמשך, כתוב/י "המשך".`;
  }

  if (trigger === 'scheduled_lectures') {
    const timeStr = fullRequest.last_appointment_time_str || '';
    return `✅ נקבע תור להרצאה!\nיום ושעה: ${timeStr}\n\nנשמח לראותך! 😊\n\nלהמשך, כתוב/י "המשך".`;
  }

  if (trigger === 'scheduled_clinic') {
    const timeStr = fullRequest.last_appointment_time_str || '';
    return `✅ נקבע תור לקליניקה!\nיום ושעה: ${timeStr}\n\nלהמשך, כתוב/י "המשך".`;
  }

  if (trigger === 'scheduled_post_lecture') {
    const timeStr = fullRequest.last_appointment_time_str || '';
    return `✅ נקבע תור!\nיום ושעה: ${timeStr}\n\nתודה ונשמח לראותך! 😊\n\nלהמשך, כתוב/י "המשך".`;
  }

  if (trigger === 'questionnaire_completed') {
    const settings = await base44.asServiceRole.entities.BotContent.filter({ key: 'questionnaire_completed_message' });
    return settings.length > 0
      ? settings[0].content.replace('{שם פרטי}', contactName).replace('{שם}', contactName)
      : `היי ${contactName}, ראינו שמילאת את השאלון! תודה רבה, אעבור עליו בהקדם.`;
  }

  if (trigger === 'whatsapp_appointment_scheduled') {
    const timeStr = fullRequest.last_appointment_time_str || '';
    return `✅ נקבע תור לזמינות בווצאפ!\nיום ושעה: ${timeStr}\n\nנשמח לדבר אז! 😊\n\nלהמשך, כתוב/י "המשך".`;
  }

  if (trigger === 'clinic_appointment_scheduled') {
    const timeStr = fullRequest.last_appointment_time_str || '';
    return `✅ נקבע תור לייעוץ מלא!\nיום ושעה: ${timeStr}\n\nלהמשך, כתוב/י "המשך".`;
  }

  if (trigger === 'both_appointments_scheduled') {
    const whatsappTime = fullRequest.scheduled_date_whatsapp
      ? new Date(fullRequest.scheduled_date_whatsapp).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
      : '';
    const clinicTime = fullRequest.scheduled_date_clinic
      ? new Date(fullRequest.scheduled_date_clinic).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
      : '';
    return `🎉 מעולה! שני התורים נקבעו:\n1. זמינות בווצאפ — ${whatsappTime}\n2. ייעוץ מלא — ${clinicTime}\n\nנשמח לראותך! 😊\n\nלהמשך, כתוב/י "המשך".`;
  }

  return '';
}