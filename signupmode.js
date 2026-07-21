/* Public /signup: shows the v109 customer booking design and routes bookings to the backend. */
(function () {
  function val(id){var e=document.getElementById(id);return e?String(e.value||'').trim():'';}
  function boot(){
    try { if (typeof openPublic==='function') openPublic(); else if (typeof showView==='function') showView('cust'); } catch(e){}
    // hide any "back to console" control and the fake card fields (real payment goes through Stripe)
    document.querySelectorAll('[onclick*="backFromCustomer"]').forEach(function(el){el.style.display='none';});
    var st=document.createElement('style'); st.textContent='#payFields{display:none!important}'; document.head.appendChild(st);
    if (typeof window.confirmBooking==='function') {
      var _cb=window.confirmBooking;
      window.confirmBooking=function(){
        if(!window.cs||!cs.program||!cs.date||!cs.time){ return _cb(); }
        var d=cs.date;
        var payload={programId:cs.program.id,student:val('fStudent'),age:val('fAge'),guardian:val('fGuardian'),
          email:val('fEmail'),phone:val('fPhone'),when:(WD[d.getDay()]+' '+usDate(d)+' · '+cs.time),source:val('fHeard')||'signup'};
        fetch('/api/book',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
          .then(function(r){return r.json();}).then(function(data){
            if(data&&data.pay&&data.checkoutUrl){ location.href=data.checkoutUrl; return; }
            if(data&&data.error){ var b=document.getElementById('payBtn'); if(b){b.disabled=false;b.textContent='Try again';} alert(data.error); return; }
            _cb();
          }).catch(function(){ _cb(); });
      };
    }
  }
  function start(){ fetch('/api/programs',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(p){ if(Array.isArray(p)&&p.length&&window.DB) DB.programs=p; }).catch(function(){}).then(function(){ boot(); }); }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
