import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Extract file URLs (PDF, images, Google Drive) from text and return clean text + file list
function extractFilesFromText(text) {
  const fileUrls = [];
  let cleanText = text;
  const alreadyMatched = new Set();

  // Match direct file URLs (.pdf, .png, .jpg, .jpeg, .gif, .webp)
  const directRegex = /https?:\/\/[^\s\n\)]+\.(pdf|png|jpg|jpeg|gif|webp)(\?[^\s\n\)]*)?/gi;
  const directMatches = text.match(directRegex) || [];
  for (const url of directMatches) {
    if (alreadyMatched.has(url)) continue;
    alreadyMatched.add(url);
    const ext = url.split('?')[0].split('.').pop().toLowerCase();
    const isPdf = ext === 'pdf';
    fileUrls.push({ url, fileName: isPdf ? 'document.pdf' : `image.${ext}` });
    cleanText = cleanText.replace(url, '');
  }

  // Match Google Drive URLs (uc?export=view or file/d/...)
  const driveRegex = /https?:\/\/drive\.google\.com\/(?:uc\?[^\s\n\)]*|file\/d\/[^\s\n\)]*)/gi;
  const driveMatches = text.match(driveRegex) || [];
  for (const url of driveMatches) {
    if (alreadyMatched.has(url)) continue;
    alreadyMatched.add(url);
    const urlIndex = text.indexOf(url);
    const nearby = text.substring(Math.max(0, urlIndex - 100), urlIndex + url.length + 50).toLowerCase();
    const isPdf = nearby.includes('pdf') || nearby.includes('מאמר') || nearby.includes('הסכם') || nearby.includes('מסמך');
    fileUrls.push({ url, fileName: isPdf ? 'document.pdf' : 'image.jpg' });
    cleanText = cleanText.replace(url, '');
  }

  cleanText = cleanText.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
  return { textMessage: cleanText, fileUrls };
}

