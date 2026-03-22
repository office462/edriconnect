import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const statusConfig = {
  new_lead: { label: 'ליד חדש', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  pending: { label: 'ממתין', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  whatsapp_message_to_check: { label: 'הודעה לבדיקה', color: 'bg-rose-100 text-rose-700 border-rose-200' },
  in_review: { label: 'בטיפול', color: 'bg-violet-100 text-violet-700 border-violet-200' },
  paid: { label: 'שולם', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  scheduled: { label: 'נקבע תור', color: 'bg-teal-100 text-teal-700 border-teal-200' },
  completed: { label: 'הושלם', color: 'bg-stone-100 text-stone-600 border-stone-200' },
};

export default function StatusBadge({ status }) {
  const config = statusConfig[status] || { label: status, color: 'bg-stone-100 text-stone-600' };

  return (
    <Badge 
      variant="outline" 
      className={cn("text-xs font-medium border px-3 py-0.5", config.color)}
      style={{ borderRadius: '50px' }}
    >
      {config.label}
    </Badge>
  );
}