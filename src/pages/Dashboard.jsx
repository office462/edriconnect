import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Users, FileText, Clock, CheckCircle2 } from 'lucide-react';
import StatsCards from '@/components/dashboard/StatsCards';
import AlertCards from '@/components/dashboard/AlertCards';
import RecentRequests from '@/components/dashboard/RecentRequests';
import ServiceBreakdown from '@/components/dashboard/ServiceBreakdown';
import PostLectureQR from '@/components/dashboard/PostLectureQR';

export default function Dashboard() {
  const [hideTests, setHideTests] = useState(() => localStorage.getItem('hide_tests') !== 'false');

  const toggleHideTests = () => {
    setHideTests(prev => {
      localStorage.setItem('hide_tests', !prev ? 'true' : 'false');
      return !prev;
    });
  };

  const { data: allContacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => base44.entities.Contact.list('-created_date', 100),
  });

  const { data: allRequests = [] } = useQuery({
    queryKey: ['service-requests'],
    queryFn: () => base44.entities.ServiceRequest.list('-created_date', 100),
  });

  const contacts = hideTests ? allContacts.filter(c => !c.is_test) : allContacts;
  const requests = hideTests ? allRequests.filter(r => !r.is_test) : allRequests;

  const newLeads = requests.filter(r => r.status === 'new_lead').length;
  const toCheck = requests.filter(r => r.status === 'whatsapp_message_to_check').length;
  const inReview = requests.filter(r => r.status === 'in_review').length;
  const completed = requests.filter(r => r.status === 'completed').length;

  const stats = [
    { label: 'אנשי קשר', value: contacts.length, icon: Users, bgStyle: { backgroundColor: '#E8D5E8' }, iconStyle: { color: '#6D436D' } },
    { label: 'פניות פעילות', value: requests.filter(r => r.status !== 'completed').length, icon: FileText, bgStyle: { backgroundColor: '#F2D0C9' }, iconStyle: { color: '#8B3A2F' } },
    { label: 'בטיפול', value: inReview, icon: Clock, bgStyle: { backgroundColor: '#FAD980' }, iconStyle: { color: '#5E4B35' } },
    { label: 'הושלמו', value: completed, icon: CheckCircle2, bgStyle: { backgroundColor: '#D5E8D5' }, iconStyle: { color: '#3A6B3A' } },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">לוח בקרה</h1>
          <p className="text-muted-foreground text-sm mt-1 font-body">ד״ר ליאת אדרי — מערכת שירות חכמה 24/7</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <input type="checkbox" checked={hideTests} onChange={toggleHideTests} className="rounded border-border" />
          הסתר בדיקות
        </label>
      </div>

      <AlertCards newLeads={newLeads} toCheck={toCheck} />
      <StatsCards stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="lg:col-span-2">
          <RecentRequests requests={requests} />
        </div>
        <div className="space-y-4 md:space-y-6">
          <ServiceBreakdown requests={requests} />
          <PostLectureQR />
        </div>
      </div>
    </div>
  );
}