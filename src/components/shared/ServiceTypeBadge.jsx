import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const typeConfig = {
  consultation: { label: 'ייעוץ', color: 'bg-primary/10 text-primary border-primary/20' },
  legal: { label: 'חוות דעת משפטית', color: 'bg-secondary/30 text-secondary-foreground border-secondary/40' },
  lectures: { label: 'הרצאות', color: 'bg-chart-4/10 text-chart-4 border-chart-4/20' },
  clinic: { label: 'השכרת קליניקה', color: 'bg-chart-2/10 text-chart-2 border-chart-2/20' },
  post_lecture: { label: 'פוסט הרצאה', color: 'bg-chart-5/10 text-chart-5 border-chart-5/20' },
};

export default function ServiceTypeBadge({ type }) {
  const config = typeConfig[type] || { label: type, color: 'bg-muted text-muted-foreground' };

  return (
    <Badge variant="outline" className={cn("text-xs font-medium border", config.color)}>
      {config.label}
    </Badge>
  );
}