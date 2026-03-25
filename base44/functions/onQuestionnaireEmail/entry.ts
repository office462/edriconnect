import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const base44 = createClientFromRequest(req);

    // 1. Decode Pub/Sub notification
    if (!body.data?.message?.data) {
      return Response.json({ status: 'no_message_data' });
    }

    const decoded = JSON.parse(atob(body.data.message.data));
    const currentHistoryId = String(decoded.historyId);

    console.log('Gmail notification received, historyId:', currentHistoryId);

    // 2. Get Gmail access token
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    // 3. Load previous historyId from SyncState
    const existing = await base44.asServiceRole.entities.SyncState.list();
    const syncRecord = existing.length > 0 ? existing[0] : null;

    if (!syncRecord) {
      // First run: save current historyId as baseline
      await base44.asServiceRole.entities.SyncState.create({ history_id: currentHistoryId });
      console.log('First run - saved baseline historyId:', currentHistoryId);
      return Response.json({ status: 'initialized' });
    }

    // 4. Fetch changes since last known historyId
    const prevHistoryId = syncRecord.history_id;
    console.log('Fetching history from:', prevHistoryId);

    const historyRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${prevHistoryId}&historyTypes=messageAdded`,
      { headers: authHeader }
    );

    if (!historyRes.ok) {
      const errorText = await historyRes.text();
      console.error('History API error:', historyRes.status, errorText);
      // If historyId is too old, reset baseline
      if (historyRes.status === 404) {
        await base44.asServiceRole.entities.SyncState.update(syncRecord.id, { history_id: currentHistoryId });
        return Response.json({ status: 'history_reset' });
      }
      return Response.json({ status: 'history_error', error: errorText });
    }

    const historyData = await historyRes.json();

    // 5. Update stored historyId
    await base44.asServiceRole.entities.SyncState.update(syncRecord.id, { history_id: currentHistoryId });

    if (!historyData.history || historyData.history.length === 0) {
      console.log('No new history entries');
      return Response.json({ status: 'no_changes' });
    }

    // 6. Process new messages
    const messageIds = new Set();
    for (const entry of historyData.history) {
      if (entry.messagesAdded) {
        for (const added of entry.messagesAdded) {
          messageIds.add(added.message.id);
        }
      }
    }

    console.log('New messages to check:', messageIds.size);

    let matched = 0;

    for (const msgId of messageIds) {
      // Fetch message details
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
        { headers: authHeader }
      );

      if (!msgRes.ok) continue;

      const msg = await msgRes.json();

      // Check subject
      const subjectHeader = msg.payload?.headers?.find(h => h.name.toLowerCase() === 'subject');
      const subject = subjectHeader?.value || '';

      if (!subject.includes('תוצאות שאלון אבחון')) {
        continue;
      }

      console.log('Found questionnaire email! Subject:', subject);

      // Extract body text - collect both text/plain and text/html
      let plainText = '';
      let htmlText = '';

      const extractText = (part) => {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          plainText += new TextDecoder().decode(
            Uint8Array.from(atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
          );
        } else if (part.mimeType === 'text/html' && part.body?.data) {
          htmlText += new TextDecoder().decode(
            Uint8Array.from(atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
          );
        }
        if (part.parts) {
          for (const p of part.parts) extractText(p);
        }
      };
      extractText(msg.payload);

      // Use plain text if available, otherwise strip HTML tags
      const bodyText = plainText.length > 0
        ? plainText
        : htmlText
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ')
            .trim();

      console.log('Email body length:', bodyText.length);
      console.log('Email body preview:', bodyText.substring(0, 300));

      // Extract name from body
      const firstNameMatch = bodyText.match(/שם פרטי[:\s]+(.+?)(?:\n|שם משפחה|$)/);
      const lastNameMatch = bodyText.match(/שם משפחה[:\s]+(.+?)(?:\n|$)/);

      const firstName = firstNameMatch ? firstNameMatch[1].trim() : '';
      const lastName = lastNameMatch ? lastNameMatch[1].trim() : '';
      const fullName = `${firstName} ${lastName}`.trim();

      if (!fullName) {
        console.log('Could not extract name from email');
        console.log('Body text for debug:', bodyText.substring(0, 500));
        continue;
      }

      console.log('Extracted name:', fullName);

      const requests = await base44.asServiceRole.entities.ServiceRequest.filter({
        service_type: 'consultation'
      });

      const matchingReq = requests.find(r => {
        const reqName = (r.contact_name || '').trim().toLowerCase();
        const emailName = fullName.toLowerCase();
        return reqName === emailName ||
               reqName.includes(firstName.toLowerCase()) ||
               emailName.includes(reqName);
      });

      if (!matchingReq) {
        console.log('No matching ServiceRequest found for name:', fullName);
        continue;
      }

      console.log('Matched ServiceRequest:', matchingReq.id, 'current status:', matchingReq.status);

      // Check if questionnaire message was already sent
      const existingTimeline = await base44.asServiceRole.entities.ServiceRequestTimeline.filter({
        service_request_id: matchingReq.id,
        event_type: 'message_sent',
      });
      const alreadySentQuestionnaire = existingTimeline.some(t => 
        t.description && t.description.includes('שאלון')
      );

      // Update status to questionnaire_completed (only if not already in advanced status)
      if (matchingReq.status !== 'questionnaire_completed' && matchingReq.status !== 'paid' && matchingReq.status !== 'scheduled' && matchingReq.status !== 'completed') {
        await base44.asServiceRole.entities.ServiceRequest.update(matchingReq.id, {
          status: 'questionnaire_completed',
          questionnaire_completed: true,
          current_step: 'questionnaire_completed',
        });

        await base44.asServiceRole.entities.ServiceRequestTimeline.create({
          service_request_id: matchingReq.id,
          event_type: 'status_change',
          description: `שאלון אבחון מולא על ידי ${fullName} (זוהה אוטומטית ממייל)`,
          old_value: matchingReq.status,
          new_value: 'questionnaire_completed',
        });

        // Set flag for frontend to send bot message
        if (!alreadySentQuestionnaire) {
          await base44.asServiceRole.entities.ServiceRequest.update(matchingReq.id, {
            pending_bot_message: 'questionnaire_completed'
          });
          console.log('Set pending_bot_message flag for frontend to handle');
        }

        console.log('Updated ServiceRequest to questionnaire_completed');
        matched++;
      } else if (!alreadySentQuestionnaire) {
        // Status already advanced but message never sent
        await base44.asServiceRole.entities.ServiceRequest.update(matchingReq.id, {
          questionnaire_completed: true,
          pending_bot_message: 'questionnaire_completed'
        });
        console.log('Status already advanced, set pending_bot_message flag');
        matched++;
      } else {
        console.log('ServiceRequest already in advanced status and message already sent:', matchingReq.status);
      }
    }

    return Response.json({ status: 'ok', processed: messageIds.size, matched });

  } catch (error) {
    console.error('Error in onQuestionnaireEmail:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});