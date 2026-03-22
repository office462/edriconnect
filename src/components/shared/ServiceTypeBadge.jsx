import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const typeConfig = {
  consultation: { label: 'ייעוץ', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  legal: { label: 'חוות דעת משפטית', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  lectures: { label: 'הרצאות', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  clinic: { label: 'השכרת קליניקה', color: 'bg-stone-100 text-stone-700 border-stone-200' },
  post_lecture: { label: 'פוסט הרצאה', color: 'bg-rose-100 text-rose-700 border-rose-200' },
};

export default function ServiceTypeBadge({ type }) {
  const config = typeConfig[type] || { label: type, color: 'bg-muted text-muted-foreground' };

  return (
    <Badge variant="outline" className={cn("text-xs font-medium border", config.color)}>
      {config.label}
    </Badge>
  );
}