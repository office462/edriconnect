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
  Filter,
  Zap,
  Image,
  ShieldCheck,
  Smartphone
} from 'lucide-react';

const sections = [
  {
    id: 'overview',
    title: 'איך הכל מתחבר יחד?',
    icon: Sparkles,
    color: 'bg-primary text-primary-foreground',
    subs: [
      {
        id: 'overview-flow',
        title: 'התמונה המלאה',
        icon: Zap,
        color: 'text-primary',
        content: `המערכת בנויה סביב בוט וואטסאפ חכם שמנהל שיחות עם פונים. הבוט שולף תוכן מ-3 מקומות במערכת:

① תוכן הבוט (הודעות) — הטקסטים שהבוט שולח ("אישור תשלום", "הנחיות הגעה", "בקשת מסמכים" וכו׳)
② ניהול תוכן (קישורים) — קישורי תשלום, סרטונים, שאלונים, הסכמים ו-PDF
③ הגדרות מערכת — קישורים טכניים (מייל, Cal.com) והגדרות נוספות

💡 העיקרון: כל דבר שהבוט שולח לפונה — כל טקסט, כל קישור, כל הנחיה — ניתן לעריכה דרך הממשקים האלה בלי לגעת בקוד.`
      },
      {
        id: 'overview-map',
        title: 'מפת המערכת — מה בכל עמוד',
        icon: BookOpenCheck,
        color: 'text-primary',
        content: `🟣 תוכן הבוט = ההודעות שהבוט שולח לפונים (מסוננות לפי מסלול ושלב)
🟢 ניהול תוכן = קישורים וקבצים שהבוט שולח (תשלום, סרטונים, שאלונים, הסכמים)
⚪ הגדרות מערכת = קישורים טכניים והגדרות שלא קשורות ישירות לתוכן
📒 קטלוג הרצאות = רשימת הרצאות שהבוט מציג לפונים
📝 פניות שירות = מעקב אחרי כל פונה (סטטוסים, קבצים, תורים)
🤖 בדיקת בוט = לבדוק את הבוט לפני שפונה אמיתית`
      }
    ]
  },
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
        content: `לוח הבקרה הוא מסך הבית של המערכת ונותן מבט-על מהיר:
• מספר אנשי קשר כולל
• פניות חדשות שמחכות לטיפול
• פניות בתהליך עבודה
• פניות שהושלמו
• פירוט לפי סוגי שירות (ייעוץ, משפטי, הרצאות, מרפאה)
• רשימת פניות אחרונות שנכנסו`
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
        content: `בדף אנשי קשר תמצאי את כל הפונים שנרשמו למערכת.
• חיפוש לפי שם, טלפון או אימייל
• לכל איש קשר מוצג מקור ההגעה: אתר, וואטסאפ או QR
• לחיצה על שורה מאפשרת עריכת פרטים`
      },
      {
        id: 'contacts-add',
        title: 'הוספת איש קשר ידנית',
        icon: PlusCircle,
        color: 'text-purple-500',
        content: `ניתן להוסיף איש קשר חדש ידנית דרך כפתור "הוסף איש קשר".

שדות נדרשים:
• שם מלא (חובה)
• טלפון
• אימייל
• מקור הגעה
• הערות

📌 בדרך כלל אין צורך — הבוט בוואטסאפ יוצר אנשי קשר חדשים אוטומטית כשמישהו פונה לראשונה.`
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
        content: `סוגי השירות הקיימים במערכת:
• ייעוץ גנטי (consultation)
• חוות דעת משפטית (legal)
• הרצאות (lectures)
• מרפאה (clinic)
• פוסט הרצאה (post_lecture)`
      },
      {
        id: 'sr-statuses',
        title: 'סטטוסים ומשמעותם',
        icon: Filter,
        color: 'text-emerald-500',
        content: `כל פנייה עוברת בין סטטוסים:
• ליד חדש — פנייה שנכנסה ועדיין לא טופלה
• ממתין — מחכה לפעולה מצד הלקוח (תשלום, מסמכים...)
• הודעת וואטסאפ לבדיקה — הבוט סימן שצריך התייחסות שלך
• בטיפול — התחלת לעבוד על הפנייה
• שולם — התקבל תשלום
• נקבע תור — נקבע מועד פגישה
• הושלם — הטיפול הסתיים

⚠️ שינוי סטטוס ל"שולם" מפעיל אוטומטית שליחת הודעות בוט לפונה (אישור תשלום, הנחיות הגעה וכו׳).`
      },
      {
        id: 'sr-detail',
        title: 'מסך פרטי פנייה',
        icon: Eye,
        color: 'text-emerald-500',
        content: `לחיצה על פנייה ברשימה מעבירה למסך מפורט שכולל:
• פרטי איש הקשר (שם, טלפון, אימייל)
• פרטי הפנייה (סוג שירות, סטטוס, שלב נוכחי)
• אפשרות לשנות סטטוס ולהוסיף הערות
• קבצים מצורפים שהועלו
• ציר זמן (היסטוריה) של כל השינויים והפעולות`
      },
      {
        id: 'sr-create',
        title: 'יצירת פנייה חדשה ידנית',
        icon: PlusCircle,
        color: 'text-emerald-500',
        content: `ניתן ליצור פנייה ידנית דרך כפתור "פנייה חדשה":
1. בחרי איש קשר מהרשימה
2. בחרי סוג שירות
3. הפנייה תיווצר בסטטוס "ליד חדש"

📌 בדרך כלל הבוט יוצר פניות אוטומטית, אבל לפעמים שימושי ליצור ידנית.`
      }
    ]
  },
  {
    id: 'bot-content',
    title: '🟣 תוכן הבוט (הודעות)',
    icon: MessageSquare,
    color: 'bg-rose-500 text-white',
    subs: [
      {
        id: 'botc-what',
        title: 'מה זה תוכן הבוט?',
        icon: Eye,
        color: 'text-rose-500',
        content: `זה המקום המרכזי לניהול כל ההודעות שהבוט שולח לפונים בוואטסאפ.

כל הודעה כאן משויכת למסלול שירות ולשלב בתהליך, כך שתוכלי למצוא במהירות את ההודעה הנכונה לפי מסלול (ייעוץ/משפטי/הרצאות וכו׳) ושלב.

💡 שינוי תוכן כאן ישפיע מיידית על מה שהבוט שולח בוואטסאפ!`
      },
      {
        id: 'botc-examples',
        title: 'דוגמאות להודעות שכאן',
        icon: ListChecks,
        color: 'text-rose-500',
        content: `ההודעות החשובות שמנוהלות כאן:

מסלול ייעוץ:
• "אישור תשלום" — נשלחת אחרי שאושר תשלום
• "שאלון הושלם" — נשלחת אחרי מילוי שאלון

מסלול משפטי:
• "הסכמת פרטיות" — הודעת סודיות רפואית
• "בקשת מסמכים" — הנחיות אילו מסמכים לשלוח
• "הודעת סיום טיפול (30 יום)" — נשלחת אוטומטית אחרי 30 יום

כללי:
• "הנחיות הגעה" — הנחיות הגעה ל-MedWork

💡 את יכולה לערוך את הטקסט של כל הודעה. השינוי ישפיע מיידית על הבוט.`
      },
      {
        id: 'botc-filter',
        title: 'סינון לפי מסלול ושלב',
        icon: Filter,
        color: 'text-rose-500',
        content: `כל הודעה מסווגת למסלול שירות ולשלב בתהליך:

• סינון לפי מסלול — תראי רק את ההודעות ששייכות למסלול (ייעוץ, משפטי, הרצאות...)
• סינון לפי קטגוריה — כללי, ייעוץ, משפטי וכו׳
• עמודת "שלב" — מראה באיזה נקודה בתהליך ההודעה נשלחת

התצוגה ממוינת לפי שלב, כך שתוכלי לראות את הזרימה המלאה של כל מסלול.`
      },
      {
        id: 'botc-edit',
        title: 'איך עורכים הודעה?',
        icon: Pencil,
        color: 'text-rose-500',
        content: `1. לחצי על כפתור העיפרון (אייקון עריכה) בהודעה שרוצים לשנות
2. שני את תוכן ההודעה — זה הטקסט שהפונה יקבל
3. לחצי "עדכן" — השינוי חל מיידית

אפשר להשתמש ב-{שם פרטי} בתוך ההודעה — הבוט יחליף אותו אוטומטית בשם הפונה.

⚠️ חשוב: אל תשני את שדה המפתח (key) — הוא מקשר את ההודעה לקוד של הבוט. רק את התוכן מותר לערוך חופשית.`
      },
      {
        id: 'botc-media',
        title: 'צירוף מדיה להודעות',
        icon: Image,
        color: 'text-rose-500',
        content: `לכל הודעה ניתן לצרף:
• סרטון
• קובץ PDF
• תמונה
• קישור חיצוני

המדיה תישלח ללקוח יחד עם ההודעה בוואטסאפ.`
      }
    ]
  },
  {
    id: 'service-content',
    title: '🟢 ניהול תוכן (קישורים)',
    icon: FolderOpen,
    color: 'bg-cyan-500 text-white',
    subs: [
      {
        id: 'sc-what',
        title: 'מה זה ניהול תוכן?',
        icon: Eye,
        color: 'text-cyan-500',
        content: `כאן מנהלים את כל הקישורים והקבצים שהבוט שולח לפונים:
• קישורי תשלום
• סרטוני הכנה
• שאלונים
• הסכמים ומסמכים
• קישורים חיצוניים

💡 זה שונה מ"תוכן הבוט" — כאן זה קישורים וקבצים, וב"תוכן הבוט" זה הודעות טקסט.`
      },
      {
        id: 'sc-types',
        title: 'סוגי תוכן',
        icon: ListChecks,
        color: 'text-cyan-500',
        content: `ניתן להוסיף את סוגי התוכן הבאים:
• סרטונים
• קובצי PDF
• שאלונים
• קישורי תשלום
• קישורים חיצוניים
• הסכמים`
      },
      {
        id: 'sc-usage',
        title: 'איך הבוט משתמש בתוכן הזה?',
        icon: Zap,
        color: 'text-cyan-500',
        content: `כל תוכן משויך לסוג שירות ספציפי.

לדוגמה:
• סרטון "הכנה לייעוץ" → יוצג רק בפניות ייעוץ
• קישור תשלום → יישלח בשלב התשלום
• הסכם → יישלח לחתימה

📌 הבוט שולח את התכנים הרלוונטיים אוטומטית לפונים בהתאם לסוג השירות שלהם.

אם רוצים לשנות קישור תשלום או לעדכן סרטון — זה המקום!`
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
        content: `שלושה סוגים:
• סדרה — מספר הרצאות ברצף
• הרצאה בודדת — הרצאה עצמאית
• סדנה — מפגש אינטראקטיבי`
      },
      {
        id: 'lectures-manage',
        title: 'הוספה ועריכה של הרצאות',
        icon: Pencil,
        color: 'text-amber-500',
        content: `לכל הרצאה ניתן להגדיר:
• כותרת ותיאור
• משך (בדקות) ומחיר
• קישור לסרטון או PDF
• תמונת נושא
• שיוך לסדרה (אם רלוונטי)
• סדר הצגה והפעלה/השבתה

💡 הבוט משתמש בתוכן הזה כדי לענות ללקוחות על שאלות בנושא הרצאות.`
      }
    ]
  },
  {
    id: 'system-settings',
    title: '⚪ הגדרות מערכת',
    icon: Settings,
    color: 'bg-gray-500 text-white',
    subs: [
      {
        id: 'ss-what',
        title: 'מה זה הגדרות מערכת?',
        icon: Eye,
        color: 'text-gray-500',
        content: `אזור זה מכיל הגדרות טכניות שלא קשורות ישירות לתוכן הבוט.

כרגע אין צורך לגעת כאן — רוב ההודעות החשובות עברו ל"תוכן הבוט" ורוב הקישורים עברו ל"ניהול תוכן".

מה כן נשאר כאן:
• כתובת מייל למשפטי (legal_email)
• הגדרות טכניות נוספות`
      },
      {
        id: 'ss-warning',
        title: 'מתי צריך לגעת בהגדרות?',
        icon: ShieldCheck,
        color: 'text-gray-500',
        content: `⚠️ אזור זה מיועד לשימוש מתקדם.

תצטרכי לשנות הגדרות רק כאשר:
• רוצים לעדכן כתובת מייל למשפטי
• צריך לשנות קישור טכני

💡 לעריכת הודעות וקישורים שהבוט שולח — עדיף להשתמש ב"תוכן הבוט" ו"ניהול תוכן".
אם לא בטוחה — שאלי לפני שמשנים.`
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
        content: `ממשק פנימי שמאפשר לך לשוחח עם הבוט ולבדוק את תגובותיו.

• פתחי שיחה חדשה או המשיכי שיחה קיימת
• שלחי הודעות ותראי תגובות בזמן אמת
• היסטוריית שיחות נשמרת לבדיקה חוזרת`
      },
      {
        id: 'bc-actions',
        title: 'מה הפעולות הטכניות שרואים?',
        icon: Zap,
        color: 'text-blue-500',
        content: `בממשק הבדיקה רואים את הפעולות שהבוט מבצע מאחורי הקלעים:
• read_contact — בודק אם איש הקשר קיים
• create_contact — יוצר איש קשר חדש
• create_servicerequest — פותח פנייה
• update_servicerequest — מעדכן פנייה

⚠️ בוואטסאפ הלקוח לא רואה את הפעולות האלה — רק הודעות טקסט נקיות.`
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
        id: 'wa-flow',
        title: 'איך הבוט משתמש בתוכן שהגדרת?',
        icon: Zap,
        color: 'text-green-500',
        content: `הבוט משלב בין 3 מקורות תוכן:

1. תוכן הבוט (תוכן הבוט במערכת) — הודעות טקסט כמו "אישור תשלום", "הנחיות הגעה", "בקשת מסמכים" וכו׳
2. ניהול תוכן (ניהול תוכן במערכת) — קישורי תשלום, סרטונים, שאלונים, הסכמים
3. קטלוג הרצאות — פרטי הרצאות שהבוט מציג

🔗 מה שאת משנה במערכת = מה שהבוט שולח. זה הקשר הישיר.`
      },
      {
        id: 'wa-auto',
        title: 'מה הבוט עושה אוטומטית?',
        icon: Zap,
        color: 'text-green-500',
        content: `הבוט בוואטסאפ מבצע אוטומטית:
• מקבל פניות חדשות ומזהה סוג שירות
• יוצר איש קשר חדש אם זו פנייה ראשונה
• פותח פנייה חדשה במערכת
• שולח תכנים רלוונטיים (סרטונים, מסמכים, קישורי תשלום)
• מנחה את הלקוח בתהליך
• מסמן פניות שדורשות התייחסות שלך`
      },
      {
        id: 'wa-customer',
        title: 'מה הלקוח רואה בוואטסאפ?',
        icon: Eye,
        color: 'text-green-500',
        content: `הלקוח רואה רק:
• הודעות טקסט מותאמות אישית
• סרטונים ומסמכים רלוונטיים
• קישורי תשלום
• הנחיות ברורות לגבי השלב הבא

📌 הלקוח לא רואה את הפעולות הטכניות — רק תוכן נקי ומסודר.`
      },
      {
        id: 'wa-edit-content',
        title: '💡 איך משנים מה שהבוט שולח?',
        icon: Pencil,
        color: 'text-green-500',
        content: `לשנות את מה שהבוט שולח — יש 3 מקומות:

🟣 לשנות טקסט הודעה ("אישור תשלום", "בקשת מסמכים"):
→ לכי ל: תוכן הבוט → מצאי לפי מסלול → ערכי תוכן

🟢 לשנות קישור תשלום או סרטון:
→ לכי ל: ניהול תוכן → מצאי לפי שירות → ערכי URL

📒 לעדכן הרצאה:
→ לכי ל: קטלוג הרצאות → ערכי הרצאה

זהו — את לא צריכה לגעת בקוד בשביל לשנות מה שהבוט שולח!`
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
            כאן תמצאי הסברים מפורטים על כל חלקי המערכת — מה עושה כל דף, איך הכל מתחבר לבוט הוואטסאפ, ואיך לשנות תוכן בלי לגעת בקוד. לחצי על כל שאלה כדי לפתוח את התשובה.
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