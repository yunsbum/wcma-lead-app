/* Public /signup: shows the v109 customer booking design and routes bookings to the backend. */
(function () {
  function val(id){var e=document.getElementById(id);return e?String(e.value||'').trim():'';}
  function boot(){
    try { if (typeof openPublic==='function') openPublic(); else if (typeof showView==='function') showView('cust'); } catch(e){}
    // hide any "back to console" control and the fake card fields (real payment goes through Stripe)
    document.querySelectorAll('[onclick*="backFromCustomer"]').forEach(function(el){el.style.display='none';});
    var st=document.createElement('style'); st.textContent='#payFields{display:none!important}'; document.head.appendChild(st);
    if(typeof renderLogos==='function'){try{renderLogos();}catch(e){}}
    if (typeof window.confirmBooking==='function') {
      var _cb=window.confirmBooking;
      window.confirmBooking=function(){
        if(typeof cs==='undefined'||!cs||!cs.program||!cs.date||!cs.time){ return _cb(); }
        var d=cs.date;
        var payload={programId:cs.program.id,student:val('fStudent'),age:val('fAge'),guardian:val('fGuardian'),
          email:val('fEmail'),phone:val('fPhone'),when:(WD[d.getDay()]+' '+usDate(d)+' · '+cs.time),source:val('fHeard')||'signup',
          promoCode:(cs&&cs.promo)?cs.promo:''};
        fetch('/api/book',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
          .then(function(r){return r.json();}).then(function(data){
            if(data&&data.pay&&data.checkoutUrl){ location.href=data.checkoutUrl; return; }
            if(data&&data.error){ var b=document.getElementById('payBtn'); if(b){b.disabled=false;b.textContent='Try again';} alert(data.error); return; }
            _cb();
          }).catch(function(){ _cb(); });
      };
    }
  }
  function start(){ var done=0; function ready(){ if(++done>=3) boot(); }
    fetch('/api/programs',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(p){ if(Array.isArray(p)&&p.length&&typeof DB!=='undefined') DB.programs=p; }).catch(function(){}).then(ready);
    fetch('/api/branding',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(b){ if(b&&typeof DB!=='undefined'&&DB.settings){ if(b.logo)DB.settings.logo=b.logo; if(b.logoBg)DB.settings.logoBg=b.logoBg; if(b.bgColor)DB.settings.bgColor=b.bgColor; } }).catch(function(){}).then(ready);
    fetch('/api/promos',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(p){ if(Array.isArray(p)&&typeof DB!=='undefined') DB.promos=p; }).catch(function(){}).then(ready);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
