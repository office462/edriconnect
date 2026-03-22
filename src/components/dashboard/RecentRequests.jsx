import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusBadge from '@/components/shared/StatusBadge';
import ServiceTypeBadge from '@/components/shared/ServiceTypeBadge';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ExternalLink } from 'lucide-react';

export default function RecentRequests({ requests }) {
  return (
    <Card style={{ borderRadius: '12px' }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">פניות אחרונות</CardTitle>
          <Link to="/ServiceRequests" className="text-sm text-primary hover:underline flex items-center gap-1">
            הצג הכל
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">שם</TableHead>
              <TableHead className="text-right">סוג שירות</TableHead>
              <TableHead className="text-right">סטטוס</TableHead>
              <TableHead className="text-right">תאריך</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  אין פניות עדיין
                </TableCell>
              </TableRow>
            ) : (
              requests.slice(0, 8).map((req) => (
                <TableRow key={req.id} className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <TableCell>
                    <Link to={`/ServiceRequestDetail?id=${req.id}`} className="font-medium text-foreground hover:text-primary">
                      {req.contact_name || 'לא ידוע'}
                    </Link>
                  </TableCell>
                  <TableCell><ServiceTypeBadge type={req.service_type} /></TableCell>
                  <TableCell><StatusBadge status={req.status} /></TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {req.created_date ? format(new Date(req.created_date), 'dd/MM/yy HH:mm') : '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}