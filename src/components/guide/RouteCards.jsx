import React from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Stethoscope, Scale, Building2, GraduationCap, QrCode, ArrowDown, Settings2, MessageSquareText } from 'lucide-react';

const routeCards = [
  {
    id: 'route-consultation',
    title: 'כרטיס 1 — ייעוץ גנטי',
    icon: Stethoscope,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 border-blue-200',
    content: `🔀 שני נתיבים:
• נתיב 1 — אוטיזם ותסמונות גנטיות
• נתיב 2 — מחלות כרוניות (~8 אפשרויות: פוריות, הריון, גיל המעבר, סוכרת, דיכאון, מחלות מעי, סרטן, אוטיזם)

כל האפשרויות עוברות באותו מסלול (סרטון → צפיתי → חומר נוסף → סודיות → שאלון → תשלום → תורים).

📋 דוגמה — מסלול "סוכרת":
שלב 1: סרטון כללי → "צפיתי"
שלב 2: בחירת סוגיה → "2" (מחלות כרוניות) → "סוכרת"
שלב 3: סרטון + PDF סוכרת → "צפיתי וקראתי"
שלב 4: חומר נוסף → כן/לא
שלב 5: סודיות → "כן"
שלב 6: שאלון (בלי תשלום!)
שלב 7: (אוטומטי) תשלום אחרי שאלון
שלב 8: (אוטומטי) תורים משורשרים (ווצאפ → ייעוץ מלא)

📦 מודולים רלוונטיים:
• תוכן הבוט — סנני "ייעוץ" (הודעות: greeting, welcome, סרטון, סודיות, שאלון, תשלום...)
• ניהול תוכן — סנני "ייעוץ" (סרטונים לפי sub_type, PDF לפי sub_type, שאלון, קישור תשלום)`
  },
  {
    id: 'route-legal',
    title: 'כרטיס 2 — חוות דעת משפטית',
    icon: Scale,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50 border-violet-200',
    content: `⚠️ אין שאלון! אין מחירון!

📋 המסלול:
שלב 1: הסבר על השירות → "מעוניינת"
שלב 1.5: חומר נוסף לקריאה → כן/לא
שלב 2: הסכם (PDF) → "קראתי"
שלב 3: תשלום (Paybox + ברקוד Bit) → "שילמתי"
שלב 4: (אוטומטי) סודיות + בקשת מסמכים למייל
שלב 5: "שלחתי מסמכים"
שלב 7: תיאום פגישה (קישור יומן) → "קבעתי"
שלב 7.5: (אוטומטי) הנחיות הגעה + תמונת מקום

📦 מודולים רלוונטיים:
• תוכן הבוט — סנני "משפטי" (הודעות: הסבר, הסכם, תשלום, סודיות, מסמכים, פגישה)
• ניהול תוכן — סנני "משפטי" (הסכם PDF, קישור תשלום, קישור יומן, כתובת מייל)`
  },
  {
    id: 'route-clinic',
    title: 'כרטיס 3 — קליניקה (השכרת חדרים)',
    icon: Building2,
    color: 'text-teal-600',
    bgColor: 'bg-teal-50 border-teal-200',
    content: `🔀 שני נתיבים:

--- שוכר ותיק ---
שלב 1: בחירת ותיק/חדש → "1"
שלב 2: מחירון (הודעת טקסט) → "קראתי"
שלב 3: תיאום הגעה → "קבעתי"
שלב 4: (אוטומטי) הנחיות הגעה

--- מתעניין חדש ---
שלב 1: בחירת ותיק/חדש → "2"
שלב 2: בחירת סוג חדר (1=שיחה, 2=טיפול, 3=רופא)
שלב 3: תמונה + סרטון של החדר → "צפיתי"
שלב 4: מידע כללי + מחירון → "קראתי"
שלב 5: תיאום הגעה → "קבעתי"
שלב 6: (אוטומטי) הנחיות הגעה

📦 מודולים רלוונטיים:
• תוכן הבוט — סנני "קליניקה" (הודעות: ברוכים הבאים, בחירת חדר, מידע, מחירון)
• ניהול תוכן — סנני "קליניקה" (תמונות חדרים לפי sub_type, סרטונים לפי sub_type, קישור יומן)`
  },
  {
    id: 'route-lectures',
    title: 'כרטיס 4 — הרצאות',
    icon: GraduationCap,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 border-amber-200',
    content: `🔀 שלושה סוגים:

━━━ סדרת הרצאות (אפשרות 1) ━━━
שלב 1: קישור לדף הסדרה → "קראתי"
שלב 2: תיאום פגישה (קישור יומן) → "קבעתי"
שלב 3: (אוטומטי) הנחיות הגעה

━━━ הרצאה בודדת (אפשרות 2) ━━━
דוגמה: "האנטומיה של אושר"
שלב 1: רשימת הרצאות → בחירת מספר
שלב 2: סרטון + PDF של ההרצאה → "קראתי"
שלב 3: תיאום פגישה (קישור יומן) → "קבעתי"
שלב 4: (אוטומטי) הנחיות הגעה

━━━ סדנת ביופידבק (אפשרות 3) ━━━
שלב 1: סרטון + PDF של הסדנה → "צפיתי וקראתי"
שלב 2: תיאום פגישה (קישור יומן) → "קבעתי"
שלב 3: (אוטומטי) הנחיות הגעה

📦 מודולים רלוונטיים:
• תוכן הבוט — סנני "הרצאות" (הודעות: ברוכים הבאים, רשימת הרצאות בודדות, תיאום)
• ניהול תוכן — סנני "הרצאות" (קישור דף סדרה, קישורי יומן לפי sub_type)
• קטלוג הרצאות — הרצאות בודדות (PDF + סרטון), סדנאות (PDF + סרטון)`
  },
  {
    id: 'route-post-lecture',
    title: 'כרטיס 5 — אחרי הרצאה (QR)',
    icon: QrCode,
    color: 'text-rose-600',
    bgColor: 'bg-rose-50 border-rose-200',
    content: `⚡ מופעל כשמשתתף סורק QR בסוף הרצאה

📋 המסלול:
שלב 1: איסוף פרטים (שם + טלפון + מייל)
שלב 2: שליחת PDF סיכום (לפי שם ההרצאה) → "קראתי"
שלב 3: הצעת ספר → "הזמנתי" / "המשך"
שלב 4: הצעת הרצאות נוספות → "כן" / "לא"
שלב 5: כן → מעבר למסלול הרצאות / לא → סיום

📦 מודולים רלוונטיים:
• תוכן הבוט — סנני "פוסט הרצאה" (הודעות: ברוכים הבאים, PDF נשלח, הצעת ספר, הרצאות נוספות)
• ניהול תוכן — סנני "פוסט הרצאה" (PDF סיכום לפי sub_type=שם ההרצאה, קישור ספר, קישור ביקורת גוגל)

💡 ה-QR נמצא בניהול תוכן → כרטיס QR (בתחתית העמוד)`
  }
];

export default function RouteCards() {
  return (
    <div className="space-y-3">
      <div className="bg-primary/5 border border-primary/15 rounded-lg p-3 mb-2">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong>💡 כל כרטיס מציג:</strong> את שלבי המסלול בבוט + באילו מודולים במערכת לערוך את התוכן של כל שלב.
          <br />
          <strong>כלל אצבע:</strong> טקסט הודעה → תוכן הבוט | קישור/קובץ → ניהול תוכן | הרצאה ספציפית → קטלוג הרצאות
        </p>
      </div>
      <Accordion type="single" collapsible className="space-y-2">
        {routeCards.map((card) => {
          const Icon = card.icon;
          return (
            <AccordionItem
              key={card.id}
              value={card.id}
              className={`border rounded-lg overflow-hidden ${card.bgColor}`}
            >
              <AccordionTrigger className="px-4 py-3 hover:no-underline text-sm">
                <div className="flex items-center gap-2.5 w-full">
                  <Icon className={`w-4 h-4 ${card.color}`} />
                  <span className={`font-semibold ${card.color}`}>{card.title}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 pt-2">
                <div className="text-sm leading-relaxed text-foreground/80 whitespace-pre-line pr-2 bg-white/60 rounded-lg p-3">
                  {card.content}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}