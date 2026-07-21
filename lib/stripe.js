// Stripe wrapper. Runs in MOCK mode when STRIPE_SECRET_KEY is blank,
// so the whole booking flow works locally with no keys and no real charges.
const key = process.env.STRIPE_SECRET_KEY;
const stripe = key ? require('stripe')(key) : null;
const mock = !stripe;

// Note: with Stripe Checkout, a declined card is handled inline on Stripe's page —
// the customer just retries with another card. We only record paid vs not-paid.

async function createCheckout({ lead, program, baseUrl }) {
  if (mock) {
    // Pretend a session was created; success page will just mark it paid.
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

module.exports = { stripe, mock, createCheckout };
