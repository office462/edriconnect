import React from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  LayoutDashboard,
  Users,
  FileText,
  MessageSquare,
  FolderOpen,
  BookOpen,
  Bot,
  Settings,
  Sparkles,
  BookOpenCheck
} from 'lucide-react';

const sections = [
  {
    id: 'dashboard',
    title: 'לוח בקרה',
    icon: LayoutDashboard,
    color: 'bg-primary text-primary-foreground',
    content: `לוח הבקרה הוא המסך הראשי שנפתח כשנכנסים למערכת.\n\nכאן תמצאי סקירה מהירה של:\n• מספר אנשי הקשר במערכת\n• פניות שירות חדשות שמחכות לטיפול\n• פניות בתהליך עבודה\n• פניות שהושלמו\n• פירוט לפי סוגי שירות (ייעוץ, משפטי, הרצאות, מרפאה)\n• פניות אחרונות שנכנסו למערכת\n\n💡 טיפ: הכנסי ללוח הבקרה בתחילת כל יום כדי לראות מה מחכה לך.`
  },
  {
    id: 'contacts',
    title: 'אנשי קשר',
    icon: Users,
    color: 'bg-purple-500 text-white',
    content: `אזור ניהול אנשי הקשר שלך.\n\nכאן תוכלי:\n• לצפות בכל אנשי הקשר שנרשמו למערכת\n• לחפש איש קשר לפי שם, טלפון או אימייל\n• להוסיף איש קשר חדש ידנית\n• לערוך פרטי איש קשר קיים\n• לראות מאיפה הגיע כל איש קשר (אתר, וואטסאפ, QR)\n\n📌 חשוב: הבוט בוואטסאפ יוצר אנשי קשר חדשים אוטומטית כשמישהו פונה לראשונה. אין צורך להוסיף אותם ידנית.`
  },
  {
    id: 'service-requests',
    title: 'פניות שירות',
    icon: FileText,
    color: 'bg-emerald-500 text-white',
    content: `האזור המרכזי לניהול כל הפניות הנכנסות.\n\nסוגי שירות:\n• ייעוץ גנטי\n• חוות דעת משפטית\n• הרצאות\n• מרפאה\n• פוסט הרצאה\n\nסטטוסים של פנייה:\n• ליד חדש — פנייה שנכנסה ועדיין לא טופלה\n• ממתין — מחכה לפעולה מצד הלקוח\n• הודעת וואטסאפ לבדיקה — הבוט סימן שצריך לבדוק הודעה\n• בטיפול — התחלת לעבוד על הפנייה\n• שולם — התקבל תשלום\n• נקבע תור — נקבע מועד\n• הושלם — הטיפול הסתיים\n\nלחיצה על פנייה מציגה את כל הפרטים: מידע על איש הקשר, קבצים מצורפים, היסטוריית שינויים, ואפשרות לעדכן סטטוס ולהוסיף הערות.`
  },
  {
    id: 'lectures',
    title: 'קטלוג הרצאות',
    icon: BookOpen,
    color: 'bg-amber-500 text-white',
    content: `ניהול מאגר ההרצאות שלך.\n\nכאן תוכלי:\n• להוסיף הרצאות חדשות (סדרה, הרצאה בודדת, או סדנה)\n• לערוך פרטי הרצאה: כותרת, תיאור, משך, מחיר\n• לצרף סרטון או PDF לכל הרצאה\n• להוסיף תמונת נושא\n• לקבוע סדר הצגה\n• להפעיל או להשבית הרצאות\n\n💡 הבוט משתמש בתוכן הזה כדי לענות ללקוחות על שאלות בנושא הרצאות.`
  },
  {
    id: 'service-content',
    title: 'ניהול תוכן שירות',
    icon: FolderOpen,
    color: 'bg-cyan-500 text-white',
    content: `ניהול תכנים דיגיטליים המשויכים לשירותים השונים.\n\nסוגי תוכן:\n• סרטונים\n• קובצי PDF\n• שאלונים\n• קישורי תשלום\n• קישורים חיצוניים\n• הסכמים\n\nכל תוכן משויך לסוג שירות ספציפי. לדוגמה, סרטון \"הכנה לייעוץ\" יהיה זמין רק בתהליך ייעוץ.\n\n📌 הבוט שולח את התכנים הרלוונטיים לפונים בהתאם לסוג השירות שלהם.`
  },
  {
    id: 'bot-chat',
    title: 'בדיקת בוט',
    icon: Bot,
    color: 'bg-blue-500 text-white',
    content: `ממשק בדיקה פנימי לבוט החכם.\n\nכאן תוכלי:\n• לפתוח שיחה חדשה עם הבוט\n• לשלוח הודעות ולראות את תגובות הבוט בזמן אמת\n• לצפות בפעולות שהבוט מבצע מאחורי הקלעים (יצירת אנשי קשר, פתיחת פניות וכו׳)\n• לשמור היסטוריית שיחות לבדיקה חוזרת\n\n⚠️ שימי לב: בממשק הבדיקה רואים את הפעולות הפנימיות של הבוט. בוואטסאפ — הלקוח רואה רק את ההודעות עצמן, בלי הפעולות הטכניות.`
  },
  {
    id: 'bot-content',
    title: 'תוכן הבוט',
    icon: MessageSquare,
    color: 'bg-rose-500 text-white',
    content: `עריכת ההודעות שהבוט שולח.\n\nכאן תוכלי:\n• לערוך את הנוסח של כל הודעה שהבוט שולח\n• לצרף מדיה: סרטונים, PDF, תמונות או קישורים\n• לסנן הודעות לפי קטגוריה (כללי, ייעוץ, משפטי, הרצאות, מרפאה)\n• להפעיל או לבטל הודעות ספציפיות\n\n💡 כל שינוי שתבצעי כאן ישפיע מיידית על תגובות הבוט בוואטסאפ.`
  },
  {
    id: 'system-settings',
    title: 'הגדרות מערכת',
    icon: Settings,
    color: 'bg-gray-500 text-white',
    content: `הגדרות מתקדמות של המערכת.\n\nהגדרות מחולקות לקטגוריות:\n• הודעות וטקסטים — נוסחי הודעות מותאמים\n• תוכן — הגדרות תוכן כלליות\n• קישורים — קישורים חיצוניים חשובים\n• עיצוב ותצוגה — הגדרות תצוגה\n• הגדרות Flow — הגדרות תהליכי עבודה\n\n⚠️ אזור זה מיועד לשימוש מתקדם. שינויים כאן עשויים להשפיע על כלל המערכת.`
  },
  {
    id: 'whatsapp',
    title: 'בוט וואטסאפ — איך זה עובד?',
    icon: Sparkles,
    color: 'bg-green-500 text-white',
    content: `הבוט בוואטסאפ הוא הממשק הראשי מול הלקוחות שלך.\n\nמה הבוט עושה אוטומטית:\n• מקבל פניות חדשות ומזהה את סוג השירות המבוקש\n• יוצר איש קשר חדש אם זו פנייה ראשונה\n• פותח פנייה חדשה במערכת\n• שולח תכנים רלוונטיים (סרטונים, מסמכים, קישורי תשלום)\n• מנחה את הלקוח בתהליך\n• מסמן פניות שדורשות התייחסות שלך\n\nמה הלקוח רואה:\n• הודעות טקסט מותאמות אישית\n• סרטונים ומסמכים רלוונטיים\n• קישורי תשלום\n• הנחיות ברורות לגבי השלב הבא\n\n📌 הלקוח לא רואה את הפעולות הטכניות — רק תוכן נקי ומסודר.`
  },
];

export default function UserGuide() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Welcome banner */}
      <div className="bg-primary/10 border border-primary/20 rounded-2xl p-6 flex items-start gap-4">
        <div className="p-2.5 rounded-xl bg-primary/15 mt-0.5">
          <BookOpenCheck className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground mb-1">ברוכה הבאה למדריך למשתמשת</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            כאן תמצאי הסברים מפורטים על כל חלקי המערכת — מה עושה כל דף, אילו סטטוסים קיימים, מה משתנה אוטומטית ומה צריך לעדכן ידנית, ואיך הכל מתחבר יחד. לחצי על כל שאלה כדי לפתוח את התשובה.
          </p>
        </div>
      </div>

      {/* Accordion sections */}
      <Accordion type="single" collapsible className="space-y-3">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <AccordionItem
              key={section.id}
              value={section.id}
              className="border rounded-xl px-0 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]]:bg-muted/30">
                <div className="flex items-center gap-3 w-full">
                  <div className={`p-2 rounded-lg ${section.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-base font-semibold text-foreground">{section.title}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-5 pt-2">
                <div className="bg-muted/20 rounded-lg p-4 text-sm leading-relaxed text-foreground whitespace-pre-line">
                  {section.content}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}