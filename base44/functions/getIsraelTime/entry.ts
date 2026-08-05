Deno.serve(async () => {
  const now = new Date();
  const tz = 'Asia/Jerusalem';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {} as Record<string, string>);

  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}`;
  const weekday = new Intl.DateTimeFormat('he-IL', { timeZone: tz, weekday: 'long' }).format(now);
  const display = new Intl.DateTimeFormat('he-IL', {
    timeZone: tz, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now);

  return Response.json({ timezone: tz, date, time, weekday, display, iso_utc: now.toISOString() });
});