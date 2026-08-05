import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';

export default function LectureCodeQRCard({ lecture, code, phone }) {
  const [copied, setCopied] = useState(false);
  const link = `https://wa.me/${phone}?text=${encodeURIComponent(code)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border rounded-lg p-3 space-y-2 text-center">
      <p className="text-xs font-semibold text-foreground leading-tight">{lecture}</p>
      <img src={qrUrl} alt={`QR ${lecture}`} className="w-28 h-28 mx-auto rounded border" />
      <p className="text-xs text-muted-foreground">מילת קוד: <span className="font-medium text-foreground">{code}</span></p>
      <Button variant="outline" size="sm" className="w-full gap-1 text-xs" onClick={handleCopy}>
        <Copy className="h-3 w-3" />
        {copied ? 'הועתק!' : 'העתק קישור'}
      </Button>
    </div>
  );
}