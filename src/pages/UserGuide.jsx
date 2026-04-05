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
        title: 'מה זה ומה עושים פה?',
        icon: Eye,
        color: 'text-rose-500',
        content: `כאן מנהלים את כל הודעות הטקסט שהבוט שולח לפונים בוואטסאפ.\n\nלדוגמה: כשפונה משלם ומקבל הודעת "אישור תשלום" — הטקסט של ההודעה הזו מגיע מכאן.\nכשפונה במסלול משפטי מקבל "בקשת מסמכים" — גם זה מכאן.\n\n📌 כל הודעה כאן = הודעה אמיתית שנשלחת בוואטסאפ.`
      },
      {
        id: 'botc-list',
        title: 'רשימת ההודעות שמנוהלות כאן',
        icon: ListChecks,
        color: 'text-rose-500',
        content: `מסלול ייעוץ:\n• "אישור תשלום" (שלב 6) — נשלחת אחרי שאושר תשלום לייעוץ\n• "שאלון הושלם" (שלב 5) — נשלחת אחרי שהפונה מילא שאלון\n\nמסלול משפטי:\n• "הסכמת פרטיות" (שלב 4) — הודעת סודיות רפואית\n• "בקשת מסמכים" (שלב 5) — הנחיות אילו מסמכים לשלוח למייל\n• "הודעת סיום טיפול" (שלב 9) — נשלחת אוטומטית אחרי 30 יום\n\nכללי:\n• "הנחיות הגעה" — כתובת MedWork, חנייה, קומה`
      },
      {
        id: 'botc-how-edit',
        title: 'איך עורכים הודעה? (צעד אחר צעד)',
        icon: Pencil,
        color: 'text-rose-500',
        content: `1. סנני לפי מסלול (למשל \"מסלול משפטי\") כדי למצוא מהר\n2. לחצי על אייקון העיפרון ליד ההודעה\n3. שני את שדה \"תוכן ההודעה\" — זה הטקסט שהפונה מקבל\n4. לחצי \"עדכן\"\n\n💡 טיפ: אפשר לכתוב {שם פרטי} בתוך ההודעה — הבוט יחליף אותו בשם הפונה.\n\n⚠️ אזהרה: לא לשנות את שדה \"מפתח\" (key) — הוא מקשר את ההודעה לקוד. לשנות רק את התוכן.`
      },
      {
        id: 'botc-effect',
        title: '🔗 איך זה משפיע על הבוט?',
        icon: Zap,
        color: 'text-rose-500',
        content: `השפעה ישירה ומיידית!\n\nכשהבוט צריך לשלוח הודעה (למשל אישור תשלום), הוא קורא את הטקסט מכאן לפי המפתח.\n\nדוגמה מעשית:\n• פונה שילם → המערכת שולפת את ההודעה עם מפתח consultation_payment_confirmed → שולחת את התוכן לוואטסאפ\n• פונה במשפטי סיים 30 יום → המערכת שולפת legal_timeout_message → שולחת לפונה\n\nשינוי תוכן כאן = שינוי מה שהבוט שולח. מיידי. בלי קוד.`
      }
    ]
  },
  {
    title: '🟢 ניהול תוכן (קישורים וקבצים)',
    icon: FolderOpen,
    color: 'bg-cyan-500 text-white',
    subs: [
      {
        id: 'sc-what',
        title: 'מה זה ומה עושים פה?',
        icon: Eye,
        color: 'text-cyan-500',
        content: `כאן מנהלים את כל הקישורים, הסרטונים, השאלונים וקבצי ה-PDF שהבוט שולח לפונים.\n\nלדוגמה: כשהבוט שולח קישור תשלום — הקישור מגיע מכאן.\nכשהבוט שולח סרטון הכנה לייעוץ — הקישור לסרטון מגיע מכאן.\n\n📌 ההבדל מ\"תוכן הבוט\": שם זה טקסט (הודעות), כאן זה קישורים וקבצים.`
      },
      {
        id: 'sc-examples',
        title: 'דוגמאות למה שמנוהל כאן',
        icon: ListChecks,
        color: 'text-cyan-500',
        content: `מסלול ייעוץ:\n• סרטון הכנה לייעוץ (video) — סרטון שנשלח לפונה לפני הייעוץ\n• קישור תשלום (payment_link) — לינק לעמוד תשלום\n• שאלון (questionnaire) — קישור לשאלון שהפונה ממלא\n\nמסלול משפטי:\n• קישור תשלום משפטי (payment_link)\n• הסכם (agreement) — מסמך הסכם לחתימה\n• קישור יומן (external_link) — לינק ל-Cal.com\n\nמסלול הרצאות:\n• סרטוני הרצאות (video)\n• קבצי PDF (pdf)\n• קישור ליומן (external_link)`
      },
      {
        id: 'sc-how-edit',
        title: 'איך מוסיפים או עורכים תוכן? (צעד אחר צעד)',
        icon: Pencil,
        color: 'text-cyan-500',
        content: `הוספת תוכן חדש:\n1. לחצי \"הוסף תוכן\"\n2. כתבי כותרת (למשל \"קישור תשלום ייעוץ\")\n3. בחרי סוג תוכן (סרטון / PDF / שאלון / קישור תשלום / הסכם / קישור חיצוני)\n4. בחרי שיוך שירות (ייעוץ / משפטי / הרצאות / כללי)\n5. הדביקי את הקישור\n6. לחצי \"צור\"\n\nעריכת תוכן קיים:\n1. סנני לפי שירות (למשל \"ייעוץ\")\n2. לחצי על אייקון העיפרון\n3. שני את הקישור או הכותרת\n4. לחצי \"עדכן\"\n\n💡 לעדכן קישור תשלום? פשוט מצאי אותו לפי סוג \"קישור תשלום\" ושירות מתאים, ושני את ה-URL.`
      },
      {
        id: 'sc-effect',
        title: '🔗 איך זה משפיע על הבוט?',
        icon: Zap,
        color: 'text-cyan-500',
        content: `הבוט שולף קישורים מכאן לפי סוג השירות וסוג התוכן.\n\nדוגמה מעשית:\n• פונה בייעוץ הגיע לשלב תשלום → הבוט מחפש תוכן מסוג \"קישור תשלום\" ושירות \"ייעוץ\" → שולח את הקישור\n• פונה בייעוץ צריך שאלון → הבוט מחפש \"שאלון\" + \"ייעוץ\" → שולח קישור לשאלון\n• פונה במשפטי צריך הסכם → הבוט מחפש \"הסכם\" + \"משפטי\" → שולח\n\n📌 אם שינית קישור תשלום כאן — מהרגע הזה כל הפונים יקבלו את הקישור החדש.`
      }
    ]
  },
  {
    title: '📒 קטלוג הרצאות',
    icon: BookOpen,
    color: 'bg-amber-500 text-white',
    subs: [
      {
        id: 'lectures-what',
        title: 'מה זה ומה עושים פה?',
        icon: Eye,
        color: 'text-amber-500',
        content: `כאן מנהלים את רשימת כל ההרצאות שד\"ר אדרי מציעה.\n\nכשפונה בוחר במסלול \"הרצאות\" בבוט — הבוט מציג לו את ההרצאות מכאן.\nהבוט משתמש בנתונים האלה כדי:\n• להציג רשימת הרצאות זמינות\n• לשלוח סרטון או PDF של הרצאה ספציפית\n• להציג מחירים ופרטים`
      },
      {
        id: 'lectures-types',
        title: 'סוגי הרצאות',
        icon: ListChecks,
        color: 'text-amber-500',
        content: `שלושה סוגים:\n• סדרה — מספר הרצאות ברצף (למשל \"סדרת מדעי החיים\")\n• הרצאה בודדת — הרצאה עצמאית\n• סדנה — מפגש אינטראקטיבי (ביופידבק)`
      },
      {
        id: 'lectures-how',
        title: 'איך מוסיפים או עורכים הרצאה? (צעד אחר צעד)',
        icon: Pencil,
        color: 'text-amber-500',
        content: `הוספת הרצאה חדשה:\n1. לחצי \"הוסף הרצאה\"\n2. כתבי כותרת ותיאור\n3. בחרי סוג (סדרה / בודדת / סדנה)\n4. הוסיפי מחיר ומשך בדקות\n5. הדביקי קישור לסרטון ו/או PDF (אם יש)\n6. הוסיפי תמונת נושא (אם יש)\n7. אם חלק מסדרה — בחרי שם סדרה\n8. לחצי \"צור\"\n\nעריכה:\n• לחצי על אייקון העיפרון ← שני מה שצריך ← \"עדכן\"\n\n💡 סדר ההצגה נקבע לפי שדה \"סדר הצגה\" — מספר קטן יותר = מופיע ראשון.\n💡 אפשר להשבית הרצאה בלי למחוק אותה (כבי את \"פעילה\").`
      },
      {
        id: 'lectures-effect',
        title: '🔗 איך זה משפיע על הבוט?',
        icon: Zap,
        color: 'text-amber-500',
        content: `כשפונה בוחר \"הרצאות\" בבוט, הבוט קורא את הרשימה מכאן ומציג אותה.\n\nדוגמה מעשית:\n• פונה בחר \"הרצאה בודדת\" → הבוט שולף את כל ההרצאות מסוג \"בודדת\" → מציג רשימה עם שם, תיאור ומחיר → שולח PDF וסרטון של מה שהפונה בחר\n• פונה בחר \"סדרה\" → הבוט מציג את פרטי הסדרה + קישור ליומן\n\n📌 הוספת/עריכת הרצאה כאן = שינוי מה שהפונים רואים מיידית.\n📌 השבתת הרצאה = הפונים לא יראו אותה יותר.`
      }
    ]
  },
  {
    title: '⚪ הגדרות מערכת',
    icon: Settings,
    color: 'bg-gray-500 text-white',
    subs: [
      {
        id: 'ss-what',
        title: 'מה זה ומה עושים פה?',
        icon: Eye,
        color: 'text-gray-500',
        content: `אזור זה מכיל הגדרות טכניות של המערכת.\n\nרוב התוכן שהבוט שולח כבר עבר ל\"תוכן הבוט\" ול\"ניהול תוכן\", אז כרגע כמעט אין צורך לגעת כאן.\n\nמה כן נשאר כאן:\n• כתובת מייל לשליחת מסמכים משפטיים (legal_email) — המייל שנכתב בהודעת \"בקשת מסמכים\"\n• הגדרות טכניות פנימיות`
      },
      {
        id: 'ss-when',
        title: 'מתי צריך לגעת פה?',
        icon: ShieldCheck,
        color: 'text-gray-500',
        content: `רק במקרים נדירים:\n\n• לשנות כתובת מייל למשפטי — אם המייל office@drliatedry.co.il משתנה\n\n⚠️ לעריכת הודעות שהבוט שולח — לכי ל\"תוכן הבוט\".\n⚠️ לעריכת קישורים — לכי ל\"ניהול תוכן\".\n\nאם לא בטוחה אם צריך לשנות משהו כאן — שאלי לפני.`
      },
      {
        id: 'ss-effect',
        title: '🔗 איך זה משפיע על הבוט?',
        icon: Zap,
        color: 'text-gray-500',
        content: `השפעה מינימלית על הבוט ישירות.\n\nהדבר היחיד שמשפיע:\n• legal_email — כתובת המייל שמופיעה בהודעת \"בקשת מסמכים\" במסלול המשפטי. אם תשני אותה כאן, הבוט ישלח את הכתובת החדשה לפונים.\n\n💡 כל שאר התוכן שהבוט שולח מנוהל דרך \"תוכן הבוט\" ו\"ניהול תוכן\".`
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
    <div className="space-y-4 md:space-y-6 max-w-4xl mx-auto">
      {/* Welcome banner */}
      <div className="bg-primary/10 border border-primary/20 rounded-xl md:rounded-2xl p-4 md:p-6 flex items-start gap-3 md:gap-4">
        <div className="p-2 md:p-2.5 rounded-xl bg-primary/15 mt-0.5 flex-shrink-0">
          <BookOpenCheck className="w-5 h-5 md:w-6 md:h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-lg md:text-xl font-bold text-foreground mb-1">ברוכה הבאה למדריך למשתמשת</h1>
          <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
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