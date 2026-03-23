import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Colors matching the Pantherray palette:
// Primary purple: #6D436D, Terracotta: #D29486, Gold: #FAD980, Brown text: #5E4B35
const statusConfig = {
  new_lead: { label: 'ליד חדש', bg: '#FAD980', text: '#5E4B35', border: '#E8C45A' },
  pending: { label: 'ממתין', bg: '#F5E6C8', text: '#5E4B35', border: '#E0CBA5' },
  whatsapp_message_to_check: { label: 'הודעה לבדיקה', bg: '#F2D0C9', text: '#8B3A2F', border: '#D29486' },
  in_review: { label: 'בטיפול', bg: '#E8D5E8', text: '#6D436D', border: '#C9A5C9' },
  questionnaire_completed: { label: 'מילא שאלון', bg: '#D5E8E8', text: '#2A6B6B', border: '#A5C9C9' },
  paid: { label: 'שולם', bg: '#D5E8D5', text: '#3A6B3A', border: '#A5C9A5' },
  scheduled: { label: 'נקבע תור', bg: '#D5DDE8', text: '#3A4F6B', border: '#A5B5C9' },
  completed: { label: 'הושלם', bg: '#E8E0D5', text: '#6B5C4F', border: '#C9B9A5' },
};

export default function StatusBadge({ status }) {
  const config = statusConfig[status];
  
  if (!config) {
    return (
      <Badge variant="outline" className="text-xs font-medium border px-3 py-0.5" style={{ borderRadius: '50px' }}>
        {status}
      </Badge>
    );
  }

  return (
    <Badge 
      className="text-xs font-medium px-3 py-0.5 border"
      style={{ 
        borderRadius: '50px',
        backgroundColor: config.bg,
        color: config.text,
        borderColor: config.border,
      }}
    >
      {config.label}
    </Badge>
  );
}