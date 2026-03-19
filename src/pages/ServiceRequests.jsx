import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Filter } from 'lucide-react';
import StatusBadge from '@/components/shared/StatusBadge';
import ServiceTypeBadge from '@/components/shared/ServiceTypeBadge';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function ServiceRequests() {
  const urlParams = new URLSearchParams(window.location.search);
  const initialStatus = urlParams.get('status') || 'all';
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [typeFilter, setTypeFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
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
      const requestData = {
        ...data,
        contact_name: contact?.full_name || '',
        contact_phone: contact?.phone || '',
        status: 'new_lead',
      };
      const result = await base44.entities.ServiceRequest.create(requestData);
      await base44.entities.ServiceRequestTimeline.create({
        service_request_id: result.id,
        event_type: 'status_change',
        description: 'פנייה חדשה נוצרה',
        new_value: 'new_lead',
      });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-requests'] });
      setShowCreate(false);
      toast.success('פנייה נוצרה בהצלחה');
    },
  });

  const filtered = requests.filter(r => {
    const matchSearch = !search || (r.contact_name || '').includes(search) || (r.contact_phone || '').includes(search);
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchType = typeFilter === 'all' || r.service_type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">פניות שירות</h1>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="w-4 h-4" /> פנייה חדשה
        </Button>
      </div>

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
                <SelectItem value="new_lead">ליד חדש</SelectItem>
                <SelectItem value="pending">ממתין</SelectItem>
                <SelectItem value="whatsapp_message_to_check">הודעה לבדיקה</SelectItem>
                <SelectItem value="in_review">בטיפול</SelectItem>
                <SelectItem value="paid">שולם</SelectItem>
                <SelectItem value="scheduled">נקבע תור</SelectItem>
                <SelectItem value="completed">הושלם</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="סוג שירות" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל סוגי השירות</SelectItem>
                <SelectItem value="consultation">ייעוץ</SelectItem>
                <SelectItem value="legal">חוות דעת משפטית</SelectItem>
                <SelectItem value="lectures">הרצאות</SelectItem>
                <SelectItem value="clinic">השכרת קליניקה</SelectItem>
                <SelectItem value="post_lecture">פוסט הרצאה</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">שם</TableHead>
                <TableHead className="text-right">טלפון</TableHead>
                <TableHead className="text-right">סוג שירות</TableHead>
                <TableHead className="text-right">שלב נוכחי</TableHead>
                <TableHead className="text-right">סטטוס</TableHead>
                <TableHead className="text-right">תאריך יצירה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">טוען...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">אין פניות</TableCell></TableRow>
              ) : (
                filtered.map((req) => (
                  <TableRow key={req.id} className="hover:bg-muted/50 transition-colors">
                    <TableCell>
                      <Link to={`/ServiceRequestDetail?id=${req.id}`} className="font-medium text-foreground hover:text-primary">
                        {req.contact_name || 'לא ידוע'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{req.contact_phone || '-'}</TableCell>
                    <TableCell><ServiceTypeBadge type={req.service_type} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{req.current_step || '-'}</TableCell>
                    <TableCell><StatusBadge status={req.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {req.created_date ? format(new Date(req.created_date), 'dd/MM/yy HH:mm') : '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>פנייה חדשה</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>איש קשר *</Label>
              <Select value={newReq.contact_id} onValueChange={(v) => setNewReq({ ...newReq, contact_id: v })}>
                <SelectTrigger><SelectValue placeholder="בחר איש קשר" /></SelectTrigger>
                <SelectContent>
                  {contacts.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name} {c.phone ? `(${c.phone})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>סוג שירות *</Label>
              <Select value={newReq.service_type} onValueChange={(v) => setNewReq({ ...newReq, service_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultation">ייעוץ</SelectItem>
                  <SelectItem value="legal">חוות דעת משפטית</SelectItem>
                  <SelectItem value="lectures">הרצאות</SelectItem>
                  <SelectItem value="clinic">השכרת קליניקה</SelectItem>
                  <SelectItem value="post_lecture">פוסט הרצאה</SelectItem>
                </SelectContent>
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
    </div>
  );
}