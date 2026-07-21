/* Public /signup: keeps the v109 booking wizard EXACTLY as-is, and adds a cart so a
   buyer can add more students / more programs and pay for everyone in ONE Stripe payment.
   - Finish a booking (program -> time -> details) -> a summary page with just the TOTAL
     and three buttons: Pay · Add another student · Add another program.
   - Add student  = same program & same time, enter only the new student's info.
   - Add program  = start again from program selection. */
(function () {
  var cart = [], PROMOS = [], promoObj = null;
  function val(id){var e=document.getElementById(id);return e?String(e.value||'').trim():'';}
  function setVal(id,v){var e=document.getElementById(id);if(e)e.value=(v==null?'':v);}
  function m(c){return (c===0)?'Free':'$'+((c||0)/100).toFixed(2);}
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function computeDisc(p,price){if(!p)return 0;if(p.type==='percent')return Math.round(price*(p.value||0)/100);if(p.type==='amount')return Math.min(price,p.value||0);if(p.type==='free')return price;return 0;}

  function injectReview(){
    if(document.getElementById('cartReview'))return;
    var wrap=document.querySelector('.cwrap');if(!wrap)return;
    var sec=document.createElement('section');
    sec.id='cartReview';sec.className='max760 hidden';
    sec.innerHTML=''
      +'<div class="card pad">'
      +'<h2 class="title">Registration summary</h2>'
      +'<p class="sub">Add more people or programs, or pay for everyone at once.</p>'
      +'<div class="summary" id="crSummary"></div>'
      +'<label class="fl">Promo code</label>'
      +'<div class="promo-row"><input class="fi" id="crPromo" placeholder="e.g. SUMMER50" /><button class="btn-apply" onclick="crApply()">Apply</button></div>'
      +'<div id="crPromoMsg" style="font-size:12.5px;margin-top:6px"></div>'
      +'<div class="foot" style="flex-direction:column;gap:10px;margin-top:16px">'
      +'<button class="btn btn-primary" style="width:100%" id="crPay" onclick="crPay()">Pay &amp; complete registration</button>'
      +'<button class="btn btn-ghost" style="width:100%" onclick="crAddStudent()">+ Add another student</button>'
      +'<button class="btn btn-ghost" style="width:100%" onclick="crAddProgram()">+ Add another program</button>'
      +'</div>'
      +'<div id="crErr" style="color:var(--red,#e63535);font-size:13px;margin-top:10px;text-align:center;font-weight:600"></div>'
      +'<div class="note" style="text-align:center;margin-top:12px">Intro registration fees are non-refundable · 🔒 Secured by Stripe</div>'
      +'</div>';
    wrap.appendChild(sec);
  }
  function hideSteps(){for(var i=1;i<=5;i++){var s=document.getElementById('s'+i);if(s)s.classList.add('hidden');}}
  function showReview(){injectReview();hideSteps();document.getElementById('cartReview').classList.remove('hidden');renderReview();window.scrollTo({top:0,behavior:'smooth'});}

  function renderReview(){
    var sub=cart.reduce(function(s,i){return s+(i.price||0);},0);
    var disc=promoObj?Math.min(sub,computeDisc(promoObj,sub)):0;
    var total=Math.max(0,sub-disc);
    var html='';
    if(disc>0)html+='<div class="srow"><span class="disc">Promo'+(promoObj?' ('+esc(promoObj.code)+')':'')+'</span><span class="disc">−'+m(disc)+'</span></div>';
    html+='<div class="srow total"><span>Total ('+cart.length+' participant'+(cart.length>1?'s':'')+')</span><span>'+m(total)+'</span></div>';
    document.getElementById('crSummary').innerHTML=html;
    var pay=document.getElementById('crPay');pay.textContent=total>0?('Pay '+m(total)+' & complete'):'Complete free registration';
  }

  window.crApply=function(){
    var code=val('crPromo').toUpperCase();var msg=document.getElementById('crPromoMsg');
    if(!code){promoObj=null;msg.textContent='';renderReview();return;}
    var p=PROMOS.find(function(x){return x.code&&x.code.toUpperCase()===code&&(x.status?x.status==='Active':true);});
    if(!p){promoObj=null;msg.style.color='var(--red,#e63535)';msg.textContent='✕ Invalid or expired code';renderReview();return;}
    if(p.max&&(p.used||0)>=p.max){promoObj=null;msg.style.color='var(--red,#e63535)';msg.textContent='✕ This code has reached its limit';renderReview();return;}
    promoObj=p;msg.style.color='var(--ok,#1cb454)';var lab=p.type==='percent'?p.value+'% off':(p.type==='amount'?m(p.value)+' off':'Free intro');msg.textContent='✓ '+lab+' applied';renderReview();
  };

  function captureEntry(){
    if(typeof cs==='undefined'||!cs||!cs.program||!cs.date||!cs.time)return false;
    cart.push({programId:cs.program.id,program:cs.program.name,price:cs.program.price,
      student:val('fStudent'),age:val('fAge'),guardian:val('fGuardian'),email:val('fEmail'),phone:val('fPhone'),heard:val('fHeard'),
      slotDate:key(cs.date),slotTime:cs.time,when:(WD[cs.date.getDay()]+' '+usDate(cs.date)+' · '+cs.time)});
    return true;
  }

  // Add another student -> keep same program & time, enter only the new student info.
  window.crAddStudent=function(){
    var cr=document.getElementById('cartReview');if(cr)cr.classList.add('hidden');
    setVal('fStudent','');setVal('fAge','');setVal('fGuardian','');
    var b=cart[0]||{};if(b.email)setVal('fEmail',b.email);if(b.phone)setVal('fPhone',b.phone);if(b.heard)setVal('fHeard',b.heard);
    if(typeof renderCSummary==='function'){try{renderCSummary();}catch(e){}}
    if(typeof cgo==='function')cgo(3);
  };
  // Add another program -> start again from program selection (same buyer contact prefilled).
  window.crAddProgram=function(){
    var cr=document.getElementById('cartReview');if(cr)cr.classList.add('hidden');
    var b=cart[0]||{};
    setVal('fStudent','');setVal('fAge','');setVal('fGuardian','');
    if(b.email)setVal('fEmail',b.email);if(b.phone)setVal('fPhone',b.phone);if(b.heard)setVal('fHeard',b.heard);
    if(typeof resetCustomer==='function')resetCustomer();else if(typeof cgo==='function')cgo(1);
  };

  window.crPay=function(){
    var btn=document.getElementById('crPay');var err=document.getElementById('crErr');err.textContent='';
    if(!cart.length){err.textContent='Add at least one participant.';return;}
    btn.disabled=true;var old=btn.textContent;btn.textContent='Processing…';
    var first=cart[0];var bn=(first.guardian||first.student||'').trim();var parts=bn.split(/\s+/);
    var buyer={first:parts[0]||bn||'Customer',last:parts.slice(1).join(' ')||(parts[0]||'-'),email:first.email,phone:first.phone,source:first.heard||'signup'};
    var participants=cart.map(function(it){var np=(it.student||'').trim().split(/\s+/);return {programId:it.programId,first:np[0]||it.student||'Student',last:np.slice(1).join(' ')||(np[0]||'-'),age:it.age,slotDate:it.slotDate,slotTime:it.slotTime,when:it.when,medicalNotes:''};});
    var payload={buyer:buyer,participants:participants,promoCode:promoObj?promoObj.code:''};
    fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
      .then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d};});})
      .then(function(res){
        if(!res.ok){btn.disabled=false;btn.textContent=old;err.textContent=(res.d&&res.d.error)||'Something went wrong. Please try again.';return;}
        var d=res.d;
        if(d.pay&&d.checkoutUrl){location.href=d.checkoutUrl;return;}
        location.href='/success?order='+d.orderId;
      }).catch(function(){btn.disabled=false;btn.textContent=old;err.textContent='Network error. Please try again.';});
  };

  function showRetry(orderId){
    var wrap=document.querySelector('.cwrap');if(!wrap)return;
    var b=document.createElement('div');b.style.cssText='background:#fff4e5;border:1px solid #f0c987;color:#8a5a00;border-radius:11px;padding:14px 16px;margin:0 0 6px;font-size:14px';
    b.innerHTML='<b>Payment was not completed.</b> Your spots are still held — you can try again with a different card.<br><button class="btn btn-primary btn-sm" style="margin-top:8px" id="retryBtn">Try payment again</button>';
    wrap.insertBefore(b,wrap.firstChild);
    document.getElementById('retryBtn').onclick=function(){var el=this;el.disabled=true;el.textContent='Starting…';fetch('/api/order/'+orderId+'/retry',{method:'POST'}).then(function(r){return r.json();}).then(function(d){if(d&&d.paid){location.href='/success?order='+orderId;return;}if(d&&d.checkoutUrl){location.href=d.checkoutUrl;return;}el.disabled=false;el.textContent='Try payment again';alert((d&&d.error)||'Could not restart payment.');}).catch(function(){el.disabled=false;el.textContent='Try payment again';});};
  }

  // Switch to the PUBLIC booking view immediately — /signup must never show the admin console.
  function goPublic(){
    try{ if(typeof openPublic==='function')openPublic(); else if(typeof showView==='function')showView('cust'); }catch(e){}
    // remove any control that returns to the management console
    document.querySelectorAll('[onclick*="backFromCustomer"]').forEach(function(el){el.style.display='none';});
    var stl=document.createElement('style');stl.textContent='#payFields{display:none!important}';document.head.appendChild(stl);
    // per-booking promo is replaced by one promo field on the summary page
    try{var fp=document.getElementById('fPromo');if(fp){var row=fp.closest('.promo-row');if(row){row.style.display='none';var lbl=row.previousElementSibling;if(lbl&&lbl.tagName==='LABEL')lbl.style.display='none';}}var pm=document.getElementById('promoMsg');if(pm)pm.style.display='none';document.querySelectorAll('#s3 .note').forEach(function(n){n.style.display='none';});}catch(e){}
    injectReview();
    if(typeof window.toPayStep==='function'){ window.toPayStep=function(){ if(typeof validDetails==='function'&&!validDetails())return; if(!captureEntry())return; showReview(); }; }
    if(typeof renderLogos==='function'){try{renderLogos();}catch(e){}}
    var q=new URLSearchParams(location.search);if(q.get('canceled')&&q.get('order'))showRetry(q.get('order'));
  }
  function start(){
    goPublic(); // immediate — do NOT wait on network, so the admin console never flashes
    fetch('/api/programs',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(p){ if(Array.isArray(p)&&p.length&&typeof DB!=='undefined'){ DB.programs=p; if(typeof renderPrograms==='function'){try{renderPrograms();}catch(e){}} } }).catch(function(){});
    fetch('/api/branding',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(b){ if(b&&typeof DB!=='undefined'&&DB.settings){ if(b.logo)DB.settings.logo=b.logo; if(b.logoBg)DB.settings.logoBg=b.logoBg; if(b.bgColor)DB.settings.bgColor=b.bgColor; if(typeof renderLogos==='function'){try{renderLogos();}catch(e){}} } }).catch(function(){});
    fetch('/api/promos',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(p){ if(Array.isArray(p)) PROMOS=p; }).catch(function(){});
    fetch('/api/schedule',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(s){ if(s&&typeof DB!=='undefined'){ if(s.schedule&&Object.keys(s.schedule).length) DB.schedule=s.schedule; if(Array.isArray(s.exceptions)) DB.exceptions=s.exceptions; } }).catch(function(){});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
