require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./lib/db');
const programs = require('./lib/programs');
const { createCheckout, createOrderCheckout, getClient } = require('./lib/stripe');
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
    const obj = event.data && event.data.object ? event.data.object : {};
    const orderId = obj.metadata && obj.metadata.order_id ? obj.metadata.order_id : null;
    if (event.type === 'checkout.session.completed') {
      if (orderId) { await db.updateOrder(orderId, { status: 'paid', paidAt: new Date().toISOString() }); await db.updateLeadsByOrder(orderId, { payStatus: 'paid', status: 'confirmed' }); }
      else await db.updateBySession(obj.id, { payStatus: 'paid', status: 'confirmed' });
    } else if (event.type === 'checkout.session.async_payment_failed') {
      if (orderId) { await db.updateOrder(orderId, { status: 'failed' }); await db.updateLeadsByOrder(orderId, { payStatus: 'failed' }); }
      else await db.updateBySession(obj.id, { payStatus: 'failed' });
    }
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
  const html = fs.readFileSync(path.join(__dirname, 'views', 'signup.html'), 'utf8');
  res.set('Cache-Control','no-store').set('Content-Type','text/html').send(html);
});
app.get('/api/programs', async (req, res) => { try { const s = await db.getSettings(); return res.json((s && Array.isArray(s.programs) && s.programs.length) ? s.programs : programs); } catch (e) { return res.json(programs); } });
// School schedule + already-booked counts, so the booking page shows real available seats.
app.get('/api/schedule', async (req, res) => {
  try {
    const s = await db.getSettings();
    const schedule = (s && s.schedule) ? s.schedule : {};
    const exceptions = (s && Array.isArray(s.exceptions)) ? s.exceptions : [];
    const leads = await db.listLeads(); const booked = {};
    leads.forEach(l => { if (l.deleted) return; if (l.slotDate && l.slotTime && ['booked','confirmed','showed','enrolled','followup'].indexOf(l.status) > -1) { const k = l.slotDate + '|' + l.slotTime; booked[k] = (booked[k] || 0) + 1; } });
    res.json({ schedule, exceptions, booked });
  } catch (e) { res.json({ schedule: {}, exceptions: [], booked: {} }); }
});
app.get('/api/branding', async (req, res) => { try { const s = await db.getSettings(); res.json({ logo: s.logo || '', brandColor: s.brandColor || '', bgColor: s.bgColor || '', logoBg: s.logoBg || '' }); } catch (e) { res.json({}); } });
// Public: the booking page validates codes against the SAME promos the server charges with, so the preview matches the real charge.
app.get('/api/promos', async (req, res) => { try { const s = await db.getSettings(); const list = (s && Array.isArray(s.promos)) ? s.promos : []; res.json(list.filter(p => p && (p.status ? p.status === 'Active' : true))); } catch (e) { res.json([]); } });

