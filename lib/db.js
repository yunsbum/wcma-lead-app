const fs = require('fs');
const path = require('path');
const useMongo = !!process.env.MONGO_URI;
const FILE = path.join(__dirname, '..', 'data', 'leads.json');
const SFILE = path.join(__dirname, '..', 'data', 'settings.json');
let mongoose = null, LeadModel = null, SettingsModel = null;
function buildModel() {
  mongoose = require('mongoose');
  SettingsModel = mongoose.models.Settings || mongoose.model('Settings', new mongoose.Schema({ _id: String }, { versionKey: false, strict: false }));
  const leadSchema = new mongoose.Schema({
    schoolId: { type: String, default: 'wcma', index: true },
    student: String, age: Number, guardian: String, email: String, phone: String,
    program: String, programId: String, price: Number, when: String, source: String,
    status: { type: String, default: 'booked' }, payStatus: { type: String, default: 'none' },
    notes: { type: String, default: '' }, archived: { type: Boolean, default: false },
    stripeSessionId: String, createdAt: { type: Date, default: Date.now }
  }, { versionKey: false });
  LeadModel = mongoose.models.Lead || mongoose.model('Lead', leadSchema);
}
async function init() {
  if (useMongo) { buildModel(); await mongoose.connect(process.env.MONGO_URI); console.log('[db] connected to MongoDB'); }
  else { if (!fs.existsSync(path.dirname(FILE))) fs.mkdirSync(path.dirname(FILE), { recursive: true }); if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '[]'); console.log('[db] using local JSON file'); }
}
function readFile() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; } }
function writeFile(a) { fs.writeFileSync(FILE, JSON.stringify(a, null, 2)); }
async function createLead(doc) {
  if (useMongo) return (await LeadModel.create(doc)).toObject();
  const a = readFile(); const lead = Object.assign({ _id: 'L' + Date.now() + Math.floor(Math.random()*1000), createdAt: new Date().toISOString() }, doc);
  a.push(lead); writeFile(a); return lead;
}
async function listLeads() { if (useMongo) return LeadModel.find().sort({ createdAt: -1 }).lean(); return readFile().sort((x,y)=>new Date(y.createdAt)-new Date(x.createdAt)); }
async function updateBySession(sid, patch) { if(!sid)return null; if (useMongo) return LeadModel.findOneAndUpdate({ stripeSessionId: sid }, patch, { new: true }).lean(); const a=readFile();const i=a.findIndex(l=>l.stripeSessionId===sid);if(i===-1)return null;a[i]=Object.assign(a[i],patch);writeFile(a);return a[i]; }
async function setSession(id, sid) { if (useMongo) return LeadModel.updateOne({ _id: id }, { stripeSessionId: sid }); const a=readFile();const i=a.findIndex(l=>l._id===id);if(i>-1){a[i].stripeSessionId=sid;writeFile(a);} }
async function updateFields(id, patch) { if (useMongo) return LeadModel.findByIdAndUpdate(id, patch, { new: true }).lean(); const a=readFile();const i=a.findIndex(l=>String(l._id)===String(id));if(i===-1)return null;a[i]=Object.assign(a[i],patch);writeFile(a);return a[i]; }
async function markPaidById(id) { if (useMongo) return LeadModel.findByIdAndUpdate(id, { payStatus:'paid', status:'confirmed' }, { new: true }).lean(); const a=readFile();const i=a.findIndex(l=>l._id===id);if(i>-1){a[i]=Object.assign(a[i],{payStatus:'paid',status:'confirmed'});writeFile(a);return a[i];}return null; }
async function getSettings() { if (useMongo) return (await SettingsModel.findById('wcma').lean())||{}; try{return JSON.parse(fs.readFileSync(SFILE,'utf8'));}catch{return {};} }
async function saveSettings(patch) { if (useMongo) return SettingsModel.findByIdAndUpdate('wcma', patch, { new: true, upsert: true }).lean(); const cur=await getSettings();const next=Object.assign(cur,patch);if(!fs.existsSync(path.dirname(SFILE)))fs.mkdirSync(path.dirname(SFILE),{recursive:true});fs.writeFileSync(SFILE,JSON.stringify(next,null,2));return next; }
module.exports = { init, createLead, listLeads, updateBySession, setSession, markPaidById, updateFields, getSettings, saveSettings };
