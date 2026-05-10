import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Read agent config via SDK
    const agentConfig = await base44.asServiceRole.agents.getAgentConfig('dr_adri_bot');

    const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });

    let docText = `גיבוי הנחיות בוט — dr_adri_bot\nתאריך: ${now}\n\n`;
    docText += `═══════════════════════════════════════\n\n`;

    docText += `📋 תיאור (description):\n`;
    docText += `────────────────────────────────────────\n`;
    docText += (agentConfig.description || '') + '\n\n';

    docText += `📜 הנחיות (instructions):\n`;
    docText += `────────────────────────────────────────\n`;
    docText += (agentConfig.instructions || '') + '\n\n';

    docText += `🔧 tool_configs:\n`;
    docText += `────────────────────────────────────────\n`;
    docText += JSON.stringify(agentConfig.tool_configs || [], null, 2) + '\n\n';

    docText += `🧠 memory_config:\n`;
    docText += `────────────────────────────────────────\n`;
    docText += JSON.stringify(agentConfig.memory_config || {}, null, 2) + '\n\n';

    docText += `⚙️ model: ${agentConfig.model || 'automatic'}\n`;

    // Create Google Doc
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `גיבוי הנחיות בוט — ${now}`,
        mimeType: 'application/vnd.google-apps.document',
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      return Response.json({ error: 'Failed to create doc', details: err }, { status: 500 });
    }

    const docFile = await createRes.json();
    const docId = docFile.id;

    await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{ insertText: { location: { index: 1 }, text: docText } }],
      }),
    });

    await fetch(`https://www.googleapis.com/drive/v3/files/${docId}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'writer', type: 'anyone' }),
    });

    const docUrl = `https://docs.google.com/document/d/${docId}/edit`;
    console.log(`Backup created: ${docUrl}`);
    return Response.json({ ok: true, docUrl });
  } catch (error) {
    console.error('backupAgentInstructions error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});