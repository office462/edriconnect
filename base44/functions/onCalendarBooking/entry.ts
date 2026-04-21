import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function nextFridayAtLeast9DaysOut(fromDate) {
  const target = new Date(fromDate);
  target.setDate(target.getDate() + 9);
  while (target.getDay() !== 5) target.setDate(target.getDate() + 1);
  return target.toISOString().split('T')[0]; // YYYY-MM-DD
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const base44 = createClientFromRequest(req);

    // Cal.com sends different triggerEvent types — only process new bookings
    if (body.triggerEvent !== 'BOOKING_CREATED') {
      return Response.json({ status: 'ignored', event: body.triggerEvent });
    }

    // Check if WhatsApp bot is enabled — if not, still save booking but don't trigger bot messages
    const botEnabledSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' });
    const botEnabled = botEnabledSettings.length > 0 && botEnabledSettings[0].value === 'true';

    const payload = body.payload;
    const attendee = payload.attendees?.[0];
    if (!attendee) return Response.json({ status: 'no_attendee' });

    const attendeeName = attendee.name || '';
    const attendeePhone = attendee.phoneNumber || payload.responses?.phone?.value || payload.metadata?.phone || '';
    const attendeeEmail = attendee.email || '';
    const startTimeRaw = payload.startTime;
    const durationMinutes = payload.length;
    const eventSlug = payload.eventType?.slug || payload.type || '';

    const startDate = new Date(startTimeRaw);
    const israeliDateStr = startDate.toLocaleString('he-IL', {
      timeZone: 'Asia/Jerusalem',
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    // Determine appointment type based on duration or event slug
    const isWhatsapp = durationMinutes <= 15 || eventSlug.includes('whatsapp');
    const appointmentField = isWhatsapp ? 'scheduled_date_whatsapp' : 'scheduled_date_clinic';
    const appointmentType = isWhatsapp ? 'זמינות בווצאפ (10 דק\')' : 'ייעוץ מלא (שעה וחצי)';

    console.log('Calendar booking received:', { attendeeName, attendeeEmail, attendeePhone, appointmentType, startTimeRaw, durationMinutes, eventSlug });

    let matchingReq = null;

    // Search by email first (most reliable — Cal.com always collects email)
    if (attendeeEmail) {
      const allRequests = await base44.asServiceRole.entities.ServiceRequest.list('-created_date', 200);
      matchingReq = allRequests.find(r => {
        const reqEmail = (r.contact_email || '').toLowerCase().trim();
        return reqEmail && reqEmail === attendeeEmail.toLowerCase().trim();
      });
    }

    // Fallback: match by phone
    if (!matchingReq && attendeePhone) {
      const normalizedPhone = attendeePhone.replace(/\D/g, '');
      const allRequests = await base44.asServiceRole.entities.ServiceRequest.list('-created_date', 200);
      matchingReq = allRequests.find(r => {
        const reqPhone = (r.contact_phone || '').replace(/\D/g, '');
        return reqPhone && (reqPhone === normalizedPhone || normalizedPhone.endsWith(reqPhone) || reqPhone.endsWith(normalizedPhone));
      });
    }

    // Fallback: match by name
    if (!matchingReq && attendeeName) {
      const allRequests = await base44.asServiceRole.entities.ServiceRequest.list('-created_date', 200);
      const nameLower = attendeeName.toLowerCase().trim();
      const firstName = nameLower.split(' ')[0];
      matchingReq = allRequests.find(r => {
        const reqName = (r.contact_name || '').toLowerCase().trim();
        return reqName === nameLower || reqName.includes(firstName) || firstName.includes(reqName.split(' ')[0]);
      });
    }

    if (!matchingReq) {
      console.log('No matching ServiceRequest found for:', { attendeeName, attendeeEmail, attendeePhone });
      return Response.json({ status: 'no_match', attendee: attendeeName });
    }

    console.log('Matched ServiceRequest:', matchingReq.id, 'type:', matchingReq.service_type, 'for attendee:', attendeeName, attendeeEmail);

    // Build update data
    const updateData = {
      [appointmentField]: startTimeRaw,
      last_appointment_time_str: israeliDateStr,
      last_appointment_type: appointmentType,
    };

    const serviceType = matchingReq.service_type;

    if (serviceType === 'consultation') {
      if (isWhatsapp) {
        // First booking: WhatsApp appointment — send full consultation link next
        const targetFriday = nextFridayAtLeast9DaysOut(startDate);
        updateData.status = 'scheduled_whatsapp';
        updateData.target_friday = targetFriday;
        if (botEnabled) updateData.pending_bot_message = 'send_full_consultation_link';
      } else {
        // Second booking: Full consultation — both appointments done
        updateData.status = 'scheduled';
        if (botEnabled) updateData.pending_bot_message = 'both_appointments_scheduled';
      }
    } else {
      // All other service types — single appointment is enough
      updateData.status = 'scheduled';
      if (botEnabled) {
        const triggerMap = {
          legal: 'scheduled_legal',
          lectures: 'scheduled_lectures',
          clinic: 'scheduled_clinic',
          post_lecture: 'scheduled_post_lecture',
        };
        updateData.pending_bot_message = triggerMap[serviceType] || 'scheduled_consultation';
      }
    }

    await base44.asServiceRole.entities.ServiceRequest.update(matchingReq.id, updateData);

    // Log to timeline
    await base44.asServiceRole.entities.ServiceRequestTimeline.create({
      service_request_id: matchingReq.id,
      event_type: 'status_change',
      description: `תור נקבע אוטומטית: ${appointmentType} — ${israeliDateStr} (Cal.com)`,
      old_value: matchingReq.status,
      new_value: updateData.status || matchingReq.status,
    });

    console.log('Updated ServiceRequest:', matchingReq.id, updateData);

    // Bot message will be sent by the frontend via usePendingBotMessages subscription
    // when it detects the pending_bot_message field update.

    return Response.json({ status: 'ok', updated: matchingReq.id, type: appointmentType });

  } catch (error) {
    console.error('onCalendarBooking error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});