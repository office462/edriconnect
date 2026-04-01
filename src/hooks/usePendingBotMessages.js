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
  const queryClient = useQueryClient();

  useEffect(() => {
    console.log('usePendingBotMessages: subscription started');
    const unsubscribe = base44.entities.ServiceRequest.subscribe((event) => {
      console.log('usePendingBotMessages: event received', event.type, event.id, event.data?.pending_bot_message || '(none)');
      if (event.type !== 'update') return;
      
      const data = event.data;
      if (!data?.pending_bot_message) return;
      
      const requestId = event.id;
      
      // Avoid processing the same request twice simultaneously
      if (processingRef.current.has(requestId)) return;
      processingRef.current.add(requestId);

      console.log('usePendingBotMessages: detected pending message', data.pending_bot_message, 'for', requestId);
      
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
          processingRef.current.delete(requestId);
        }
      }, 1000);
    });

    return unsubscribe;
  }, [queryClient]);
}