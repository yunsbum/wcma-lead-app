(function () {
  var LOADING = true, counter = 1; window.__idmap = {};
  function money(s){if(s.price)return '$'+(s.price/100).toFixed(2);return s.payStatus==='paid'?'Paid':'Free';}
  function conv(s,idnum){var created=s.createdAt?new Date(s.createdAt).toLocaleString():'';
    return {id:idnum,_sid:s._id,createdAt:s.createdAt||null,student:s.student||'(no name)',age:s.age,guardian:s.guardian||'',email:s.email||'',phone:s.phone||'',heard:s.source||'',program:s.program||'',when:s.when||'',src:s.source||'direct',paid:money(s),status:s.status||'booked',notes:s.notes||'',created:created,archived:!!s.archived,activity:(s.activity&&s.activity.length)?s.activity:[{t:'Booking created',tm:created}]};}
  function busy(){return document.querySelector('.dragging')||document.querySelector('.drawer.on')||(document.getElementById('leadModal')&&!document.getElementById('leadModal').classList.contains('hidden'))||(document.getElementById('confirmModal')&&!document.getElementById('confirmModal').classList.contains('hidden'));}
  function refresh(){return fetch('/api/leads',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(list){if(!Array.isArray(list))return;LOADING=true;window.__idmap={};DB.leads=list.map(function(s){var id=counter++;window.__idmap[id]=s._id;return conv(s,id);});if(typeof renderBoard==='function')renderBoard();if(typeof renderStats==='function')renderStats();LOADING=false;}).catch(function(e){console.warn('refresh failed',e);LOADING=false;});}
  function pushSync(force){if(LOADING&&!force)return;try{
    var payload={leads:DB.leads.map(function(l){return {_sid:l._sid||window.__idmap[l.id]||null,id:l.id,student:l.student,age:l.age,guardian:l.guardian,email:l.email,phone:l.phone,program:l.program,programId:l.programId,src:l.src,when:l.when,status:l.status,archived:!!l.archived,notes:l.notes||''};})};
    var st=(window.DB&&DB.settings)?DB.settings:{};
    payload.settings={stripeKey:st.stripeKey||'',sendgridKey:st.sendgridKey||'',fromEmail:st.fromEmail||'',notifyEmail:!!st.notifyEmail,notifySms:!!st.notifySms,schoolEmail:st.schoolEmail||'',schoolPhone:st.schoolPhone||'',twilioSid:st.twilioSid||'',twilioToken:st.twilioToken||'',twilioFrom:st.twilioFrom||'',logo:st.logo||'',brandColor:st.brandColor||'',bgColor:st.bgColor||'',logoBg:st.logoBg||'',schoolSlug:st.schoolSlug||'',monthlyGoal:st.monthlyGoal,programs:(window.DB&&Array.isArray(DB.programs))?DB.programs:undefined};
    fetch('/api/leads/sync',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(r){return r.json();}).then(function(res){if(res&&res.mapping)res.mapping.forEach(function(m){window.__idmap[m.tempId]=m._id;var ld=DB.leads.find(function(x){return x.id===m.tempId;});if(ld)ld._sid=m._id;});}).catch(function(){});
  }catch(e){}}
  function reflectStatus(){fetch('/api/settings',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(s){
    function set(label,on){var cards=document.querySelectorAll('.intcard');cards.forEach(function(card){if((card.textContent||'').indexOf(label)>-1){var b=card.querySelector('.stat');if(b){b.textContent=on?'Connected':'Not connected';b.style.background=on?'#1cb45420':'';b.style.color=on?'#1cb454':'';}}});}
    set('Stripe',s.stripeConnected);set('Email',s.emailConnected);set('Twilio',s.smsConnected);if(s.logo&&window.DB&&DB.settings){DB.settings.logo=s.logo;if(typeof renderLogos==='function'){try{renderLogos();}catch(e){}}}
  }).catch(function(){});}
  function loadPrograms(){fetch('/api/programs',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(p){if(Array.isArray(p)&&p.length&&window.DB){DB.programs=p;if(typeof renderPrograms==='function'){try{renderPrograms();}catch(e){}}}}).catch(function(){});}
  function initPrograms(){fetch('/api/settings',{credentials:'same-origin'}).then(function(r){return r.json();}).then(function(s){if(s&&s.programsSaved){loadPrograms();}else if(window.DB&&Array.isArray(DB.programs)&&DB.programs.length){pushSync(true);}}).catch(function(){});}
  function install(){
    if(typeof window.save==='function'){var _s=window.save;window.save=function(){var r=_s.apply(this,arguments);pushSync();reflectStatus();return r;};}
    window.bookingUrl=function(){return (location.origin||'')+'/signup';};
    document.querySelectorAll('a,button').forEach(function(el){if((el.textContent||'').toLowerCase().indexOf('booking page')>-1){el.setAttribute('target','_blank');el.onclick=function(e){e.preventDefault();window.open('/signup','_blank');};if(el.tagName==='A')el.href='/signup';}});
    refresh();reflectStatus();initPrograms();if(typeof renderLinkQR==='function'){try{renderLinkQR();}catch(e){}}
    setInterval(function(){if(!busy())refresh();},20000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
