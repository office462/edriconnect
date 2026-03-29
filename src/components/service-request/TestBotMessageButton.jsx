import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bug } from 'lucide-react';
import { toast } from 'sonner';
import { handleBotMessage } from '@/lib/sendBotMessage';

const triggerOptions = [
  { value: 'both_appointments_scheduled', label: 'שני תורים נקבעו (consultation)' },
  { value: 'whatsapp_appointment_scheduled', label: 'תור וואטסאפ נקבע' },
  { value: 'clinic_appointment_scheduled', label: 'תור קליניקה נקבע' },
  { value: 'paid_consultation', label: 'שולם — ייעוץ' },
  { value: 'paid_legal', label: 'שולם — משפטי' },
  { value: 'ready_to_schedule', label: 'מוכן לזימון תורים' },
  { value: 'questionnaire_completed_awaiting_payment', label: 'שאלון מולא, ממתין לתשלום' },
  { value: 'scheduled_consultation', label: 'נקבע תור — ייעוץ' },
  { value: 'scheduled_legal', label: 'נקבע תור — משפטי' },
];

export default function TestBotMessageButton({ requestId }) {
  const [trigger, setTrigger] = useState('both_appointments_scheduled');
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    try {
      toast.info(`מגדיר pending_bot_message = ${trigger}...`);
      
      // Set the pending_bot_message directly — simulates what Cal.com webhook does
      await base44.entities.ServiceRequest.update(requestId, { 
        pending_bot_message: trigger 
      });
      
      toast.info('ממתין ל-subscription לתפוס...');
      
      // Also try directly via handleBotMessage as fallback
      setTimeout(async () => {
        try {
          const sent = await handleBotMessage(requestId);
          if (sent) {
            toast.success(`הודעת ${sent.trigger} נשלחה בהצלחה!`);
          } else {
            toast.warning('handleBotMessage לא שלח הודעה — בדקי console');
          }
        } catch (err) {
          toast.error(`שגיאה: ${err.message}`);
        } finally {
          setTesting(false);
        }
      }, 3000);
    } catch (err) {
      toast.error(`שגיאה: ${err.message}`);
      setTesting(false);
    }
  };

  return (
    <div className="border border-dashed border-orange-300 rounded-lg p-3 bg-orange-50 space-y-2">
      <p className="text-xs font-medium text-orange-700 flex items-center gap-1">
        <Bug className="w-3.5 h-3.5" /> בדיקת שליחת הודעה
      </p>
      <Select value={trigger} onValueChange={setTrigger}>
        <SelectTrigger className="text-xs h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {triggerOptions.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button 
        size="sm" 
        variant="outline" 
        className="w-full text-xs border-orange-300 text-orange-700 hover:bg-orange-100"
        onClick={handleTest} 
        disabled={testing}
      >
        {testing ? 'בודק...' : 'שלח הודעת בדיקה'}
      </Button>
    </div>
  );
}