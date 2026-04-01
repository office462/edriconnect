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
import { Plus, Pencil, Save, Palette, GitBranch } from 'lucide-react';
import { toast } from 'sonner';

const categoryConfig = {
  ui: { label: 'עיצוב ותצוגה', icon: Palette, color: 'bg-amber-100 text-amber-700' },
  flow: { label: 'הגדרות Flow', icon: GitBranch, color: 'bg-red-100 text-red-700' },
};

const valueTypes = [
  { value: 'text', label: 'טקסט' },
  { value: 'url', label: 'קישור' },
  { value: 'html', label: 'HTML' },
  { value: 'number', label: 'מספר' },
  { value: 'boolean', label: 'כן/לא' },
  { value: 'json', label: 'JSON' },
];

const emptyForm = { category: 'ui', key: '', label: '', value: '', value_type: 'text' };

export default function SystemSettings() {
  const [activeTab, setActiveTab] = useState('ui');
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [inlineEdits, setInlineEdits] = useState({});
  const queryClient = useQueryClient();

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: () => base44.entities.SystemSetting.list('category', 500),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editId
      ? base44.entities.SystemSetting.update(editId, data)
      : base44.entities.SystemSetting.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      setShowDialog(false);
      setEditId(null);
      toast.success('נשמר');
    },
  });

  const updateInlineMutation = useMutation({
    mutationFn: ({ id, value }) => base44.entities.SystemSetting.update(id, { value }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      setInlineEdits(prev => { const next = { ...prev }; delete next[id]; return next; });
      toast.success('נשמר');
    },
  });

  const handleEdit = (item) => {
    setForm({
      category: item.category, key: item.key, label: item.label || '',
      value: item.value || '', value_type: item.value_type || 'text',
    });
    setEditId(item.id);
    setShowDialog(true);
  };

  const filteredSettings = settings.filter(s => s.category === activeTab);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">הגדרות מערכת</h1>
        <Button onClick={() => { setForm({ ...emptyForm, category: activeTab }); setEditId(null); setShowDialog(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> הוסף הגדרה
        </Button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(categoryConfig).map(([key, cfg]) => {
          const Icon = cfg.icon;
          const count = settings.filter(s => s.category === key).length;
          return (
            <Button
              key={key}
              variant={activeTab === key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab(key)}
              className="gap-2"
            >
              <Icon className="w-4 h-4" /> {cfg.label} ({count})
            </Button>
          );
        })}
      </div>

      {/* Settings list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            {(() => { const cfg = categoryConfig[activeTab]; const Icon = cfg.icon; return <><Icon className="w-5 h-5" />{cfg.label}</>; })()}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">טוען...</p>
          ) : filteredSettings.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">אין הגדרות בקטגוריה זו</p>
          ) : (
            <div className="space-y-4">
              {filteredSettings.map((setting) => (
                <div key={setting.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="text-sm font-bold">{setting.label || setting.key}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs font-mono">{setting.key}</Badge>
                        <Badge variant="secondary" className="text-xs">{valueTypes.find(v => v.value === setting.value_type)?.label || setting.value_type}</Badge>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(setting)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="mt-2">
                    {setting.value_type === 'text' || setting.value_type === 'html' ? (
                      <div className="flex gap-2 items-start">
                        <Textarea
                          value={inlineEdits[setting.id] !== undefined ? inlineEdits[setting.id] : setting.value}
                          onChange={(e) => setInlineEdits({ ...inlineEdits, [setting.id]: e.target.value })}
                          rows={2}
                          className="text-sm flex-1"
                        />
                        {inlineEdits[setting.id] !== undefined && (
                          <Button size="icon" variant="outline" onClick={() => updateInlineMutation.mutate({ id: setting.id, value: inlineEdits[setting.id] })}>
                            <Save className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="flex gap-2 items-center">
                        <Input
                          value={inlineEdits[setting.id] !== undefined ? inlineEdits[setting.id] : setting.value}
                          onChange={(e) => setInlineEdits({ ...inlineEdits, [setting.id]: e.target.value })}
                          className="text-sm flex-1"
                          dir={setting.value_type === 'url' ? 'ltr' : 'rtl'}
                        />
                        {inlineEdits[setting.id] !== undefined && (
                          <Button size="icon" variant="outline" onClick={() => updateInlineMutation.mutate({ id: setting.id, value: inlineEdits[setting.id] })}>
                            <Save className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editId ? 'עריכת הגדרה' : 'הגדרה חדשה'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>קטגוריה *</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoryConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>סוג ערך</Label>
                <Select value={form.value_type} onValueChange={(v) => setForm({ ...form, value_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {valueTypes.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>מפתח *</Label>
              <Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="welcome_message" dir="ltr" />
            </div>
            <div>
              <Label>תיאור ידידותי</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </div>
            <div>
              <Label>ערך *</Label>
              <Textarea value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>ביטול</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={!form.key || !form.value}>{editId ? 'עדכן' : 'צור'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}