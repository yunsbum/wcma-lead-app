// Data layer: uses MongoDB when MONGO_URI is set, otherwise a local JSON file.
// The JSON fallback lets the app run instantly for testing with zero setup.
// mongoose is required lazily so the file-mode path has no external dependencies.
const fs = require('fs');
const path = require('path');

const useMongo = !!process.env.MONGO_URI;
const FILE = path.join(__dirname, '..', 'data', 'leads.json');

let mongoose = null;
let LeadModel = null;
let SettingsModel = null;
const SFILE = path.join(__dirname, '..', 'data', 'settings.json');

function buildModel() {
  mongoose = require('mongoose');
  const settingsSchema = new mongoose.Schema({ _id: String }, { versionKey: false, strict: false });
  SettingsModel = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);
  const leadSchema = new mongoose.Schema({
    schoolId: { type: String, default: 'wcma', index: true }, // tenant-ready for later DOJOApp migration
    student: String, age: Number, guardian: String, email: String, phone: String,
    program: String, programId: String, price: Number, when: String, source: String,
    status: { type: String, default: 'booked' },
    payStatus: { type: String, default: 'none' },   // none | pending | paid | failed
    notes: { type: String, default: '' },
    archived: { type: Boolean, default: false },
    stripeSessionId: String,
    createdAt: { type: Date, default: Date.now }
  }, { versionKey: false });
  LeadModel = mongoose.models.Lead || mongoose.model('Lead', leadSchema);
}

async function init() {
  if (useMongo) {
    buildModel();
    await mongoose.connect(process.env.MONGO_URI);
    console.log('[db] connected to MongoDB');
  } else {
    if (!fs.existsSync(path.dirname(FILE))) fs.mkdirSync(path.dirname(FILE), { recursive: true });
    if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '[]');
    console.log('[db] using local JSON file (set MONGO_URI for real persistence)');
  }
}

function readFile() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; } }
function writeFile(arr) { fs.writeFileSync(FILE, JSON.stringify(arr, null, 2)); }

async function createLead(doc) {
  if (useMongo) return (await LeadModel.create(doc)).toObject();
  const arr = readFile();
  const lead = Object.assign({ _id: 'L' + Date.now() + Math.floor(Math.random() * 1000), createdAt: new Date().toISOString() }, doc);
  arr.push(lead); writeFile(arr); return lead;
}

async function listLeads() {
  if (useMongo) return LeadModel.find().sort({ createdAt: -1 }).lean();
  return readFile().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function updateBySession(sessionId, patch) {
  if (!sessionId) return null;
  if (useMongo) return LeadModel.findOneAndUpdate({ stripeSessionId: sessionId }, patch, { new: true }).lean();
  const arr = readFile(); const i = arr.findIndex(l => l.stripeSessionId === sessionId);
  if (i === -1) return null; arr[i] = Object.assign(arr[i], patch); writeFile(arr); return arr[i];
}

async function setSession(leadId, sessionId) {
  if (useMongo) return LeadModel.updateOne({ _id: leadId }, { stripeSessionId: sessionId });
  const arr = readFile(); const i = arr.findIndex(l => l._id === leadId);
  if (i > -1) { arr[i].stripeSessionId = sessionId; writeFile(arr); }
}

async function updateFields(id, patch) {
  if (useMongo) return LeadModel.findByIdAndUpdate(id, patch, { new: true }).lean();
  const arr = readFile(); const i = arr.findIndex(l => String(l._id) === String(id));
  if (i === -1) return null; arr[i] = Object.assign(arr[i], patch); writeFile(arr); return arr[i];
}

async function markPaidById(leadId) {
  if (useMongo) return LeadModel.findByIdAndUpdate(leadId, { payStatus: 'paid', status: 'confirmed' }, { new: true }).lean();
  const arr = readFile(); const i = arr.findIndex(l => l._id === leadId);
  if (i > -1) { arr[i] = Object.assign(arr[i], { payStatus: 'paid', status: 'confirmed' }); writeFile(arr); return arr[i]; }
  return null;
}

// ---- App settings store (single doc; holds admin-entered Stripe key, etc.) ----
async function getSettings() {
  if (useMongo) { return (await SettingsModel.findById('wcma').lean()) || {}; }
  try { return JSON.parse(fs.readFileSync(SFILE, 'utf8')); } catch { return {}; }
}
async function saveSettings(patch) {
  if (useMongo) { return SettingsModel.findByIdAndUpdate('wcma', patch, { new: true, upsert: true }).lean(); }
  const cur = await getSettings(); const next = Object.assign(cur, patch);
  if (!fs.existsSync(path.dirname(SFILE))) fs.mkdirSync(path.dirname(SFILE), { recursive: true });
  fs.writeFileSync(SFILE, JSON.stringify(next, null, 2)); return next;
}

module.exports = { init, createLead, listLeads, updateBySession, setSession, markPaidById, updateFields, getSettings, saveSettings };
