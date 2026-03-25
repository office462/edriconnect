import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const base44 = createClientFromRequest(req);

    // Cal.com sends different triggerEvent types — only process new bookings
    if (body.triggerEvent !== 'BOOKING_CREATED') {
      return Response.json({ status: 'ignored', event: body.triggerEvent });
    }

    const payload = body.payload;
    const attendee = payload.attendees?.[0];
    if (!attendee) return Response.json({ status: 'no_attendee' });

    const attendeeName = attendee.name || '';
    const attendeePhone = attendee.phoneNumber || payload.responses?.phone?.value || payload.metadata?.phone || '';
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

    console.log('Calendar booking received:', { attendeeName, attendeePhone, appointmentType, startTimeRaw, durationMinutes, eventSlug });

    // Try to match by phone number first
    let matchingReq = null;

    if (attendeePhone) {
      const normalizedPhone = attendeePhone.replace(/\D/g, '');
      const allRequests = await base44.asServiceRole.entities.ServiceRequest.filter({ service_type: 'consultation' });
      matchingReq = allRequests.find(r => {
        const reqPhone = (r.contact_phone || '').replace(/\D/g, '');
        return reqPhone && (reqPhone === normalizedPhone || normalizedPhone.endsWith(reqPhone) || reqPhone.endsWith(normalizedPhone));
      });
    }

    // Fallback: match by name
    if (!matchingReq && attendeeName) {
      const allRequests = await base44.asServiceRole.entities.ServiceRequest.filter({ service_type: 'consultation' });
      const nameLower = attendeeName.toLowerCase().trim();
      const firstName = nameLower.split(' ')[0];
      matchingReq = allRequests.find(r => {
        const reqName = (r.contact_name || '').toLowerCase().trim();
        return reqName === nameLower || reqName.includes(firstName) || firstName.includes(reqName.split(' ')[0]);
      });
    }

    if (!matchingReq) {
      console.log('No matching ServiceRequest found for:', { attendeeName, attendeePhone });
      return Response.json({ status: 'no_match', attendee: attendeeName });
    }

    // Build update data
    const updateData = {
      [appointmentField]: startTimeRaw,
      last_appointment_time_str: israeliDateStr,
      last_appointment_type: appointmentType,
    };

    // Check if both appointments are now set
    const updatedWhatsapp = isWhatsapp ? startTimeRaw : matchingReq.scheduled_date_whatsapp;
    const updatedClinic = isWhatsapp ? matchingReq.scheduled_date_clinic : startTimeRaw;

    if (updatedWhatsapp && updatedClinic) {
      updateData.status = 'scheduled';
      updateData.pending_bot_message = 'both_appointments_scheduled';
    } else {
      updateData.pending_bot_message = isWhatsapp
        ? 'whatsapp_appointment_scheduled'
        : 'clinic_appointment_scheduled';
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
    return Response.json({ status: 'ok', updated: matchingReq.id, type: appointmentType });

  } catch (error) {
    console.error('onCalendarBooking error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});