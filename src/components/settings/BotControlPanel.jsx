import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Bot, Pause, Play, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

// Normalize to digits, 972 prefix (matches how the webhook stores auto-paused numbers).
function normalizePhone(raw) {
  let d = (raw || '').replace(/[\s\-\+]/g, '');
  if (d.startsWith('0')) d = '972' + d.substring(1);
  return d;
}

export default function BotControlPanel() {
  const [phone, setPhone] = useState('');
  const queryClient = useQueryClient();

  const { data: controls = [], isLoading } = useQuery({
    queryKey: ['bot-controls'],
    queryFn: () => base44.entities.WhatsAppBotControl.list('-created_date', 200),
  });

  const setMutation = useMutation({
    mutationFn: async ({ rawPhone, mode }) => {
      const p = normalizePhone(rawPhone);
      if (!p) throw new Error('missing phone');
      const existing = await base44.entities.WhatsAppBotControl.filter({ phone: p });
      if (existing.length > 0) {
        await base44.entities.WhatsAppBotControl.update(existing[0].id, { mode, set_by: 'human' });
        for (let i = 1; i < existing.length; i++) {
          await base44.entities.WhatsAppBotControl.delete(existing[i].id);
        }
      } else {
        await base44.entities.WhatsAppBotControl.create({ phone: p, mode, set_by: 'human' });
      }
    },
    onSuccess: (_, { mode }) => {
      queryClient.invalidateQueries({ queryKey: ['bot-controls'] });
      setPhone('');
      toast.success(mode === 'paused' ? 'הבוט הושהה למספר' : 'הבוט הופעל למספר');
    },
    onError: () => toast.error('צריך מספר טלפון תקין'),
  });

  const resumeMutation = useMutation({
    mutationFn: (id) => base44.entities.WhatsAppBotControl.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-controls'] });
      toast.success('הבוט הוחזר למצב רגיל');
    },
  });

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <h3 className="font-bold text-sm">בקרת בוט לפי מספר</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          כשליאת עונה ידנית ללקוח מהטלפון — הבוט משתיק את עצמו לאותו אדם אוטומטית.
          כאן אפשר להשהות, להחזיר, או להפעיל בוט לכל מספר (גם כזה שלא פנה). ההחזרה תמיד ידנית — הבוט לא חוזר לבד.
        </p>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1">
            <Label className="text-xs">מספר טלפון</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0501234567" dir="ltr" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1" disabled={!phone || setMutation.isPending}
              onClick={() => setMutation.mutate({ rawPhone: phone, mode: 'paused' })}>
              <Pause className="w-3.5 h-3.5" /> השהה בוט
            </Button>
            <Button size="sm" className="gap-1" disabled={!phone || setMutation.isPending}
              onClick={() => setMutation.mutate({ rawPhone: phone, mode: 'active_managed' })}>
              <Play className="w-3.5 h-3.5" /> הפעל בוט
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground">מספרים בשליטה ידנית ({controls.length})</h4>
          {isLoading ? (
            <p className="text-xs text-muted-foreground py-2">טוען...</p>
          ) : controls.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">אין מספרים מושהים או מנוהלים כרגע.</p>
          ) : (
            <div className="space-y-2">
              {controls.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 border rounded-lg p-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-mono" dir="ltr">{c.phone}</span>
                    {c.mode === 'paused' ? (
                      <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700">מושהה</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">מנוהל (בוט פעיל)</Badge>
                    )}
                    <Badge variant="outline" className="text-xs">{c.set_by === 'auto' ? 'זוהה אוטומטית' : 'ידני'}</Badge>
                  </div>
                  <Button size="sm" variant="ghost" className="gap-1 text-xs whitespace-nowrap"
                    onClick={() => resumeMutation.mutate(c.id)} disabled={resumeMutation.isPending}>
                    <RotateCcw className="w-3.5 h-3.5" /> החזר בוט
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
