import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, MessageCircle, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AlertCards({ newLeads, toCheck }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Link to="/ServiceRequests?status=new_lead">
        <Card className="border-amber-200 bg-amber-50/50 hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-100">
              <UserPlus className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-800">{newLeads}</p>
              <p className="text-sm text-amber-600">לידים חדשים</p>
            </div>
          </CardContent>
        </Card>
      </Link>

      <Link to="/ServiceRequests?status=whatsapp_message_to_check">
        <Card className="border-rose-200 bg-rose-50/50 hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-rose-100">
              <MessageCircle className="w-5 h-5 text-rose-700" />
            </div>
            <div>
              <p className="text-2xl font-bold text-rose-800">{toCheck}</p>
              <p className="text-sm text-rose-600">הודעות לבדיקה</p>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}