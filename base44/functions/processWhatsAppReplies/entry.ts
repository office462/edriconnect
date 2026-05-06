import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // This function runs as a scheduled automation (no user context).
    // Validate that the caller is either an admin or a service role (automation).
    let isAuthorized = false;
    try {
      const user = await base44.auth.me();
      if (user?.role === 'admin') isAuthorized = true;
    } catch (_) {
      // auth.me() throws in automation context — that's expected
    }
    // If no admin user, check if this is a service-role call (automation/scheduled)
    // by verifying we can do a service-role operation
    if (!isAuthorized) {
      try {
        // Quick service-role check — if this succeeds, we're running as service role
        await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' });
        isAuthorized = true;
      } catch (_) {
        // Not service role either
      }
    }
    if (!isAuthorized) {
      return Response.json({ error: 'Forbidden: Admin or automation access required' }, { status: 403 });
    }

    // Check if WhatsApp bot is enabled
    const botSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_bot_enabled' });
    const botEnabled = botSettings.length > 0 && botSettings[0].value === 'true';
    
    // Load test phones list (active even when bot is disabled)
    let testPhonesList = [];
    if (!botEnabled) {
      const testPhoneSettings = await base44.asServiceRole.entities.SystemSetting.filter({ key: 'whatsapp_test_phones' });
      const testPhonesStr = testPhoneSettings.length > 0 ? testPhoneSettings[0].value : '';
      testPhonesList = testPhonesStr.split(',').map(p => {
        let clean = p.trim().replace(/[\s\-\+]/g, '');
        if (clean.startsWith('0')) clean = '972' + clean.substring(1);
        return clean;
      }).filter(Boolean);
      
      if (testPhonesList.length === 0) {
        console.log('processWhatsAppReplies: bot disabled, no test phones, skipping');
        return Response.json({ ok: true, processed: 0, reason: 'bot_disabled' });
      }
      console.log(`processWhatsAppReplies: bot disabled, but processing test phones: ${testPhonesList.join(', ')}`);
    }

    // ===== PROCESS PENDING BOT MESSAGES — clear flags but don't send (bot already confirmed enabled above) =====
    const instanceId = Deno.env.get('GREEN_API_INSTANCE_ID');
    const token = Deno.env.get('GREEN_API_TOKEN');

    const allRequests = await base44.asServiceRole.entities.ServiceRequest.list('-updated_date', 50);
    const pendingBotRequests = allRequests.filter(r => r.pending_bot_message && r.pending_bot_message.length > 0);

    let pendingSentCount = 0;
    for (const sr of pendingBotRequests) {
      try {
        // Rate limit: delay between different phones to avoid WhatsApp spam detection
        if (pendingSentCount > 0) {
          console.log('processWhatsAppReplies: waiting 5s between sends (anti-spam)');
          await new Promise(r => setTimeout(r, 5000));
        }

        // If bot is disabled, only process test phones
        if (!botEnabled) {
          let srPhone = (sr.contact_phone || '').replace(/[\s\-\+]/g, '');
          if (srPhone.startsWith('0')) srPhone = '972' + srPhone.substring(1);
          if (!testPhonesList.includes(srPhone)) {
            console.log(`processWhatsAppReplies: skipping pending bot msg for ${srPhone} (not a test phone)`);
            continue;
          }
        }

        console.log(`processWhatsAppReplies: found pending_bot_message=${sr.pending_bot_message} for ${sr.id}`);

        // Call onServiceRequestUpdate to generate the message
        const botResponse = await base44.asServiceRole.functions.invoke('onServiceRequestUpdate', {
          event: { type: 'update', entity_name: 'ServiceRequest', entity_id: sr.id },
          data: { ...sr, status: sr.pending_bot_message, conversation_id: sr.conversation_id },
          old_data: { ...sr, status: 'previous' },
        });

        // functions.invoke returns {data, status, headers} — extract .data
        const botResult = botResponse?.data || botResponse;
        console.log('processWhatsAppReplies: botResult keys:', Object.keys(botResult || {}));
        const pendingMsg = botResult?.pendingBotMessage;
        if (pendingMsg?.message && pendingMsg?.contactPhone) {
          // Send via WhatsApp
          let cleanPhone = pendingMsg.contactPhone.replace(/^whatsapp:/i, '').replace(/[\s\-\+]/g, '');
          if (cleanPhone.startsWith('0')) cleanPhone = '972' + cleanPhone.substring(1);
          const chatId = `${cleanPhone}@c.us`;
          
          // Parse [FILE:url:filename] tags from pending message
          const pendingFileTagRegex = /\[FILE:(https?:\/\/[^\]:]+):([^\]]+)\]/g;
          const pendingFiles = [];
          let pendingText = pendingMsg.message;
          let pendingMatch;
          while ((pendingMatch = pendingFileTagRegex.exec(pendingMsg.message)) !== null) {
            pendingFiles.push({ url: pendingMatch[1], fileName: pendingMatch[2] });
            pendingText = pendingText.replace(pendingMatch[0], '');
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
          
          // Send files from main message
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

          // Send follow-up messages (location photo + post_directions_prompt)
          const followUps = pendingMsg.followUpMessages || [];
          for (const followUp of followUps) {
            try {
              await new Promise(r => setTimeout(r, 1500));
              const fuFileRegex = /\[FILE:(https?:\/\/[^\]:]+):([^\]]+)\]/g;
              const fuMatch = fuFileRegex.exec(followUp);
              if (fuMatch) {
                const pfUrl = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;
                await fetch(pfUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chatId, urlFile: fuMatch[1], fileName: fuMatch[2] }),
                });
                console.log(`Follow-up file sent: ${fuMatch[2]}`);
              } else {
                const sendUrl = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${token}`;
                await fetch(sendUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chatId, message: followUp }),
                });
                console.log(`Follow-up text sent: ${followUp.substring(0, 50)}...`);
              }
            } catch (fuErr) {
              console.error(`Follow-up send error: ${fuErr.message}`);
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
            pendingSentCount++;
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

        // Clear the flag and record last system message for bot sync
        await base44.asServiceRole.entities.ServiceRequest.update(sr.id, { pending_bot_message: '', last_system_message: sr.pending_bot_message });
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
        // If bot is disabled, only process test phones
        if (!botEnabled) {
          let msgPhone = (msg.phone || msg.chat_id?.replace('@c.us', '') || '').replace(/[\s\-\+]/g, '');
          if (msgPhone.startsWith('0')) msgPhone = '972' + msgPhone.substring(1);
          if (!testPhonesList.includes(msgPhone)) {
            continue;
          }
        }
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

        // Parse [FILE:url:filename] tags from bot reply
        const fileTagRegex = /\[FILE:(https?:\/\/[^\]:]+):([^\]]+)\]/g;
        const fileUrls = [];
        let textMessage = botReply;
        let fileMatch;
        while ((fileMatch = fileTagRegex.exec(botReply)) !== null) {
          fileUrls.push({ url: fileMatch[1], fileName: fileMatch[2] });
          textMessage = textMessage.replace(fileMatch[0], '');
        }
        textMessage = textMessage.replace(/\n{3,}/g, '\n\n').trim();
        
        // Send clean text message
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
        
        // Send each file as a separate message
        for (const file of fileUrls) {
          try {
            const fileApiUrl = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${token}`;
            const fileResp = await fetch(fileApiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chatId: msg.chat_id, urlFile: file.url, fileName: file.fileName, caption: '' }),
            });
            if (fileResp.ok) {
              console.log(`File sent to ${msg.chat_id}: ${file.fileName}`);
            } else {
              console.error(`Failed to send file ${file.fileName}:`, await fileResp.text());
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