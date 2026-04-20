import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Smile } from 'lucide-react';

const emojiCategories = [
  { label: 'נפוצים', emojis: ['😊', '🙏', '❤️', '✅', '⚠️', '📋', '💳', '📧', '📞', '🎉', '👍', '😄', '🌸', '💡', '🔔', '⭐', '🎯', '✨', '💪', '🤗'] },
  { label: 'ידיים', emojis: ['👋', '🤝', '👏', '🙌', '✋', '🤞', '✌️', '🤟', '🤙', '👆', '👇', '👈', '👉', '☝️', '👊', '🫶', '❤️‍🩹', '💕', '💖', '💗'] },
  { label: 'פנים', emojis: ['😀', '😃', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😍', '🥰', '😘', '😇', '🤔', '😐', '😮', '😢', '😭', '😤', '🥺'] },
  { label: 'סמלים', emojis: ['✅', '❌', '⭕', '❗', '❓', '⚡', '🔥', '💯', '🏆', '🎖️', '📌', '📍', '🗺️', '🕐', '📅', '📎', '🔗', '📝', '📊', '🎁'] },
  { label: 'טבע', emojis: ['🌸', '🌺', '🌻', '🌹', '🌷', '🌿', '🍀', '🌈', '☀️', '🌙', '⭐', '🦋', '🐝', '🌊', '🔆', '🌱', '💐', '🍃', '🌾', '🏵️'] },
];

export default function EmojiPicker({ onSelect }) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0">
          <Smile className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <div className="flex gap-1 mb-2 flex-wrap">
          {emojiCategories.map((cat, i) => (
            <Button
              key={cat.label}
              type="button"
              variant={activeTab === i ? 'default' : 'ghost'}
              size="sm"
              className="text-xs h-7 px-2"
              onClick={() => setActiveTab(i)}
            >
              {cat.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-8 gap-1 max-h-40 overflow-y-auto">
          {emojiCategories[activeTab].emojis.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="text-xl hover:bg-muted rounded p-1 cursor-pointer text-center leading-none"
              onClick={() => onSelect(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}