const crypto = require('crypto');
const COOKIE = 'wcma_auth';
function pw() { return process.env.ADMIN_PASSWORD || 'changeme'; }
function token() { return crypto.createHmac('sha256', pw()).update('wcma-admin-v1').digest('hex').slice(0, 32); }
function parseCookies(req) { const o={}; (req.headers.cookie||'').split(';').forEach(p=>{const i=p.indexOf('=');if(i>-1)o[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim());}); return o; }
function isAuthed(req) { return parseCookies(req)[COOKIE] === token(); }
function setCookie(res) { res.setHeader('Set-Cookie', COOKIE + '=' + token() + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000'); }
function clearCookie(res) { res.setHeader('Set-Cookie', COOKIE + '=; Path=/; HttpOnly; Max-Age=0'); }
function requireAuth(req, res, next) { if (isAuthed(req)) return next(); if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'auth required' }); return res.redirect('/login'); }
function check(p) { return p === pw(); }
module.exports = { requireAuth, setCookie, clearCookie, check, isAuthed };
