import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, MessageCircle, Loader2, EyeOff, RotateCcw, CheckSquare } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import moment from 'moment';

export default function ConversationsList({ conversations, activeId, onSelect, onCreate, onHide, onHideBulk, onRestoreAll, hasHidden, isLoading }) {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleBulkHide = () => {
    if (onHideBulk) onHideBulk(selectedIds);
    setSelectedIds([]);
    setSelectMode(false);
  };

  return (
    <div className="w-full h-full flex flex-col border-l border-border bg-card">
      <div className="p-3 border-b border-border space-y-2">
        <Button onClick={onCreate} className="w-full gap-2" size="sm">
          <Plus className="w-4 h-4" />
          שיחה חדשה
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant={selectMode ? "secondary" : "ghost"}
            size="sm"
            className="flex-1 gap-1 text-xs h-7"
            onClick={() => { setSelectMode(!selectMode); setSelectedIds([]); }}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            {selectMode ? 'בטל בחירה' : 'בחר להסתרה'}
          </Button>
          {selectMode && selectedIds.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-1 text-xs h-7"
              onClick={handleBulkHide}
            >
              <EyeOff className="w-3.5 h-3.5" />
              הסתר ({selectedIds.length})
            </Button>
          )}
        </div>
        {!selectMode && conversations.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-1 text-xs h-7 text-muted-foreground"
            onClick={() => { if (onHideBulk) onHideBulk(conversations.map(c => c.id)); }}
          >
            <EyeOff className="w-3.5 h-3.5" />
            הסתר הכל
          </Button>
        )}
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
              {selectMode && (
                <Checkbox
                  checked={selectedIds.includes(conv.id)}
                  onCheckedChange={() => toggleSelect(conv.id)}
                  className="flex-shrink-0"
                />
              )}
              <button
                onClick={() => selectMode ? toggleSelect(conv.id) : onSelect(conv.id)}
                className="flex items-center gap-3 flex-1 overflow-hidden"
              >
                {!selectMode && <MessageCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                <div className="flex-1 overflow-hidden text-right">
                  <p className="text-sm font-medium truncate">{conv.metadata?.name || 'שיחה'}</p>
                  <p className="text-xs text-muted-foreground">{(() => {
                    let d = conv.created_date;
                    if (d && typeof d === 'string' && !d.endsWith('Z') && !d.includes('+')) d = d + 'Z';
                    return new Date(d).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                  })()}</p>
                </div>
              </button>
              {!selectMode && (
                <button
                  onClick={(e) => { e.stopPropagation(); onHide(conv); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10"
                  title="הסתר שיחה"
                >
                  <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              )}
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