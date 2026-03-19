import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, MessageCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import moment from 'moment';

export default function ConversationsList({ conversations, activeId, onSelect, onCreate, isLoading }) {
  return (
    <div className="w-full h-full flex flex-col border-l border-border bg-card">
      <div className="p-3 border-b border-border">
        <Button onClick={onCreate} className="w-full gap-2" size="sm">
          <Plus className="w-4 h-4" />
          שיחה חדשה
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center p-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center p-4">אין שיחות עדיין</p>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-3 text-right border-b border-border transition-colors",
                activeId === conv.id ? "bg-muted" : "hover:bg-muted/50"
              )}
            >
              <MessageCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium truncate">{conv.metadata?.name || 'שיחה'}</p>
                <p className="text-xs text-muted-foreground">{moment(conv.created_date).format('DD/MM HH:mm')}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}