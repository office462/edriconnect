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

      // Extract body text
      let bodyText = '';
      const extractText = (part) => {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          bodyText += new TextDecoder().decode(Uint8Array.from(atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
        }
        if (part.parts) {
          for (const p of part.parts) extractText(p);
        }
      };
      extractText(msg.payload);

      console.log('Email body length:', bodyText.length);

      // Extract name from body
      const firstNameMatch = bodyText.match(/שם פרטי:\s*(.+)/);
      const lastNameMatch = bodyText.match(/שם משפחה:\s*(.+)/);

      const firstName = firstNameMatch ? firstNameMatch[1].trim() : '';
      const lastName = lastNameMatch ? lastNameMatch[1].trim() : '';
      const fullName = `${firstName} ${lastName}`.trim();

      if (!fullName) {
        console.log('Could not extract name from email');
        continue;
      }

      console.log('Extracted name:', fullName);

      // Find matching ServiceRequest by contact_name
      const requests = await base44.asServiceRole.entities.ServiceRequest.filter({
        service_type: 'consultation'
      });

      // Try to match by full name (case-insensitive, trim)
      const matchingReq = requests.find(r => {
        const reqName = (r.contact_name || '').trim().toLowerCase();
        const emailName = fullName.toLowerCase();
        // Match if contact name contains firstName or full match
        return reqName === emailName || 
               reqName.includes(firstName.toLowerCase()) ||
               emailName.includes(reqName);
      });

      if (!matchingReq) {
        console.log('No matching ServiceRequest found for name:', fullName);
        continue;
      }

      console.log('Matched ServiceRequest:', matchingReq.id, 'current status:', matchingReq.status);

      // Update status to questionnaire_completed
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

        console.log('Updated ServiceRequest to questionnaire_completed');

        // Trigger bot continuation (same flow as manual status change)
        try {
          const botResult = await base44.asServiceRole.functions.invoke('onServiceRequestUpdate', {
            event: { type: 'update', entity_name: 'ServiceRequest', entity_id: matchingReq.id },
            data: { ...matchingReq, status: 'questionnaire_completed', questionnaire_completed: true, current_step: 'questionnaire_completed' },
            old_data: { ...matchingReq },
          });
          console.log('Bot trigger result:', botResult?.data);

          // If backend returned a pending bot message, send it directly via agent
          const pending = botResult?.data?.pendingBotMessage;
          if (pending?.conversationId && pending?.message) {
            const conv = await base44.asServiceRole.agents.getConversation(pending.conversationId);
            await base44.asServiceRole.agents.addMessage(conv, { role: 'assistant', content: pending.message });
            await base44.asServiceRole.entities.ServiceRequestTimeline.create({
              service_request_id: matchingReq.id,
              event_type: 'message_sent',
              description: `הודעת שאלון מולא נשלחה ל${matchingReq.contact_name} בשיחת הבוט`,
            });
            console.log('Bot message sent via conversation:', pending.conversationId);
          }
        } catch (botErr) {
          console.warn('Bot trigger failed:', botErr.message);
        }

        matched++;
      } else {
        console.log('ServiceRequest already in advanced status:', matchingReq.status);
      }
    }

    return Response.json({ status: 'ok', processed: messageIds.size, matched });

  } catch (error) {
    console.error('Error in onQuestionnaireEmail:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});