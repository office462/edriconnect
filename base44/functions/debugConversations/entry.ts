import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { phone, contactName } = await req.json();
    
    const conversations = await base44.asServiceRole.agents.listConversations({
      agent_name: 'dr_adri_bot',
      sort: '-created_date',
      limit: 50,
    });

    console.log(`Total conversations: ${conversations.length}`);
    
    const results = [];
    
    for (const conv of conversations) {
      const msgs = conv.messages || [];
      let foundPhone = false;
      let foundName = false;
      let phoneFormatsFound = [];
      
      for (const msg of msgs) {
        // Check in tool_calls arguments
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            const args = tc.arguments_string || '';
            if (phone && args.includes(phone)) {
              foundPhone = true;
              phoneFormatsFound.push(`tool_call:${tc.name}`);
            }
            // Also check partial phone (without leading 0)
            if (phone && phone.startsWith('0') && args.includes(phone.substring(1))) {
              foundPhone = true;
              phoneFormatsFound.push(`tool_call_partial:${tc.name}`);
            }
            // Check with +972
            if (phone && args.includes('+972' + phone.substring(1))) {
              foundPhone = true;
              phoneFormatsFound.push(`tool_call_972:${tc.name}`);
            }
            if (contactName && args.includes(contactName)) {
              foundName = true;
            }
          }
        }
        
        // Check in message content
        if (msg.content) {
          if (phone && msg.content.includes(phone)) {
            foundPhone = true;
            phoneFormatsFound.push('content');
          }
          if (phone && phone.startsWith('0') && msg.content.includes(phone.substring(1))) {
            foundPhone = true;
            phoneFormatsFound.push('content_partial');
          }
          if (contactName && msg.content.includes(contactName)) {
            foundName = true;
          }
        }
        
        // Check in tool_calls results
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            const results_str = tc.results || '';
            if (phone && results_str.includes(phone)) {
              foundPhone = true;
              phoneFormatsFound.push(`results:${tc.name}`);
            }
            if (phone && phone.startsWith('0') && results_str.includes(phone.substring(1))) {
              foundPhone = true;
              phoneFormatsFound.push(`results_partial:${tc.name}`);
            }
            if (contactName && results_str.includes(contactName)) {
              foundName = true;
            }
          }
        }
      }
      
      if (foundPhone || foundName) {
        const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
        results.push({
          conversation_id: conv.id,
          created_date: conv.created_date,
          message_count: msgs.length,
          foundPhone,
          foundName,
          phoneFormatsFound,
          metadata: conv.metadata,
          last_message_role: lastMsg?.role,
          last_message_preview: lastMsg?.content?.substring(0, 100),
        });
      }
    }

    console.log(`Found ${results.length} matching conversations`);
    
    return Response.json({ 
      total_conversations: conversations.length,
      matching: results.length,
      results 
    });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});