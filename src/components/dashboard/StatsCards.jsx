import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default function StatsCards({ stats }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {stats.map((stat, idx) => (
        <Card key={idx} className="p-3 md:p-5 relative overflow-hidden group hover:shadow-md transition-shadow" style={{ borderRadius: '12px' }}>
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-xs md:text-sm text-muted-foreground font-medium font-body truncate">{stat.label}</p>
              <p className="text-2xl md:text-3xl font-bold mt-1 text-foreground font-body">{stat.value}</p>
            </div>
            <div className="p-2.5 rounded-xl" style={stat.bgStyle || {}}>
              <stat.icon className="w-5 h-5" style={stat.iconStyle || {}} />
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