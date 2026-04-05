import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { handleBotMessage } from '@/lib/sendBotMessage';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Subscribes to ServiceRequest changes and automatically sends
 * pending bot messages when detected (e.g. from Cal.com webhook updates).
 */
export function usePendingBotMessages() {
  const processingRef = useRef(new Set());
  // Track triggers we've already seen to prevent re-processing
  const seenTriggersRef = useRef(new Map());
  const queryClient = useQueryClient();

  useEffect(() => {
    console.log('usePendingBotMessages: subscription started');
    const unsubscribe = base44.entities.ServiceRequest.subscribe((event) => {
      if (event.type !== 'update') return;
      
      const data = event.data;
      const trigger = data?.pending_bot_message;
      if (!trigger) return;
      
      const requestId = event.id;
      const triggerKey = `${requestId}:${trigger}`;
      
      // Dedupe: skip if we already saw this exact trigger for this request recently
      const lastSeen = seenTriggersRef.current.get(triggerKey);
      if (lastSeen && Date.now() - lastSeen < 60000) {
        console.log('usePendingBotMessages: SKIP duplicate trigger', triggerKey);
        return;
      }
      seenTriggersRef.current.set(triggerKey, Date.now());
      
      // Avoid processing the same request twice simultaneously
      if (processingRef.current.has(requestId)) {
        console.log('usePendingBotMessages: SKIP already processing', requestId);
        return;
      }
      processingRef.current.add(requestId);

      console.log('usePendingBotMessages: detected pending message', trigger, 'for', requestId);
      
      // Small delay to let DB settle
      setTimeout(async () => {
        try {
          const sent = await handleBotMessage(requestId, { skipIfNoTrigger: true });
          if (sent) {
            console.log('usePendingBotMessages: sent', sent.trigger);
            queryClient.invalidateQueries({ queryKey: ['service-requests'] });
          }
        } catch (err) {
          console.warn('usePendingBotMessages: error', err.message);
        } finally {
          // Keep the lock for 30s to prevent rapid re-processing
          setTimeout(() => processingRef.current.delete(requestId), 30000);
        }
      }, 1500);
    });

    return unsubscribe;
  }, [queryClient]);
}