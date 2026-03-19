import React from 'react';
import { format } from 'date-fns';
import { 
  ArrowLeftRight, 
  FileText, 
  MessageSquare, 
  CreditCard, 
  Footprints 
} from 'lucide-react';
import { cn } from '@/lib/utils';

const iconMap = {
  status_change: ArrowLeftRight,
  file_received: FileText,
  system_note: MessageSquare,
  payment: CreditCard,
  message_sent: MessageSquare,
  step_change: Footprints,
};

const colorMap = {
  status_change: 'bg-blue-100 text-blue-600',
  file_received: 'bg-amber-100 text-amber-600',
  system_note: 'bg-gray-100 text-gray-600',
  payment: 'bg-emerald-100 text-emerald-600',
  message_sent: 'bg-purple-100 text-purple-600',
  step_change: 'bg-cyan-100 text-cyan-600',
};

export default function TimelineView({ events }) {
  if (!events || events.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">אין אירועים עדיין</p>;
  }

  return (
    <div className="space-y-4">
      {events.map((event, idx) => {
        const Icon = iconMap[event.event_type] || MessageSquare;
        return (
          <div key={event.id || idx} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0", colorMap[event.event_type] || 'bg-gray-100 text-gray-500')}>
                <Icon className="w-4 h-4" />
              </div>
              {idx < events.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
            </div>
            <div className="pb-4">
              <p className="text-sm font-medium text-foreground">{event.description}</p>
              {event.old_value && event.new_value && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {event.old_value} ← {event.new_value}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {event.created_date ? format(new Date(event.created_date), 'dd/MM/yy HH:mm') : ''}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}