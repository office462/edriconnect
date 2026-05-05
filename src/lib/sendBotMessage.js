/**
 * DEPRECATED: All bot message sending is now handled exclusively by
 * processWhatsAppReplies (backend, every 5 minutes).
 * 
 * This file is kept only for backward compatibility in case any component
 * still imports handleBotMessage — it is now a no-op.
 */

export async function handleBotMessage(requestId, options = {}) {
  console.log('handleBotMessage: NO-OP — all sending handled by processWhatsAppReplies backend');
  return null;
}