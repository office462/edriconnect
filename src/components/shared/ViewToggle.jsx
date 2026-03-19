import React from 'react';
import { Button } from '@/components/ui/button';
import { LayoutGrid, List } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ViewToggle({ view, onChange }) {
  return (
    <div className="flex border rounded-lg overflow-hidden">
      <Button
        variant="ghost"
        size="sm"
        className={cn("rounded-none px-2.5", view === 'table' && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}
        onClick={() => onChange('table')}
      >
        <List className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn("rounded-none px-2.5", view === 'cards' && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}
        onClick={() => onChange('cards')}
      >
        <LayoutGrid className="w-4 h-4" />
      </Button>
    </div>
  );
}