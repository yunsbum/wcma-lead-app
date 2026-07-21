require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./lib/db');
const programs = require('./lib/programs');
const { createCheckout, getClient } = require('./lib/stripe');
const email = require('./lib/email');
const { sendSMS } = require('./lib/sms');
const auth = require('./lib/auth');
const app = express();
const BASE_URL = process.env.BASE_URL || ('http://localhost:' + (process.env.PORT || 3000));
const SCHOOL_NAME = process.env.SCHOOL_NAME || 'World Class Martial Arts';

app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const { stripe } = await getClient(); let event = null;
  try {
    if (stripe && process.env.STRIPE_WEBHOOK_SECRET) event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    else event = JSON.parse(req.body.toString() || '{}');
  } catch (err) { console.error('[webhook] sig', err.message); return res.status(400).send('Webhook Error: ' + err.message); }
  try {
    if (event.type === 'checkout.session.completed') await db.updateBySession(event.data.object.id, { payStatus: 'paid', status: 'confirmed' });
    else if (event.type === 'checkout.session.async_payment_failed') await db.updateBySession(event.data.object.id, { payStatus: 'failed' });
  } catch (e) { console.error('[webhook]', e.message); }
  res.json({ received: true });
});

app.use(express.json({ limit: '6mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

function loginPage(msg, logo) {
  return '<!doctype html><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"><title>Sign in</title>'
  + '<style>body{margin:0;font-family:-apple-system,Arial,sans-serif;background:#f5f7fb;color:#1e293b;display:flex;min-height:100vh;align-items:center;justify-content:center}'
  + '.card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:34px;width:340px;box-shadow:0 1px 3px rgba(16,24,40,.06)}'
  + '.logo{width:44px;height:44px;border-radius:11px;background:#3073F1;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;margin:0 auto 14px}'
  + 'h1{font-size:19px;text-align:center;margin:0 0 4px}p.s{color:#64748b;font-size:13px;text-align:center;margin:0 0 20px}'
  + 'input{width:100%;padding:12px;border:1px solid #e5e7eb;border-radius:9px;font-size:15px;box-sizing:border-box}'
  + 'button{width:100%;margin-top:14px;padding:12px;border:0;border-radius:9px;background:#3073F1;color:#fff;font-size:15px;font-weight:700;cursor:pointer}'
  + '.err{color:#e63535;font-size:13px;margin-top:10px;text-align:center}</style>'
  + '<div class="card">' + (logo ? '<div style="width:72px;height:72px;margin:0 auto 14px"><img src="' + logo + '" alt="logo" style="width:100%;height:100%;object-fit:contain"/></div>' : '<div class="logo">WCMA</div>') + '<h1>Lead Management</h1><p class="s">' + SCHOOL_NAME + '</p>'
  + '<form method="POST" action="/login"><input type="password" name="password" placeholder="Password" autofocus autocomplete="current-password"/>'
  + '<button type="submit">Sign in</button>' + (msg ? '<div class="err">' + msg + '</div>' : '') + '</form></div>';
}
app.get('/login', async (req, res) => { if (auth.isAuthed(req)) return res.redirect('/admin'); const s = await db.getSettings(); res.send(loginPage('', s.logo || '')); });
app.post('/login', async (req, res) => { if (auth.check((req.body.password || '').trim())) { auth.setCookie(res); return res.redirect('/admin'); } const s = await db.getSettings(); res.status(401).send(loginPage('Incorrect password.', s.logo || '')); });
app.get('/logout', (req, res) => { auth.clearCookie(res); res.redirect('/login'); });

app.get('/', (req, res) => res.redirect('/signup'));
app.get('/signup', (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'views', 'console.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, 'public', 'signup-mode.js'), 'utf8');
  html = html.replace('</body>', function () { return '<style>#persistNote{display:none!important}</style><script>' + js + '<\/script></body>'; });
  res.set('Cache-Control','no-store').set('Content-Type','text/html').send(html);
});
app.get('/api/programs', async (req, res) => { try { const s = await db.getSettings(); return res.json((s && Array.isArray(s.programs) && s.programs.length) ? s.programs : programs); } catch (e) { return res.json(programs); } });

app.post('/api/book', async (req, res) => {
  try {
    const b = req.body || {}; const _st = await db.getSettings(); const _list = (_st && Array.isArray(_st.programs) && _st.programs.length) ? _st.programs : programs; const program = _list.find(p => p.id === b.programId);
    if (!program) return res.status(400).json({ error: 'Invalid program' });
    if (!b.student || !b.email || !b.phone) return res.status(400).json({ error: 'Missing required fields' });
    const lead = await db.createLead({ student: b.student, age: b.age ? Number(b.age) : undefined, guardian: b.guardian || '', email: b.email, phone: b.phone, program: program.name, programId: program.id, price: program.price, when: b.when || '', source: b.source || 'direct', status: 'booked', payStatus: program.price > 0 ? 'pending' : 'none' });
    email.onBooking(lead).catch(() => {});
    if (program.price > 0) { const session = await createCheckout({ lead, program, baseUrl: BASE_URL }); await db.setSession(lead._id, session.id); return res.json({ ok: true, pay: true, checkoutUrl: session.url }); }
    return res.json({ ok: true, pay: false, message: 'Booked!' });
  } catch (e) { console.error('[book]', e); res.status(500).json({ error: 'Something went wrong. Please try again.' }); }
});
app.get('/success', async (req, res) => { if (req.query.mock && req.query.lead) { try { await db.markPaidById(req.query.lead); } catch {} } res.sendFile(path.join(__dirname, 'public', 'success.html')); });

app.get('/console', auth.requireAuth, (req, res) => res.redirect('/admin'));
app.get('/admin', auth.requireAuth, (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'views', 'console.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, 'public', 'console-bridge.js'), 'utf8');
  html = html.replace('</body>', function () { return '<style>#persistNote{display:none!important}</style><script>' + js + '<\/script></body>'; });
  res.set('Cache-Control','no-store').set('Content-Type','text/html').send(html);
});
app.get('/admin/list', auth.requireAuth, async (req, res) => {
  const leads = await db.listLeads(); const esc = v => (v == null ? '' : '' + v).replace(/[<>&]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c]));
  const rows = leads.map(l => '<tr><td>' + esc(l.student) + '</td><td>' + esc(l.program) + '</td><td>' + esc(l.when) + '</td><td>' + esc(l.email) + '<br>' + esc(l.phone) + '</td><td>' + esc(l.source) + '</td><td>' + esc(l.status) + '</td></tr>').join('');
  res.send('<!doctype html><meta charset=utf8><title>Leads</title><style>body{font-family:Arial;margin:24px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #e5e7eb;padding:8px;text-align:left}</style><h1>' + SCHOOL_NAME + ' — Leads (' + leads.length + ')</h1><p><a href="/admin">Full console</a></p><table><tr><th>Student</th><th>Program</th><th>When</th><th>Contact</th><th>Source</th><th>Status</th></tr>' + (rows || '<tr><td colspan=6>No leads yet.</td></tr>') + '</table>');
});

app.get('/api/leads', auth.requireAuth, async (req, res) => res.json(await db.listLeads()));
app.post('/api/leads/sync', auth.requireAuth, async (req, res) => {
  const items = (req.body && req.body.leads) || []; const mapping = [];
  for (const it of items) { try {
    if (it._sid) await db.updateFields(it._sid, { status: it.status, archived: !!it.archived, notes: it.notes || '', student: it.student, phone: it.phone, email: it.email });
    else { const doc = await db.createLead({ student: it.student || '(no name)', age: it.age ? Number(it.age) : undefined, guardian: it.guardian || '', email: it.email || '', phone: it.phone || '', program: it.program || '', programId: it.programId || '', price: 0, when: it.when || '', source: it.src || 'walk-in', status: it.status || 'booked', payStatus: 'none', archived: !!it.archived, notes: it.notes || '' }); mapping.push({ tempId: it.id, _id: doc._id }); }
  } catch (e) { console.error('[sync] item', e.message); } }
  try { const s = (req.body && req.body.settings) || {}; const patch = {};
    if (/^sk_/.test(s.stripeKey || '')) patch.stripeKey = s.stripeKey;
    if (s.sendgridKey) patch.sendgridKey = s.sendgridKey;
    if (typeof s.fromEmail === 'string') patch.fromEmail = s.fromEmail;
    if (typeof s.schoolEmail === 'string') patch.schoolEmail = s.schoolEmail;
    if (typeof s.schoolPhone === 'string') patch.schoolPhone = s.schoolPhone;
    if (typeof s.notifyEmail !== 'undefined') patch.notifyEmail = !!s.notifyEmail;
    if (typeof s.notifySms !== 'undefined') patch.notifySms = !!s.notifySms;
    if (s.twilioSid) patch.twilioSid = s.twilioSid; if (s.twilioToken) patch.twilioToken = s.twilioToken; if (s.twilioFrom) patch.twilioFrom = s.twilioFrom;
    if (Array.isArray(s.programs)) patch.programs = s.programs;
    ['logo','brandColor','bgColor','logoBg','schoolSlug'].forEach(function(k){ if (typeof s[k] === 'string') patch[k] = s[k]; });
    if (typeof s.monthlyGoal !== 'undefined' && s.monthlyGoal !== null) patch.monthlyGoal = s.monthlyGoal;
    if (Object.keys(patch).length) await db.saveSettings(patch);
  } catch (e) { console.error('[sync] settings', e.message); }
  res.json({ ok: true, mapping });
});
app.get('/api/settings', auth.requireAuth, async (req, res) => {
  const s = await db.getSettings(); const sk = s.stripeKey || process.env.STRIPE_SECRET_KEY || '';
  res.json({ stripeConnected: /^sk_/.test(sk), stripeMode: /^sk_live_/.test(sk) ? 'live' : (/^sk_test_/.test(sk) ? 'test' : 'none'), emailConnected: !!((s.sendgridKey || process.env.SENDGRID_KEY) && (s.fromEmail || process.env.FROM_EMAIL)), smsConnected: !!(s.twilioSid && s.twilioToken && s.twilioFrom), logo: s.logo || '', programsSaved: (Array.isArray(s.programs) && s.programs.length > 0) });
});

const PORT = process.env.PORT || 3000;
db.init().then(() => app.listen(PORT, () => console.log('WCMA lead app on ' + BASE_URL + ' (console:/admin, booking:/signup)'))).catch(e => { console.error('startup failed', e); process.exit(1); });
