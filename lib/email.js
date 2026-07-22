const db = require('./db');
let nodemailer = null; try { nodemailer = require('nodemailer'); } catch (e) { /* installed on the server */ }

async function cfg() {
  const env = process.env; let s = {};
  try { s = (await db.getSettings()) || {}; } catch (e) {}
  const smtpHost = s.smtpHost || env.SMTP_HOST || '';
  const smtpPort = Number(s.smtpPort || env.SMTP_PORT || 465);
  const smtpUser = s.smtpUser || env.SMTP_USER || '';
  const smtpPass = s.smtpPass || env.SMTP_PASS || '';
  const smtpSecure = (typeof s.smtpSecure !== 'undefined' && s.smtpSecure !== null && s.smtpSecure !== '') ? !!s.smtpSecure : (smtpPort === 465);
  const from = s.fromEmail || env.FROM_EMAIL || smtpUser || '';
  const sgKey = s.sendgridKey || env.SENDGRID_KEY || '';
  const notifyEmail = !!s.notifyEmail; const schoolEmail = s.schoolEmail || '';
  return { smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, from, sgKey, notifyEmail, schoolEmail };
}

// Send one email. Prefers the school's own mailbox (SMTP); falls back to SendGrid; else logs a stub.
async function send(to, subject, html) {
  const c = await cfg();
  if (!to || !c.from) { console.log('[email:STUB] to ' + (to || '(none)') + ': ' + subject); return { stub: true }; }
  if (c.smtpHost && c.smtpUser && c.smtpPass && nodemailer) {
    try {
      const tx = nodemailer.createTransport({ host: c.smtpHost, port: c.smtpPort, secure: c.smtpSecure, auth: { user: c.smtpUser, pass: c.smtpPass } });
      await tx.sendMail({ from: '"World Class Martial Arts" <' + c.from + '>', to: to, subject: subject, html: html });
      return { ok: true };
    } catch (e) { console.error('[email:smtp]', e.message); return { ok: false, error: e.message }; }
  }
  if (c.sgKey) {
    try {
      const r = await fetch('https://api.sendgrid.com/v3/mail/send', { method: 'POST', headers: { 'Authorization': 'Bearer ' + c.sgKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalizations: [{ to: [{ email: to }] }], from: { email: c.from, name: 'World Class Martial Arts' }, subject, content: [{ type: 'text/html', value: html }] }) });
      if (!r.ok) { console.error('[email:sendgrid] failed', r.status, await r.text().catch(() => '')); return { ok: false }; }
      return { ok: true };
    } catch (e) { console.error('[email:sendgrid]', e.message); return { ok: false }; }
  }
  console.log('[email:STUB] to ' + to + ': ' + subject);
  return { stub: true };
}

async function onBooking(lead) {
  const c = await cfg();
  const cust = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1e293b"><h2>You are booked! &#129354;</h2><p>Hi ' + (lead.student || 'there') + ', thanks for signing up for your intro at <b>World Class Martial Arts</b>.</p><p><b>Program:</b> ' + (lead.program || '') + '<br><b>When:</b> ' + (lead.when || 'we will confirm shortly') + '</p><p>Please arrive 10 minutes early in comfortable clothes. See you soon!</p><p style="color:#64748b">&mdash; World Class Martial Arts</p></div>';
  await send(lead.email, 'You are booked — World Class Martial Arts', cust);
  if (c.notifyEmail && c.schoolEmail) {
    const sh = '<div style="font-family:Arial,sans-serif;font-size:14px"><h3>New intro booking</h3><p><b>' + lead.student + '</b> (' + (lead.age || '?') + ')<br>' + lead.program + ' &middot; ' + lead.when + '<br>' + (lead.phone || '') + ' &middot; ' + (lead.email || '') + '<br>Source: ' + (lead.source || 'direct') + '</p></div>';
    await send(c.schoolEmail, 'New intro: ' + lead.student + ' · ' + lead.program, sh);
  }
}

async function onOrder(order, participants) {
  const c = await cfg();
  const buyer = order.buyer || {};
  const money = v => '$' + ((v || 0) / 100).toFixed(2);
  const rows = (participants || []).map(p => '<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">' + (p.student || '') + '</td><td style="padding:6px 10px;border-bottom:1px solid #eee">' + (p.program || '') + '</td><td style="padding:6px 10px;border-bottom:1px solid #eee">' + (p.when || 'TBD') + '</td></tr>').join('');
  const cust = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1e293b"><h2>You are registered! &#129354;</h2><p>Hi ' + (buyer.first || 'there') + ', thanks for registering at <b>World Class Martial Arts</b>. Here is your registration:</p>'
    + '<table style="border-collapse:collapse;width:100%;font-size:14px;margin:10px 0"><tr><th style="text-align:left;padding:6px 10px;border-bottom:2px solid #ddd">Participant</th><th style="text-align:left;padding:6px 10px;border-bottom:2px solid #ddd">Program</th><th style="text-align:left;padding:6px 10px;border-bottom:2px solid #ddd">When</th></tr>' + rows + '</table>'
    + '<p><b>Total paid:</b> ' + money(order.total) + '</p><p>Please arrive 10 minutes early in comfortable clothes. See you soon!</p><p style="color:#64748b">&mdash; World Class Martial Arts</p></div>';
  await send(buyer.email, 'You are registered — World Class Martial Arts', cust);
  if (c.notifyEmail && c.schoolEmail) {
    const sh = '<div style="font-family:Arial,sans-serif;font-size:14px"><h3>New registration (' + (participants || []).length + ' participant(s))</h3><p><b>' + (buyer.first || '') + ' ' + (buyer.last || '') + '</b><br>' + (buyer.phone || '') + ' &middot; ' + (buyer.email || '') + '<br>Total: ' + money(order.total) + '</p><table style="border-collapse:collapse;font-size:13px">' + rows + '</table></div>';
    await send(c.schoolEmail, 'New registration: ' + (buyer.first || '') + ' ' + (buyer.last || '') + ' (' + (participants || []).length + ')', sh);
  }
}
module.exports = { onBooking, onOrder, cfg, send };
