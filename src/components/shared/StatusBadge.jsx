import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const statusConfig = {
  new_lead: { label: 'ליד חדש', color: 'bg-amber-50 text-amber-800 border-amber-300' },
  pending: { label: 'ממתין', color: 'bg-orange-50 text-orange-700 border-orange-300' },
  whatsapp_message_to_check: { label: 'הודעה לבדיקה', color: 'bg-rose-50 text-rose-700 border-rose-300' },
  in_review: { label: 'בטיפול', color: 'bg-yellow-50 text-yellow-800 border-yellow-300' },
  paid: { label: 'שולם', color: 'bg-lime-50 text-lime-800 border-lime-300' },
  scheduled: { label: 'נקבע תור', color: 'bg-stone-100 text-stone-700 border-stone-300' },
  completed: { label: 'הושלם', color: 'bg-stone-50 text-stone-500 border-stone-200' },
};

export default function StatusBadge({ status }) {
  const config = statusConfig[status] || { label: status, color: 'bg-stone-50 text-stone-500' };

  return (
    <Badge variant="outline" className={cn("text-xs font-medium border", config.color)}>
      {config.label}
    </Badge>
  );
}