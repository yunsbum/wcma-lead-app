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
// One Stripe Checkout for a whole order: one line item per participant (方式 2),
// order-level promo applied as a one-time coupon, idempotency key prevents duplicate orders on double-click.
async function createOrderCheckout({ order, items, baseUrl, discount, idempotencyKey }) {
  const { stripe, mock } = await getClient();
  if (mock) return { id: 'cs_mock_' + order._id, url: baseUrl + '/success?mock=1&order=' + order._id };
  const line_items = items.map(i => ({ quantity: 1, price_data: { currency: 'usd', unit_amount: Math.round(i.amount), product_data: { name: i.name } } }));
  const params = {
    mode: 'payment',
    line_items,
    customer_email: (order.buyer && order.buyer.email) || undefined,
    success_url: baseUrl + '/success?order=' + order._id + '&session_id={CHECKOUT_SESSION_ID}',
    cancel_url: baseUrl + '/signup?canceled=1&order=' + order._id,
    metadata: {
      school_id: order.schoolId || 'wcma', order_id: String(order._id), buyer_id: String(order.buyerId || ''),
      participant_count: String(items.length), lead_source: (order.buyer && order.buyer.source) || 'signup'
    }
  };
  if (discount && discount > 0) {
    const coupon = await stripe.coupons.create({ amount_off: Math.round(discount), currency: 'usd', duration: 'once', name: 'Promo ' + (order.promo || '') });
    params.discounts = [{ coupon: coupon.id }];
  }
  const opts = idempotencyKey ? { idempotencyKey: String(idempotencyKey) } : {};
  return stripe.checkout.sessions.create(params, opts);
}
module.exports = { createCheckout, createOrderCheckout, getClient, currentKey };
