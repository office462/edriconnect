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

    console.log(`Status changed: ${oldStatus} -> ${newStatus} for request ${requestId}`);

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
        // Send confirmation message via bot conversation
        await sendBotContinuation(base44, data, 'paid_consultation');
      } else if (serviceType === 'legal') {
        updates.current_step = 'send_privacy_message';
        await sendBotContinuation(base44, data, 'paid_legal');
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

      // Send location info to bot
      if (data.service_type === 'consultation') {
        await sendBotContinuation(base44, data, 'scheduled_consultation');
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

async function sendBotContinuation(base44, requestData, triggerType) {
  try {
    const contactId = requestData.contact_id;
    if (!contactId) {
      console.log('No contact_id found, skipping bot continuation');
      return;
    }

    // Get the contact info
    const contacts = await base44.asServiceRole.entities.Contact.filter({ id: contactId });
    const contact = contacts[0];
    if (!contact) {
      console.log('Contact not found:', contactId);
      return;
    }

    const contactName = contact.full_name || requestData.contact_name || '';
    const serviceType = requestData.service_type;

    // Read relevant content from SystemSetting and ServiceContent
    let botMessage = '';

    if (triggerType === 'paid_consultation') {
      // Read payment confirmation message
      const settings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'consultation_payment_confirmed' });
      if (settings.length > 0) {
        botMessage = settings[0].value.replace('{שם פרטי}', contactName).replace('{שם}', contactName);
      } else {
        botMessage = `היי ${contactName}, קיבלתי את התשלום והשאלון ואעבור עליו בהקדם!`;
      }

      // Also get appointment instructions
      const appointmentSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'consultation_appointments' });
      if (appointmentSettings.length > 0) {
        botMessage += '\n\n' + appointmentSettings[0].value;
      } else {
        botMessage += '\n\n!חשוב מאוד\nיש לזמן 2 תורים:\n1. תור לזמינות בווצאפ (קוד קופ"ח) - 10 דקות\n2. תור לייעוץ מלא - שעה וחצי';
      }

      // Get calendar link
      const calendarSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'calendar_link' });
      if (calendarSettings.length > 0) {
        botMessage += '\n\nקישור ליומן: ' + calendarSettings[0].value;
      }

    } else if (triggerType === 'paid_legal') {
      // Send privacy message first
      const privacySettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'privacy' });
      if (privacySettings.length > 0) {
        botMessage = privacySettings[0].value;
      } else {
        botMessage = 'רגע לפני שממשיכים, חשוב לנו לציין שכל המידע שתשתפו נשמר תחת חיסיון וסודיות רפואית מלאה.';
      }

      // Then request documents
      const docSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'legal_documents_request' });
      if (docSettings.length > 0) {
        botMessage += '\n\n' + docSettings[0].value;
      } else {
        botMessage += '\n\nאילו חומרים נדרשים למייל?\n• תיאור המקרה הרפואי\n• תוצאות בדיקות ותיקים רפואיים\n• דוחות רלוונטיים\n• כל מידע נוסף רלוונטי';
      }

    } else if (triggerType === 'scheduled_consultation') {
      // Send location directions
      const locationSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'location_directions' });
      if (locationSettings.length > 0) {
        botMessage = locationSettings[0].value;
      } else {
        botMessage = 'הגעה ל-MedWork\n• מרכז מסחרי רננים, מודיעין מכבים רעות\n• כיתוב ענק על הבניין\n• 2 חניונים במקביל\n• קומה 2 (מעל הפיצה, מול Remax וחב"ד)\n• מעלית ושני גרמי מדרגות\n• חפשו את הלוגו';
      }
    }

    if (botMessage) {
      console.log(`Bot message for ${triggerType} to ${contactName}: ${botMessage.substring(0, 100)}...`);

      // Find existing conversation for this contact and send message
      const conversations = await base44.asServiceRole.agents.listConversations({ agent_name: 'dr_adri_bot' });

      // Find conversation that matches this contact
      let targetConversation = null;
      for (const conv of conversations) {
        if (conv.metadata?.contact_id === contactId || conv.metadata?.phone === contact.phone) {
          targetConversation = conv;
          break;
        }
      }

      if (targetConversation) {
        // Add bot message to the conversation
        await base44.asServiceRole.agents.addMessage(targetConversation, {
          role: 'assistant',
          content: botMessage,
        });
        console.log('Bot message sent to conversation:', targetConversation.id);
      } else {
        console.log('No existing conversation found for contact:', contactId);
        // Log this as a timeline event so admin knows
        await base44.asServiceRole.entities.ServiceRequestTimeline.create({
          service_request_id: requestData.id,
          event_type: 'system_note',
          description: `הודעת המשך תהליך (${triggerType}) לא נשלחה - לא נמצאה שיחה פעילה עבור ${contactName}. יש לשלוח ידנית.`,
        });
      }
    }
  } catch (error) {
    console.error('Error sending bot continuation:', error);
    // Don't throw - we don't want to fail the whole update
    await base44.asServiceRole.entities.ServiceRequestTimeline.create({
      service_request_id: requestData.id,
      event_type: 'system_note',
      description: `שגיאה בשליחת הודעת המשך: ${error.message}`,
    });
  }
}