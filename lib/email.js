const db = require('./db');
async function cfg() {
  let key = process.env.SENDGRID_KEY || '', from = process.env.FROM_EMAIL || '', notifyEmail = false, schoolEmail = '';
  try { const s = await db.getSettings(); if (s.sendgridKey) key = s.sendgridKey; if (s.fromEmail) from = s.fromEmail; notifyEmail = !!s.notifyEmail; schoolEmail = s.schoolEmail || ''; } catch (e) {}
  return { key, from, notifyEmail, schoolEmail };
}
async function sendRaw(key, from, to, subject, html) {
  if (!key || !from || !to) { console.log('[email:STUB] to ' + (to||'(none)') + ': ' + subject); return { stub: true }; }
  try {
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', { method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ personalizations: [{ to: [{ email: to }] }], from: { email: from, name: 'World Class Martial Arts' }, subject, content: [{ type: 'text/html', value: html }] }) });
    if (!r.ok) { console.error('[email] failed', r.status, await r.text().catch(()=>'')); return { ok:false }; }
    return { ok: true };
  } catch (e) { console.error('[email]', e.message); return { ok:false }; }
}
async function onBooking(lead) {
  const c = await cfg();
  const cust = '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1e293b"><h2>You are booked! &#129354;</h2><p>Hi ' + (lead.student||'there') + ', thanks for signing up for your intro at <b>World Class Martial Arts</b>.</p><p><b>Program:</b> ' + (lead.program||'') + '<br><b>When:</b> ' + (lead.when||'we will confirm shortly') + '</p><p>Please arrive 10 minutes early in comfortable clothes. See you soon!</p><p style="color:#64748b">&mdash; World Class Martial Arts</p></div>';
  await sendRaw(c.key, c.from, lead.email, 'You are booked — World Class Martial Arts', cust);
  if (c.notifyEmail && c.schoolEmail) {
    const sh = '<div style="font-family:Arial,sans-serif;font-size:14px"><h3>New intro booking</h3><p><b>' + lead.student + '</b> (' + (lead.age||'?') + ')<br>' + lead.program + ' &middot; ' + lead.when + '<br>' + (lead.phone||'') + ' &middot; ' + (lead.email||'') + '<br>Source: ' + (lead.source||'direct') + '</p></div>';
    await sendRaw(c.key, c.from, c.schoolEmail, 'New intro: ' + lead.student + ' · ' + lead.program, sh);
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
  await sendRaw(c.key, c.from, buyer.email, 'You are registered — World Class Martial Arts', cust);
  if (c.notifyEmail && c.schoolEmail) {
    const sh = '<div style="font-family:Arial,sans-serif;font-size:14px"><h3>New registration (' + (participants || []).length + ' participant(s))</h3><p><b>' + (buyer.first || '') + ' ' + (buyer.last || '') + '</b><br>' + (buyer.phone || '') + ' &middot; ' + (buyer.email || '') + '<br>Total: ' + money(order.total) + '</p><table style="border-collapse:collapse;font-size:13px">' + rows + '</table></div>';
    await sendRaw(c.key, c.from, c.schoolEmail, 'New registration: ' + (buyer.first || '') + ' ' + (buyer.last || '') + ' (' + (participants || []).length + ')', sh);
  }
}
module.exports = { onBooking, onOrder, cfg };