// Send a file via Green API sendFileByUrl
async function sendFileByUrl(instanceId, token, chatId, urlFile, fileName) {
  try {
    const apiUrl = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, urlFile, fileName, caption: '' }),
    });
    if (resp.ok) {
      console.log(`File sent: ${fileName} to ${chatId}`);
    } else {
      console.error(`Failed to send file ${fileName}:`, await resp.text());
    }
  } catch (err) {
    console.error(`Error sending file ${fileName}:`, err.message);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Check if WhatsApp bot is enabled
    const botSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' });
    const botEnabled = botSettings.length > 0 && botSettings[0].value === 'true';
    if (!botEnabled) {
      console.log('processWhatsAppReplies: bot disabled, skipping');
      return Response.json({ ok: true, processed: 0, reason: 'bot_disabled' });
    }

    // ===== PROCESS PENDING BOT MESSAGES — clear flags but don't send (bot already confirmed enabled above) =====
    const instanceId = Deno.env.get('GREEN_API_INSTANCE_ID');
    const token = Deno.env.get('GREEN_API_TOKEN');

    const allRequests = await base44.asServiceRole.entities.ServiceRequest.list('-updated_date', 50);
    const pendingBotRequests = allRequests.filter(r => r.pending_bot_message && r.pending_bot_message.length > 0);

    for (const sr of pendingBotRequests) {
      try {
        console.log(`processWhatsAppReplies: found pending_bot_message=${sr.pending_bot_message} for ${sr.id}`);

        // Call onServiceRequestUpdate to generate the message
        const botResult = await base44.asServiceRole.functions.invoke('onServiceRequestUpdate', {
          event: { type: 'update', entity_name: 'ServiceRequest', entity_id: sr.id },
          data: { ...sr, status: sr.pending_bot_message, conversation_id: sr.conversation_id },
          old_data: { ...sr, status: 'previous' },
        });

        const pendingMsg = botResult?.pendingBotMessage;
        if (pendingMsg?.message && pendingMsg?.contactPhone) {
          // Send via WhatsApp
          let cleanPhone = pendingMsg.contactPhone.replace(/[\s\-\+]/g, '');
          if (cleanPhone.startsWith('0')) cleanPhone = '972' + cleanPhone.substring(1);
          const chatId = `${cleanPhone}@c.us`;
          
          // Extract files and clean text
          const { textMessage: pendingText, fileUrls: pendingFiles } = extractFilesFromText(pendingMsg.message);
          
          // Send text
          let pendingSendOk = true;
          if (pendingText) {
            const sendUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
            const sendResp = await fetch(sendUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId, message: pendingText }),
            });
            if (!sendResp.ok) pendingSendOk = false;
          }
          
          // Send files
          for (const pf of pendingFiles) {
            await sendFileByUrl(instanceId, token, chatId, pf.url, pf.fileName);
          }
          
          if (pendingSendOk) {
            // Log outgoing for daily count
            await base44.asServiceRole.entities.WhatsAppMessageLog.create({
              id_message: `out_${Date.now()}_pb`,
              phone: cleanPhone,
              direction: 'outgoing',
              text: (pendingMsg.message || '').substring(0, 500),
              status: 'replied',
              chat_id: `${cleanPhone}@c.us`,
            });
            console.log(`processWhatsAppReplies: sent pending bot message to ${cleanPhone}`);
          }

          // Also add to bot conversation if available
          if (pendingMsg.conversationId && /^[a-f0-9]{24}$/i.test(pendingMsg.conversationId)) {
            try {
              const conv = await base44.asServiceRole.agents.getConversation(pendingMsg.conversationId);
              await base44.asServiceRole.agents.addMessage(conv, { role: 'assistant', content: pendingMsg.message });
            } catch (convErr) {
              console.warn('processWhatsAppReplies: conv error:', convErr.message);
            }
          }

          // Log in timeline
          await base44.asServiceRole.entities.ServiceRequestTimeline.create({
            service_request_id: sr.id,
            event_type: 'message_sent',
            description: `הודעת ${pendingMsg.botTrigger || sr.pending_bot_message} נשלחה אוטומטית (processWhatsAppReplies)`,
          });
        }

        // Clear the flag
        await base44.asServiceRole.entities.ServiceRequest.update(sr.id, { pending_bot_message: '' });
      } catch (pendErr) {
        console.warn('processWhatsAppReplies: pending bot error:', pendErr.message);
      }
    }

    // ===== PROCESS PENDING WHATSAPP REPLIES =====
    // Find all pending messages
    const pending = await base44.asServiceRole.entities.WhatsAppMessageLog.filter({ status: 'pending_reply' });

    if (pending.length === 0) {
      return Response.json({ ok: true, processed: 0 });
    }

    console.log(`Processing ${pending.length} pending WhatsApp replies`);

    let processed = 0;
    let errors = 0;

    for (const msg of pending) {
      try {
        // Timeout: if message is older than 5 minutes, mark as timeout
        const createdAt = new Date(msg.created_date);
        const ageMs = Date.now() - createdAt.getTime();
        if (ageMs > 5 * 60 * 1000) {
          console.log(`Message ${msg.id_message} timed out (${Math.round(ageMs / 1000)}s old)`);
          await base44.asServiceRole.entities.WhatsAppMessageLog.update(msg.id, { status: 'timeout' });
          continue;
        }

        if (!msg.conversation_id || !msg.chat_id) {
          await base44.asServiceRole.entities.WhatsAppMessageLog.update(msg.id, { status: 'error' });
          continue;
        }

        // Get conversation and look for bot reply
        const conversation = await base44.asServiceRole.agents.getConversation(msg.conversation_id);
        const messages = conversation.messages || [];
        const expectedCount = msg.message_count_at_send || 0;

        // Look for assistant message AFTER our user message
        let botReply = '';
        if (messages.length > expectedCount) {
          for (let i = messages.length - 1; i >= expectedCount; i--) {
            if (messages[i].role === 'assistant' && messages[i].content) {
              botReply = messages[i].content;
              break;
            }
          }
        }

        if (!botReply) {
          // Bot hasn't replied yet — will try again next run
          console.log(`No reply yet for ${msg.id_message} (${Math.round(ageMs / 1000)}s old)`);
          continue;
        }

        // Extract files and clean text
        const { textMessage, fileUrls } = extractFilesFromText(botReply);
        
        // Send text message (without file URLs)
        let sendSuccess = true;
        if (textMessage) {
          const sendUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
          const sendResponse = await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: msg.chat_id, message: textMessage }),
          });
          if (!sendResponse.ok) {
            const err = await sendResponse.json();
            console.error(`Failed to send text to ${msg.chat_id}:`, err);
            sendSuccess = false;
          }
        }
        
        // Send files as separate messages
        for (const file of fileUrls) {
          await sendFileByUrl(instanceId, token, msg.chat_id, file.url, file.fileName);
        }

        if (sendSuccess) {
          await base44.asServiceRole.entities.WhatsAppMessageLog.update(msg.id, { status: 'replied' });
          // Log outgoing for daily count
          await base44.asServiceRole.entities.WhatsAppMessageLog.create({
            id_message: `out_${Date.now()}_pr`,
            phone: msg.phone || msg.chat_id?.replace('@c.us', '') || '',
            direction: 'outgoing',
            text: botReply.substring(0, 500),
            status: 'replied',
            chat_id: msg.chat_id,
          });
          console.log(`Reply sent to ${msg.chat_id} for message ${msg.id_message} (${fileUrls.length} files)`);
          processed++;
        } else {
          await base44.asServiceRole.entities.WhatsAppMessageLog.update(msg.id, { status: 'error' });
          errors++;
        }
      } catch (err) {
        console.error(`Error processing message ${msg.id_message}:`, err.message);
        errors++;
      }
    }

    return Response.json({ ok: true, processed, errors, total: pending.length });
  } catch (error) {
    console.error('processWhatsAppReplies error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});