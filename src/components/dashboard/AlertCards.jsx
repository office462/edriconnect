import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { UserPlus, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AlertCards({ newLeads, toCheck }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Link to="/ServiceRequests?status=new_lead">
        <Card className="hover:shadow-md transition-shadow cursor-pointer" style={{ borderRadius: '12px', borderColor: '#E0CBA5', backgroundColor: '#FDF6E3' }}>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-full" style={{ backgroundColor: '#FAD980' }}>
              <UserPlus className="w-6 h-6" style={{ color: '#5E4B35' }} />
            </div>
            <div>
              <p className="text-2xl font-bold font-body" style={{ color: '#5E4B35' }}>{newLeads}</p>
              <p className="text-sm font-body" style={{ color: '#7A6B4F' }}>לידים חדשים</p>
            </div>
          </CardContent>
        </Card>
      </Link>

      <Link to="/ServiceRequests?status=whatsapp_message_to_check">
        <Card className="hover:shadow-md transition-shadow cursor-pointer" style={{ borderRadius: '12px', borderColor: '#D29486', backgroundColor: '#FBF0ED' }}>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-full" style={{ backgroundColor: '#F2D0C9' }}>
              <MessageCircle className="w-6 h-6" style={{ color: '#8B3A2F' }} />
            </div>
            <div>
              <p className="text-2xl font-bold font-body" style={{ color: '#8B3A2F' }}>{toCheck}</p>
              <p className="text-sm font-body" style={{ color: '#A5564A' }}>הודעות לבדיקה</p>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}