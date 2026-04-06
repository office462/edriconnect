import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Video, FileText, Link as LinkIcon, CreditCard, ClipboardList, FileCheck, Search } from 'lucide-react';
import ViewToggle from '@/components/shared/ViewToggle';
import BulkActions from '@/components/shared/BulkActions';
import { toast } from 'sonner';

const contentTypes = [
  { value: 'video', label: 'סרטון', icon: Video },
  { value: 'pdf', label: 'PDF', icon: FileText },
  { value: 'questionnaire', label: 'שאלון', icon: ClipboardList },
  { value: 'payment_link', label: 'קישור תשלום', icon: CreditCard },
  { value: 'external_link', label: 'קישור חיצוני', icon: LinkIcon },
  { value: 'agreement', label: 'הסכם', icon: FileCheck },
];

const serviceTypes = [
  { value: 'general', label: 'כללי' },
  { value: 'consultation', label: 'ייעוץ' },
  { value: 'legal', label: 'משפטי' },
  { value: 'lectures', label: 'הרצאות' },
  { value: 'clinic', label: 'קליניקה' },
  { value: 'post_lecture', label: 'פוסט הרצאה' },
];

const emptyForm = { title: '', content_type: 'video', service_type: 'general', url: '', description: '', is_active: true, sort_order: 0 };

export default function ServiceContentPage() {
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [filterService, setFilterService] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState('cards');
  const [selected, setSelected] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const queryClient = useQueryClient();

  const { data: contents = [], isLoading } = useQuery({
    queryKey: ['service-content'],
    queryFn: () => base44.entities.ServiceContent.list('sort_order', 200),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editId ? base44.entities.ServiceContent.update(editId, data) : base44.entities.ServiceContent.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['service-content'] }); setShowDialog(false); setEditId(null); toast.success(editId ? 'עודכן' : 'נוצר'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ServiceContent.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['service-content'] }); toast.success('נמחק'); },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids) => { for (const id of ids) { await base44.entities.ServiceContent.delete(id); } },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['service-content'] }); setSelected([]); toast.success('נמחקו'); },
  });

  const handleEdit = (item) => {
    setForm({ title: item.title || '', content_type: item.content_type || 'video', service_type: item.service_type || 'general', url: item.url || '', description: item.description || '', is_active: item.is_active !== false, sort_order: item.sort_order || 0 });
    setEditId(item.id);
    setShowDialog(true);
  };

  const filtered = contents.filter(c => {
    const matchService = filterService === 'all' || c.service_type === filterService;
    const matchType = filterType === 'all' || c.content_type === filterType;
    if (!matchService || !matchType) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (c.title || '').toLowerCase().includes(q) || (c.url || '').toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q) || (c.sub_type || '').toLowerCase().includes(q);
  });

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map(c => c.id));
  const getIcon = (type) => { const ct = contentTypes.find(t => t.value === type); return ct ? ct.icon : FileText; };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl md:text-2xl font-bold">ניהול תוכן שירות</h1>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          <Button onClick={() => { setForm(emptyForm); setEditId(null); setShowDialog(true); }} className="gap-2" size="sm"><Plus className="w-4 h-4" /> <span className="hidden sm:inline">הוסף תוכן</span><span className="sm:hidden">הוסף</span></Button>
        </div>
      </div>

      <BulkActions selectedCount={selected.length} onDelete={() => bulkDeleteMutation.mutate(selected)} onClear={() => setSelected([])} />

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="חיפוש לפי כותרת, URL, תיאור או תת-סוג..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pr-9" />
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={filterService} onValueChange={setFilterService}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="סוג שירות" /></SelectTrigger>
          <SelectContent><SelectItem value="all">כל השירותים</SelectItem>{serviceTypes.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="סוג תוכן" /></SelectTrigger>
          <SelectContent><SelectItem value="all">כל הסוגים</SelectItem>{contentTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {view === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? <p className="col-span-3 text-center py-8 text-muted-foreground">טוען...</p> : filtered.length === 0 ? <p className="col-span-3 text-center py-8 text-muted-foreground">אין תוכן</p> : (
            filtered.map((item) => {
              const Icon = getIcon(item.content_type);
              return (
                <Card key={item.id} className="hover:shadow-md transition-shadow group">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox checked={selected.includes(item.id)} onCheckedChange={() => toggleSelect(item.id)} className="mt-1" />
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2"><div className="p-1.5 rounded-md bg-primary/10"><Icon className="w-4 h-4 text-primary" /></div><span className="text-sm font-bold">{item.title}</span></div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(item)}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </div>
                        {item.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{item.description}</p>}
                        {item.url && <p className="text-xs text-primary/70 mb-3 truncate" dir="ltr">{item.url}</p>}
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">{contentTypes.find(t => t.value === item.content_type)?.label}</Badge>
                          <Badge variant="secondary" className="text-xs">{serviceTypes.find(s => s.value === item.service_type)?.label}</Badge>
                          {!item.is_active && <Badge variant="destructive" className="text-xs">לא פעיל</Badge>}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Checkbox checked={selected.length === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} /></TableHead>
                  <TableHead className="text-right">כותרת</TableHead>
                  <TableHead className="text-right">סוג תוכן</TableHead>
                  <TableHead className="text-right">שירות</TableHead>
                  <TableHead className="text-right">סטטוס</TableHead>
                  <TableHead className="text-right w-20">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={6} className="text-center py-8">טוען...</TableCell></TableRow> : filtered.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">אין תוכן</TableCell></TableRow> : (
                  filtered.map((item) => (
                    <TableRow key={item.id} className="hover:bg-muted/50">
                      <TableCell><Checkbox checked={selected.includes(item.id)} onCheckedChange={() => toggleSelect(item.id)} /></TableCell>
                      <TableCell className="font-medium">{item.title}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{contentTypes.find(t => t.value === item.content_type)?.label}</Badge></TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{serviceTypes.find(s => s.value === item.service_type)?.label}</Badge></TableCell>
                      <TableCell>{item.is_active ? <Badge className="text-xs bg-emerald-100 text-emerald-700">פעיל</Badge> : <Badge variant="destructive" className="text-xs">לא פעיל</Badge>}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(item)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit/Create dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editId ? 'עריכת תוכן' : 'תוכן חדש'}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pl-1">
            <div><Label>כותרת *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>סוג תוכן *</Label><Select value={form.content_type} onValueChange={(v) => setForm({ ...form, content_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{contentTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>שיוך שירות *</Label><Select value={form.service_type} onValueChange={(v) => setForm({ ...form, service_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{serviceTypes.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div><Label>קישור / URL</Label><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." dir="ltr" /></div>
            <div><Label>תיאור</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></div>
            <div className="grid grid-cols-2 gap-3"><div><Label>סדר הצגה</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>ביטול</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={!form.title}>{editId ? 'עדכן' : 'צור'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>מחיקת תוכן</AlertDialogTitle><AlertDialogDescription>האם למחוק את "{deleteTarget?.title}"?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>ביטול</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}>מחק</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}