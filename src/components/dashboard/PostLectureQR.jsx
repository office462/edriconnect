import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QrCode, Copy, ExternalLink } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import LectureCodeQRCard from '@/components/dashboard/LectureCodeQRCard';

const FIXED_MESSAGE = 'הי ד"ר אדרי, אשמח לקבל את הסיכום של ההרצאה';

const LECTURE_CODES = [
  { lecture: 'אנטומיה של אושר', code: 'סיכום אושר' },
  { lecture: 'מניעת שחיקה', code: 'סיכום שחיקה' },
  { lecture: 'תזונה מונעת מחלות', code: 'סיכום תזונה' },
  { lecture: 'אריכות ימים', code: 'סיכום אריכות' },
  { lecture: 'בריאות בהתאמה נשית גיל המעבר', code: 'סיכום גיל המעבר' },
  { lecture: 'בינה מלאכותית בבריאות', code: 'סיכום בינה' },
];

export default function PostLectureQR() {
  const [copied, setCopied] = useState(false);

  const { data: settings = [] } = useQuery({
    queryKey: ['system-settings-whatsapp'],
    queryFn: () => base44.entities.SystemSetting.filter({ key: 'whatsapp_number' }),
  });

  const phone = settings[0]?.value || '972XXXXXXXXX';

  const whatsappLink = `https://wa.me/${phone}?text=${encodeURIComponent(FIXED_MESSAGE)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(whatsappLink)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(whatsappLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <QrCode className="h-5 w-5 text-primary" />
          ברקודים לפוסט הרצאה
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <strong>ברקוד גנרי קבוע</strong> — מתאים לכל ההרצאות. הפונה סורק, הבוט מבקש את מילת הקוד שעל השקופית האחרונה, והפונה מקבל את הסיכום המתאים.
          </p>

          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex justify-center">
              <img src={qrUrl} alt="QR פוסט הרצאה" className="w-48 h-48 rounded-lg border" />
            </div>

            <div className="bg-muted/50 rounded-lg p-2 text-xs text-center break-all" dir="ltr">
              {whatsappLink}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={handleCopy}>
                <Copy className="h-3.5 w-3.5" />
                {copied ? 'הועתק!' : 'העתק קישור'}
              </Button>
              <Button variant="outline" size="sm" className="flex-1 gap-1" asChild>
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  פתח בוואטסאפ
                </a>
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <strong>ברקודים ייעודיים</strong> — אחד לכל הרצאה. סריקה שולחת את הסיכום ישירות, בלי שלב מילת הקוד.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {LECTURE_CODES.map((item) => (
              <LectureCodeQRCard key={item.code} lecture={item.lecture} code={item.code} phone={phone} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}