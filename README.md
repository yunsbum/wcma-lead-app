# WCMA Intro Booking + Lead App (interim / standalone)

A small, real full-stack app so **World Class Martial Arts** can put a live intro-booking page
on its own domain, take **real Stripe payments**, and collect every lead centrally — before the
full multi-school version is built inside TheDOJOApp.

- **Frontend:** public booking page (`/`) + success page.
- **Backend:** Node/Express — creates bookings, Stripe Checkout sessions, and records the payment result.
- **Database:** MongoDB (same as TheDOJOApp, so it migrates cleanly later). Runs on a local file if no DB is set.
- **Payments:** Stripe Checkout (hosted & secure). Also captures the **payment-failure reason** on each lead.
- **SMS:** Twilio, intentionally **OFF** for now — flip one env flag later.
- **Admin:** password-protected lead list at `/admin`.

Every lead is stamped with `schoolId` ("wcma") so the whole thing drops into the 90+ school tenant model later.

---

## 1. Run it locally (works with ZERO keys — mock mode)

```bash
npm install
cp .env.example .env      # you can leave everything blank to start
npm start
```

Open http://localhost:3000 — book a class. With no Stripe key it runs in **mock mode**
(no real charge) so you can click the whole flow. Leads are saved to `data/leads.json`.
See them at http://localhost:3000/admin (user: anything, password: `changeme`).

---

## 2. Put it online (Render — free, ~15 min)

WordPress hosting can't run Node, so we host the app on **Render** and point your domain at it.

1. Push this folder to a GitHub repo (or drag-drop; Render can deploy from GitHub).
2. On https://render.com → **New → Web Service** → connect the repo.
   - Build command: `npm install`
   - Start command: `npm start`
3. Add environment variables (Render → Settings → Environment) from `.env.example`.
4. Deploy. Render gives you a URL like `https://wcma-lead.onrender.com`.

### Point your domain (`lead.uswcma.com`)
In Render → your service → **Settings → Custom Domains** → add `lead.uswcma.com`.
Render shows a **CNAME** target. Add that CNAME record in your domain's DNS
(wherever uswcma.com's DNS lives). Set `BASE_URL=https://lead.uswcma.com` in Render env.

Then, on your WordPress site, add a **"Book Intro Class"** button/QR that links to `https://lead.uswcma.com`.

---

## 3. Database (MongoDB Atlas — free)

1. https://www.mongodb.com/atlas → create a free cluster.
2. Create a DB user + allow network access, copy the connection string.
3. Set `MONGO_URI=mongodb+srv://...` in Render env. Done — leads now persist in a real DB.

Without `MONGO_URI` the app uses a local file (fine for testing, not for production).

---

## 4. Stripe (your school account)

> **Never put your secret key in the code or in chat.** Keys go only in Render's Environment settings.

1. Stripe Dashboard → Developers → **API keys**. Start in **Test mode**.
2. Set in Render env: `STRIPE_SECRET_KEY=sk_test_...`
3. **Webhook:** Stripe → Developers → Webhooks → Add endpoint
   `https://lead.uswcma.com/api/stripe/webhook`, events:
   `checkout.session.completed`, `checkout.session.async_payment_failed`.
   Copy the signing secret → `STRIPE_WEBHOOK_SECRET=whsec_...`
4. Test with card `4242 4242 4242 4242` (success) and `4000 0000 0000 0002` (declined).
   A declined card is handled **on Stripe's page** — the customer simply retries with another card.
5. When ready for real money: switch to **live** keys (`sk_live_...`) and a live webhook.

Payment is recorded as simply **paid / not paid** on each lead (shown in `/admin`). No failure-reason
detail here — that's only needed in TheDOJOApp member/tuition billing, not for intro bookings.

---

## 5. Twilio (later)

Leave `SMS_ENABLED=false` for now. When A2P 10DLC is approved:
set `SMS_ENABLED=true` and add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`. No code change.

---

## 6. QR code

Point a QR at `https://lead.uswcma.com` (add `?src=flyer` or `?src=event` to track where signups come from).
Any QR generator works; the source tag shows up on each lead in `/admin`.

---

## Notes / limitations (interim build)
- Scheduling is a simple date + time-slot picker (good for events). The full availability engine
  (capacity, exceptions, per-day slots) comes with the DOJOApp version.
- Email confirmations are logged, not sent, until an email provider is wired (SendGrid/SES) — easy add.
- This is the bridge to the real product; the data model (`schoolId`, lead fields) matches so migration is clean.
