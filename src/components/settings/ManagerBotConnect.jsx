import React from 'react';
import { base44 } from '@/api/base44Client';
import { Bot, MessageCircle } from 'lucide-react';

export default function ManagerBotConnect() {
  const whatsappURL = base44.agents.getWhatsAppConnectURL('manager_bot');

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Bot className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h3 className="font-bold text-lg">סוכן ניהול בוואטסאפ</h3>
          <p className="text-sm text-muted-foreground mt-1">
            סוכן AI שמאפשר לבצע כל פעולה במערכת ישירות מהווטסאפ — להוסיף ולעדכן אנשי קשר,
            פניות שירות, הרצאות, תוכן שירות והודעות בוט, לטפל בהגדרות, ולקרוא נתונים וסטטיסטיקות.
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
        <p className="text-sm font-medium">חיבור החשבון לוואטסאפ:</p>
        <a
          href={whatsappURL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
        >
          <MessageCircle className="w-5 h-5" />
          התחבר לסוכן הניהול בוואטסאפ
        </a>
        <p className="text-xs text-muted-foreground leading-relaxed">
          לחיצה על הכפתור פותחת שיחת וואטסאפ עם הסוכן. רק משתמשות אדמין מורשות
          (עינת גן אל וליאת אדרי) יוכלו להשתמש בו. אם הסוכן לא בטוח במשהו — הוא ישאל שאלת הבהרה
          לפני שיבצע.
        </p>
      </div>
    </div>
  );
}