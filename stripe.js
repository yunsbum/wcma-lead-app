const fs = require('fs');
const path = require('path');
const useMongo = !!process.env.MONGO_URI;
const FILE = path.join(__dirname, '..', 'data', 'leads.json');
const SFILE = path.join(__dirname, '..', 'data', 'settings.json');
const OFILE = path.join(__dirname, '..', 'data', 'orders.json');
let mongoose = null, LeadModel = null, SettingsModel = null, OrderModel = null;
function buildModel() {
  mongoose = require('mongoose');
  SettingsModel = mongoose.models.Settings || mongoose.model('Settings', new mongoose.Schema({ _id: String }, { versionKey: false, strict: false }));
  const leadSchema = new mongoose.Schema({
    schoolId: { type: String, default: 'wcma', index: true },
    orderId: { type: String, index: true }, buyerId: String,
    student: String, age: Number, guardian: String, email: String, phone: String,
    program: String, programId: String, price: Number, promo: String, discount: Number,
    when: String, slotDate: String, slotTime: String, dob: String, gender: String, medicalNotes: String, source: String,
    status: { type: String, default: 'booked' }, payStatus: { type: String, default: 'none' },
    notes: { type: String, default: '' }, archived: { type: Boolean, default: false }, deleted: { type: Boolean, default: false },
    stripeSessionId: String, createdAt: { type: Date, default: Date.now }
  }, { versionKey: false, strict: false });
  LeadModel = mongoose.models.Lead || mongoose.model('Lead', leadSchema);
  OrderModel = mongoose.models.Order || mongoose.model('Order', new mongoose.Schema({ _id: String }, { versionKey: false, strict: false }));
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
function readOrders() { try { return JSON.parse(fs.readFileSync(OFILE, 'utf8')); } catch { return []; } }
function writeOrders(a) { if (!fs.existsSync(path.dirname(OFILE))) fs.mkdirSync(path.dirname(OFILE), { recursive: true }); fs.writeFileSync(OFILE, JSON.stringify(a, null, 2)); }
async function createOrder(doc) {
  const order = Object.assign({ _id: doc._id || ('order_' + Date.now() + Math.floor(Math.random()*1000)), createdAt: new Date().toISOString() }, doc);
  if (useMongo) { await OrderModel.create(order); return order; }
  const a = readOrders(); a.push(order); writeOrders(a); return order;
}
async function getOrder(id) { if (useMongo) return (await OrderModel.findById(id).lean()) || null; return readOrders().find(o => String(o._id) === String(id)) || null; }
async function updateOrder(id, patch) { if (useMongo) return OrderModel.findByIdAndUpdate(id, patch, { new: true }).lean(); const a=readOrders();const i=a.findIndex(o=>String(o._id)===String(id));if(i===-1)return null;a[i]=Object.assign(a[i],patch);writeOrders(a);return a[i]; }
async function updateOrderBySession(sid, patch) { if(!sid)return null; if (useMongo) return OrderModel.findOneAndUpdate({ stripeSessionId: sid }, patch, { new: true }).lean(); const a=readOrders();const i=a.findIndex(o=>o.stripeSessionId===sid);if(i===-1)return null;a[i]=Object.assign(a[i],patch);writeOrders(a);return a[i]; }
async function listOrders() { if (useMongo) return OrderModel.find().sort({ createdAt: -1 }).lean(); return readOrders().sort((x,y)=>new Date(y.createdAt)-new Date(x.createdAt)); }
async function updateLeadsByOrder(orderId, patch) { if (useMongo) return LeadModel.updateMany({ orderId }, patch); const a=readFile();let ch=false;a.forEach((l,i)=>{if(l.orderId===orderId){a[i]=Object.assign(a[i],patch);ch=true;}});if(ch)writeFile(a);return {}; }
async function getSettings() { if (useMongo) return (await SettingsModel.findById('wcma').lean())||{}; try{return JSON.parse(fs.readFileSync(SFILE,'utf8'));}catch{return {};} }
async function saveSettings(patch) { if (useMongo) return SettingsModel.findByIdAndUpdate('wcma', patch, { new: true, upsert: true }).lean(); const cur=await getSettings();const next=Object.assign(cur,patch);if(!fs.existsSync(path.dirname(SFILE)))fs.mkdirSync(path.dirname(SFILE),{recursive:true});fs.writeFileSync(SFILE,JSON.stringify(next,null,2));return next; }
module.exports = { init, createLead, listLeads, updateBySession, setSession, markPaidById, updateFields, getSettings, saveSettings, createOrder, getOrder, updateOrder, updateOrderBySession, listOrders, updateLeadsByOrder };
