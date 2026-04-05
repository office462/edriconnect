import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, User, Phone, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import RequestInfo from '@/components/service-request/RequestInfo';
import StatusActions from '@/components/service-request/StatusActions';
import TimelineView from '@/components/service-request/TimelineView';
import FilesList from '@/components/service-request/FilesList';
import TestBotMessageButton from '@/components/service-request/TestBotMessageButton';
import { toast } from 'sonner';
import { handleBotMessage } from '@/lib/sendBotMessage';

export default function ServiceRequestDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get('id');
  const queryClient = useQueryClient();

  const { data: request, isLoading } = useQuery({
    queryKey: ['service-request', id],
    queryFn: () => base44.entities.ServiceRequest.filter({ id }),
    select: (data) => data[0],
    enabled: !!id,
  });

  const { data: timeline = [] } = useQuery({
    queryKey: ['timeline', id],
    queryFn: () => base44.entities.ServiceRequestTimeline.filter({ service_request_id: id }, '-created_date', 50),
    enabled: !!id,
  });

  const { data: contact } = useQuery({
    queryKey: ['contact', request?.contact_id],
    queryFn: () => base44.entities.Contact.filter({ id: request.contact_id }),
    select: (data) => data[0],
    enabled: !!request?.contact_id,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ updates, oldStatus }) => {
      await base44.entities.ServiceRequest.update(id, updates);
      if (updates.status && updates.status !== oldStatus) {
        await base44.entities.ServiceRequestTimeline.create({
          service_request_id: id,
          event_type: 'status_change',
          description: `סטטוס שונה`,
          old_value: oldStatus,
          new_value: updates.status,
        });
      }
      if (updates.current_step && updates.current_step !== request?.current_step) {
        await base44.entities.ServiceRequestTimeline.create({
          service_request_id: id,
          event_type: 'step_change',
          description: `שלב שונה ל: ${updates.current_step}`,
          new_value: updates.current_step,
        });
      }
      return { statusChanged: updates.status && updates.status !== oldStatus };
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['service-request', id] });
      queryClient.invalidateQueries({ queryKey: ['timeline', id] });
      queryClient.invalidateQueries({ queryKey: ['service-requests'] });
      toast.success('הפנייה עודכנה');
      if (result?.statusChanged) {
        try {
          const sent = await handleBotMessage(id);
          if (sent) {
            toast.success(`הודעת ${sent.trigger} נשלחה`);
            queryClient.invalidateQueries({ queryKey: ['timeline', id] });
          }
        } catch (err) {
          console.warn('Bot message failed:', err.message);
        }
      }
    },
  });

  if (isLoading || !request) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/ServiceRequests">
          <Button variant="ghost" size="icon"><ArrowRight className="w-5 h-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{request.contact_name || 'פנייה'}</h1>
          <p className="text-sm text-muted-foreground">מזהה: {request.id}</p>
        </div>
      </div>

      {/* Contact info */}
      {contact && (
        <Card>
          <CardContent className="p-3 md:p-4 flex items-center gap-3 md:gap-6 flex-wrap">
            <div className="p-2 rounded-full bg-primary/10">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{contact.full_name}</span>
            </div>
            {contact.phone && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Phone className="w-3.5 h-3.5" /> {contact.phone}
              </div>
            )}
            {contact.email && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Mail className="w-3.5 h-3.5" /> {contact.email}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          <RequestInfo request={request} />

          {/* Files */}
          <FilesList serviceRequestId={id} />
          
          {/* Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">היסטוריה</CardTitle>
            </CardHeader>
            <CardContent>
              <TimelineView events={timeline} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 order-first lg:order-none">
          <StatusActions 
            request={request} 
            onUpdate={(updates, oldStatus) => updateMutation.mutate({ updates, oldStatus })}
            isUpdating={updateMutation.isPending}
          />
          <TestBotMessageButton requestId={id} />
        </div>
      </div>
    </div>
  );
}