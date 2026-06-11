import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Pencil, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function EditContactButton({ request, contact }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const handleOpen = () => {
    setName(request.contact_name || contact?.full_name || '');
    setPhone(request.contact_phone || contact?.phone || '');
    setOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('יש להזין שם'); return; }
    setSaving(true);
    await base44.entities.ServiceRequest.update(request.id, { contact_name: name.trim(), contact_phone: phone.trim() });
    if (contact?.id) {
      await base44.entities.Contact.update(contact.id, { full_name: name.trim(), phone: phone.trim() });
    }
    await base44.entities.ServiceRequestTimeline.create({
      service_request_id: request.id,
      event_type: 'system_note',
      description: `פרטי איש קשר עודכנו ידנית — ${name.trim()}`,
    });
    queryClient.invalidateQueries({ queryKey: ['service-request', request.id] });
    queryClient.invalidateQueries({ queryKey: ['contact', request.contact_id] });
    queryClient.invalidateQueries({ queryKey: ['timeline', request.id] });
    setSaving(false);
    setOpen(false);
    toast.success('הפרטים עודכנו');
  };

  return (
    <>
      <Button variant="ghost" size="icon" onClick={handleOpen} title="עריכת שם וטלפון">
        <Pencil className="w-4 h-4 text-muted-foreground" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>עריכת פרטי איש קשר</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>שם מלא</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם מלא" />
            </div>
            <div className="space-y-1.5">
              <Label>טלפון</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XXXXXXXX" dir="ltr" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
              שמירה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}