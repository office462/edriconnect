import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const COLORS = {
  consultation: '#B45309',
  legal: '#C2410C',
  lectures: '#A16207',
  clinic: '#78716C',
  post_lecture: '#BE123C',
};

const LABELS = {
  consultation: 'ייעוץ',
  legal: 'חוות דעת משפטית',
  lectures: 'הרצאות',
  clinic: 'השכרת קליניקה',
  post_lecture: 'פוסט הרצאה',
};

export default function ServiceBreakdown({ requests }) {
  const counts = {};
  requests.forEach(r => {
    counts[r.service_type] = (counts[r.service_type] || 0) + 1;
  });

  const data = Object.entries(counts).map(([key, value]) => ({
    name: LABELS[key] || key,
    value,
    key,
  }));

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">פילוח לפי סוג שירות</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground">
          אין נתונים עדיין
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">פילוח לפי סוג שירות</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          <div className="w-48 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                  {data.map((entry) => (
                    <Cell key={entry.key} fill={COLORS[entry.key] || '#999'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-2">
            {data.map((entry) => (
              <div key={entry.key} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[entry.key] || '#999' }} />
                <span className="text-sm text-foreground">{entry.name}</span>
                <span className="text-sm font-bold mr-auto">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}