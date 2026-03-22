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

      timelineEntries.push({
        service_request_id: requestId,
        event_type: 'system_note',
        description: 'תשלום אושר אוטומטית - הבוט ימשיך בתהליך',
        old_value: oldStatus,
        new_value: 'paid',
      });

      const serviceType = data.service_type;
      if (serviceType === 'consultation') {
        updates.current_step = 'confirm_payment';
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
        botTrigger = 'scheduled_consultation';
      }
    }

    // Handle status -> whatsapp_message_to_check
    if (newStatus === 'whatsapp_message_to_check') {
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
      const conversationId = fullRequest.conversation_id || null;

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

      if (botTrigger === 'paid_consultation') {
        const settings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'consultation_payment_confirmed' });
        botMessage = settings.length > 0
          ? settings[0].value.replace('{שם פרטי}', contactName).replace('{שם}', contactName)
          : `היי ${contactName}, קיבלתי את התשלום והשאלון ואעבור עליו בהקדם!`;

        const appointmentSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'consultation_appointments' });
        if (appointmentSettings.length > 0) botMessage += '\n\n' + appointmentSettings[0].value;

        const calendarSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'calendar_link' });
        if (calendarSettings.length > 0) botMessage += '\n\nקישור ליומן: ' + calendarSettings[0].value;

      } else if (botTrigger === 'paid_legal') {
        const settings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'consultation_payment_confirmed' });
        botMessage = settings.length > 0
          ? settings[0].value.replace('{שם פרטי}', contactName).replace('{שם}', contactName)
          : `היי ${contactName}, ראינו ששילמת! תודה רבה.`;

        const privacySettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'privacy' });
        if (privacySettings.length > 0) botMessage += '\n\n' + privacySettings[0].value;

        const docSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'legal_documents_request' });
        if (docSettings.length > 0) botMessage += '\n\n' + docSettings[0].value;

      } else if (botTrigger === 'paid_post_lecture') {
        botMessage = `היי ${contactName}, קיבלנו את התשלום! תודה רבה.`;

      } else if (botTrigger === 'paid_lectures') {
        botMessage = `היי ${contactName}, קיבלנו את התשלום! תודה רבה.`;

      } else if (botTrigger === 'scheduled_consultation') {
        const locationSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'location_directions' });
        botMessage = locationSettings.length > 0
          ? locationSettings[0].value
          : 'הגעה ל-MedWork\n• מרכז מסחרי רננים, מודיעין מכבים רעות';
      }

      if (botMessage) {
        let targetConversation = null;

        if (conversationId) {
          targetConversation = await base44.asServiceRole.agents.getConversation(conversationId);
          console.log(`Using conversation_id: ${conversationId}`);
        }

        // Fallback: search by phone
        if (!targetConversation && contactPhone) {
          console.log('Searching for conversation by phone...', { contactPhone });
          const conversations = await base44.asServiceRole.agents.listConversations({
            agent_name: 'dr_adri_bot',
            sort: '-created_date',
            limit: 50,
          });
          console.log(`Listed ${conversations.length} conversations`);

          for (const conv of conversations) {
            const msgs = conv.messages || [];
            console.log(`Checking conv ${conv.id}: ${msgs.length} messages, metadata:`, JSON.stringify(conv.metadata || {}));
            for (const msg of msgs) {
              if (msg.tool_calls) {
                for (const tc of msg.tool_calls) {
                  const args = tc.arguments_string || '';
                  if (args.includes(contactPhone)) {
                    targetConversation = conv;
                    await base44.asServiceRole.entities.ServiceRequest.update(requestId, { conversation_id: conv.id });
                    console.log(`Found conversation by phone in tool_calls args: ${conv.id}`);
                    break;
                  }
                }
                if (targetConversation) break;
              }
            }
            if (targetConversation) break;
          }
          
          if (!targetConversation) {
            console.log('No conversation found after checking all conversations');
          }
        }

        if (targetConversation) {
          console.log(`Sending bot message to conversation ${targetConversation.id}, message length: ${botMessage.length}`);
          const addResult = await base44.asServiceRole.agents.addMessage(targetConversation, {
            role: 'assistant',
            content: botMessage,
          });
          console.log('addMessage result:', JSON.stringify(addResult || 'undefined'));

          await base44.asServiceRole.entities.ServiceRequestTimeline.create({
            service_request_id: requestId,
            event_type: 'message_sent',
            description: `הודעת ${botTrigger} נשלחה ל${contactName} בשיחת הבוט`,
          });
          botSent = true;
        } else {
          console.log('No conversation found for contact:', contactPhone);
          await base44.asServiceRole.entities.ServiceRequestTimeline.create({
            service_request_id: requestId,
            event_type: 'system_note',
            description: `הודעת המשך תהליך (${botTrigger}) לא נשלחה - לא נמצאה שיחה פעילה עבור ${contactName}. יש לשלוח ידנית.`,
          });
        }
      }
    }

    return Response.json({ ok: true, updates, timelineCount: timelineEntries.length, botTrigger, botSent });
  } catch (error) {
    console.error('Error in onServiceRequestUpdate:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});