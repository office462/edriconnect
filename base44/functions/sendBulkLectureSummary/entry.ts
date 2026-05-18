import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const instanceId = Deno.env.get('GREEN_API_INSTANCE_ID');
    const token = Deno.env.get('GREEN_API_TOKEN');

    const pdfUrl = 'https://drive.google.com/uc?export=view&id=1BK7BUitGiETT82Rjl32WwIBsLu5OytkM';
    const lectureName = 'האנטומיה של האושר';
    const textMessage = `בבקשה, הנה סיכום ההרצאה ${lectureName} 🌸\nשמחתי לראותך, העוזר הדיגיטלי שלי עדיין בתהליכי הרצה, סליחה על העיכוב`;

    const recipients = [
      { name: 'צביקה מושקוביץ', phone: '0507270841' },
      { name: 'יואב אביבי', phone: '0544682503' },
      { name: 'שרון פדאל', phone: '0502889000' },
      { name: 'יעקוב רוזנבאום', phone: '0508454820' },
      { name: 'אילנה', phone: '0505733623' },
      { name: 'אמנון בן ישי', phone: '0523663446' },
      { name: 'עדה בקר', phone: '0544722282' },
      { name: '', phone: '0528840670' },
      { name: 'שרי', phone: '0509126680' },
      { name: 'דניאל פרץ', phone: '0544753956' },
      { name: 'ניר דורון', phone: '0507519684' },
    ];

    // Get current index from SystemSetting
    const indexSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'bulk_send_index' });
    let currentIndex = 0;
    if (indexSettings.length > 0) {
      currentIndex = parseInt(indexSettings[0].value) || 0;
    }

    // If we've sent to everyone, stop
    if (currentIndex >= recipients.length) {
      console.log('All recipients done. No more to send.');
      return Response.json({ status: 'completed', message: 'All 11 recipients have been sent.' });
    }

    const r = recipients[currentIndex];
    let cleanPhone = r.phone.replace(/[\s\-\+]/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '972' + cleanPhone.substring(1);
    const chatId = `${cleanPhone}@c.us`;

    // 1. Send text message
    const sendUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
    const textResp = await fetch(sendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message: textMessage }),
    });

    // 2. Wait 2 seconds then send PDF
    await new Promise(resolve => setTimeout(resolve, 2000));
    const fileUrl = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;
    const fileResp = await fetch(fileUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId,
        urlFile: pdfUrl,
        fileName: `סיכום הרצאה - ${lectureName}.pdf`,
        caption: '',
      }),
    });

    console.log(`[${currentIndex + 1}/${recipients.length}] Sent to ${r.name || r.phone} (${r.phone}): text=${textResp.ok}, file=${fileResp.ok}`);

    // Update index for next run
    const nextIndex = currentIndex + 1;
    if (indexSettings.length > 0) {
      await base44.asServiceRole.entities.SystemSetting.update(indexSettings[0].id, { value: String(nextIndex) });
    } else {
      await base44.asServiceRole.entities.SystemSetting.create({ key: 'bulk_send_index', value: String(nextIndex), category: 'flow' });
    }

    return Response.json({
      status: 'sent',
      recipient: r.name || r.phone,
      phone: r.phone,
      index: currentIndex + 1,
      total: recipients.length,
      textOk: textResp.ok,
      fileOk: fileResp.ok,
    });
  } catch (error) {
    console.error('sendBulkLectureSummary error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});