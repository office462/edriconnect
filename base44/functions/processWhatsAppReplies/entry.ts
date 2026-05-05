import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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
          
          // Extract file URLs from pending message
          const pendingFileRegex = /https?:\/\/[^\s\n]+\.(pdf|png|jpg|jpeg|gif|webp)(\?[^\s\n]*)?/gi;
          const pendingDriveRegex = /https?:\/\/drive\.google\.com\/(?:uc\?[^\s\n]*|file\/d\/[^\s\n]*)/gi;
          const pendingFiles = [];
          let pendingText = pendingMsg.message;
          
          const pendingDirectMatches = pendingMsg.message.match(pendingFileRegex) || [];
          for (const url of pendingDirectMatches) {
            const ext = url.split('?')[0].split('.').pop().toLowerCase();
            const isPdf = ext === 'pdf';
            pendingFiles.push({ url, fileName: isPdf ? 'document.pdf' : `image.${ext}`, type: isPdf ? 'file' : 'image' });
            pendingText = pendingText.replace(url, '').trim();
          }
          const pendingDriveMatches = pendingMsg.message.match(pendingDriveRegex) || [];
          for (const url of pendingDriveMatches) {
            if (pendingDirectMatches.includes(url)) continue;
            const isPdf = pendingMsg.message.toLowerCase().includes('pdf');
            pendingFiles.push({ url, fileName: isPdf ? 'document.pdf' : 'image.jpg', type: isPdf ? 'file' : 'image' });
            pendingText = pendingText.replace(url, '').trim();
          }
          pendingText = pendingText.replace(/\n{3,}/g, '\n\n').trim();
          
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
            try {
              const pfUrl = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;
              await fetch(pfUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatId, urlFile: pf.url, fileName: pf.fileName }),
              });
              console.log(`Pending file sent: ${pf.fileName}`);
            } catch (pfErr) {
              console.error(`Pending file error: ${pfErr.message}`);
            }
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

        // Extract file URLs from bot reply (PDFs, Drive files, images)
        const fileUrlRegex = /https?:\/\/[^\s\n]+\.(pdf|png|jpg|jpeg|gif|webp)(\?[^\s\n]*)?/gi;
        const driveFileRegex = /https?:\/\/drive\.google\.com\/(?:uc\?[^\s\n]*|file\/d\/[^\s\n]*)/gi;
        
        const fileUrls = [];
        let textMessage = botReply;
        
        // Find PDF/image direct URLs
        const directMatches = botReply.match(fileUrlRegex) || [];
        for (const url of directMatches) {
          const ext = url.split('?')[0].split('.').pop().toLowerCase();
          const isPdf = ext === 'pdf';
          fileUrls.push({ url, fileName: isPdf ? 'document.pdf' : `image.${ext}`, type: isPdf ? 'file' : 'image' });
          textMessage = textMessage.replace(url, '').trim();
        }
        
        // Find Google Drive URLs
        const driveMatches = botReply.match(driveFileRegex) || [];
        for (const url of driveMatches) {
          if (directMatches.includes(url)) continue; // skip if already matched
          // Check if it's a PDF or image based on context
          const isPdf = botReply.toLowerCase().includes('pdf') && botReply.indexOf('pdf') < botReply.indexOf(url) + 50;
          fileUrls.push({ url, fileName: isPdf ? 'document.pdf' : 'image.jpg', type: isPdf ? 'file' : 'image' });
          textMessage = textMessage.replace(url, '').trim();
        }
        
        // Clean up empty lines from removed URLs
        textMessage = textMessage.replace(/\n{3,}/g, '\n\n').trim();
        
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
        
        // Send files as separate messages via sendFileByUrl
        for (const file of fileUrls) {
          try {
            const fileApiUrl = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;
            const fileResp = await fetch(fileApiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chatId: msg.chat_id,
                urlFile: file.url,
                fileName: file.fileName,
              }),
            });
            if (fileResp.ok) {
              console.log(`File sent to ${msg.chat_id}: ${file.fileName}`);
            } else {
              const fileErr = await fileResp.json();
              console.error(`Failed to send file ${file.fileName}:`, fileErr);
            }
          } catch (fileError) {
            console.error(`Error sending file ${file.fileName}:`, fileError.message);
          }
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