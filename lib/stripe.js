const db = require('./db');
async function currentKey() {
  try { const s = await db.getSettings(); const k = s.stripeKey || s.stripeSecretKey || ''; if (/^sk_/.test(k)) return k; } catch (e) {}
  const env = process.env.STRIPE_SECRET_KEY; return (env && /^sk_/.test(env)) ? env : '';
}
async function getClient() { const key = await currentKey(); if (!key) return { stripe: null, mock: true }; try { return { stripe: require('stripe')(key), mock: false }; } catch (e) { console.error('[stripe] init failed', e.message); return { stripe: null, mock: true }; } }
async function createCheckout({ lead, program, baseUrl, amount }) {
  const { stripe, mock } = await getClient();
  // amount (in cents) lets the caller charge a promo-discounted total; falls back to the program price.
  const unit = (typeof amount === 'number' && amount >= 0) ? Math.round(amount) : program.price;
  if (mock) return { id: 'cs_mock_' + Date.now(), url: baseUrl + '/success?mock=1&lead=' + lead._id };
  return stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: unit, product_data: { name: program.name + ' — Intro (World Class Martial Arts)' } } }],
    customer_email: lead.email || undefined,
    success_url: baseUrl + '/success?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: baseUrl + '/signup?canceled=1',
    metadata: { leadId: String(lead._id), programId: program.id }
  });
}
module.exports = { createCheckout, getClient, currentKey };
