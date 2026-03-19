import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Globe, MessageCircle, QrCode } from 'lucide-react';
import { cn } from '@/lib/utils';

const sourceConfig = {
  web: { label: 'אתר', icon: Globe, color: 'bg-blue-50 text-blue-600' },
  whatsapp: { label: 'וואטסאפ', icon: MessageCircle, color: 'bg-green-50 text-green-600' },
  qr: { label: 'QR', icon: QrCode, color: 'bg-purple-50 text-purple-600' },
};

export default function SourceBadge({ source }) {
  const config = sourceConfig[source] || { label: source, icon: Globe, color: 'bg-gray-50 text-gray-600' };
  const Icon = config.icon;

  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium", config.color)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}