import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QrCode, Copy, ExternalLink } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

const FIXED_MESSAGE = 'הי ד"ר אדרי, אשמח לקבל את הסיכום של ההרצאה בינה מלאכותית בבריאות';

export default function PostLectureAIHealthQR() {
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
          QR ייעודי — בינה מלאכותית בבריאות
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          QR נפרד להרצאת "בינה מלאכותית בבריאות" — סריקה שולחת ישירות את סיכום ההרצאה הזו, בלי תפריט בחירה.
        </p>

        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex justify-center">
            <img
              src={qrUrl}
              alt="QR בינה מלאכותית בבריאות"
              className="w-48 h-48 rounded-lg border"
            />
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
      </CardContent>
    </Card>
  );
}