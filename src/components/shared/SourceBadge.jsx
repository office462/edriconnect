import React from 'react';
import { Globe, MessageCircle, QrCode } from 'lucide-react';

const sourceConfig = {
  web: { label: 'אתר', icon: Globe, bg: '#E8D5E8', text: '#6D436D', border: '#C9A5C9' },
  whatsapp: { label: 'וואטסאפ', icon: MessageCircle, bg: '#F5E6C8', text: '#5E4B35', border: '#E0CBA5' },
  qr: { label: 'QR', icon: QrCode, bg: '#F2D0C9', text: '#8B3A2F', border: '#D29486' },
};

export default function SourceBadge({ source }) {
  const config = sourceConfig[source] || { label: source, icon: Globe, bg: '#E8E0D5', text: '#6B5C4F', border: '#C9B9A5' };
  const Icon = config.icon;

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border"
      style={{ 
        borderRadius: '50px',
        backgroundColor: config.bg,
        color: config.text,
        borderColor: config.border,
      }}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}