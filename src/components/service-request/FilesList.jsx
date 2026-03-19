import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, Image, File, ExternalLink, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const fileTypeIcon = (type) => {
  if (type === 'image') return Image;
  if (type === 'pdf' || type === 'doc' || type === 'docx') return FileText;
  return File;
};

export default function FilesList({ serviceRequestId }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: files = [] } = useQuery({
    queryKey: ['request-files', serviceRequestId],
    queryFn: () => base44.entities.ServiceRequestFile.filter({ service_request_id: serviceRequestId }, '-created_date', 50),
    enabled: !!serviceRequestId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      setUploading(true);
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const ext = file.name.split('.').pop().toLowerCase();
      let file_type = 'other';
      if (['pdf'].includes(ext)) file_type = 'pdf';
      else if (['doc', 'docx'].includes(ext)) file_type = ext;
      else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) file_type = 'image';

      await base44.entities.ServiceRequestFile.create({
        service_request_id: serviceRequestId,
        file_name: file.name,
        file_url,
        file_type,
        uploaded_by: 'admin',
      });

      // Log to timeline
      await base44.entities.ServiceRequestTimeline.create({
        service_request_id: serviceRequestId,
        event_type: 'file_received',
        description: `קובץ הועלה: ${file.name}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request-files', serviceRequestId] });
      queryClient.invalidateQueries({ queryKey: ['timeline', serviceRequestId] });
      setUploading(false);
      toast.success('הקובץ הועלה');
    },
    onError: () => setUploading(false),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ServiceRequestFile.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request-files', serviceRequestId] });
      toast.success('נמחק');
    },
  });

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-lg">קבצים מצורפים</CardTitle>
        <div>
          <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-1">
            <Upload className="w-3.5 h-3.5" /> {uploading ? 'מעלה...' : 'העלה קובץ'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">אין קבצים</p>
        ) : (
          <div className="space-y-2">
            {files.map((file) => {
              const Icon = fileTypeIcon(file.file_type);
              return (
                <div key={file.id} className="flex items-center gap-3 p-2 border rounded-lg hover:bg-muted/30">
                  <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.file_name}</p>
                    <div className="flex gap-2 mt-0.5">
                      <Badge variant="outline" className="text-xs">{file.file_type}</Badge>
                      <Badge variant="secondary" className="text-xs">{file.uploaded_by === 'admin' ? 'אדמין' : 'משתמש'}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" asChild>
                      <a href={file.file_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5" /></a>
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(file.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}