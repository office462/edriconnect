import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { conversationId } = await req.json();
    
    if (!conversationId) {
      return Response.json({ error: 'conversationId is required' }, { status: 400 });
    }

    // Archive the conversation by updating its metadata
    await base44.agents.updateConversation(conversationId, { 
      is_archived: true 
    });

    return Response.json({ ok: true, archived: conversationId });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});