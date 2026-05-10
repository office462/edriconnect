import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const agentInstructions = body.agentInstructions || null;

    const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });

    // Fetch all 4 layers
    const botContent = await base44.asServiceRole.entities.BotContent.list('-created_date', 200);
    const serviceContent = await base44.asServiceRole.entities.ServiceContent.list('sort_order', 200);
    const lectures = await base44.asServiceRole.entities.Lecture.list('sort_order', 100);
    const systemSettings = await base44.asServiceRole.entities.SystemSetting.list('-created_date', 100);

    let docText = `גיבוי מערכת — ד״ר ליאת אדרי\nתאריך: ${now}\n\n`;
    docText += `═══════════════════════════════════════\n\n`;

    // Layer 4: Agent Instructions (if provided from frontend)
    if (agentInstructions) {
      docText += `🧠 שכבה 4 — הנחיות הבוט (Agent Instructions)\n`;
      docText += `────────────────────────────────────────\n`;
      docText += agentInstructions + '\n\n';
    }

    // Layer 3: BotContent
    docText += `💬 שכבה 3 — תוכן הבוט (BotContent) — ${botContent.length} רשומות\n`;
    docText += `────────────────────────────────────────\n\n`;
    for (const bc of botContent) {
      docText += `[${bc.key}] ${bc.title}\n`;
      docText += `קטגוריה: ${bc.category || '-'} | מסלול: ${bc.service_type_flow || '-'}\n`;
      docText += `תוכן:\n${bc.content}\n\n`;
    }

    // Layer 2: ServiceContent
    docText += `\n🔗 שכבה 2 — ניהול תוכן שירות (ServiceContent) — ${serviceContent.length} רשומות\n`;
    docText += `────────────────────────────────────────\n\n`;
    for (const sc of serviceContent) {
      docText += `${sc.title} | ${sc.service_type}/${sc.content_type}${sc.sub_type ? '/' + sc.sub_type : ''}\n`;
      docText += `URL: ${sc.url || '(ריק)'}\n`;
      if (sc.description) docText += `תיאור: ${sc.description}\n`;
      docText += `\n`;
    }

    // Layer 1: Lectures
    docText += `\n📚 שכבה 1 — קטלוג הרצאות (Lecture) — ${lectures.length} רשומות\n`;
    docText += `────────────────────────────────────────\n\n`;
    for (const l of lectures) {
      docText += `${l.title} (${l.lecture_type})\n`;
      if (l.description) docText += `תיאור: ${l.description}\n`;
      if (l.video_url) docText += `סרטון: ${l.video_url}\n`;
      if (l.pdf_url) docText += `PDF: ${l.pdf_url}\n`;
      if (l.price) docText += `מחיר: ${l.price}\n`;
      docText += `\n`;
    }

    // SystemSettings
    docText += `\n⚙️ הגדרות מערכת (SystemSetting) — ${systemSettings.length} רשומות\n`;
    docText += `────────────────────────────────────────\n\n`;
    for (const s of systemSettings) {
      docText += `[${s.category}] ${s.key}: ${s.value}\n`;
    }

    // Create Google Doc
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `גיבוי מערכת — ${now}${agentInstructions ? ' (כולל הנחיות בוט)' : ''}`,
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