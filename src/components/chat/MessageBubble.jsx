import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Zap, CheckCircle2, AlertCircle, Loader2, ChevronRight, Clock } from 'lucide-react';
import { cn } from "@/lib/utils";

function FunctionDisplay({ toolCall }) {
  const [expanded, setExpanded] = useState(false);
  const name = toolCall?.name || 'Function';
  const status = toolCall?.status || 'pending';
  const results = toolCall?.results;

  const parsedResults = (() => {
    if (!results) return null;
    try { return typeof results === 'string' ? JSON.parse(results) : results; } catch { return results; }
  })();

  const isError = results && (
    (typeof results === 'string' && /error|failed/i.test(results)) ||
    (parsedResults?.success === false)
  );

  const statusConfig = {
    pending: { icon: Clock, color: 'text-muted-foreground', text: 'ממתין', spin: false },
    running: { icon: Loader2, color: 'text-primary', text: 'מריץ...', spin: true },
    in_progress: { icon: Loader2, color: 'text-primary', text: 'מריץ...', spin: true },
    completed: isError
      ? { icon: AlertCircle, color: 'text-destructive', text: 'שגיאה', spin: false }
      : { icon: CheckCircle2, color: 'text-green-600', text: 'הושלם', spin: false },
    success: { icon: CheckCircle2, color: 'text-green-600', text: 'הושלם', spin: false },
    failed: { icon: AlertCircle, color: 'text-destructive', text: 'שגיאה', spin: false },
    error: { icon: AlertCircle, color: 'text-destructive', text: 'שגיאה', spin: false },
  }[status] || { icon: Zap, color: 'text-muted-foreground', text: '', spin: false };

  const Icon = statusConfig.icon;
  const formattedName = name.split('.').reverse().join(' ').toLowerCase();

  return (
    <div className="mt-1 text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all hover:bg-muted",
          expanded ? "bg-muted border-border" : "bg-card border-border"
        )}
      >
        <Icon className={cn("h-3 w-3", statusConfig.color, statusConfig.spin && "animate-spin")} />
        <span className="text-foreground">{formattedName}</span>
        {statusConfig.text && <span className={cn("text-muted-foreground", isError && "text-destructive")}>• {statusConfig.text}</span>}
        {!statusConfig.spin && (toolCall.arguments_string || results) && (
          <ChevronRight className={cn("h-3 w-3 text-muted-foreground transition-transform mr-auto", expanded && "rotate-90")} />
        )}
      </button>
      {expanded && !statusConfig.spin && (
        <div className="mt-1.5 mr-3 pr-3 border-r-2 border-border space-y-2">
          {toolCall.arguments_string && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">פרמטרים:</div>
              <pre className="bg-muted rounded-md p-2 text-xs text-foreground whitespace-pre-wrap" dir="ltr">
                {(() => { try { return JSON.stringify(JSON.parse(toolCall.arguments_string), null, 2); } catch { return toolCall.arguments_string; } })()}
              </pre>
            </div>
          )}
          {parsedResults && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">תוצאה:</div>
              <pre className="bg-muted rounded-md p-2 text-xs text-foreground whitespace-pre-wrap max-h-48 overflow-auto" dir="ltr">
                {typeof parsedResults === 'object' ? JSON.stringify(parsedResults, null, 2) : parsedResults}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn("flex gap-3", isUser ? "justify-start" : "justify-end")}>
      <div className={cn("max-w-[85%]", isUser && "flex flex-col items-start")}>
        {message.content && (
          <div className={cn(
            "rounded-2xl px-4 py-2.5",
            isUser ? "bg-primary text-primary-foreground" : "bg-card border border-border"
          )}>
            {isUser ? (
              <p className="text-sm leading-relaxed">{message.content}</p>
            ) : (
              <ReactMarkdown
                className="text-sm prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                components={{
                  p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="my-1 mr-4 list-disc">{children}</ul>,
                  ol: ({ children }) => <ol className="my-1 mr-4 list-decimal">{children}</ol>,
                  li: ({ children }) => <li className="my-0.5">{children}</li>,
                  a: ({ children, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-primary underline">{children}</a>,
                  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
          </div>
        )}
        {message.tool_calls?.length > 0 && (
          <div className="space-y-1">
            {message.tool_calls.map((tc, idx) => <FunctionDisplay key={idx} toolCall={tc} />)}
          </div>
        )}
      </div>
      {!isUser && (
        <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center mt-0.5 flex-shrink-0">
          <span className="text-xs text-primary-foreground font-bold">ד״ר</span>
        </div>
      )}
    </div>
  );
}