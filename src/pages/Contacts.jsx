import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Plus, Search, Phone, Mail } from 'lucide-react';
import SourceBadge from '@/components/shared/SourceBadge';
import { format } from 'date-fns';
import { toast } from 'sonner';

const emptyContact = { full_name: '', phone: '', email: '', source: 'web', notes: '' };

export default function Contacts() {
  const [search, setSearch] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState(emptyContact);
  const [editId, setEditId] = useState(null);
  const queryClient = useQueryClient();

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.list('-created_date', 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Contact.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['contacts'] }); setShowDialog(false); setForm(emptyContact); toast.success('איש קשר נוצר'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Contact.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['contacts'] }); setShowDialog(false); setForm(emptyContact); setEditId(null); toast.success('עודכן'); },
  });

  const filtered = contacts.filter(c =>
    (c.full_name || '').includes(search) || (c.phone || '').includes(search) || (c.email || '').includes(search)
  );

  const handleSubmit = () => {
    if (!form.full_name) return;
    if (editId) {
      updateMutation.mutate({ id: editId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleEdit = (contact) => {
    setForm({ full_name: contact.full_name || '', phone: contact.phone || '', email: contact.email || '', source: contact.source || 'web', notes: contact.notes || '' });
    setEditId(contact.id);
    setShowDialog(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">אנשי קשר</h1>
        <Button onClick={() => { setForm(emptyContact); setEditId(null); setShowDialog(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> הוסף איש קשר
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש לפי שם, טלפון או מייל..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-10"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">שם מלא</TableHead>
                <TableHead className="text-right">טלפון</TableHead>
                <TableHead className="text-right">אימייל</TableHead>
                <TableHead className="text-right">מקור</TableHead>
                <TableHead className="text-right">תאריך</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">טוען...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">אין אנשי קשר</TableCell></TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleEdit(c)}>
                    <TableCell className="font-medium">{c.full_name}</TableCell>
                    <TableCell>
                      {c.phone && <span className="flex items-center gap-1 text-sm"><Phone className="w-3 h-3" />{c.phone}</span>}
                    </TableCell>
                    <TableCell>
                      {c.email && <span className="flex items-center gap-1 text-sm"><Mail className="w-3 h-3" />{c.email}</span>}
                    </TableCell>
                    <TableCell><SourceBadge source={c.source} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.created_date ? format(new Date(c.created_date), 'dd/MM/yy') : '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? 'עריכת איש קשר' : 'איש קשר חדש'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>שם מלא *</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <Label>טלפון</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>אימייל</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>מקור הגעה</Label>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="web">אתר</SelectItem>
                  <SelectItem value="whatsapp">וואטסאפ</SelectItem>
                  <SelectItem value="qr">QR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>ביטול</Button>
            <Button onClick={handleSubmit} disabled={!form.full_name}>
              {editId ? 'עדכן' : 'צור'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}