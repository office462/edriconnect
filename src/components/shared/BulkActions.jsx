import React from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, X } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export default function BulkActions({ selectedCount, onDelete, onClear }) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2">
      <span className="text-sm font-medium">{selectedCount} נבחרו</span>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm" className="gap-1.5">
            <Trash2 className="w-3.5 h-3.5" /> מחק נבחרים
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת {selectedCount} פריטים</AlertDialogTitle>
            <AlertDialogDescription>פעולה זו לא ניתנת לביטול. האם להמשיך?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">מחק</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Button variant="ghost" size="sm" onClick={onClear} className="gap-1">
        <X className="w-3.5 h-3.5" /> בטל בחירה
      </Button>
    </div>
  );
}