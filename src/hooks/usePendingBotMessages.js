import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { handleBotMessage } from '@/lib/sendBotMessage';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Subscribes to ServiceRequest changes and automatically sends
 * pending bot messages when detected (e.g. from Cal.com webhook updates).
 * Uses a debounce approach: accumulates events, then processes once.
 */
export function usePendingBotMessages() {
  const queryClient = useQueryClient();
  // Global lock: only one request processed at a time across all events
  const busyRef = useRef(false);
  // Tracks requestId:trigger keys we've already handled (never retry)
  const handledRef = useRef(new Set());
  // Pending queue: only keeps the LATEST event per requestId
  const pendingRef = useRef(new Map());
  const timerRef = useRef(null);

  useEffect(() => {
    console.log('usePendingBotMessages: subscription started');

    const processQueue = async () => {
      if (busyRef.current) return;
      const entries = Array.from(pendingRef.current.entries());
      pendingRef.current.clear();
      if (entries.length === 0) return;

      busyRef.current = true;
      for (const [requestId, trigger] of entries) {
        const key = `${requestId}:${trigger}`;
        if (handledRef.current.has(key)) continue;
        handledRef.current.add(key);

        console.log('usePendingBotMessages: processing', trigger, 'for', requestId);
        try {
          const sent = await handleBotMessage(requestId, { skipIfNoTrigger: true, trigger });
          if (sent) {
            console.log('usePendingBotMessages: sent', sent.trigger);
            queryClient.invalidateQueries({ queryKey: ['service-requests'] });
          }
        } catch (err) {
          console.warn('usePendingBotMessages: error', err.message);
        }
      }
      busyRef.current = false;
    };

    const unsubscribe = base44.entities.ServiceRequest.subscribe((event) => {
      if (event.type !== 'update') return;
      const trigger = event.data?.pending_bot_message;
      if (!trigger) return;

      const requestId = event.id;
      const key = `${requestId}:${trigger}`;

      // Already handled this exact trigger — skip
      if (handledRef.current.has(key)) return;

      // Debounce: collect events for 2s, then process once
      pendingRef.current.set(requestId, trigger);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(processQueue, 2000);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [queryClient]);
}