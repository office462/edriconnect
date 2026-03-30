import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const notificationText = (body.notification_text || '').trim();

    if (!notificationText) {
      return Response.json({ error: 'missing notification_text' }, { status: 400 });
    }

    console.log('Payment webhook received:', notificationText);

    // 1. Validate webhook secret (try env var first, then DB)
    const secretHeader = req.headers.get('X-Webhook-Secret') || '';
    let expectedSecret = Deno.env.get('PAYMENT_WEBHOOK_SECRET') || null;

    if (!expectedSecret) {
      try {
        const secretSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'payment_webhook_secret' });
        expectedSecret = secretSettings.length > 0 ? secretSettings[0].value : null;
      } catch (e) {
        console.log('Could not read SystemSetting, falling back to env only:', e.message);
      }
    }

    if (!expectedSecret || secretHeader !== expectedSecret) {
      console.log('Webhook secret mismatch');
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    // 2. Extract payer name from notification text
    const payerName = extractPayerName(notificationText);

    if (!payerName) {
      console.log('Could not extract payer name from:', notificationText);
      return Response.json({ status: 'parse_error', notification_text: notificationText }, { status: 400 });
    }

    console.log('Extracted payer name:', payerName);

    // 3. Find matching ServiceRequest
    const allRequests = await base44.asServiceRole.entities.ServiceRequest.list('-created_date', 200);
    const eligibleRequests = allRequests.filter(r =>
      r.status !== 'paid' && r.status !== 'scheduled' && r.status !== 'completed'
    );

    const payerLower = payerName.toLowerCase().trim();
    const payerFirstName = payerLower.split(' ')[0];

    const matchingReq = eligibleRequests.find(r => {
      const reqName = (r.contact_name || '').toLowerCase().trim();
      if (!reqName) return false;
      // Exact match
      if (reqName === payerLower) return true;
      // First name match
      const reqFirstName = reqName.split(' ')[0];
      if (reqFirstName === payerFirstName) return true;
      // Partial match
      if (reqName.includes(payerLower) || payerLower.includes(reqName)) return true;
      return false;
    });

    if (!matchingReq) {
      console.log('No matching ServiceRequest found for payer:', payerName);
      return Response.json({ status: 'no_match', payer_name: payerName });
    }

    console.log('Matched ServiceRequest:', matchingReq.id, 'type:', matchingReq.service_type, 'current status:', matchingReq.status);

    // 4. Update status to paid (entity automation handles the rest)
    const oldStatus = matchingReq.status;
    await base44.asServiceRole.entities.ServiceRequest.update(matchingReq.id, {
      status: 'paid',
      payment_confirmed: true,
    });

    // 5. Log to timeline
    await base44.asServiceRole.entities.ServiceRequestTimeline.create({
      service_request_id: matchingReq.id,
      event_type: 'payment',
      description: `תשלום זוהה אוטומטית מ-Bit/Paybox — ${payerName}`,
      old_value: oldStatus,
      new_value: 'paid',
    });

    console.log('Updated ServiceRequest to paid:', matchingReq.id);

    return Response.json({
      status: 'ok',
      matched_request_id: matchingReq.id,
      payer_name: payerName,
      service_type: matchingReq.service_type,
    });

  } catch (error) {
    console.error('paymentWebhook error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/**
 * Extract payer name from Bit/Paybox notification text.
 * Covers common Hebrew notification patterns.
 */
function extractPayerName(text) {
  const patterns = [
    // Bit patterns — מ- prefix handled by trimming result
    /קיבלת .+ מ-?(.+?) באפליקציית Bit/,
    /קיבלת .+ מ-?(.+?) ב-?Bit/,
    /התקבל תשלום .+ מ-?(.+?) ב-?Bit/,
    /(.+?) שלח.? לך .+ ב-?Bit/,
    /(.+?) העביר.? לך .+ ב-?Bit/,
    // Paybox patterns
    /קיבלת .+ מ-?(.+?) ב-?Paybox/,
    /קיבלת .+ מ-?(.+?) ב-?פייבוקס/,
    /התקבל תשלום .+ מ-?(.+?) ב-?Paybox/,
    /התקבל תשלום .+ מ-?(.+?) ב-?פייבוקס/,
    /(.+?) שלח.? לך .+ ב-?Paybox/,
    /(.+?) העביר.? לך .+ ב-?Paybox/,
    // Generic fallback: "קיבלת X מ-<name>"
    /קיבלת .+ מ-?(.+?)$/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}