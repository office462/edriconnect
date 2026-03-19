import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const conversations = await base44.agents.listConversations({ agent_name: 'dr_adri_bot' });

    // Check each conversation for tool calls that reference the contact
    const results = [];
    for (const conv of conversations) {
      const msgs = conv.messages || [];
      // Check tool_calls in messages for contact references
      let foundContactId = null;
      let foundPhone = null;
      for (const msg of msgs) {
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            const args = tc.arguments_string || '';
            if (args.includes('69bbe3bb909bb9d8c7ae086d')) {
              foundContactId = '69bbe3bb909bb9d8c7ae086d';
            }
            if (args.includes('0544535688')) {
              foundPhone = '0544535688';
            }
            if (args.includes('עינת')) {
              foundContactId = foundContactId || 'mentioned_in_args';
            }
          }
        }
        if (msg.content && msg.content.includes('עינת')) {
          foundContactId = foundContactId || 'mentioned_in_content';
        }
      }
      results.push({
        id: conv.id,
        metadata: conv.metadata,
        messages_count: msgs.length,
        foundContactId,
        foundPhone,
      });
    }

    return Response.json({ conversations: results });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});