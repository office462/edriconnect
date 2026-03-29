import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import StatusBadge from '@/components/shared/StatusBadge';
import ServiceTypeBadge from '@/components/shared/ServiceTypeBadge';
import { Calendar, Clock, FileCheck, CreditCard, ClipboardList } from 'lucide-react';

export default function RequestInfo({ request }) {
  const infoItems = [
    { label: 'סוג שירות', value: <ServiceTypeBadge type={request.service_type} /> },
    { label: 'סטטוס', value: <StatusBadge status={request.status} /> },
    { label: 'תת-סוג', value: request.sub_type || '-' },
    { label: 'שלב נוכחי', value: request.current_step || '-' },
    { label: 'תשלום', value: request.payment_confirmed ? '✓ אושר' : '✗ לא אושר', icon: CreditCard },
    { label: 'שאלון', value: request.questionnaire_completed ? '✓ מולא' : '✗ לא מולא', icon: ClipboardList },
    { label: 'מסמכים', value: request.documents_received ? '✓ התקבלו' : '✗ לא התקבלו', icon: FileCheck },
  ];

  if (request.scheduled_date_whatsapp) {
    infoItems.push({ 
      label: 'תור וואטסאפ', 
      value: new Date(request.scheduled_date_whatsapp).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }), 
      icon: Calendar 
    });
  }
  if (request.scheduled_date_clinic) {
    infoItems.push({ 
      label: 'תור קליניקה', 
      value: new Date(request.scheduled_date_clinic).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }), 
      icon: Calendar 
    });
  }
  if (request.processing_start_date) {
    infoItems.push({ 
      label: 'תחילת טיפול', 
      value: new Date(request.processing_start_date).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }), 
      icon: Clock 
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">פרטי הפנייה</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {infoItems.map((item, idx) => (
            <div key={idx} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <span className="text-sm font-medium">{item.value}</span>
            </div>
          ))}
        </div>
        {request.notes && (
          <div className="mt-4 pt-4 border-t border-border">
            <span className="text-xs text-muted-foreground">הערות</span>
            <p className="text-sm mt-1">{request.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}