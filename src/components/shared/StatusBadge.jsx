import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const statusConfig = {
  new_lead: { label: 'ליד חדש', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  pending: { label: 'ממתין', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  whatsapp_message_to_check: { label: 'הודעה לבדיקה', color: 'bg-red-100 text-red-700 border-red-200' },
  in_review: { label: 'בטיפול', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  paid: { label: 'שולם', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  scheduled: { label: 'נקבע תור', color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  completed: { label: 'הושלם', color: 'bg-gray-100 text-gray-600 border-gray-200' },
};

export default function StatusBadge({ status }) {
  const config = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-600' };

  return (
    <Badge variant="outline" className={cn("text-xs font-medium border", config.color)}>
      {config.label}
    </Badge>
  );
}