import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const results = {};

    try {
      console.log('Test 1: asServiceRole with q filter');
      const c1 = await base44.asServiceRole.agents.listConversations({ q: { agent_name: 'dr_adri_bot' }, limit: 5 });
      results.serviceRole_q = c1.length;
      console.log('Test 1 OK:', c1.length);
    } catch (e) {
      results.serviceRole_q_error = e.message;
      console.error('Test 1 error:', e.message);
    }

    try {
      console.log('Test 2: asServiceRole with agent_name');
      const c2 = await base44.asServiceRole.agents.listConversations({ agent_name: 'dr_adri_bot' });
      results.serviceRole_agentName = c2.length;
      console.log('Test 2 OK:', c2.length);
    } catch (e) {
      results.serviceRole_agentName_error = e.message;
      console.error('Test 2 error:', e.message);
    }

    try {
      console.log('Test 3: asServiceRole no filter');
      const c3 = await base44.asServiceRole.agents.listConversations({});
      results.serviceRole_noFilter = c3.length;
      console.log('Test 3 OK:', c3.length);
    } catch (e) {
      results.serviceRole_noFilter_error = e.message;
      console.error('Test 3 error:', e.message);
    }

    try {
      console.log('Test 4: user scope');
      const c4 = await base44.agents.listConversations({ agent_name: 'dr_adri_bot' });
      results.userScope = c4.length;
      if (c4.length > 0) {
        results.userScope_first = { id: c4[0].id, metadata: c4[0].metadata };
      }
      console.log('Test 4 OK:', c4.length);
    } catch (e) {
      results.userScope_error = e.message;
      console.error('Test 4 error:', e.message);
    }

    return Response.json(results);
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});