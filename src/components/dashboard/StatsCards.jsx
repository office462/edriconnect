import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default function StatsCards({ stats }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, idx) => (
        <Card key={idx} className="p-5 relative overflow-hidden group hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-medium">{stat.label}</p>
              <p className="text-3xl font-bold mt-1 text-foreground">{stat.value}</p>
            </div>
            <div className={cn("p-2.5 rounded-xl", stat.bgColor)}>
              <stat.icon className={cn("w-5 h-5", stat.iconColor)} />
            </div>
          </div>
          {stat.sub && (
            <p className="text-xs text-muted-foreground mt-2">{stat.sub}</p>
          )}
        </Card>
      ))}
    </div>
  );
}