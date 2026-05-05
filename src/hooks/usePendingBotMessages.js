import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Monitor-only hook: watches for pending_bot_message changes on ServiceRequest
 * and invalidates queries so the UI refreshes. Does NOT send messages.
 * All message sending is handled exclusively by processWhatsAppReplies (backend).
 */
export function usePendingBotMessages() {
  const queryClient = useQueryClient();
  const debounceRef = useRef(null);

  useEffect(() => {
    console.log('usePendingBotMessages: monitor started (UI-only, no sending)');

    const unsubscribe = base44.entities.ServiceRequest.subscribe((event) => {
      if (event.type !== 'update') return;
      const trigger = event.data?.pending_bot_message;
      if (!trigger) return;

      console.log('usePendingBotMessages: detected pending_bot_message =', trigger, 'for', event.id);

      // Debounce UI refresh
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['service-requests'] });
      }, 2000);
    });

    return () => {
      unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [queryClient]);
}