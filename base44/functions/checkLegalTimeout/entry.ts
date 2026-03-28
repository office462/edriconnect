import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify admin access
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Get all legal requests in in_review status
    const legalRequests = await base44.asServiceRole.entities.ServiceRequest.filter({
      service_type: 'legal',
      status: 'in_review',
    });

    const now = new Date();
    const results = [];

    for (const request of legalRequests) {
      if (!request.processing_start_date) continue;

      const startDate = new Date(request.processing_start_date);
      const daysPassed = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));

      if (daysPassed >= 30) {
        console.log(`Legal request ${request.id} (${request.contact_name}) passed 30 days`);

        // Update the request
        await base44.asServiceRole.entities.ServiceRequest.update(request.id, {
          current_step: 'offer_call',
          status: 'pending',
        });

        // Log in timeline
        await base44.asServiceRole.entities.ServiceRequestTimeline.create({
          service_request_id: request.id,
          event_type: 'system_note',
          description: `עברו ${daysPassed} ימים מתחילת הטיפול בחוות דעת משפטית - הפנייה עודכנה להצעת שיחה`,
          old_value: 'in_review',
          new_value: 'pending',
        });

        // Try to send bot message
        try {
          const contactName = request.contact_name || '';
          const conversations = await base44.asServiceRole.agents.listConversations({ agent_name: 'dr_adri_bot' });
          
          let targetConversation = null;
          for (const conv of conversations) {
            if (conv.metadata?.contact_id === request.contact_id) {
              targetConversation = conv;
              break;
            }
          }

          if (targetConversation) {
            // Read message from BotContent instead of hardcoded text
            let timeoutMessage = `הטיפול בחוות הדעת הסתיים. נשמח לתאם שיחה עם ד"ר אדרי.\nמעוניין/ת לתאם?`;
            const botContentEntries = await base44.asServiceRole.entities.BotContent.filter({ key: 'legal_timeout_message' });
            if (botContentEntries.length > 0) {
              timeoutMessage = botContentEntries[0].content.replace('{שם פרטי}', contactName).replace('{שם}', contactName);
            }
            await base44.asServiceRole.agents.addMessage(targetConversation, {
              role: 'assistant',
              content: timeoutMessage,
            });
            console.log('30-day message sent to:', contactName);
          } else {
            console.log('No conversation found for:', contactName);
          }
        } catch (msgErr) {
          console.error('Failed to send 30-day message:', msgErr);
        }

        results.push({ requestId: request.id, contactName: request.contact_name, daysPassed });
      }
    }

    console.log(`Checked ${legalRequests.length} legal requests, ${results.length} passed 30 days`);
    return Response.json({ ok: true, checked: legalRequests.length, triggered: results.length, results });
  } catch (error) {
    console.error('Error in checkLegalTimeout:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});