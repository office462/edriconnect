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
import { Plus, Pencil, Trash2, BookOpen, Clock, Video, FileText, Search } from 'lucide-react';
import ViewToggle from '@/components/shared/ViewToggle';
import BulkActions from '@/components/shared/BulkActions';
import { toast } from 'sonner';

const lectureTypes = [
  { value: 'series', label: 'סדרה' },
  { value: 'single', label: 'הרצאה בודדת' },
  { value: 'workshop', label: 'סדנה' },
];

const emptyForm = { title: '', lecture_type: 'single', description: '', duration_minutes: 90, price: '', video_url: '', pdf_url: '', image_url: '', series_name: '', sort_order: 0, is_active: true };

export default function Lectures() {
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState('cards');
  const [selected, setSelected] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const queryClient = useQueryClient();

  const { data: lectures = [], isLoading } = useQuery({
    queryKey: ['lectures'],
    queryFn: () => base44.entities.Lecture.list('sort_order', 100),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editId ? base44.entities.Lecture.update(editId, data) : base44.entities.Lecture.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lectures'] }); setShowDialog(false); setEditId(null); toast.success(editId ? 'עודכן' : 'נוצר'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Lecture.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lectures'] }); toast.success('נמחק'); },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids) => { for (const id of ids) { await base44.entities.Lecture.delete(id); } },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lectures'] }); setSelected([]); toast.success('נמחקו'); },
  });

  const handleEdit = (item) => {
    setForm({ title: item.title || '', lecture_type: item.lecture_type || 'single', description: item.description || '', duration_minutes: item.duration_minutes || 90, price: item.price || '', video_url: item.video_url || '', pdf_url: item.pdf_url || '', image_url: item.image_url || '', series_name: item.series_name || '', sort_order: item.sort_order || 0, is_active: item.is_active !== false });
    setEditId(item.id);
    setShowDialog(true);
  };

  const filtered = (filterType === 'all' ? lectures : lectures.filter(l => l.lecture_type === filterType)).filter(l => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (l.title || '').toLowerCase().includes(q) || (l.description || '').toLowerCase().includes(q) || (l.series_name || '').toLowerCase().includes(q);
  });
  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map(l => l.id));

  const typeColor = (type) => {
    if (type === 'series') return 'bg-purple-100 text-purple-700 border-purple-200';
    if (type === 'workshop') return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-blue-100 text-blue-700 border-blue-200';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl md:text-2xl font-bold">קטלוג הרצאות</h1>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          <Button onClick={() => { setForm(emptyForm); setEditId(null); setShowDialog(true); }} className="gap-2" size="sm">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">הוסף הרצאה</span><span className="sm:hidden">הוסף</span>
          </Button>
        </div>
      </div>

      <BulkActions selectedCount={selected.length} onDelete={() => bulkDeleteMutation.mutate(selected)} onClear={() => setSelected([])} />

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="חיפוש לפי כותרת, תיאור או שם סדרה..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pr-9" />
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button variant={filterType === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilterType('all')}>הכל ({lectures.length})</Button>
        {lectureTypes.map(t => (
          <Button key={t.value} variant={filterType === t.value ? 'default' : 'outline'} size="sm" onClick={() => setFilterType(t.value)}>
            {t.label} ({lectures.filter(l => l.lecture_type === t.value).length})
          </Button>
        ))}
      </div>

      {view === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? <p className="col-span-3 text-center py-8 text-muted-foreground">טוען...</p> : filtered.length === 0 ? <p className="col-span-3 text-center py-8 text-muted-foreground">אין הרצאות</p> : (
            filtered.map((item) => (
              <Card key={item.id} className="hover:shadow-md transition-shadow group">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox checked={selected.includes(item.id)} onCheckedChange={() => toggleSelect(item.id)} className="mt-1" />
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-primary" />
                          <span className="text-sm font-bold">{item.title}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(item)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>
                      {item.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{item.description}</p>}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={typeColor(item.lecture_type)}>{lectureTypes.find(t => t.value === item.lecture_type)?.label}</Badge>
                        {item.duration_minutes && <Badge variant="outline" className="text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> {item.duration_minutes} דק׳</Badge>}
                        {item.series_name && <Badge variant="secondary" className="text-xs">{item.series_name}</Badge>}
                        {item.video_url && <Video className="w-3.5 h-3.5 text-muted-foreground" />}
                        {item.pdf_url && <FileText className="w-3.5 h-3.5 text-muted-foreground" />}
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
            <Table className="min-w-[650px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Checkbox checked={selected.length === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} /></TableHead>
                  <TableHead className="text-right">כותרת</TableHead>
                  <TableHead className="text-right">סוג</TableHead>
                  <TableHead className="text-right">משך</TableHead>
                  <TableHead className="text-right">מחיר</TableHead>
                  <TableHead className="text-right">סדרה</TableHead>
                  <TableHead className="text-right w-20">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={7} className="text-center py-8">טוען...</TableCell></TableRow> : filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">אין הרצאות</TableCell></TableRow> : (
                  filtered.map((item) => (
                    <TableRow key={item.id} className="hover:bg-muted/50">
                      <TableCell><Checkbox checked={selected.includes(item.id)} onCheckedChange={() => toggleSelect(item.id)} /></TableCell>
                      <TableCell className="font-medium">{item.title}</TableCell>
                      <TableCell><Badge variant="outline" className={typeColor(item.lecture_type)}>{lectureTypes.find(t => t.value === item.lecture_type)?.label}</Badge></TableCell>
                      <TableCell className="text-sm">{item.duration_minutes ? `${item.duration_minutes} דק׳` : '-'}</TableCell>
                      <TableCell className="text-sm">{item.price || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.series_name || '-'}</TableCell>
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
          <DialogHeader><DialogTitle>{editId ? 'עריכת הרצאה' : 'הרצאה חדשה'}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pl-1">
            <div><Label>כותרת *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>סוג *</Label><Select value={form.lecture_type} onValueChange={(v) => setForm({ ...form, lecture_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{lectureTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>משך (דקות)</Label><Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} /></div>
            </div>
            <div><Label>תיאור</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>מחיר</Label><Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="₪..." /></div>
              <div><Label>שם סדרה</Label><Input value={form.series_name} onChange={(e) => setForm({ ...form, series_name: e.target.value })} /></div>
            </div>
            <div><Label>קישור סרטון</Label><Input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} dir="ltr" placeholder="https://..." /></div>
            <div><Label>קישור PDF</Label><Input value={form.pdf_url} onChange={(e) => setForm({ ...form, pdf_url: e.target.value })} dir="ltr" placeholder="https://..." /></div>
            <div><Label>תמונה</Label><Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} dir="ltr" placeholder="https://..." /></div>
            <div><Label>סדר הצגה</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
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
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת הרצאה</AlertDialogTitle>
            <AlertDialogDescription>האם למחוק את "{deleteTarget?.title}"? פעולה זו לא ניתנת לביטול.</AlertDialogDescription>
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