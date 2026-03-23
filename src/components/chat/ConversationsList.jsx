import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, MessageCircle, Loader2, Trash2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import moment from 'moment';

export default function ConversationsList({ conversations, activeId, onSelect, onCreate, onHide, onRestoreAll, hasHidden, isLoading }) {
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
            <div
              key={conv.id}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-3 text-right border-b border-border transition-colors group",
                activeId === conv.id ? "bg-muted" : "hover:bg-muted/50"
              )}
            >
              <button
                onClick={() => onSelect(conv.id)}
                className="flex items-center gap-3 flex-1 overflow-hidden"
              >
                <MessageCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 overflow-hidden text-right">
                  <p className="text-sm font-medium truncate">{conv.metadata?.name || 'שיחה'}</p>
                  <p className="text-xs text-muted-foreground">{moment(conv.created_date).format('DD/MM HH:mm')}</p>
                </div>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onHide(conv); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10"
                title="הסתר שיחה"
              >
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </button>
            </div>
          ))
        )}
        {hasHidden && (
          <button
            onClick={onRestoreAll}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border-t border-border"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            שחזר שיחות מוסתרות
          </button>
        )}
      </div>
    </div>
  );
}