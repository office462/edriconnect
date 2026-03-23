import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, Filter, Pencil, Trash2 } from 'lucide-react';
import StatusBadge from '@/components/shared/StatusBadge';
import ServiceTypeBadge from '@/components/shared/ServiceTypeBadge';
import ViewToggle from '@/components/shared/ViewToggle';
import BulkActions from '@/components/shared/BulkActions';
import RequestCard from '@/components/service-requests/RequestCard';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { findAndSaveConversationId } from '@/lib/findConversationId';

const statusOptions = [
  { value: 'new_lead', label: 'ליד חדש' },
  { value: 'pending', label: 'ממתין' },
  { value: 'whatsapp_message_to_check', label: 'הודעה לבדיקה' },
  { value: 'in_review', label: 'בטיפול' },
  { value: 'questionnaire_completed', label: 'מילא שאלון' },
  { value: 'paid', label: 'שולם' },
  { value: 'scheduled', label: 'נקבע תור' },
  { value: 'completed', label: 'הושלם' },
];

const serviceTypeOptions = [
  { value: 'consultation', label: 'ייעוץ' },
  { value: 'legal', label: 'חוות דעת משפטית' },
  { value: 'lectures', label: 'הרצאות' },
  { value: 'clinic', label: 'השכרת קליניקה' },
  { value: 'post_lecture', label: 'פוסט הרצאה' },
];

