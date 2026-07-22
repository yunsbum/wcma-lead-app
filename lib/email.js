const db = require('./db');
let nodemailer = null; try { nodemailer = require('nodemailer'); } catch (e) { /* installed on the server */ }

async function cfg() {
  const env = process.env; let s = {};
  try { s = (await db.getSettings()) || {}; } catch (e) {}
  const smtpHost = s.smtpHost || env.SMTP_HOST || '';
  const smtpPort = Number(s.smtpPort || env.SMTP_PORT || 465);
  const smtpUser = s.smtpUser || env.SMTP_USER || '';
  const smtpPass = s.smtpPass || env.SMTP_PASS || '';
  const smtpSecure = (smtpPort === 465); // 465 = implicit SSL, 587 = STARTTLS (derive from port to avoid mismatches)
  const from = s.fromEmail || env.FROM_EMAIL || smtpUser || '';
  const sgKey = s.sendgridKey || env.SENDGRID_KEY || '';
  const notifyEmail = !!s.notifyEmail; const schoolEmail = s.schoolEmail || '';
  const confirmSubject = s.confirmSubject || ''; const confirmMessage = s.confirmMessage || '';
  return { smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, from, sgKey, notifyEmail, schoolEmail, confirmSubject, confirmMessage };
}

const SCHOOL = 'World Class Martial Arts';
const DEF_CONF_SUBJECT = "You're in! See you at {school} 🥋";
const DEF_CONF_MSG = "Hi {student},\n\nThank you for signing up — we're genuinely excited to meet you! Taking the first step is the hardest part, and you just did it. 👏\n\nOur team can't wait to welcome you on the mat and help you build confidence, focus, and strength from day one. Come as you are — no experience needed, just bring a great attitude.\n\n{summary}\n\nPlease arrive 10 minutes early in comfortable clothes. If you have any questions, just reply to this email.\n\nSee you soon,\nThe {school} Team";
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
// Build the customer confirmation email from the school's (editable) template + auto booking summary.
function buildConfirm(c, order, participants) {
  const buyer = order.buyer || {};
  const money = v => '$' + ((v || 0) / 100).toFixed(2);
  const p0 = (participants && participants[0]) || {};
  const rows = (participants || []).map(p => '<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">' + esc(p.student) + '</td><td style="padding:6px 10px;border-bottom:1px solid #eee">' + esc(p.program) + '</td><td style="padding:6px 10px;border-bottom:1px solid #eee">' + esc(p.when || 'TBD') + '</td></tr>').join('');
  const summary = '<table style="border-collapse:collapse;width:100%;font-size:14px;margin:6px 0 4px"><tr><th style="text-align:left;padding:6px 10px;border-bottom:2px solid #ddd">Participant</th><th style="text-align:left;padding:6px 10px;border-bottom:2px solid #ddd">Program</th><th style="text-align:left;padding:6px 10px;border-bottom:2px solid #ddd">When</th></tr>' + rows + '</table><p style="margin:4px 0"><b>Total paid:</b> ' + money(order.total) + '</p>';
  const textVars = { student: p0.student || buyer.first || 'there', buyer: buyer.first || 'there', program: p0.program || '', when: p0.when || '', amount: money(order.total), school: SCHOOL, confirmation: String(order._id || '').replace('order_', 'WC-') };
  const subject = String(c.confirmSubject || DEF_CONF_SUBJECT).replace(/\{(\w+)\}/g, (m, k) => (k !== 'summary' && textVars[k] != null) ? textVars[k] : '');
  let body = c.confirmMessage || DEF_CONF_MSG;
  if (body.indexOf('{summary}') === -1) body += '\n\n{summary}';
  // escape the school's text, keep line breaks, then substitute variables (text escaped, summary raw HTML)
  let htmlBody = esc(body).replace(/\n/g, '<br>').replace(/\{(\w+)\}/g, (m, k) => k === 'summary' ? summary : (textVars[k] != null ? esc(textVars[k]) : ''));
  const html = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1e293b;line-height:1.55">' + htmlBody + '</div>';
  return { subject, html };
}

// Send with an explicit config object (used by the "test email" button with unsaved field values).
async function sendWith(c, to, subject, html) {
  if (!to || !c.from) { console.log('[email:STUB] to ' + (to || '(none)') + ': ' + subject); return { stub: true }; }
  if (c.smtpHost && c.smtpUser && c.smtpPass && nodemailer) {
    try {
      const port = Number(c.smtpPort) || 465;
      const tx = nodemailer.createTransport({
        host: c.smtpHost, port: port,
        secure: port === 465,            // 465 → implicit SSL; 587 → STARTTLS
        requireTLS: port === 587,
        auth: { user: c.smtpUser, pass: c.smtpPass },
        tls: { rejectUnauthorized: false }, // tolerate shared-hosting cert name mismatch
        connectionTimeout: 15000, greetingTimeout: 12000, socketTimeout: 20000
      });
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
// Send one email using the saved settings.
async function send(to, subject, html) { return sendWith(await cfg(), to, subject, html); }

async function onBooking(lead) {
  const c = await cfg();
  const order = { buyer: { first: lead.student, last: '', email: lead.email, phone: lead.phone }, total: lead.price || 0, _id: lead._id || '' };
  const participants = [{ student: lead.student, program: lead.program, when: lead.when }];
  const built = buildConfirm(c, order, participants);
  await sendWith(c, lead.email, built.subject, built.html);
  if (c.notifyEmail && c.schoolEmail) {
    const sh = '<div style="font-family:Arial,sans-serif;font-size:14px"><h3>New intro booking</h3><p><b>' + esc(lead.student) + '</b> (' + (lead.age || '?') + ')<br>' + esc(lead.program) + ' &middot; ' + esc(lead.when) + '<br>' + esc(lead.phone || '') + ' &middot; ' + esc(lead.email || '') + '<br>Source: ' + esc(lead.source || 'direct') + '</p></div>';
    await sendWith(c, c.schoolEmail, 'New intro: ' + lead.student + ' · ' + lead.program, sh);
  }
}

async function onOrder(order, participants) {
  const c = await cfg();
  const buyer = order.buyer || {};
  const money = v => '$' + ((v || 0) / 100).toFixed(2);
  const built = buildConfirm(c, order, participants);
  await sendWith(c, buyer.email, built.subject, built.html);
  if (c.notifyEmail && c.schoolEmail) {
    const rows = (participants || []).map(p => '<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">' + esc(p.student) + '</td><td style="padding:6px 10px;border-bottom:1px solid #eee">' + esc(p.program) + '</td><td style="padding:6px 10px;border-bottom:1px solid #eee">' + esc(p.when || 'TBD') + '</td></tr>').join('');
    const sh = '<div style="font-family:Arial,sans-serif;font-size:14px"><h3>New registration (' + (participants || []).length + ' participant(s))</h3><p><b>' + esc(buyer.first || '') + ' ' + esc(buyer.last || '') + '</b><br>' + esc(buyer.phone || '') + ' &middot; ' + esc(buyer.email || '') + '<br>Total: ' + money(order.total) + '</p><table style="border-collapse:collapse;font-size:13px">' + rows + '</table></div>';
    await sendWith(c, c.schoolEmail, 'New registration: ' + (buyer.first || '') + ' ' + (buyer.last || '') + ' (' + (participants || []).length + ')', sh);
  }
}
module.exports = { onBooking, onOrder, cfg, send, sendWith };
