import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const typeConfig = {
  consultation: { label: 'ייעוץ', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  legal: { label: 'חוות דעת משפטית', color: 'bg-stone-50 text-stone-700 border-stone-200' },
  lectures: { label: 'הרצאות', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  clinic: { label: 'קליניקה', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  post_lecture: { label: 'פוסט הרצאה', color: 'bg-orange-50 text-orange-700 border-orange-200' },
};

export default function ServiceTypeBadge({ type }) {
  const config = typeConfig[type] || { label: type, color: 'bg-stone-50 text-stone-700' };

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