// Google Calendar "busy day" reader (Method A): fetch the calendar's secret iCal (.ics) feed
// and return the dates that have an ALL-DAY event — those days get blocked on the booking page.
// Timed events (including signups) are ignored, so bookings never block other bookings.
let _cache = { url: '', days: [], at: 0 };
const TTL = 5 * 60 * 1000; // 5 min

function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymdToDate(s) { return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)); }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function keyOf(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); } // matches app's key()

function parseBusyDays(ics) {
  const days = {};
  const blocks = String(ics || '').split('BEGIN:VEVENT').slice(1);
  blocks.forEach(b => {
    const ev = b.split('END:VEVENT')[0];
    const ds = ev.match(/DTSTART;VALUE=DATE:(\d{8})/); // all-day only
    if (!ds) return;
    if (/TRANSP:TRANSPARENT/.test(ev)) return;   // marked "Free" → not a block
    if (/STATUS:CANCELLED/.test(ev)) return;
    const de = ev.match(/DTEND;VALUE=DATE:(\d{8})/);
    let cur = ymdToDate(ds[1]);
    const endD = de ? ymdToDate(de[1]) : addDays(cur, 1); // DTEND is exclusive for all-day
    let guard = 0;
    while (cur < endD && guard < 400) { days[keyOf(cur)] = true; cur = addDays(cur, 1); guard++; }
  });
  return Object.keys(days);
}

async function getBusyDays(icalUrl) {
  if (!icalUrl) return [];
  const now = Date.now();
  if (_cache.url === icalUrl && (now - _cache.at) < TTL) return _cache.days;
  try {
    const url = String(icalUrl).trim().replace(/^webcal:\/\//i, 'https://');
    const r = await fetch(url);
    if (!r.ok) { console.error('[gcal] fetch', r.status); return (_cache.url === icalUrl) ? _cache.days : []; }
    const text = await r.text();
    const days = parseBusyDays(text);
    _cache = { url: icalUrl, days, at: now };
    return days;
  } catch (e) { console.error('[gcal]', e.message); return (_cache.url === icalUrl) ? _cache.days : []; }
}

module.exports = { getBusyDays, parseBusyDays };
