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

  const normalize = (p) => {
    const d = p.replace(/\D/g, '');
    return d.startsWith('972') ? d : d.startsWith('0') ? '972' + d.slice(1) : d;
  };
  const normalizedPhone = normalize(contactPhone);

  for (const conv of conversations) {
    const convStr = JSON.stringify(conv);
    if (convStr.includes(contactPhone) || convStr.includes(normalizedPhone)) {
      await base44.entities.ServiceRequest.update(requestId, { conversation_id: conv.id });
      console.log('Found and saved conversation_id:', conv.id);
      return conv.id;
    }
  }

  console.log('No conversation found for phone:', contactPhone);
  return null;
}