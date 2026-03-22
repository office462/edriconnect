import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, MessageCircle, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AlertCards({ newLeads, toCheck }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Link to="/ServiceRequests?status=new_lead">
        <Card className="border-blue-200 bg-blue-50/50 hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-full bg-blue-100">
              <UserPlus className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-700">{newLeads}</p>
              <p className="text-sm text-blue-600">לידים חדשים</p>
            </div>
          </CardContent>
        </Card>
      </Link>

      <Link to="/ServiceRequests?status=whatsapp_message_to_check">
        <Card className="border-red-200 bg-red-50/50 hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-full bg-red-100">
              <MessageCircle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-700">{toCheck}</p>
              <p className="text-sm text-red-600">הודעות לבדיקה</p>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}