require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./lib/db');
const programs = require('./lib/programs');
const { createCheckout, mock } = require('./lib/stripe');
const { sendSMS, enabled: smsOn } = require('./lib/sms');

const app = express();
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const SCHOOL = {
  name: process.env.SCHOOL_NAME || 'World Class Martial Arts',
  email: process.env.SCHOOL_EMAIL || '',
  phone: process.env.SCHOOL_PHONE || ''
};

// --- Stripe webhook needs the RAW body, so mount it BEFORE express.json ---
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const { stripe } = require('./lib/stripe');
  let event = null;
  try {
    if (stripe && process.env.STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      event = JSON.parse(req.body.toString() || '{}'); // mock/dev
    }
  } catch (err) {
    console.error('[webhook] signature error', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      await db.updateBySession(s.id, { payStatus: 'paid', status: 'confirmed' });
    } else if (event.type === 'checkout.session.async_payment_failed') {
      // e.g. a delayed ACH failure. Just flag it as not paid — customer can rebook / retry with another card.
      await db.updateBySession(event.data.object.id, { payStatus: 'failed' });
    }
  } catch (e) { console.error('[webhook] handler error', e.message); }

  res.json({ received: true });
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/programs', (req, res) => res.json(programs));

app.post('/api/book', async (req, res) => {
  try {
    const b = req.body || {};
    const program = programs.find(p => p.id === b.programId);
    if (!program) return res.status(400).json({ error: 'Invalid program' });
    if (!b.student || !b.email || !b.phone) return res.status(400).json({ error: 'Missing required fields' });

    const lead = await db.createLead({
      student: b.student, age: b.age ? Number(b.age) : undefined, guardian: b.guardian || '',
      email: b.email, phone: b.phone, program: program.name, programId: program.id,
      price: program.price, when: b.when || '', source: b.source || 'direct',
      status: 'booked', payStatus: program.price > 0 ? 'pending' : 'none'
    });

    // School notification (email/SMS both stubbed here; SMS via Twilio when enabled)
    console.log(`[notify] New intro for ${SCHOOL.name}: ${lead.student} · ${program.name} · ${lead.when} -> ${SCHOOL.email} / ${SCHOOL.phone}`);
    if (smsOn) sendSMS(SCHOOL.phone, `New intro: ${lead.student} · ${program.name} · ${lead.when}`).catch(() => {});

    if (program.price > 0) {
      const session = await createCheckout({ lead, program, baseUrl: BASE_URL });
      // store the session id on the lead so the webhook can match the payment result
      await db.setSession(lead._id, session.id);
      return res.json({ ok: true, pay: true, checkoutUrl: session.url });
    }

    return res.json({ ok: true, pay: false, message: 'Booked! See you in class.' });
  } catch (e) {
    console.error('[book] error', e);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.get('/success', async (req, res) => {
  // In mock mode we mark the booking paid here; in live mode the Stripe webhook is the source of truth.
  if (req.query.mock && req.query.lead) {
    try { await db.markPaidById(req.query.lead); } catch {}
  }
  res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

// --- Simple password-protected admin lead list ---
app.get('/admin', basicAuth, async (req, res) => {
  const leads = await db.listLeads();
  const rows = leads.map(l => `<tr>
    <td>${esc(l.student)}</td><td>${esc(l.program)}</td><td>${esc(l.when)}</td>
    <td>${esc(l.email)}<br>${esc(l.phone)}</td><td>${esc(l.source)}</td>
    <td>${l.price ? '$' + (l.price/100).toFixed(2) : 'Free'}</td>
    <td>${badge(l.payStatus)}</td>
    <td>${esc(new Date(l.createdAt).toLocaleString())}</td></tr>`).join('');
  res.send(`<!doctype html><meta charset=utf8><title>WCMA Leads</title>
  <style>body{font-family:-apple-system,Arial,sans-serif;margin:24px;color:#1e293b}
  h1{font-size:20px}table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{border:1px solid #e5e7eb;padding:8px;text-align:left;vertical-align:top}
  th{background:#f5f7fb}.b{padding:2px 8px;border-radius:99px;font-size:12px;font-weight:600}</style>
  <h1>${SCHOOL.name} — Intro Leads (${leads.length})</h1>
  <table><tr><th>Student</th><th>Program</th><th>When</th><th>Contact</th><th>Source</th><th>Price</th><th>Payment</th><th>Created</th></tr>${rows||'<tr><td colspan=8>No leads yet.</td></tr>'}</table>`);
});

function badge(s) {
  const map = { paid:['#1cb454','Paid'], failed:['#e63535','Failed'], pending:['#e2a907','Pending'], none:['#64748b','—'] };
  const [c, t] = map[s] || map.none; return `<span class="b" style="background:${c}22;color:${c}">${t}</span>`;
}
function esc(v){return (v==null?'':''+v).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));}
function basicAuth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const [, b64] = hdr.split(' ');
  const [, pass] = Buffer.from(b64 || '', 'base64').toString().split(':');
  if (pass && pass === (process.env.ADMIN_PASSWORD || 'changeme')) return next();
  res.set('WWW-Authenticate', 'Basic realm="WCMA Admin"').status(401).send('Auth required');
}

const PORT = process.env.PORT || 3000;
db.init().then(() => {
  app.listen(PORT, () => {
    console.log(`WCMA lead app on ${BASE_URL}  (Stripe: ${mock ? 'MOCK' : 'LIVE keys'}, SMS: ${smsOn ? 'ON' : 'stubbed'})`);
  });
}).catch(e => { console.error('startup failed', e); process.exit(1); });
