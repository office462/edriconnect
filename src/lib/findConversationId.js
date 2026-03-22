import { base44 } from '@/api/base44Client';

/**
 * Finds and saves the conversation_id for a service request.
 * Called from the frontend before triggering bot continuation,
 * because the frontend has permission to list conversations.
 */
export async function findAndSaveConversationId(requestId, contactPhone) {
  if (!contactPhone) return null;

  const conversations = await base44.agents.listConversations({
    agent_name: 'dr_adri_bot',
    sort: '-created_date',
    limit: 50,
  });

  console.log('listConversations returned:', conversations.length, 'conversations');
  if (conversations.length > 0) {
    console.log('First conv sample - id:', conversations[0].id, 'has messages:', !!(conversations[0].messages?.length));
  }

  const normalize = (p) => {
    const d = p.replace(/\D/g, '');
    return d.startsWith('972') ? d : d.startsWith('0') ? '972' + d.slice(1) : d;
  };
  const normalizedPhone = normalize(contactPhone);

  // Search only in messages content — not the entire conversation object
  for (const conv of conversations) {
    const messagesStr = JSON.stringify(conv.messages || []);
    if (messagesStr.includes(contactPhone) || messagesStr.includes(normalizedPhone)) {
      await base44.entities.ServiceRequest.update(requestId, { conversation_id: conv.id });
      console.log('Found and saved conversation_id:', conv.id, 'for phone:', contactPhone);
      return conv.id;
    }
  }

  console.log('No conversation found for phone:', contactPhone);
  return null;
}