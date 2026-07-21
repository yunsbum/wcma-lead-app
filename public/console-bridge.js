/* Live-data bridge for the WCMA Lead Management console (v109).
   Replaces the console's localStorage lead data with real bookings from the backend,
   and syncs status changes / archive / manual adds back to the database.
   (Contains no secrets; the /api endpoints it calls are password-protected.) */
(function () {
  var LOADING = true;             // true while we programmatically load, so save() doesn't echo back
  var counter = 1;
  window.__idmap = {};            // numeric console id -> server _id

  function money(s) {
    if (s.price) return '$' + (s.price / 100).toFixed(2);
    return s.payStatus === 'paid' ? 'Paid' : 'Free';
  }
  function conv(s, idnum) {
    var created = s.createdAt ? new Date(s.createdAt).toLocaleString() : '';
    return {
      id: idnum, _sid: s._id,
      student: s.student || '(no name)', age: s.age, guardian: s.guardian || '',
      email: s.email || '', phone: s.phone || '', heard: s.source || '',
      program: s.program || '', when: s.when || '', src: s.source || 'direct',
      paid: money(s), status: s.status || 'booked', notes: s.notes || '',
      created: created, archived: !!s.archived,
      activity: (s.activity && s.activity.length) ? s.activity : [{ t: 'Booking created', tm: created }]
    };
  }

  function busy() {
    return document.querySelector('.dragging') ||
           document.querySelector('.drawer.on') ||
           (document.getElementById('leadModal') && !document.getElementById('leadModal').classList.contains('hidden')) ||
           (document.getElementById('confirmModal') && !document.getElementById('confirmModal').classList.contains('hidden'));
  }

  function refresh() {
    return fetch('/api/leads', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (list) {
        if (!Array.isArray(list)) return;
        LOADING = true;
        window.__idmap = {};
        DB.leads = list.map(function (s) { var idnum = counter++; window.__idmap[idnum] = s._id; return conv(s, idnum); });
        if (typeof renderBoard === 'function') renderBoard();
        if (typeof renderStats === 'function') renderStats();
        LOADING = false;
      })
      .catch(function (e) { console.warn('lead refresh failed', e); LOADING = false; });
  }

  function pushSync() {
    if (LOADING) return;
    try {
      var payload = { leads: DB.leads.map(function (l) {
        return { _sid: l._sid || window.__idmap[l.id] || null, id: l.id, student: l.student, age: l.age,
                 guardian: l.guardian, email: l.email, phone: l.phone, program: l.program, programId: l.programId,
                 src: l.src, when: l.when, status: l.status, archived: !!l.archived, notes: l.notes || '' }; }) };
      // let the admin connect Stripe from the console's Integrations screen (key synced to backend)
      if (window.DB && DB.settings && DB.settings.stripeKey) payload.settings = { stripeKey: DB.settings.stripeKey };
      fetch('/api/leads/sync', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res && res.mapping) res.mapping.forEach(function (m) {
            window.__idmap[m.tempId] = m._id;
            var ld = DB.leads.find(function (x) { return x.id === m.tempId; });
            if (ld) ld._sid = m._id;
          });
        }).catch(function () {});
    } catch (e) {}
  }

  function install() {
    if (typeof window.save === 'function') {
      var _save = window.save;
      window.save = function () { var r = _save.apply(this, arguments); pushSync(); return r; };
    }
    refresh();
    setInterval(function () { if (!busy()) refresh(); }, 20000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
