import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const files = body.files || [];
    const title = body.title || 'תיעוד קוד';

    const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    
    let docText = `${title}\nתאריך: ${now}\n\n`;
    docText += `סה״כ ${files.length} קבצים\n`;
    docText += `═══════════════════════════════════════\n\n`;

    for (const file of files) {
      docText += `\n────────────────────────────────────────\n`;
      docText += `📄 ${file.path}\n`;
      docText += `────────────────────────────────────────\n\n`;
      docText += file.content + '\n\n';
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `${title} — ${now}`,
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
    return Response.json({ ok: true, docUrl });
  } catch (error) {
    console.error('createCodeDoc error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});