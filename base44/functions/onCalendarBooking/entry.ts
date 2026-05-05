import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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

    // === SEND BOT MESSAGE IMMEDIATELY ===
    if (botEnabled && updateData.pending_bot_message) {
      try {
        const trigger = updateData.pending_bot_message;
        const contactPhone = matchingReq.contact_phone || '';
        const conversationId = matchingReq.conversation_id || '';

        // Call onServiceRequestUpdate to generate the message
        const updatedReq = await base44.asServiceRole.entities.ServiceRequest.filter({ id: matchingReq.id });
        const freshReq = updatedReq.length > 0 ? updatedReq[0] : { ...matchingReq, ...updateData };

        const botResponse = await base44.asServiceRole.functions.invoke('onServiceRequestUpdate', {
          event: { type: 'update', entity_name: 'ServiceRequest', entity_id: matchingReq.id },
          data: { ...freshReq, status: trigger, conversation_id: conversationId },
          old_data: { ...matchingReq, status: 'previous' },
        });

        const botResult = botResponse?.data || botResponse;
        const pendingMsg = botResult?.pendingBotMessage;

        if (pendingMsg?.message && contactPhone) {
          const instanceId = Deno.env.get('GREEN_API_INSTANCE_ID');
          const token = Deno.env.get('GREEN_API_TOKEN');

          let cleanPhone = contactPhone.replace(/[\s\-\+]/g, '');
          if (cleanPhone.startsWith('0')) cleanPhone = '972' + cleanPhone.substring(1);
          const chatId = `${cleanPhone}@c.us`;

          // Parse [FILE:url:filename] tags
          const fileTagRegex = /\[FILE:(https?:\/\/[^\]:]+):([^\]]+)\]/g;
          const files = [];
          let textMessage = pendingMsg.message;
          let match;
          while ((match = fileTagRegex.exec(pendingMsg.message)) !== null) {
            files.push({ url: match[1], fileName: match[2] });
            textMessage = textMessage.replace(match[0], '');
          }
          textMessage = textMessage.replace(/\n{3,}/g, '\n\n').trim();

          // Send text
          let sendOk = true;
          if (textMessage) {
            const sendUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
            const sendResp = await fetch(sendUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: textMessage }),
            });
            if (!sendResp.ok) {
              console.error('Failed to send immediate message:', await sendResp.text());
              sendOk = false;
            }
          }

          // Send files from main message
          for (const file of files) {
            try {
              const fileUrl = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;
              await fetch(fileUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, urlFile: file.url, fileName: file.fileName }),
              });
              console.log(`File sent immediately: ${file.fileName}`);
            } catch (fileErr) {
              console.error(`File send error: ${fileErr.message}`);
            }
          }

          // Send follow-up messages (location photo + post_directions_prompt)
          const followUps = pendingMsg.followUpMessages || [];
          for (const followUp of followUps) {
            try {
              await new Promise(r => setTimeout(r, 1500)); // brief delay between messages
              const fuFileRegex = /\[FILE:(https?:\/\/[^\]:]+):([^\]]+)\]/g;
              const fuMatch = fuFileRegex.exec(followUp);
              if (fuMatch) {
                // It's a file message
                const fileUrl = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;
                await fetch(fileUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chatId, urlFile: fuMatch[1], fileName: fuMatch[2] }),
                });
                console.log(`Follow-up file sent: ${fuMatch[2]}`);
              } else {
                // It's a text message
                const sendUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
                await fetch(sendUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chatId, message: followUp }),
                });
                console.log(`Follow-up text sent: ${followUp.substring(0, 50)}...`);
              }
            } catch (fuErr) {
              console.error(`Follow-up send error: ${fuErr.message}`);
            }
          }

          if (sendOk) {
            // Log outgoing message
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: `out_${Date.now()}_cal`,
              phone: cleanPhone,
              direction: 'outgoing',
              text: (pendingMsg.message || '').substring(0, 500),
              status: 'replied',
              chat_id: chatId,
            });

            // Add to bot conversation if available
            if (conversationId && /^[a-f0-9]{24}$/i.test(conversationId)) {
              try {
                const conv = await base44.asServiceRole.agents.getConversation(conversationId);
                await base44.asServiceRole.agents.addMessage(conv, { role: 'assistant', content: pendingMsg.message });
              } catch (convErr) {
                console.warn('Conv error:', convErr.message);
              }
            }

            // Log in timeline
            await base44.asServiceRole.entities.ServiceRequestTimeline.create({
              service_request_id: matchingReq.id,
              event_type: 'message_sent',
              description: `הודעת ${trigger} נשלחה מיידית (onCalendarBooking)`,
            });

            // Clear the pending flag and record last system message for bot sync
            await base44.asServiceRole.entities.ServiceRequest.update(matchingReq.id, { pending_bot_message: '', last_system_message: trigger });
            console.log(`Immediate bot message sent to ${cleanPhone} for trigger ${trigger}`);
          }
        } else {
          console.log('No message generated or no phone for immediate send');
        }
      } catch (sendErr) {
        console.error('Immediate send error (will be picked up by processWhatsAppReplies):', sendErr.message);
        // Don't clear pending_bot_message — processWhatsAppReplies will handle it as fallback
      }
    }

    return Response.json({ status: 'ok', updated: matchingReq.id, type: appointmentType });

  } catch (error) {
    console.error('onCalendarBooking error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});