import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function WhatsAppTestSender() {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('בדיקת חיבור WhatsApp — הודעה אוטומטית 🔧');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!phone || !message) {
      toast.error('יש למלא טלפון והודעה');
      return;
    }
    setSending(true);
    try {
      const res = await base44.functions.invoke('sendWhatsAppMessage', { phone, message, force: true });
      if (res.data?.ok) {
        if (res.data.skipped) {
          toast.warning('הבוט כבוי (מצב דמו) — ההודעה לא נשלחה');
        } else {
          toast.success('הודעה נשלחה בהצלחה!');
        }
      } else {
        toast.error('שגיאה: ' + (res.data?.error || 'לא ידוע'));
      }
    } catch (err) {
      toast.error('שגיאה: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="border-dashed border-green-300 bg-green-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Send className="w-4 h-4 text-green-600" />
          שליחת הודעת בדיקה
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-sm">מספר טלפון</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="05XXXXXXXX"
            dir="ltr"
            className="text-sm"
          />
        </div>
        <div>
          <Label className="text-sm">הודעה</Label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            className="text-sm"
          />
        </div>
        <Button
          onClick={handleSend}
          disabled={sending || !phone || !message}
          className="w-full gap-2 bg-green-600 hover:bg-green-700"
          size="sm"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {sending ? 'שולח...' : 'שלח הודעת בדיקה'}
        </Button>
        <p className="text-xs text-muted-foreground text-center">
          ללא השהיה, ללא ספירה יומית — לבדיקות טכניות בלבד
        </p>
      </CardContent>
    </Card>
  );
}