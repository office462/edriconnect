import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Try different approaches to list conversations
    console.log('Approach 1: q param');
    const convs1 = await base44.asServiceRole.agents.listConversations({ q: { agent_name: 'dr_adri_bot' }, limit: 10 });
    console.log('Approach 1 result:', convs1.length);

    console.log('Approach 2: agent_name direct');
    const convs2 = await base44.asServiceRole.agents.listConversations({ agent_name: 'dr_adri_bot' });
    console.log('Approach 2 result:', convs2.length);

    console.log('Approach 3: no filter at all');
    const convs3 = await base44.asServiceRole.agents.listConversations({});
    console.log('Approach 3 result:', convs3.length);

    console.log('Approach 4: user scope');
    const convs4 = await base44.agents.listConversations({ agent_name: 'dr_adri_bot' });
    console.log('Approach 4 result:', convs4.length);

    // Show metadata of conversations found
    const allConvs = convs1.length > 0 ? convs1 : convs2;
    const summaries = allConvs.map(c => ({
      id: c.id,
      metadata: c.metadata,
      messages_count: c.messages?.length || 0,
    }));

    return Response.json({ 
      approach1_count: convs1.length,
      approach2_count: convs2.length,
      conversations: summaries,
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});