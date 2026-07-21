// Stripe wrapper. The secret key can come from (1) the admin console (saved in DB settings)
// or (2) the STRIPE_SECRET_KEY env var. If neither is set, runs in MOCK mode (no real charge).
// Everything is per-request and wrapped so a bad/blank key can never crash the server.
const db = require('./db');

async function currentKey() {
  try {
    const s = await db.getSettings();
    if (s && s.stripeSecretKey && /^sk_/.test(s.stripeSecretKey)) return s.stripeSecretKey;
  } catch (e) { /* ignore */ }
  const env = process.env.STRIPE_SECRET_KEY;
  return (env && /^sk_/.test(env)) ? env : '';
}

async function getClient() {
  const key = await currentKey();
  if (!key) return { stripe: null, mock: true, key: '' };
  try { return { stripe: require('stripe')(key), mock: false, key }; }
  catch (e) { console.error('[stripe] client init failed, falling back to mock:', e.message); return { stripe: null, mock: true, key: '' }; }
}

async function createCheckout({ lead, program, baseUrl }) {
  const { stripe, mock } = await getClient();
  if (mock) {
    return { id: 'cs_mock_' + Date.now(), url: `${baseUrl}/success?mock=1&lead=${lead._id}` };
  }
  return stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: program.price,
        product_data: { name: `${program.name} — Intro (World Class Martial Arts)` }
      }
    }],
    customer_email: lead.email || undefined,
    success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/?canceled=1`,
    metadata: { leadId: String(lead._id), programId: program.id }
  });
}

module.exports = { createCheckout, getClient, currentKey };
