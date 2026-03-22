import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { UserPlus, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AlertCards({ newLeads, toCheck }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Link to="/ServiceRequests?status=new_lead">
        <Card className="border-yellow-200 bg-yellow-50/50 hover:shadow-md transition-shadow cursor-pointer" style={{ borderRadius: '12px' }}>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-full bg-yellow-100">
              <UserPlus className="w-6 h-6 text-yellow-700" />
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-700 font-body">{newLeads}</p>
              <p className="text-sm text-yellow-600 font-body">לידים חדשים</p>
            </div>
          </CardContent>
        </Card>
      </Link>

      <Link to="/ServiceRequests?status=whatsapp_message_to_check">
        <Card className="border-rose-200 bg-rose-50/50 hover:shadow-md transition-shadow cursor-pointer" style={{ borderRadius: '12px' }}>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-full bg-rose-100">
              <MessageCircle className="w-6 h-6 text-rose-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-rose-700 font-body">{toCheck}</p>
              <p className="text-sm text-rose-600 font-body">הודעות לבדיקה</p>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}