export default function ServiceRequests() {
  const urlParams = new URLSearchParams(window.location.search);
  const initialStatus = urlParams.get('status') || 'all';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [typeFilter, setTypeFilter] = useState('all');
  const [view, setView] = useState('table');
  const [selected, setSelected] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingReq, setEditingReq] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [newReq, setNewReq] = useState({ contact_id: '', service_type: 'consultation', notes: '' });
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['service-requests'],
    queryFn: () => base44.entities.ServiceRequest.list('-created_date', 200),
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.list('-created_date', 200),
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const contact = contacts.find(c => c.id === data.contact_id);
      const requestData = { ...data, contact_name: contact?.full_name || '', contact_phone: contact?.phone || '', status: 'new_lead' };
      const result = await base44.entities.ServiceRequest.create(requestData);
      await base44.entities.ServiceRequestTimeline.create({ service_request_id: result.id, event_type: 'status_change', description: 'פנייה חדשה נוצרה', new_value: 'new_lead' });
      return result;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['service-requests'] }); setShowCreate(false); toast.success('פנייה נוצרה'); },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, oldStatus, fullRequest }) => {
      try {
        await base44.entities.ServiceRequest.update(id, data);
        console.log('Step 1 done - DB updated');

        if (data.status && data.status !== oldStatus) {
          console.log('Step 2 - status changed:', oldStatus, '->', data.status);

          await base44.entities.ServiceRequestTimeline.create({
            service_request_id: id, event_type: 'status_change', description: 'סטטוס שונה', old_value: oldStatus, new_value: data.status,
          });
          console.log('Step 3 done - timeline created');

          // Find and save conversation_id before triggering bot
          const reqData = fullRequest || requests.find(r => r.id === id) || {};
          const isValidObjectId = (checkId) => /^[a-f0-9]{24}$/i.test(checkId || '');
          let savedConversationId = reqData.conversation_id;

          if (data.status === 'paid' && reqData.contact_phone) {
            // Always search for the real conversation - bot sometimes saves wrong conversation_id
            console.log('Step 4 - finding conversation_id...');
            savedConversationId = await findAndSaveConversationId(id, reqData.contact_phone);
            console.log('Step 4 done - conversation_id:', savedConversationId);
          }

          // Trigger bot continuation for status changes
          const updatedData = { ...reqData, ...data, conversation_id: savedConversationId };
          try {
            console.log('Step 5 - triggering bot...');
            const botResult = await base44.functions.invoke('onServiceRequestUpdate', {
              event: { type: 'update', entity_name: 'ServiceRequest', entity_id: id },
              data: updatedData,
              old_data: { ...reqData, status: oldStatus },
            });
            console.log('Step 5 done - Bot trigger result:', botResult?.data);

            // If backend returned a pending bot message, send it from frontend
            const pending = botResult?.data?.pendingBotMessage;
            if (pending?.conversationId && pending?.message) {
              console.log('Step 6 - sending bot message from frontend...');
              const conv = await base44.agents.getConversation(pending.conversationId);
              await base44.agents.addMessage(conv, { role: 'assistant', content: pending.message });
              await base44.entities.ServiceRequestTimeline.create({
                service_request_id: id,
                event_type: 'message_sent',
                description: `הודעת ${pending.botTrigger} נשלחה ל${pending.contactName} בשיחת הבוט`,
              });
              console.log('Step 6 done - message sent');
            }
          } catch (err) {
            console.warn('Step 5/6 failed - Bot trigger error:', err.message);
          }
        }
      } catch (e) {
        console.error('MUTATION FAILED AT:', e.message);
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['service-requests'] }); setShowEdit(false); setEditingReq(null); toast.success('עודכן'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ServiceRequest.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['service-requests'] }); toast.success('נמחק'); },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids) => { for (const id of ids) { await base44.entities.ServiceRequest.delete(id); } },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['service-requests'] }); setSelected([]); toast.success('נמחקו'); },
  });

  const filtered = requests.filter(r => {
    const matchSearch = !search || (r.contact_name || '').includes(search) || (r.contact_phone || '').includes(search);
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchType = typeFilter === 'all' || r.service_type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  const toggleSelect = (id) => setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map(r => r.id));

  const handleEdit = (req) => {
    setEditingReq({
      id: req.id, status: req.status || 'new_lead', service_type: req.service_type || 'consultation',
      current_step: req.current_step || '', notes: req.notes || '', contact_name: req.contact_name,
      payment_confirmed: req.payment_confirmed || false, documents_received: req.documents_received || false,
      _oldStatus: req.status,
    });
    setShowEdit(true);
  };

  const handleDelete = (req) => setDeleteTarget(req);

  const handleQuickStatus = (req, newStatus) => {
    updateMutation.mutate({ id: req.id, data: { status: newStatus }, oldStatus: req.status, fullRequest: req });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">פניות שירות</h1>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="w-4 h-4" /> פנייה חדשה
          </Button>
        </div>
      </div>

      <BulkActions selectedCount={selected.length} onDelete={() => bulkDeleteMutation.mutate(selected)} onClear={() => setSelected([])} />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><Filter className="w-4 h-4 ml-2" /><SelectValue placeholder="סטטוס" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הסטטוסים</SelectItem>
                {statusOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="סוג שירות" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל סוגי השירות</SelectItem>
                {serviceTypeOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        {view === 'table' ? (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Checkbox checked={selected.length === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} /></TableHead>
                  <TableHead className="text-right">שם</TableHead>
                  <TableHead className="text-right">טלפון</TableHead>
                  <TableHead className="text-right">סוג שירות</TableHead>
                  <TableHead className="text-right">סטטוס</TableHead>
                  <TableHead className="text-right">שלב</TableHead>
                  <TableHead className="text-right">תאריך</TableHead>
                  <TableHead className="text-right w-20">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8">טוען...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">אין פניות</TableCell></TableRow>
                ) : (
                  filtered.map((req) => (
                    <TableRow key={req.id} className="hover:bg-muted/50">
                      <TableCell><Checkbox checked={selected.includes(req.id)} onCheckedChange={() => toggleSelect(req.id)} /></TableCell>
                      <TableCell>
                        <Link to={`/ServiceRequestDetail?id=${req.id}`} className="font-medium hover:text-primary">{req.contact_name || 'לא ידוע'}</Link>
                      </TableCell>
                      <TableCell className="text-sm">{req.contact_phone || '-'}</TableCell>
                      <TableCell><ServiceTypeBadge type={req.service_type} /></TableCell>
                      <TableCell>
                        <Select value={req.status} onValueChange={(v) => handleQuickStatus(req, v)}>
                          <SelectTrigger className="h-7 w-32 text-xs border-0 bg-transparent p-0">
                            <StatusBadge status={req.status} />
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{req.current_step || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{req.created_date ? format(new Date(req.created_date), 'dd/MM/yy HH:mm') : '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(req)}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(req)}><Trash2 className="w-3.5 h-3.5" /></Button>
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
                <p className="col-span-3 text-center py-8 text-muted-foreground">אין פניות</p>
              ) : (
                filtered.map((req) => (
                  <RequestCard key={req.id} request={req} selected={selected.includes(req.id)} onSelect={toggleSelect} onEdit={handleEdit} onDelete={handleDelete} />
                ))
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>פנייה חדשה</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>איש קשר *</Label>
              <Select value={newReq.contact_id} onValueChange={(v) => setNewReq({ ...newReq, contact_id: v })}>
                <SelectTrigger><SelectValue placeholder="בחר איש קשר" /></SelectTrigger>
                <SelectContent>{contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name} {c.phone ? `(${c.phone})` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>סוג שירות *</Label>
              <Select value={newReq.service_type} onValueChange={(v) => setNewReq({ ...newReq, service_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{serviceTypeOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>הערות</Label>
              <Input value={newReq.notes} onChange={(e) => setNewReq({ ...newReq, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>ביטול</Button>
            <Button onClick={() => createMutation.mutate(newReq)} disabled={!newReq.contact_id}>צור פנייה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>עריכת פנייה — {editingReq?.contact_name}</DialogTitle></DialogHeader>
          {editingReq && (
            <div className="space-y-4">
              <div>
                <Label>סטטוס</Label>
                <Select value={editingReq.status} onValueChange={(v) => setEditingReq({ ...editingReq, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{statusOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>סוג שירות</Label>
                <Select value={editingReq.service_type} onValueChange={(v) => setEditingReq({ ...editingReq, service_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{serviceTypeOptions.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>שלב נוכחי</Label>
                <Input value={editingReq.current_step} onChange={(e) => setEditingReq({ ...editingReq, current_step: e.target.value })} />
              </div>
              <div>
                <Label>הערות</Label>
                <Textarea value={editingReq.notes} onChange={(e) => setEditingReq({ ...editingReq, notes: e.target.value })} rows={3} />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={editingReq.payment_confirmed} onCheckedChange={(v) => setEditingReq({ ...editingReq, payment_confirmed: v })} />
                  תשלום אושר
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={editingReq.documents_received} onCheckedChange={(v) => setEditingReq({ ...editingReq, documents_received: v })} />
                  מסמכים התקבלו
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>ביטול</Button>
            <Button onClick={() => {
              const { id, _oldStatus, contact_name, ...data } = editingReq;
              const fullRequest = requests.find(r => r.id === id);
              updateMutation.mutate({ id, data, oldStatus: _oldStatus, fullRequest });
            }}>שמור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת פנייה</AlertDialogTitle>
            <AlertDialogDescription>האם למחוק את הפנייה של {deleteTarget?.contact_name}? פעולה זו לא ניתנת לביטול.</AlertDialogDescription>
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