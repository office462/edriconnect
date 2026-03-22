import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Users, FileText, Clock, CheckCircle2 } from 'lucide-react';
import StatsCards from '@/components/dashboard/StatsCards';
import AlertCards from '@/components/dashboard/AlertCards';
import RecentRequests from '@/components/dashboard/RecentRequests';
import ServiceBreakdown from '@/components/dashboard/ServiceBreakdown';

export default function Dashboard() {
  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.list('-created_date', 100),
  });

  const { data: requests = [] } = useQuery({
    queryKey: ['service-requests'],
    queryFn: () => base44.entities.ServiceRequest.list('-created_date', 100),
  });

  const newLeads = requests.filter(r => r.status === 'new_lead').length;
  const toCheck = requests.filter(r => r.status === 'whatsapp_message_to_check').length;
  const inReview = requests.filter(r => r.status === 'in_review').length;
  const completed = requests.filter(r => r.status === 'completed').length;

  const stats = [
    { label: 'אנשי קשר', value: contacts.length, icon: Users, bgColor: 'bg-amber-100', iconColor: 'text-amber-700' },
    { label: 'פניות פעילות', value: requests.filter(r => r.status !== 'completed').length, icon: FileText, bgColor: 'bg-orange-100', iconColor: 'text-orange-700' },
    { label: 'בטיפול', value: inReview, icon: Clock, bgColor: 'bg-yellow-100', iconColor: 'text-yellow-700' },
    { label: 'הושלמו', value: completed, icon: CheckCircle2, bgColor: 'bg-stone-100', iconColor: 'text-stone-600' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">לוח בקרה</h1>
        <p className="text-muted-foreground text-sm mt-1">ד״ר ליאת אדרי — מערכת שירות חכמה 24/7</p>
      </div>

      <AlertCards newLeads={newLeads} toCheck={toCheck} />
      <StatsCards stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentRequests requests={requests} />
        </div>
        <ServiceBreakdown requests={requests} />
      </div>
    </div>
  );
}