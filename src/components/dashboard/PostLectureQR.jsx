import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QrCode, Copy, ExternalLink } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

const WHATSAPP_MESSAGE = "הי ד\"ר אדרי, אשמח לקבל את הסיכום של ההרצאה";

export default function PostLectureQR() {
  const [copied, setCopied] = useState(false);

  const { data: settings = [] } = useQuery({
    queryKey: ['system-settings-whatsapp'],
    queryFn: () => base44.entities.SystemSetting.filter({ key: 'whatsapp_number' }),
  });

  const phone = settings[0]?.value || '972XXXXXXXXX';
  const encodedMsg = encodeURIComponent(WHATSAPP_MESSAGE);
  const whatsappLink = `https://wa.me/${phone}?text=${encodedMsg}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(whatsappLink)}`;

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
          QR להרצאה — נתיב פוסט הרצאה
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          הציגי את ה-QR בסוף ההרצאה. הפונים יסרקו ויגיעו ישירות לוואטסאפ עם הודעת פתיחה מוכנה.
        </p>

        <div className="flex justify-center">
          <img
            src={qrUrl}
            alt="QR Code לוואטסאפ"
            className="w-48 h-48 rounded-lg border"
          />
        </div>

        <div className="bg-muted/50 rounded-lg p-3 text-sm text-center break-all direction-ltr">
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
      </CardContent>
    </Card>
  );
}