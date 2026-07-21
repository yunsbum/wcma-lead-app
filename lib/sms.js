// Twilio SMS — intentionally STUBBED (off) for now.
// Flip SMS_ENABLED=true and add keys later; no other code needs to change.
let client = null;
const enabled = String(process.env.SMS_ENABLED).toLowerCase() === 'true';

if (enabled && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try { client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN); }
  catch (e) { console.log('[sms] twilio package not installed; staying stubbed'); }
}

async function sendSMS(to, body) {
  if (!enabled || !client) {
    console.log(`[sms:STUB] would text ${to}: ${body}`);
    return { stub: true };
  }
  return client.messages.create({ to, from: process.env.TWILIO_FROM, body });
}

module.exports = { sendSMS, enabled };
