import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
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
import { Plus, Pencil, Trash2, MessageSquare, Search } from 'lucide-react';
import EmojiPicker from '@/components/shared/EmojiPicker';
import ViewToggle from '@/components/shared/ViewToggle';
import BulkActions from '@/components/shared/BulkActions';
import { toast } from 'sonner';

const categories = [
  { value: 'general', label: 'כללי' },
  { value: 'consultation', label: 'ייעוץ' },
  { value: 'legal', label: 'משפטי' },
  { value: 'lectures', label: 'הרצאות' },
  { value: 'clinic', label: 'קליניקה' },
  { value: 'post_lecture', label: 'פוסט הרצאה' },
];

const serviceFlows = [
  { value: 'consultation', label: 'מסלול ייעוץ' },
  { value: 'legal', label: 'מסלול משפטי' },
  { value: 'lectures', label: 'מסלול הרצאות' },
  { value: 'clinic', label: 'מסלול קליניקה' },
  { value: 'post_lecture', label: 'מסלול פוסט הרצאה' },
  { value: 'general', label: 'כללי' },
];

const emptyContent = { key: '', title: '', content: '', category: 'general', is_active: true, service_type_flow: '', step_label: '' };

export default function BotContent() {
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState(emptyContent);
  const [editId, setEditId] = useState(null);
  const [filterCat, setFilterCat] = useState('all');
  const [filterFlow, setFilterFlow] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState('cards');
  const [selected, setSelected] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const queryClient = useQueryClient();

  const { data: contents = [], isLoading } = useQuery({
    queryKey: ['bot-content'],
    queryFn: () => base44.entities.BotContent.list('-created_date', 200),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editId ? base44.entities.BotContent.update(editId, data) : base44.entities.BotContent.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['bot-content'] }); setShowDialog(false); setEditId(null); toast.success(editId ? 'עודכן' : 'נוצר'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.BotContent.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['bot-content'] }); toast.success('נמחק'); },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids) => { for (const id of ids) { await base44.entities.BotContent.delete(id); } },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['bot-content'] }); setSelected([]); toast.success('נמחקו'); },
  });

  const filtered = contents
    .filter(c => filterCat === 'all' || c.category === filterCat)
    .filter(c => filterFlow === 'all' || c.service_type_flow === filterFlow)
    .filter(c => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (c.title || '').toLowerCase().includes(q) || (c.key || '').toLowerCase().includes(q) || (c.content || '').toLowerCase().includes(q);
    })
    .sort((a, b) => (a.step_label || '').localeCompare(b.step_label || ''));
  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map(c => c.id));

  const handleEdit = (item) => {
    setForm({ key: item.key || '', title: item.title || '', content: item.content || '', category: item.category || 'general', is_active: item.is_active !== false, service_type_flow: item.service_type_flow || '', step_label: item.step_label || '' });
    setEditId(item.id);
    setShowDialog(true);
  };

  const handleSubmit = () => {
    if (!form.key || !form.title || !form.content) return;
    saveMutation.mutate(form);
  };



  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl md:text-2xl font-bold">תוכן הבוט</h1>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          <Button onClick={() => { setForm(emptyContent); setEditId(null); setShowDialog(true); }} className="gap-2" size="sm">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">הוסף הודעה</span><span className="sm:hidden">הוסף</span>
          </Button>
        </div>
      </div>

      <BulkActions selectedCount={selected.length} onDelete={() => bulkDeleteMutation.mutate(selected)} onClear={() => setSelected([])} />

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="חיפוש לפי כותרת, מפתח או תוכן..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pr-9" />
      </div>

      <div className="space-y-2">
        <div className="flex gap-2 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground self-center">קטגוריה:</span>
          <Button variant={filterCat === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilterCat('all')}>הכל</Button>
          {categories.map(c => <Button key={c.value} variant={filterCat === c.value ? 'default' : 'outline'} size="sm" onClick={() => setFilterCat(c.value)}>{c.label}</Button>)}
        </div>
        <div className="flex gap-2 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground self-center">מסלול:</span>
          <Button variant={filterFlow === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilterFlow('all')}>הכל</Button>
          {serviceFlows.map(f => <Button key={f.value} variant={filterFlow === f.value ? 'default' : 'outline'} size="sm" onClick={() => setFilterFlow(f.value)}>{f.label}</Button>)}
        </div>
      </div>

      {view === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? <p className="col-span-3 text-center py-8 text-muted-foreground">טוען...</p> : filtered.length === 0 ? <p className="col-span-3 text-center py-8 text-muted-foreground">אין הודעות</p> : (
            filtered.map((item) => (
              <Card key={item.id} className="hover:shadow-md transition-shadow group">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox checked={selected.includes(item.id)} onCheckedChange={() => toggleSelect(item.id)} className="mt-1" />
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /><span className="text-sm font-bold">{item.title}</span></div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(item)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3 line-clamp-3 whitespace-pre-wrap">{item.content}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{item.key}</Badge>
                        <Badge variant="secondary" className="text-xs">{categories.find(c => c.value === item.category)?.label || item.category}</Badge>
                        {item.service_type_flow && <Badge className="text-xs bg-blue-100 text-blue-700">{serviceFlows.find(f => f.value === item.service_type_flow)?.label || item.service_type_flow}</Badge>}
                        {item.step_label && <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">{item.step_label}</Badge>}

                        {!item.is_active && <Badge variant="destructive" className="text-xs">לא פעיל</Badge>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Checkbox checked={selected.length === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} /></TableHead>
                  <TableHead className="text-right">כותרת</TableHead>
                  <TableHead className="text-right">מפתח</TableHead>
                  <TableHead className="text-right">קטגוריה</TableHead>
                  <TableHead className="text-right">מסלול</TableHead>
                  <TableHead className="text-right">שלב</TableHead>
                  <TableHead className="text-right">סטטוס</TableHead>
                  <TableHead className="text-right w-20">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={9} className="text-center py-8">טוען...</TableCell></TableRow> : filtered.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">אין הודעות</TableCell></TableRow> : (
                  filtered.map((item) => (
                    <TableRow key={item.id} className="hover:bg-muted/50">
                      <TableCell><Checkbox checked={selected.includes(item.id)} onCheckedChange={() => toggleSelect(item.id)} /></TableCell>
                      <TableCell className="font-medium">{item.title}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs font-mono">{item.key}</Badge></TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{categories.find(c => c.value === item.category)?.label}</Badge></TableCell>
                      <TableCell>{item.service_type_flow ? <Badge className="text-xs bg-blue-100 text-blue-700">{serviceFlows.find(f => f.value === item.service_type_flow)?.label || item.service_type_flow}</Badge> : '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.step_label || '-'}</TableCell>
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
          <DialogHeader><DialogTitle>{editId ? 'עריכת הודעה' : 'הודעה חדשה'}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pl-1">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>מפתח *</Label><Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="welcome" /></div>
              <div><Label>קטגוריה</Label><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>מסלול שירות</Label><Select value={form.service_type_flow || 'none'} onValueChange={(v) => setForm({ ...form, service_type_flow: v === 'none' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">ללא</SelectItem>{serviceFlows.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>שלב</Label><Input value={form.step_label} onChange={(e) => setForm({ ...form, step_label: e.target.value })} placeholder="שלב 3 — אישור תשלום" /></div>
            </div>
            <div><Label>כותרת *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>תוכן ההודעה *</Label>
                <EmojiPicker onSelect={(emoji) => setForm({ ...form, content: form.content + emoji })} />
              </div>
              <Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={5} />
            </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>ביטול</Button>
            <Button onClick={handleSubmit} disabled={!form.key || !form.title || !form.content}>{editId ? 'עדכן' : 'צור'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>מחיקת הודעה</AlertDialogTitle><AlertDialogDescription>האם למחוק את "{deleteTarget?.title}"?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>ביטול</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}>מחק</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}