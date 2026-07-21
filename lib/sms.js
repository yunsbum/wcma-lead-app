const db = require('./db');
async function sendSMS(to, body) {
  let sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM;
  try { const s = await db.getSettings(); if (s.twilioSid) sid = s.twilioSid; if (s.twilioToken) tok = s.twilioToken; if (s.twilioFrom) from = s.twilioFrom; } catch (e) {}
  if (!sid || !tok || !from || !to) { console.log('[sms:STUB] ' + to + ': ' + body); return { stub: true }; }
  try { return await require('twilio')(sid, tok).messages.create({ to, from, body }); } catch (e) { console.error('[sms]', e.message); return { ok:false }; }
}
module.exports = { sendSMS };