// Re-validate a promo code on the server and return the discount (in cents).
// Never trust a client-supplied amount — the discount is computed from the school's own saved promos.
function validatePromo(promos, code, program) {
  if (!code || !Array.isArray(promos)) return { code: '', discount: 0 };
  const p = promos.find(x => x && x.code && String(x.code).toUpperCase() === String(code).toUpperCase() && (x.status ? x.status === 'Active' : true));
  if (!p) return { code: '', discount: 0 };
  if (p.max && (p.used || 0) >= p.max) return { code: '', discount: 0 };
  if (p.scope && p.scope !== 'All programs' && program && String(p.scope).indexOf(program.name) === -1) return { code: '', discount: 0 };
  const price = program.price || 0; let disc = 0;
  if (p.type === 'percent') disc = Math.round(price * (p.value || 0) / 100);
  else if (p.type === 'amount') disc = Math.min(price, p.value || 0);
  else if (p.type === 'free') disc = price;
  disc = Math.max(0, Math.min(price, disc));
  return { code: p.code, discount: disc };
}
app.post('/api/book', async (req, res) => {
  try {
    const b = req.body || {}; const _st = await db.getSettings(); const _list = (_st && Array.isArray(_st.programs) && _st.programs.length) ? _st.programs : programs; const program = _list.find(p => p.id === b.programId);
    if (!program) return res.status(400).json({ error: 'Invalid program' });
    if (!b.student || !b.email || !b.phone) return res.status(400).json({ error: 'Missing required fields' });
    const _promos = (_st && Array.isArray(_st.promos)) ? _st.promos : [];
    const applied = validatePromo(_promos, b.promoCode, program);
    const finalPrice = Math.max(0, (program.price || 0) - applied.discount);
    const lead = await db.createLead({ student: b.student, age: b.age ? Number(b.age) : undefined, guardian: b.guardian || '', email: b.email, phone: b.phone, program: program.name, programId: program.id, price: finalPrice, promo: applied.code, discount: applied.discount, when: b.when || '', source: b.source || 'direct', status: 'booked', payStatus: finalPrice > 0 ? 'pending' : 'none' });
    email.onBooking(lead).catch(() => {});
    if (finalPrice > 0) { const base = (req.headers['x-forwarded-proto'] || 'https') + '://' + req.headers.host; const session = await createCheckout({ lead, program, baseUrl: base, amount: finalPrice }); await db.setSession(lead._id, session.id); return res.json({ ok: true, pay: true, checkoutUrl: session.url }); }
    return res.json({ ok: true, pay: false, message: 'Booked!' });
  } catch (e) { console.error('[book]', e); res.status(500).json({ error: 'Something went wrong. Please try again.' }); }
});
// Capacity of a given schedule slot (null = slot not published for that day).
function slotCapacity(schedule, exceptions, slotDate, slotTime) {
  const parts = String(slotDate).split('-'); if (parts.length < 3) return null;
  const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  const exs = (exceptions || []).filter(e => e.dateKey === slotDate);
  if (exs.some(e => e.type === 'close')) return 0;
  let slots = ((schedule && schedule[d.getDay()]) || []).map(s => ({ t: s.t, c: s.c }));
  exs.forEach(e => { if (e.type === 'remove') slots = slots.filter(s => s.t !== e.time); else if (e.type === 'add') slots.push({ t: e.time, c: e.cap || 1 }); });
  const slot = slots.find(s => s.t === slotTime);
  return slot ? slot.c : null;
}
// Multi-participant, multi-program registration → ONE Stripe payment.
app.post('/api/order', async (req, res) => {
  try {
    const b = req.body || {}; const buyer = b.buyer || {};
    if (!buyer.first || !buyer.last || !buyer.email || !buyer.phone) return res.status(400).json({ error: 'Please complete your name, email, and phone.' });
    const parts = Array.isArray(b.participants) ? b.participants : [];
    if (!parts.length) return res.status(400).json({ error: 'Please add at least one participant.' });
    const _st = await db.getSettings();
    const plist = (_st && Array.isArray(_st.programs) && _st.programs.length) ? _st.programs : programs;
    const schedule = (_st && _st.schedule) ? _st.schedule : {};
    const exceptions = (_st && Array.isArray(_st.exceptions)) ? _st.exceptions : [];
    const items = []; let subtotal = 0; const demand = {};
    for (const p of parts) {
      const prog = plist.find(x => x.id === p.programId);
      if (!prog) return res.status(400).json({ error: 'One participant has an invalid program.' });
      if (!p.first || !p.last) return res.status(400).json({ error: 'Each participant needs a first and last name.' });
      const price = prog.price || 0; subtotal += price;
      const name = (p.first + ' ' + p.last).trim();
      const when = p.when || (p.slotDate && p.slotTime ? (p.slotDate + ' · ' + p.slotTime) : '');
      items.push({ prog, price, name, p, when });
      if (p.slotDate && p.slotTime) { const k = p.slotDate + '|' + p.slotTime; demand[k] = (demand[k] || 0) + 1; }
    }
    // capacity re-check against real bookings (server is the source of truth)
    const allLeads = await db.listLeads(); const bookedMap = {};
    allLeads.forEach(l => { if (l.deleted) return; if (l.slotDate && l.slotTime && ['booked','confirmed','showed','enrolled','followup'].indexOf(l.status) > -1) { const k = l.slotDate + '|' + l.slotTime; bookedMap[k] = (bookedMap[k] || 0) + 1; } });
    for (const k of Object.keys(demand)) {
      const idx = k.lastIndexOf('|'); const sd = k.slice(0, idx), stime = k.slice(idx + 1);
      const cap = slotCapacity(schedule, exceptions, sd, stime);
      if (cap != null && (bookedMap[k] || 0) + demand[k] > cap) return res.status(409).json({ error: 'The ' + stime + ' time is full. Please pick another time.', slotFull: k });
    }
    const _promos = (_st && Array.isArray(_st.promos)) ? _st.promos : [];
    const applied = validatePromo(_promos, b.promoCode, { name: 'Order', price: subtotal });
    const discount = Math.min(subtotal, applied.discount);
    const total = Math.max(0, subtotal - discount);
    const buyerId = 'buyer_' + Date.now() + Math.floor(Math.random() * 1000);
    const order = await db.createOrder({ schoolId: 'wcma', buyer: { first: buyer.first, last: buyer.last, email: buyer.email, phone: buyer.phone, address: buyer.address || '', contact: buyer.contact || '', source: buyer.source || 'signup' }, buyerId, status: 'pending', subtotal, discount, total, promo: applied.code, participantCount: items.length, attempt: 1 });
    const leadIds = [];
    for (const it of items) {
      const lead = await db.createLead({ schoolId: 'wcma', orderId: order._id, buyerId, student: it.name, first: it.p.first, last: it.p.last, age: it.p.age ? Number(it.p.age) : undefined, dob: it.p.dob || '', gender: it.p.gender || '', guardian: (buyer.first + ' ' + buyer.last).trim(), email: buyer.email, phone: buyer.phone, program: it.prog.name, programId: it.prog.id, price: it.price, when: it.when, slotDate: it.p.slotDate || '', slotTime: it.p.slotTime || '', medicalNotes: it.p.medicalNotes || '', source: buyer.source || 'signup', heard: buyer.source || '', status: 'booked', payStatus: total > 0 ? 'pending' : 'none', promo: applied.code });
      leadIds.push(lead._id);
    }
    await db.updateOrder(order._id, { leadIds });
    if (total > 0) {
      const base = (req.headers['x-forwarded-proto'] || 'https') + '://' + req.headers.host;
      const lineItems = items.map(it => ({ name: it.prog.name + ' — ' + it.name, amount: it.price }));
      const session = await createOrderCheckout({ order, items: lineItems, baseUrl: base, discount, idempotencyKey: order._id + ':1' });
      await db.updateOrder(order._id, { stripeSessionId: session.id });
      return res.json({ ok: true, pay: true, checkoutUrl: session.url, orderId: order._id, total });
    }
    await db.updateOrder(order._id, { status: 'paid' });
    await db.updateLeadsByOrder(order._id, { status: 'confirmed' });
    email.onOrder(order, items.map(it => ({ student: it.name, program: it.prog.name, when: it.when }))).catch(() => {});
    return res.json({ ok: true, pay: false, orderId: order._id, total: 0 });
  } catch (e) { console.error('[order]', e); res.status(500).json({ error: 'Something went wrong creating your registration. Please try again.' }); }
});
// Retry a pending/failed order with a different card (new checkout session).
app.post('/api/order/:id/retry', async (req, res) => {
  try {
    const order = await db.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.status === 'paid') return res.json({ ok: true, paid: true });
    const parts = (await db.listLeads()).filter(l => l.orderId === order._id && !l.deleted);
    if (!parts.length) return res.status(400).json({ error: 'No participants on this order.' });
    const attempt = (order.attempt || 1) + 1; await db.updateOrder(order._id, { attempt });
    const base = (req.headers['x-forwarded-proto'] || 'https') + '://' + req.headers.host;
    const lineItems = parts.map(p => ({ name: p.program + ' — ' + p.student, amount: p.price }));
    const session = await createOrderCheckout({ order, items: lineItems, baseUrl: base, discount: order.discount || 0, idempotencyKey: order._id + ':' + attempt });
    await db.updateOrder(order._id, { stripeSessionId: session.id });
    return res.json({ ok: true, pay: true, checkoutUrl: session.url });
  } catch (e) { console.error('[retry]', e); res.status(500).json({ error: 'Could not restart payment. Please try again.' }); }
});
app.get('/success', async (req, res) => {
  try {
    if (req.query.order) {
      const order = await db.getOrder(req.query.order);
      if (order && order.status !== 'paid') {
        let paid = !!req.query.mock;
        if (!paid && req.query.session_id) { try { const { stripe } = await getClient(); if (stripe) { const sess = await stripe.checkout.sessions.retrieve(req.query.session_id); paid = sess && sess.payment_status === 'paid'; } } catch (e) {} }
        if (paid) { await db.updateOrder(order._id, { status: 'paid', paidAt: new Date().toISOString() }); await db.updateLeadsByOrder(order._id, { payStatus: 'paid', status: 'confirmed' }); const parts = (await db.listLeads()).filter(l => l.orderId === order._id); email.onOrder(order, parts).catch(() => {}); }
      }
    } else if (req.query.mock && req.query.lead) { try { await db.markPaidById(req.query.lead); } catch {} }
  } catch (e) { console.error('[success]', e.message); }
  res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

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
    if (it._sid) await db.updateFields(it._sid, { status: it.status, archived: !!it.archived, deleted: !!it.deleted, notes: it.notes || '', student: it.student, phone: it.phone, email: it.email });
    else { const doc = await db.createLead({ student: it.student || '(no name)', age: it.age ? Number(it.age) : undefined, guardian: it.guardian || '', email: it.email || '', phone: it.phone || '', program: it.program || '', programId: it.programId || '', price: 0, when: it.when || '', source: it.src || 'walk-in', status: it.status || 'booked', payStatus: 'none', archived: !!it.archived, deleted: !!it.deleted, notes: it.notes || '' }); mapping.push({ tempId: it.id, _id: doc._id }); }
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
    if (Array.isArray(s.promos)) patch.promos = s.promos;
    if (s.schedule && typeof s.schedule === 'object') patch.schedule = s.schedule;
    if (Array.isArray(s.exceptions)) patch.exceptions = s.exceptions;
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
