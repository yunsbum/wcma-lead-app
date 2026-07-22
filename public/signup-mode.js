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
  // Promo applies to EVERY eligible participant (per-person), summed across the order.
  function orderDiscount(p){ if(!p)return 0; var d=0; cart.forEach(function(it){ var price=it.price||0; if(p.scope&&p.scope!=='All programs'&&String(p.scope).indexOf(it.program)===-1)return; d+=Math.max(0,Math.min(price,computeDisc(p,price))); }); return d; }
  function toastMsg(mm){if(typeof toast==='function'){try{toast(mm);}catch(e){}}}
  function injectAddButtons(){
    if(document.getElementById('addBtns'))return;
    var toPay=document.getElementById('toPay');if(!toPay)return;
    var foot=toPay.closest('.foot')||toPay.parentNode;
    var div=document.createElement('div');div.id='addBtns';div.style.cssText='display:flex;flex-direction:column;gap:10px;margin-top:4px';
    div.innerHTML='<button class="btn btn-ghost" type="button" style="width:100%" onclick="crAddStudent()">+ Add another student</button>'
      +'<button class="btn btn-ghost" type="button" style="width:100%" onclick="crAddProgram()">+ Add another program</button>';
    foot.parentNode.insertBefore(div, foot);
  }
  // ----- Promo code on the program page (always visible) -----
  function injectPromoBar(){
    if(document.getElementById('s1PromoWrap'))return;
    var list=document.getElementById('progList');if(!list)return;
    var bar=document.createElement('div');bar.id='s1PromoWrap';
    bar.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#f1f5ff;border:1px solid #dbe4ff;border-radius:11px;padding:12px 14px;margin:4px 0 16px';
    bar.innerHTML='<span style="font-size:13.5px;font-weight:700;color:#334155;white-space:nowrap">🏷️ Promo code</span>'
      +'<input id="s1Promo" placeholder="Enter code (optional)" autocomplete="off" style="flex:1;min-width:150px;padding:9px 11px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px" onkeydown="if(event.key===\'Enter\'){event.preventDefault();s1Apply();}"/>'
      +'<button type="button" onclick="s1Apply()" style="padding:9px 16px;border:0;border-radius:8px;background:var(--brand,#3073F1);color:#fff;font-weight:700;cursor:pointer">Apply</button>'
      +'<span id="s1PromoMsg" style="font-size:12.5px;flex-basis:100%;margin-top:2px"></span>';
    list.parentNode.insertBefore(bar,list);
  }
  window.s1Apply=function(){ var i=document.getElementById('s1Promo'); applyCode(i?i.value:'', document.getElementById('s1PromoMsg')); };
  function applyCode(code, msgEl){
    code=(code||'').trim().toUpperCase();
    if(!code){promoObj=null;if(msgEl)msgEl.textContent='';afterPromoChange();return;}
    var p=PROMOS.find(function(x){return x.code&&x.code.toUpperCase()===code&&(x.status?x.status==='Active':true);});
    if(!p){promoObj=null;if(msgEl){msgEl.style.color='var(--red,#e63535)';msgEl.textContent='✕ Invalid or expired code';}afterPromoChange();return;}
    if(p.max&&(p.used||0)>=p.max){promoObj=null;if(msgEl){msgEl.style.color='var(--red,#e63535)';msgEl.textContent='✕ This code has reached its limit';}afterPromoChange();return;}
    promoObj=p;if(msgEl){msgEl.style.color='var(--ok,#1cb454)';msgEl.textContent='✓ Applied — the prices below now show your discount';}
    afterPromoChange();
  }
  function afterPromoChange(){
    if(typeof renderPrograms==='function'){try{renderPrograms();}catch(e){}}
    var cr=document.getElementById('cartReview');if(cr&&!cr.classList.contains('hidden')){try{renderReview();}catch(e){}}
    var a=document.getElementById('s1Promo'),b=document.getElementById('crPromo');
    if(a)a.value=promoObj?promoObj.code:''; if(b)b.value=promoObj?promoObj.code:'';
  }
  // Show struck-through original + discounted price on each eligible program card.
  function decoratePrices(){
    if(!promoObj)return;
    var list=(typeof activePrograms==='function')?activePrograms():((typeof DB!=='undefined'&&DB.programs)||[]);
    var cards=document.querySelectorAll('#progList .prog');
    cards.forEach(function(card,i){
      var prog=list[i];if(!prog)return;var amt=card.querySelector('.amt');if(!amt)return;
      var price=prog.price||0;
      var elig=!(promoObj.scope&&promoObj.scope!=='All programs'&&String(promoObj.scope).indexOf(prog.name)===-1);
      var disc=elig?Math.max(0,Math.min(price,computeDisc(promoObj,price))):0;
      if(disc>0){var np=price-disc;
        amt.innerHTML='<span style="text-decoration:line-through;color:#e63535;font-weight:600;font-size:12.5px">'+m(price)+'</span><br><span style="color:#1cb454;font-weight:800">'+(np<=0?'FREE':m(np))+'</span>';
      }
    });
  }
  // ----- Required-field validation with a clear red highlight -----
  var REQ=['fStudent','fAge','fEmail','fPhone','fHeard'];
  function clearFieldMark(e){if(e){e.style.borderColor='';e.style.boxShadow='';}}
  function markFields(){var firstEmpty=null;REQ.forEach(function(id){var e=document.getElementById(id);if(!e)return;var empty=!String(e.value||'').trim();if(empty){e.style.borderColor='#e63535';e.style.boxShadow='0 0 0 3px rgba(230,53,53,.22)';if(!firstEmpty)firstEmpty=e;}else{clearFieldMark(e);}});if(firstEmpty){try{firstEmpty.scrollIntoView({behavior:'smooth',block:'center'});firstEmpty.focus({preventScroll:true});}catch(e){}}return firstEmpty===null;}
  function validateUI(){var ok=markFields();var vd=(typeof validDetails==='function')?validDetails():true;return ok&&vd;}
  function bindFieldClearing(){REQ.forEach(function(id){var e=document.getElementById(id);if(!e||e._mk)return;e._mk=1;e.addEventListener('input',function(){clearFieldMark(e);});e.addEventListener('change',function(){clearFieldMark(e);});});}

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
      +'<button class="btn btn-ghost" style="width:100%" onclick="crBackToAdd()">‹ Add another student or program</button>'
      +'<button class="btn btn-primary" style="width:100%" id="crPay" onclick="crPay()">Pay &amp; complete registration</button>'
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
    var disc=promoObj?Math.min(sub,orderDiscount(promoObj)):0;
    var total=Math.max(0,sub-disc);
    var rows=cart.map(function(it,idx){
      return '<div class="srow"><span><b>'+esc(it.student||('Participant '+(idx+1)))+'</b><br><span style="color:#64748b">'+esc(it.program)+' · '+esc(it.when)+'</span></span><span>'+m(it.price)+'</span></div>';
    }).join('');
    var html=rows;
    if(disc>0)html+='<div class="srow"><span class="disc">Promo'+(promoObj?' ('+esc(promoObj.code)+')':'')+'</span><span class="disc">−'+m(disc)+'</span></div>';
    html+='<div class="srow total"><span>Total ('+cart.length+' participant'+(cart.length>1?'s':'')+')</span><span>'+m(total)+'</span></div>';
    document.getElementById('crSummary').innerHTML=html;
    var pay=document.getElementById('crPay');pay.textContent=total>0?('Pay '+m(total)+' & complete'):'Complete free registration';
  }

  window.crApply=function(){
    applyCode(val('crPromo'), null);
    var msg=document.getElementById('crPromoMsg');
    if(promoObj){ msg.style.color='var(--ok,#1cb454)';msg.textContent='✓ Applied to all '+cart.length+' participant'+(cart.length>1?'s':'')+' — you save '+m(orderDiscount(promoObj)); }
    else if(val('crPromo')){ msg.style.color='var(--red,#e63535)';msg.textContent='✕ Invalid or expired code'; }
    else { msg.textContent=''; }
    renderReview();
  };

  function captureEntry(){
    if(typeof cs==='undefined'||!cs||!cs.program||!cs.date||!cs.time)return false;
    cart.push({programId:cs.program.id,program:cs.program.name,price:cs.program.price,
      student:val('fStudent'),age:val('fAge'),guardian:val('fGuardian'),email:val('fEmail'),phone:val('fPhone'),heard:val('fHeard'),
      slotDate:key(cs.date),slotTime:cs.time,when:(WD[cs.date.getDay()]+' '+usDate(cs.date)+' · '+cs.time)});
    return true;
  }

  // Add another student -> save this one, keep SAME program & time, enter the next student.
  window.crAddStudent=function(){
    if(!validateUI())return;
    if(!captureEntry())return;
    var cr=document.getElementById('cartReview');if(cr)cr.classList.add('hidden');
    setVal('fStudent','');setVal('fAge','');setVal('fGuardian','');
    if(typeof renderCSummary==='function'){try{renderCSummary();}catch(e){}}
    if(typeof cgo==='function')cgo(3);
    toastMsg('Added — enter the next student, or Continue to payment');
  };
  // Add another program -> save this one, then start again from program selection.
  window.crAddProgram=function(){
    if(!validateUI())return;
    if(!captureEntry())return;
    var cr=document.getElementById('cartReview');if(cr)cr.classList.add('hidden');
    var b=cart[0]||{};
    setVal('fStudent','');setVal('fAge','');setVal('fGuardian','');
    if(b.email)setVal('fEmail',b.email);if(b.phone)setVal('fPhone',b.phone);if(b.heard)setVal('fHeard',b.heard);
    if(typeof resetCustomer==='function')resetCustomer();else if(typeof cgo==='function')cgo(1);
    toastMsg('Saved — now choose the next program');
  };
  // From the review page, go back to add more people/programs (cart is kept).
  window.crBackToAdd=function(){
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
    var stl=document.createElement('style');stl.textContent='#payFields{display:none!important}.back{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #cbd5e1;color:#334155;border-radius:9px;padding:9px 15px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:12px}.back:hover{background:#f1f5f9;border-color:#94a3b8}';document.head.appendChild(stl);
    // per-booking promo is replaced by one promo field on the summary page
    try{var fp=document.getElementById('fPromo');if(fp){var row=fp.closest('.promo-row');if(row){row.style.display='none';var lbl=row.previousElementSibling;if(lbl&&lbl.tagName==='LABEL')lbl.style.display='none';}}var pm=document.getElementById('promoMsg');if(pm)pm.style.display='none';document.querySelectorAll('#s3 .note').forEach(function(n){n.style.display='none';});}catch(e){}
    injectReview();
    injectAddButtons();
    injectPromoBar();
    // re-inject the promo bar and re-apply discounted-price styling every time the program list re-renders
    if(typeof window.renderPrograms==='function'){ var _rp=window.renderPrograms; window.renderPrograms=function(){ var r=_rp.apply(this,arguments); try{injectPromoBar();decoratePrices();}catch(e){} return r; }; }
    if(typeof renderPrograms==='function'){try{renderPrograms();}catch(e){}}
    // reflect the promo discount on the details-step summary (s3) too
    if(typeof window.renderCSummary==='function'){ var _rcs=window.renderCSummary; window.renderCSummary=function(){ try{ if(typeof cs!=='undefined'&&cs&&cs.program){ if(promoObj){ var price=cs.program.price||0; var elig=!(promoObj.scope&&promoObj.scope!=='All programs'&&String(promoObj.scope).indexOf(cs.program.name)===-1); cs.discount=elig?Math.max(0,Math.min(price,computeDisc(promoObj,price))):0; cs.promo=(elig&&cs.discount>0)?promoObj.code:''; } else { cs.discount=0; cs.promo=''; } } }catch(e){} return _rcs.apply(this,arguments); }; }
    bindFieldClearing();
    if(typeof window.toPayStep==='function'){ window.toPayStep=function(){ if(!validateUI())return; if(!captureEntry())return; showReview(); }; }
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
