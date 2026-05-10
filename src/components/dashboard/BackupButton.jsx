import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Download, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// Agent instructions content — read from the source file at build time
import agentConfig from '@/agents/dr_adri_bot.json';

export default function BackupButton() {
  const [loading, setLoading] = useState(false);
  const [docUrl, setDocUrl] = useState(null);

  const handleBackup = async () => {
    setLoading(true);
    setDocUrl(null);
    try {
      // Build agent instructions text
      const agentText = [
        `description: ${agentConfig.description || ''}`,
        `\nmodel: ${agentConfig.model || 'automatic'}`,
        `\ninstructions:\n${agentConfig.instructions || ''}`,
        `\ntool_configs:\n${JSON.stringify(agentConfig.tool_configs || [], null, 2)}`,
        `\nmemory_config:\n${JSON.stringify(agentConfig.memory_config || {}, null, 2)}`,
      ].join('\n');

      const res = await base44.functions.invoke('backupAgentInstructions', {
        agentInstructions: agentText,
      });

      if (res.data?.docUrl) {
        setDocUrl(res.data.docUrl);
        toast.success('גיבוי נוצר בהצלחה!');
      } else {
        toast.error('שגיאה ביצירת גיבוי');
      }
    } catch (err) {
      toast.error('שגיאה: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button onClick={handleBackup} disabled={loading} variant="outline" size="sm" className="gap-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {loading ? 'מגבה...' : 'גיבוי מלא ל-Drive'}
      </Button>
      {docUrl && (
        <a href={docUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="ghost" size="sm" className="gap-1 text-primary">
            <ExternalLink className="w-3.5 h-3.5" />
            פתח גיבוי
          </Button>
        </a>
      )}
    </div>
  );
}