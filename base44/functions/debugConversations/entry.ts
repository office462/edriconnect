import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { phone, contactName } = await req.json();
    
    // Try listing all conversations
    let conversations = [];
    try {
      conversations = await base44.asServiceRole.agents.listConversations({
        agent_name: 'dr_adri_bot',
      });
      console.log(`Method 1 - listConversations: ${conversations.length} conversations`);
    } catch (e) {
      console.error('Method 1 failed:', e.message);
    }

    // Show first 5 conversations basic info
    const convSummaries = conversations.slice(0, 10).map(c => ({
      id: c.id,
      created_date: c.created_date,
      metadata: c.metadata,
      message_count: (c.messages || []).length,
    }));

    // Deep search for phone in all conversations
    const phoneMatches = [];
    for (const conv of conversations) {
      const convStr = JSON.stringify(conv);
      if (phone && (convStr.includes(phone) || convStr.includes(phone.substring(1)))) {
        phoneMatches.push({
          id: conv.id,
          created_date: conv.created_date,
        });
      }
      if (contactName && convStr.includes(contactName)) {
        phoneMatches.push({
          id: conv.id,
          created_date: conv.created_date,
          match: 'name',
        });
      }
    }

    return Response.json({ 
      total: conversations.length,
      first10: convSummaries,
      phoneMatches,
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});