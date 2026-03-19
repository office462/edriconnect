import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, BookOpen, Clock, Video, FileText } from 'lucide-react';
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
  const queryClient = useQueryClient();

  const { data: lectures = [], isLoading } = useQuery({
    queryKey: ['lectures'],
    queryFn: () => base44.entities.Lecture.list('sort_order', 100),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editId
      ? base44.entities.Lecture.update(editId, data)
      : base44.entities.Lecture.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lectures'] });
      setShowDialog(false);
      setEditId(null);
      toast.success(editId ? 'עודכן' : 'נוצר');
    },
  });

  const handleEdit = (item) => {
    setForm({
      title: item.title || '', lecture_type: item.lecture_type || 'single',
      description: item.description || '', duration_minutes: item.duration_minutes || 90,
      price: item.price || '', video_url: item.video_url || '', pdf_url: item.pdf_url || '',
      image_url: item.image_url || '', series_name: item.series_name || '',
      sort_order: item.sort_order || 0, is_active: item.is_active !== false,
    });
    setEditId(item.id);
    setShowDialog(true);
  };

  const filtered = filterType === 'all' ? lectures : lectures.filter(l => l.lecture_type === filterType);

  const typeColor = (type) => {
    if (type === 'series') return 'bg-purple-100 text-purple-700 border-purple-200';
    if (type === 'workshop') return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-blue-100 text-blue-700 border-blue-200';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">קטלוג הרצאות</h1>
        <Button onClick={() => { setForm(emptyForm); setEditId(null); setShowDialog(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> הוסף הרצאה
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button variant={filterType === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilterType('all')}>הכל ({lectures.length})</Button>
        {lectureTypes.map(t => (
          <Button key={t.value} variant={filterType === t.value ? 'default' : 'outline'} size="sm" onClick={() => setFilterType(t.value)}>
            {t.label} ({lectures.filter(l => l.lecture_type === t.value).length})
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <p className="col-span-3 text-center py-8 text-muted-foreground">טוען...</p>
        ) : filtered.length === 0 ? (
          <p className="col-span-3 text-center py-8 text-muted-foreground">אין הרצאות</p>
        ) : (
          filtered.map((item) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow cursor-pointer group" onClick={() => handleEdit(item)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary" />
                    <span className="text-sm font-bold">{item.title}</span>
                  </div>
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                {item.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{item.description}</p>}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={typeColor(item.lecture_type)}>
                    {lectureTypes.find(t => t.value === item.lecture_type)?.label}
                  </Badge>
                  {item.duration_minutes && (
                    <Badge variant="outline" className="text-xs flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {item.duration_minutes} דק׳
                    </Badge>
                  )}
                  {item.series_name && <Badge variant="secondary" className="text-xs">{item.series_name}</Badge>}
                  {item.video_url && <Video className="w-3.5 h-3.5 text-muted-foreground" />}
                  {item.pdf_url && <FileText className="w-3.5 h-3.5 text-muted-foreground" />}
                  {!item.is_active && <Badge variant="destructive" className="text-xs">לא פעיל</Badge>}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editId ? 'עריכת הרצאה' : 'הרצאה חדשה'}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pl-1">
            <div>
              <Label>כותרת *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>סוג *</Label>
                <Select value={form.lecture_type} onValueChange={(v) => setForm({ ...form, lecture_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {lectureTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>משך (דקות)</Label>
                <Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>תיאור</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>מחיר</Label>
                <Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="₪..." />
              </div>
              <div>
                <Label>שם סדרה</Label>
                <Input value={form.series_name} onChange={(e) => setForm({ ...form, series_name: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>קישור סרטון</Label>
              <Input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} dir="ltr" placeholder="https://..." />
            </div>
            <div>
              <Label>קישור PDF</Label>
              <Input value={form.pdf_url} onChange={(e) => setForm({ ...form, pdf_url: e.target.value })} dir="ltr" placeholder="https://..." />
            </div>
            <div>
              <Label>תמונה</Label>
              <Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} dir="ltr" placeholder="https://..." />
            </div>
            <div>
              <Label>סדר הצגה</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>ביטול</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={!form.title}>{editId ? 'עדכן' : 'צור'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}