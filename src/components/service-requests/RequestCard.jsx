import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import StatusBadge from '@/components/shared/StatusBadge';
import ServiceTypeBadge from '@/components/shared/ServiceTypeBadge';
import { Pencil, Trash2, Phone, User } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

export default function RequestCard({ request, selected, onSelect, onEdit, onDelete }) {
  return (
    <Card className="hover:shadow-md transition-shadow group relative" style={{ borderRadius: '12px' }}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={selected}
            onCheckedChange={() => onSelect(request.id)}
            className="mt-1"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <Link to={`/ServiceRequestDetail?id=${request.id}`} className="hover:text-primary">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-primary" />
                  <span className="text-sm font-bold">{request.contact_name || 'לא ידוע'}</span>
                </div>
              </Link>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onEdit(request); }}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(request); }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            {request.contact_phone && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                <Phone className="w-3 h-3" /> {request.contact_phone}
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <ServiceTypeBadge type={request.service_type} />
              <StatusBadge status={request.status} />
            </div>
            {request.current_step && (
              <p className="text-xs text-muted-foreground">שלב: {request.current_step}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {request.created_date ? format(new Date(request.created_date), 'dd/MM/yy HH:mm') : ''}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}