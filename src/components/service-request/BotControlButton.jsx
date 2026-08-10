import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bot, Pause, Play, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

function normalizePhone(raw) {
  let d = (raw || '').replace(/[\s\-\+]/g, '');
  if (d.startsWith('0')) d = '972' + d.substring(1);
  return d;
}
// All formats the number might be stored under, so we match auto-paused records too.
function phoneVariants(raw) {
  const d = normalizePhone(raw);
  const s = new Set();
  if (!d) return [];
  s.add(d);
  if (d.startsWith('972')) { s.add('0' + d.substring(3)); s.add('+' + d); }
  return [...s];
}

export default function BotControlButton({ request, contact }) {
  const phone = contact?.phone || request?.contact_phone || '';
  const key = normalizePhone(phone);
  const queryClient = useQueryClient();

  const { data: controls = [] } = useQuery({
    queryKey: ['bot-control', key],
    enabled: !!phone,
    queryFn: async () => {
      let out = [];
      for (const v of phoneVariants(phone)) {
        const f = await base44.entities.WhatsAppBotControl.filter({ phone: v });
        if (f.length) out = out.concat(f);
      }
      return out;
    },
  });

  const current = controls[0] || null;

  const setMutation = useMutation({
    mutationFn: async (mode) => {
      if (current) {
        await base44.entities.WhatsAppBotControl.update(current.id, { mode, set_by: 'human' });
      } else {
        await base44.entities.WhatsAppBotControl.create({ phone: key, mode, set_by: 'human' });
      }
    },
    onSuccess: (_, mode) => {
      queryClient.invalidateQueries({ queryKey: ['bot-control', key] });
      toast.success(mode === 'paused' ? 'הבוט הושהה למספר' : 'הבוט הופעל למספר');
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => base44.entities.WhatsAppBotControl.delete(current.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-control', key] });
      toast.success('הבוט הוחזר למצב רגיל');
    },
  });

  if (!phone) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2"><Bot className="w-5 h-5" /> בקרת בוט</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="text-muted-foreground">מצב:</span>
          {current?.mode === 'paused' ? (
            <Badge className="bg-amber-100 text-amber-700">מושהה{current.set_by === 'auto' ? ' (זוהה אוטומטית)' : ''}</Badge>
          ) : current?.mode === 'active_managed' ? (
            <Badge className="bg-green-100 text-green-700">מנוהל (בוט פעיל)</Badge>
          ) : (
            <Badge variant="secondary">רגיל (בוט פעיל)</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          כשליאת עונה ידנית ללקוח, הבוט משתיק את עצמו אוטומטית. ההחזרה ידנית בלבד.
        </p>
        <div className="flex flex-wrap gap-2">
          {current && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending}>
              <RotateCcw className="w-3.5 h-3.5" /> החזר בוט
            </Button>
          )}
          {current?.mode !== 'paused' && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setMutation.mutate('paused')} disabled={setMutation.isPending}>
              <Pause className="w-3.5 h-3.5" /> השהה בוט
            </Button>
          )}
          {current?.mode !== 'active_managed' && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setMutation.mutate('active_managed')} disabled={setMutation.isPending}>
              <Play className="w-3.5 h-3.5" /> הפעל בוט
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
