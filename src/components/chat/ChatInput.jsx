import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Loader2 } from 'lucide-react';

export default function ChatInput({ onSend, disabled }) {
  const [text, setText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 p-4 border-t border-border bg-card">
      <Button type="submit" disabled={disabled || !text.trim()} size="icon" className="flex-shrink-0">
        {disabled ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
      </Button>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="כתבי הודעה..."
        disabled={disabled}
        className="flex-1 bg-transparent border border-input rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </form>
  );
}