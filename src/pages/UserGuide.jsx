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
  BookOpenCheck,
  Search,
  ListChecks,
  PlusCircle,
  Eye,
  Pencil,
  BarChart3,
  Clock,
  Upload,
  Filter,
  Zap,
  Send,
  Image,
  Link as LinkIcon,
  ShieldCheck,
  Smartphone
} from 'lucide-react';

const sections = [
  {
    id: 'dashboard',
    title: 'לוח בקרה',
    icon: LayoutDashboard,
    color: 'bg-primary text-primary-foreground',
    subs: [
      {
        id: 'dashboard-what',
        title: 'מה מוצג בלוח הבקרה?',
        icon: BarChart3,
        color: 'text-primary',
        content: `לוח הבקרה הוא מסך הבית של המערכת ונותן מבט-על מהיר:\n• מספר אנשי קשר כולל\n• פניות חדשות שמחכות לטיפול\n• פניות בתהליך עבודה\n• פניות שהושלמו\n• פירוט לפי סוגי שירות (ייעוץ, משפטי, הרצאות, מרפאה)\n• רשימת פניות אחרונות שנכנסו`
      },
      {
        id: 'dashboard-tip',
        title: 'טיפ לשימוש יומיומי',
        icon: Sparkles,
        color: 'text-amber-500',
        content: `💡 הכנסי ללוח הבקרה בתחילת כל יום כדי לראות מה מחכה לך. מכאן תוכלי לזהות פניות חדשות ולהגיב מהר.`
      }
    ]
  },
  {
    id: 'contacts',
    title: 'אנשי קשר',
    icon: Users,
    color: 'bg-purple-500 text-white',
    subs: [
      {
        id: 'contacts-view',
        title: 'צפייה וחיפוש אנשי קשר',
        icon: Search,
        color: 'text-purple-500',
        content: `בדף אנשי קשר תמצאי את כל הפונים שנרשמו למערכת.\n• חיפוש לפי שם, טלפון או אימייל\n• לכל איש קשר מוצג מקור ההגעה: אתר, וואטסאפ או QR\n• לחיצה על שורה מאפשרת עריכת פרטים`
      },
      {
        id: 'contacts-add',
        title: 'הוספת איש קשר ידנית',
        icon: PlusCircle,
        color: 'text-purple-500',
        content: `ניתן להוסיף איש קשר חדש ידנית דרך כפתור "הוסף איש קשר".\n\nשדות נדרשים:\n• שם מלא (חובה)\n• טלפון\n• אימייל\n• מקור הגעה\n• הערות\n\n📌 בדרך כלל אין צורך — הבוט בוואטסאפ יוצר אנשי קשר חדשים אוטומטית כשמישהו פונה לראשונה.`
      }
    ]
  },
  {
    id: 'service-requests',
    title: 'פניות שירות',
    icon: FileText,
    color: 'bg-emerald-500 text-white',
    subs: [
      {
        id: 'sr-types',
        title: 'סוגי שירות',
        icon: ListChecks,
        color: 'text-emerald-500',
        content: `סוגי השירות הקיימים במערכת:\n• ייעוץ גנטי (consultation)\n• חוות דעת משפטית (legal)\n• הרצאות (lectures)\n• מרפאה (clinic)\n• פוסט הרצאה (post_lecture)`
      },
      {
        id: 'sr-statuses',
        title: 'סטטוסים ומשמעותם',
        icon: Filter,
        color: 'text-emerald-500',
        content: `כל פנייה עוברת בין סטטוסים:\n• ליד חדש — פנייה שנכנסה ועדיין לא טופלה\n• ממתין — מחכה לפעולה מצד הלקוח (תשלום, מסמכים...)\n• הודעת וואטסאפ לבדיקה — הבוט סימן שצריך התייחסות שלך\n• בטיפול — התחלת לעבוד על הפנייה\n• שולם — התקבל תשלום\n• נקבע תור — נקבע מועד פגישה\n• הושלם — הטיפול הסתיים`
      },
      {
        id: 'sr-detail',
        title: 'מסך פרטי פנייה',
        icon: Eye,
        color: 'text-emerald-500',
        content: `לחיצה על פנייה ברשימה מעבירה למסך מפורט שכולל:\n• פרטי איש הקשר (שם, טלפון, אימייל)\n• פרטי הפנייה (סוג שירות, סטטוס, שלב נוכחי)\n• אפשרות לשנות סטטוס ולהוסיף הערות\n• קבצים מצורפים שהועלו\n• ציר זמן (היסטוריה) של כל השינויים והפעולות`
      },
      {
        id: 'sr-create',
        title: 'יצירת פנייה חדשה ידנית',
        icon: PlusCircle,
        color: 'text-emerald-500',
        content: `ניתן ליצור פנייה ידנית דרך כפתור "פנייה חדשה":\n1. בחרי איש קשר מהרשימה\n2. בחרי סוג שירות\n3. הפנייה תיווצר בסטטוס "ליד חדש"\n\n📌 בדרך כלל הבוט יוצר פניות אוטומטית, אבל לפעמים שימושי ליצור ידנית.`
      }
    ]
  },
  {
    id: 'lectures',
    title: 'קטלוג הרצאות',
    icon: BookOpen,
    color: 'bg-amber-500 text-white',
    subs: [
      {
        id: 'lectures-types',
        title: 'סוגי הרצאות',
        icon: ListChecks,
        color: 'text-amber-500',
        content: `שלושה סוגים:\n• סדרה — מספר הרצאות ברצף\n• הרצאה בודדת — הרצאה עצמאית\n• סדנה — מפגש אינטראקטיבי`
      },
      {
        id: 'lectures-manage',
        title: 'הוספה ועריכה של הרצאות',
        icon: Pencil,
        color: 'text-amber-500',
        content: `לכל הרצאה ניתן להגדיר:\n• כותרת ותיאור\n• משך (בדקות) ומחיר\n• קישור לסרטון או PDF\n• תמונת נושא\n• שיוך לסדרה (אם רלוונטי)\n• סדר הצגה והפעלה/השבתה\n\n💡 הבוט משתמש בתוכן הזה כדי לענות ללקוחות על שאלות בנושא הרצאות.`
      }
    ]
  },
  {
    id: 'service-content',
    title: 'ניהול תוכן שירות',
    icon: FolderOpen,
    color: 'bg-cyan-500 text-white',
    subs: [
      {
        id: 'sc-types',
        title: 'סוגי תוכן',
        icon: ListChecks,
        color: 'text-cyan-500',
        content: `ניתן להוסיף את סוגי התוכן הבאים:\n• סרטונים\n• קובצי PDF\n• שאלונים\n• קישורי תשלום\n• קישורים חיצוניים\n• הסכמים`
      },
      {
        id: 'sc-usage',
        title: 'איך הבוט משתמש בתוכן?',
        icon: Zap,
        color: 'text-cyan-500',
        content: `כל תוכן משויך לסוג שירות ספציפי.\n\nלדוגמה:\n• סרטון "הכנה לייעוץ" → יוצג רק בפניות ייעוץ\n• קישור תשלום → ישלח בשלב התשלום\n• הסכם → יישלח לחתימה\n\n📌 הבוט שולח את התכנים הרלוונטיים אוטומטית לפונים בהתאם לסוג השירות שלהם.`
      }
    ]
  },
  {
    id: 'bot-chat',
    title: 'בדיקת בוט',
    icon: Bot,
    color: 'bg-blue-500 text-white',
    subs: [
      {
        id: 'bc-what',
        title: 'מה זה ממשק בדיקת הבוט?',
        icon: Eye,
        color: 'text-blue-500',
        content: `ממשק פנימי שמאפשר לך לשוחח עם הבוט ולבדוק את תגובותיו.\n\n• פתחי שיחה חדשה או המשיכי שיחה קיימת\n• שלחי הודעות ותראי תגובות בזמן אמת\n• היסטוריית שיחות נשמרת לבדיקה חוזרת`
      },
      {
        id: 'bc-actions',
        title: 'מה הפעולות הטכניות שרואים?',
        icon: Zap,
        color: 'text-blue-500',
        content: `בממשק הבדיקה רואים את הפעולות שהבוט מבצע מאחורי הקלעים:\n• read_contact — בודק אם איש הקשר קיים\n• create_contact — יוצר איש קשר חדש\n• create_servicerequest — פותח פנייה\n• update_servicerequest — מעדכן פנייה\n\n⚠️ בוואטסאפ הלקוח לא רואה את הפעולות האלה — רק הודעות טקסט נקיות.`
      }
    ]
  },
  {
    id: 'bot-content',
    title: 'תוכן הבוט',
    icon: MessageSquare,
    color: 'bg-rose-500 text-white',
    subs: [
      {
        id: 'botc-edit',
        title: 'עריכת הודעות הבוט',
        icon: Pencil,
        color: 'text-rose-500',
        content: `כאן תוכלי לערוך את כל ההודעות שהבוט שולח:\n• כותרת ותוכן כל הודעה\n• סינון לפי קטגוריה (כללי, ייעוץ, משפטי, הרצאות, מרפאה)\n• הפעלה וביטול הודעות\n\n💡 כל שינוי שתבצעי כאן ישפיע מיידית על תגובות הבוט בוואטסאפ.`
      },
      {
        id: 'botc-media',
        title: 'צירוף מדיה להודעות',
        icon: Image,
        color: 'text-rose-500',
        content: `לכל הודעה ניתן לצרף:\n• סרטון\n• קובץ PDF\n• תמונה\n• קישור חיצוני\n\nהמדיה תישלח ללקוח יחד עם ההודעה בוואטסאפ.`
      }
    ]
  },
  {
    id: 'system-settings',
    title: 'הגדרות מערכת',
    icon: Settings,
    color: 'bg-gray-500 text-white',
    subs: [
      {
        id: 'ss-categories',
        title: 'קטגוריות הגדרות',
        icon: ListChecks,
        color: 'text-gray-500',
        content: `ההגדרות מחולקות ל-5 קטגוריות:\n• הודעות וטקסטים — נוסחי הודעות מותאמים\n• תוכן — הגדרות תוכן כלליות\n• קישורים — קישורים חיצוניים חשובים\n• עיצוב ותצוגה — הגדרות תצוגה\n• הגדרות Flow — הגדרות תהליכי עבודה`
      },
      {
        id: 'ss-warning',
        title: 'מתי צריך לגעת בהגדרות?',
        icon: ShieldCheck,
        color: 'text-gray-500',
        content: `⚠️ אזור זה מיועד לשימוש מתקדם.\n\nתצטרכי לשנות הגדרות רק כאשר:\n• רוצים לעדכן קישור תשלום\n• רוצים לשנות נוסח הודעה כללית\n• צריך לעדכן קישור חיצוני\n\nאם לא בטוחה — שאלי לפני שמשנים.`
      }
    ]
  },
  {
    id: 'whatsapp',
    title: 'בוט וואטסאפ — איך זה עובד?',
    icon: Smartphone,
    color: 'bg-green-500 text-white',
    subs: [
      {
        id: 'wa-auto',
        title: 'מה הבוט עושה אוטומטית?',
        icon: Zap,
        color: 'text-green-500',
        content: `הבוט בוואטסאפ מבצע אוטומטית:\n• מקבל פניות חדשות ומזהה סוג שירות\n• יוצר איש קשר חדש אם זו פנייה ראשונה\n• פותח פנייה חדשה במערכת\n• שולח תכנים רלוונטיים (סרטונים, מסמכים, קישורי תשלום)\n• מנחה את הלקוח בתהליך\n• מסמן פניות שדורשות התייחסות שלך`
      },
      {
        id: 'wa-customer',
        title: 'מה הלקוח רואה בוואטסאפ?',
        icon: Eye,
        color: 'text-green-500',
        content: `הלקוח רואה רק:\n• הודעות טקסט מותאמות אישית\n• סרטונים ומסמכים רלוונטיים\n• קישורי תשלום\n• הנחיות ברורות לגבי השלב הבא\n\n📌 הלקוח לא רואה את הפעולות הטכניות — רק תוכן נקי ומסודר.`
      }
    ]
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

      {/* Main accordion */}
      <Accordion type="single" collapsible className="space-y-3">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <AccordionItem
              key={section.id}
              value={section.id}
              className="border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]]:bg-muted/30">
                <div className="flex items-center gap-3 w-full">
                  <div className={`p-2 rounded-lg ${section.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-base font-semibold text-foreground">{section.title}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-4 pt-1">
                <Accordion type="single" collapsible className="space-y-2">
                  {section.subs.map((sub) => {
                    const SubIcon = sub.icon;
                    return (
                      <AccordionItem
                        key={sub.id}
                        value={sub.id}
                        className="border rounded-lg overflow-hidden"
                      >
                        <AccordionTrigger className="px-4 py-3 hover:no-underline text-sm [&[data-state=open]]:bg-muted/20">
                          <div className="flex items-center gap-2.5 w-full">
                            <SubIcon className={`w-4 h-4 ${sub.color}`} />
                            <span className="font-medium text-foreground">{sub.title}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4 pt-2">
                          <div className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line pr-7">
                            {sub.content}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}