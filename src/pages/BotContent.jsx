import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, MessageSquare, Video, FileText as FileIcon, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';

const categories = [
  { value: 'general', label: 'כללי' },
  { value: 'consultation', label: 'ייעוץ' },
  { value: 'legal', label: 'משפטי' },
  { value: 'lectures', label: 'הרצאות' },
  { value: 'clinic', label: 'קליניקה' },
  { value: 'post_lecture', label: 'פוסט הרצאה' },
];

const mediaTypes = [
  { value: 'none', label: 'ללא' },
  { value: 'video', label: 'סרטון' },
  { value: 'pdf', label: 'PDF' },
  { value: 'image', label: 'תמונה' },
  { value: 'link', label: 'קישור' },
];

const emptyContent = { key: '', title: '', content: '', category: 'general', media_url: '', media_type: 'none', is_active: true };

export default function BotContent() {
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState(emptyContent);
  const [editId, setEditId] = useState(null);
  const [filterCat, setFilterCat] = useState('all');
  const queryClient = useQueryClient();

  const { data: contents = [], isLoading } = useQuery({
    queryKey: ['bot-content'],
    queryFn: () => base44.entities.BotContent.list('-created_date', 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.BotContent.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['bot-content'] }); setShowDialog(false); toast.success('הודעה נוצרה'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BotContent.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['bot-content'] }); setShowDialog(false); setEditId(null); toast.success('עודכן'); },
  });

  const filtered = filterCat === 'all' ? contents : contents.filter(c => c.category === filterCat);

  const handleSubmit = () => {
    if (!form.key || !form.title || !form.content) return;
    if (editId) {
      updateMutation.mutate({ id: editId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleEdit = (item) => {
    setForm({
      key: item.key || '', title: item.title || '', content: item.content || '',
      category: item.category || 'general', media_url: item.media_url || '',
      media_type: item.media_type || 'none', is_active: item.is_active !== false,
    });
    setEditId(item.id);
    setShowDialog(true);
  };

  const mediaIcon = (type) => {
    if (type === 'video') return <Video className="w-3.5 h-3.5" />;
    if (type === 'pdf') return <FileIcon className="w-3.5 h-3.5" />;
    if (type === 'link') return <LinkIcon className="w-3.5 h-3.5" />;
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">תוכן הבוט</h1>
        <Button onClick={() => { setForm(emptyContent); setEditId(null); setShowDialog(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> הוסף הודעה
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button variant={filterCat === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilterCat('all')}>הכל</Button>
        {categories.map(c => (
          <Button key={c.value} variant={filterCat === c.value ? 'default' : 'outline'} size="sm" onClick={() => setFilterCat(c.value)}>
            {c.label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <p className="col-span-3 text-center py-8 text-muted-foreground">טוען...</p>
        ) : filtered.length === 0 ? (
          <p className="col-span-3 text-center py-8 text-muted-foreground">אין הודעות</p>
        ) : (
          filtered.map((item) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow cursor-pointer group" onClick={() => handleEdit(item)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    <span className="text-sm font-bold">{item.title}</span>
                  </div>
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-xs text-muted-foreground mb-3 line-clamp-3 whitespace-pre-wrap">{item.content}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">{item.key}</Badge>
                  <Badge variant="secondary" className="text-xs">
                    {categories.find(c => c.value === item.category)?.label || item.category}
                  </Badge>
                  {item.media_type && item.media_type !== 'none' && (
                    <Badge variant="outline" className="text-xs flex items-center gap-1">
                      {mediaIcon(item.media_type)}
                      {mediaTypes.find(m => m.value === item.media_type)?.label}
                    </Badge>
                  )}
                  {!item.is_active && <Badge variant="destructive" className="text-xs">לא פעיל</Badge>}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editId ? 'עריכת הודעה' : 'הודעה חדשה'}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pl-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>מפתח *</Label>
                <Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="welcome" />
              </div>
              <div>
                <Label>קטגוריה</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>כותרת *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>תוכן ההודעה *</Label>
              <Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={5} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>סוג מדיה</Label>
                <Select value={form.media_type} onValueChange={(v) => setForm({ ...form, media_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {mediaTypes.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>קישור מדיה</Label>
                <Input value={form.media_url} onChange={(e) => setForm({ ...form, media_url: e.target.value })} placeholder="https://..." />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>ביטול</Button>
            <Button onClick={handleSubmit} disabled={!form.key || !form.title || !form.content}>
              {editId ? 'עדכן' : 'צור'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}