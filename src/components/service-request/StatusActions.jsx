import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const allStatuses = [
  { value: 'new_lead', label: 'ליד חדש' },
  { value: 'pending', label: 'ממתין' },
  { value: 'whatsapp_message_to_check', label: 'הודעה לבדיקה' },
  { value: 'in_review', label: 'בטיפול' },
  { value: 'paid', label: 'שולם' },
  { value: 'scheduled', label: 'נקבע תור' },
  { value: 'completed', label: 'הושלם' },
];

export default function StatusActions({ request, onUpdate, isUpdating }) {
  const [status, setStatus] = React.useState(request.status);
  const [step, setStep] = React.useState(request.current_step || '');
  const [notes, setNotes] = React.useState(request.notes || '');
  const [whatsappDate, setWhatsappDate] = React.useState(request.scheduled_date_whatsapp || '');
  const [clinicDate, setClinicDate] = React.useState(request.scheduled_date_clinic || '');

  const handleSave = () => {
    const updates = { status, current_step: step, notes };
    
    if (whatsappDate) updates.scheduled_date_whatsapp = whatsappDate;
    if (clinicDate) updates.scheduled_date_clinic = clinicDate;
    
    // Auto-set processing_start_date when moving to in_review
    if (status === 'in_review' && request.status !== 'in_review') {
      updates.processing_start_date = new Date().toISOString();
    }

    // Auto-set payment_confirmed when moving to paid
    if (status === 'paid' && request.status !== 'paid') {
      updates.payment_confirmed = true;
    }

    // Auto-set scheduled when both dates exist
    if (whatsappDate && clinicDate && request.service_type === 'consultation') {
      updates.status = 'scheduled';
    }

    onUpdate(updates, request.status);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">פעולות</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>סטטוס</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {allStatuses.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>שלב נוכחי</Label>
          <Input value={step} onChange={(e) => setStep(e.target.value)} placeholder="לדוגמה: send_questionnaire" />
        </div>

        {(request.service_type === 'consultation') && (
          <>
            <div>
              <Label>תור וואטסאפ</Label>
              <Input type="datetime-local" value={whatsappDate} onChange={(e) => setWhatsappDate(e.target.value)} />
            </div>
            <div>
              <Label>תור קליניקה</Label>
              <Input type="datetime-local" value={clinicDate} onChange={(e) => setClinicDate(e.target.value)} />
            </div>
          </>
        )}

        <div>
          <Label>הערות</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>

        <Button onClick={handleSave} disabled={isUpdating} className="w-full">
          {isUpdating ? 'שומר...' : 'שמור שינויים'}
        </Button>
      </CardContent>
    </Card>
  );
}