import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Plus, Search, Phone, Mail, Pencil, Trash2, User } from 'lucide-react';
import SourceBadge from '@/components/shared/SourceBadge';
import ViewToggle from '@/components/shared/ViewToggle';
import BulkActions from '@/components/shared/BulkActions';
import { format } from 'date-fns';
import { toast } from 'sonner';

const emptyContact = { full_name: '', phone: '', email: '', source: 'web', notes: '' };

export default function Contacts() {
  const [search, setSearch] = useState('');
  const [view, setView] = useState('table');
  const [selected, setSelected] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState(emptyContact);
  const [editId, setEditId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const queryClient = useQueryClient();

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.list('-created_date', 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Contact.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['contacts'] }); setShowDialog(false); setForm(emptyContact); toast.success('נוצר'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Contact.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['contacts'] }); setShowDialog(false); setForm(emptyContact); setEditId(null); toast.success('עודכן'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Contact.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['contacts'] }); toast.success('נמחק'); },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids) => { for (const id of ids) { await base44.entities.Contact.delete(id); } },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['contacts'] }); setSelected([]); toast.success('נמחקו'); },
  });

  const filtered = contacts.filter(c => {
    return (c.full_name || '').includes(search) || (c.phone || '').includes(search) || (c.email || '').includes(search);
  });

  const handleSubmit = () => {
    if (!form.full_name) return;
    editId ? updateMutation.mutate({ id: editId, data: form }) : createMutation.mutate(form);
  };

  const handleEdit = (contact) => {
    setForm({ full_name: contact.full_name || '', phone: contact.phone || '', email: contact.email || '', source: contact.source || 'web', notes: contact.notes || '', is_test: contact.is_test || false });
    setEditId(contact.id);
    setShowDialog(true);
  };

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map(c => c.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl md:text-2xl font-bold">אנשי קשר</h1>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          <Button onClick={() => { setForm(emptyContact); setEditId(null); setShowDialog(true); }} className="gap-2" size="sm">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">הוסף איש קשר</span><span className="sm:hidden">הוסף</span>
          </Button>
        </div>
      </div>

      <BulkActions selectedCount={selected.length} onDelete={() => bulkDeleteMutation.mutate(selected)} onClear={() => setSelected([])} />

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="חיפוש לפי שם, טלפון או מייל..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10" />
          </div>
        </CardHeader>

        {view === 'table' ? (
          <CardContent className="p-0 overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Checkbox checked={selected.length === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} /></TableHead>
                  <TableHead className="text-right">שם מלא</TableHead>
                  <TableHead className="text-right">טלפון</TableHead>
                  <TableHead className="text-right">אימייל</TableHead>
                  <TableHead className="text-right">מקור</TableHead>
                  <TableHead className="text-right">תאריך</TableHead>
                  <TableHead className="text-right w-20">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8">טוען...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">אין אנשי קשר</TableCell></TableRow>
                ) : (
                  filtered.map((c) => (
                    <TableRow key={c.id} className="hover:bg-muted/50">
                      <TableCell><Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggleSelect(c.id)} /></TableCell>
                      <TableCell className="font-medium">{c.full_name}</TableCell>
                      <TableCell>{c.phone && <span className="flex items-center gap-1 text-sm"><Phone className="w-3 h-3" />{c.phone}</span>}</TableCell>
                      <TableCell>{c.email && <span className="flex items-center gap-1 text-sm"><Mail className="w-3 h-3" />{c.email}</span>}</TableCell>
                      <TableCell><SourceBadge source={c.source} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.created_date ? new Date(c.created_date).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(c)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        ) : (
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {isLoading ? (
                <p className="col-span-3 text-center py-8 text-muted-foreground">טוען...</p>
              ) : filtered.length === 0 ? (
                <p className="col-span-3 text-center py-8 text-muted-foreground">אין אנשי קשר</p>
              ) : (
                filtered.map((c) => (
                  <Card key={c.id} className="hover:shadow-md transition-shadow group">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggleSelect(c.id)} className="mt-1" />
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-primary" />
                              <span className="text-sm font-bold">{c.full_name}</span>
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(c)}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </div>
                          {c.phone && <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</p>}
                          {c.email && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><Mail className="w-3 h-3" />{c.email}</p>}
                          <div className="flex items-center gap-2 mt-2">
                            <SourceBadge source={c.source} />
                            <span className="text-xs text-muted-foreground">{c.created_date ? new Date(c.created_date).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: '2-digit' }) : ''}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Create/Edit dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editId ? 'עריכת איש קשר' : 'איש קשר חדש'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>שם מלא *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><Label>טלפון</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>אימייל</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
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
            <label className="flex items-center gap-2 text-sm text-amber-600 cursor-pointer">
              <Checkbox checked={form.is_test || false} onCheckedChange={(v) => setForm({ ...form, is_test: v })} />
              🧪 בדיקת בוט
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>ביטול</Button>
            <Button onClick={handleSubmit} disabled={!form.full_name}>{editId ? 'עדכן' : 'צור'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת איש קשר</AlertDialogTitle>
            <AlertDialogDescription>האם למחוק את {deleteTarget?.full_name}? פעולה זו לא ניתנת לביטול.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}>מחק</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}