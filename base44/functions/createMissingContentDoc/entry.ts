import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch all data
    const lectures = await base44.asServiceRole.entities.Lecture.list('-sort_order', 100);
    const serviceContents = await base44.asServiceRole.entities.ServiceContent.list('-sort_order', 200);

    const demoPatterns = [
      'demo', 'dummy', 'dQw4w9WgXcQ', '{{', 'placeholder', 'example.com',
      'test', 'TODO', 'FIXME', 'TBD'
    ];

    function isDemo(val) {
      if (!val || typeof val !== 'string') return false;
      const lower = val.toLowerCase();
      return demoPatterns.some(p => lower.includes(p.toLowerCase()));
    }

    // Scan Lectures
    const lectureMissing = [];
    for (const l of lectures) {
      const issues = [];
      if (isDemo(l.video_url) || (!l.video_url && l.lecture_type !== 'series')) issues.push('חסר סרטון');
      if (isDemo(l.image_url)) issues.push('חסר תמונה (תמונה קיימת אבל דמו)');
      const hasValidImage = l.image_url && !isDemo(l.image_url);
      if (!hasValidImage) {
        if (isDemo(l.pdf_url) || !l.pdf_url) issues.push('חסר PDF (או תמונה)');
      }
      if (issues.length > 0) {
        lectureMissing.push({ title: l.title, type: l.lecture_type, issues });
      }
    }

    // Scan ServiceContent
    const scMissing = [];
    for (const sc of serviceContents) {
      const issues = [];
      if (isDemo(sc.url)) issues.push('חסר קישור אמיתי');
      else if (!sc.url && sc.content_type !== 'agreement') issues.push('חסר קישור');
      if (issues.length > 0) {
        scMissing.push({ title: sc.title, service_type: sc.service_type, content_type: sc.content_type, sub_type: sc.sub_type || '', issues });
      }
    }

    // Build document content
    const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    
    let docText = `דוח תוכן חסר — דר׳ ליאת אדרי\nתאריך סריקה: ${now}\n\n`;
    docText += `═══════════════════════════════════════\n`;
    docText += `סה״כ: ${lectureMissing.length} הרצאות + ${scMissing.length} פריטי תוכן עם בעיות\n`;
    docText += `═══════════════════════════════════════\n\n`;

    // Lectures section
    docText += `📚 קטלוג הרצאות (Lecture) — תוכן חסר\n`;
    docText += `───────────────────────────────────────\n\n`;

    if (lectureMissing.length === 0) {
      docText += `✅ הכל תקין!\n\n`;
    } else {
      // Group by type
      const byType = { series: [], single: [], workshop: [] };
      for (const l of lectureMissing) {
        (byType[l.type] || byType.single).push(l);
      }

      const typeLabels = { series: 'סדרה', single: 'הרצאה בודדת', workshop: 'סדנה' };
      for (const [type, items] of Object.entries(byType)) {
        if (items.length === 0) continue;
        docText += `▸ ${typeLabels[type]} (${items.length})\n`;
        for (const item of items) {
          docText += `  • ${item.title}\n`;
          for (const issue of item.issues) {
            docText += `    ⚠ ${issue}\n`;
          }
        }
        docText += `\n`;
      }
    }

    // ServiceContent section
    docText += `\n📋 ניהול תוכן (ServiceContent) — תוכן חסר\n`;
    docText += `───────────────────────────────────────\n\n`;

    if (scMissing.length === 0) {
      docText += `✅ הכל תקין!\n\n`;
    } else {
      // Group by service_type
      const byService = {};
      for (const sc of scMissing) {
        const key = sc.service_type;
        if (!byService[key]) byService[key] = [];
        byService[key].push(sc);
      }

      const serviceLabels = {
        consultation: 'ייעוץ', legal: 'משפטי', lectures: 'הרצאות',
        clinic: 'קליניקה', post_lecture: 'פוסט הרצאה', general: 'כללי'
      };

      for (const [svc, items] of Object.entries(byService)) {
        docText += `▸ ${serviceLabels[svc] || svc} (${items.length})\n`;
        for (const item of items) {
          const subInfo = item.sub_type ? ` [${item.sub_type}]` : '';
          docText += `  • ${item.title} (${item.content_type}${subInfo})\n`;
          for (const issue of item.issues) {
            docText += `    ⚠ ${issue}\n`;
          }
        }
        docText += `\n`;
      }
    }

    docText += `\n═══════════════════════════════════════\n`;
    docText += `דברים נוספים שחסרים (ידני):\n`;
    docText += `───────────────────────────────────────\n`;
    docText += `  • ברקוד ל-bit (תשלום)\n`;
    docText += `═══════════════════════════════════════\n`;

    // Create Google Doc via Drive API
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Step 1: Create empty doc
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `תוכן חסר — גרסה סופית — ${now}`,
        mimeType: 'application/vnd.google-apps.document',
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      console.error('Failed to create doc:', err);
      return Response.json({ error: 'Failed to create Google Doc', details: err }, { status: 500 });
    }

    const docFile = await createRes.json();
    const docId = docFile.id;

    // Step 2: Insert text content via Google Docs API
    const docsRes = await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: docText,
            },
          },
        ],
      }),
    });

    if (!docsRes.ok) {
      const err = await docsRes.text();
      console.error('Failed to write doc content:', err);
    }

    // Step 3: Make it accessible via link
    await fetch(`https://www.googleapis.com/drive/v3/files/${docId}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'writer',
        type: 'anyone',
      }),
    });

    const docUrl = `https://docs.google.com/document/d/${docId}/edit`;
    console.log(`Doc created: ${docUrl}`);

    return Response.json({
      ok: true,
      docUrl,
      summary: {
        lectureIssues: lectureMissing.length,
        serviceContentIssues: scMissing.length,
      },
    });
  } catch (error) {
    console.error('createMissingContentDoc error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});