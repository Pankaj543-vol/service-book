// ===== App UI =====
(function(){
'use strict';
var $=function(s,r){return (r||document).querySelector(s);};
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function uid(){ return 'x'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
var BN='০১২৩৪৫৬৭৮৯';

var STANDALONE=!!window.SB_STANDALONE;
var A={db:null, dl:null, mode:'loading', S:SB.defaultSettings(), T:{}, view:'home', tid:null, tab:'info', saveTimers:{}, saving:{}, again:{}};

// ---------- storage ----------
function lsGet(){ try{ return JSON.parse(localStorage.getItem('sbk_v1')||'null'); }catch(e){ return null; } }
function lsPut(){ try{ localStorage.setItem('sbk_v1',JSON.stringify({S:A.S,T:A.T})); }catch(e){} }
function scheduleSave(kind,id){
  var key=kind+':'+(id||''); clearTimeout(A.saveTimers[key]);
  A.saveTimers[key]=setTimeout(function(){ doSave(kind,id); },700); setStatus('সেভ হচ্ছে…');
}
function doSave(kind,id){
  var key=kind+':'+(id||'');
  if(A.mode!=='db'){ lsPut(); setStatus(A.mode==='local'?'এই ফোনে সেভ হয়েছে':'সেভ হয়েছে'); return; }
  if(A.saving[key]){ A.again[key]=true; return; }
  A.saving[key]=true;
  var p = kind==='S' ? A.db.doc('config/settings').set({json:JSON.stringify(A.S)})
        : kind==='del' ? A.db.doc('teachers/'+id).delete()
        : A.db.doc('teachers/'+id).set({json:JSON.stringify(A.T[id],function(k,v){return k.charAt(0)==='_'?undefined:v;}), name:A.T[id].name||'', updated:Date.now()});
  p.then(function(){ setStatus('সেভ হয়েছে ✓'); }).catch(function(e){ setStatus('সেভ হয়নি: '+(e&&e.code||e)); })
   .then(function(){ A.saving[key]=false; if(A.again[key]){ A.again[key]=false; doSave(kind,id); } });
}
function setStatus(t){ var el=$('#status'); if(el) el.textContent=t; }

function init(){
  render();
  var timer=setTimeout(function(){ if(A.mode==='loading') fallbackLocal('অনলাইন স্টোরেজ পাওয়া যায়নি'); },10000);
  if(!window.claude || !window.claude.use){ clearTimeout(timer); fallbackLocal(''); return; }
  window.claude.use('downloads').then(function(d){ A.dl=d; render(); }).catch(function(){});
  window.claude.use('db').then(function(db){
    if(!db){ clearTimeout(timer); fallbackLocal('অনলাইন স্টোরেজ পাওয়া যায়নি'); return; }
    A.db=db; A.mode='db';
    var gotS=false, gotT=false; function ready(){ if(gotS&&gotT){ clearTimeout(timer); render(); } }
    db.doc('config/settings').onSnapshot(function(s){ if(s.exists){ try{ A.S=SB.mergeSettings(JSON.parse(s.data().json)); }catch(e){} } gotS=true; ready(); if(gotT && !s.metadata.hasPendingWrites) softRender(); },
      function(e){ gotS=true; ready(); });
    db.collection('teachers').onSnapshot(function(q){
      q.docs.forEach(function(d){ if(A.saving['T:'+d.id]||A.saveTimers['T:'+d.id+'_busy']) return; try{ var t=JSON.parse(d.data().json); t.id=d.id; if(!A.T[d.id] || !d.metadata.hasPendingWrites) A.T[d.id]=t; }catch(e){} });
      var ids={}; q.docs.forEach(function(d){ ids[d.id]=1; }); Object.keys(A.T).forEach(function(k){ if(!ids[k] && !A.saving['T:'+k] && !pendingNew[k]) delete A.T[k]; });
      gotT=true; ready(); if(gotS) softRender();
    }, function(e){ gotT=true; ready(); });
  }).catch(function(){ clearTimeout(timer); fallbackLocal(''); });
}
var pendingNew={};
function fallbackLocal(msg){ A.mode='local'; var d=lsGet(); if(d){ A.S=SB.mergeSettings(d.S); A.T=d.T||{}; } A.localMsg=msg; render(); }
// re-render only list-ish views (don't disturb a form being typed)
function softRender(){ if(A.view==='home' || (A.view==='teacher' && (A.tab==='pages'))) render(); }

// ---------- render root ----------
function render(){
  var root=$('#app'); var h='';
  h+='<header class="top"><div class="tl">'+(A.view!=='home'?'<button class="ib" data-act="home">←</button>':'')+'<b>'+(STANDALONE?'শিক্ষকদের সার্ভিস বুক তৈরি করার অ্যাপ':'সার্ভিস বুক')+'</b>'+(A.S.schoolName?'<span class="sch">'+esc(A.S.schoolName)+'</span>':'')+'</div><span id="status" class="st"></span></header>';
  if(A.mode==='loading'){ root.innerHTML=h+'<div class="pad muted">লোড হচ্ছে…</div>'; return; }
  if(A.mode==='local' && !STANDALONE) h+='<div class="warn">ডেটা শুধু এই ফোন/ব্রাউজারে সেভ থাকছে, অন্য ডিভাইসে দেখা যাবে না। '+esc(A.localMsg||'')+'</div>';
  if(A.updateReady) h+='<div class="warn">নতুন আপডেট এসেছে। <button class="btn sm2" data-act="reloadApp">এখনই চালু করুন</button></div>';
  if(A.view==='home') h+=homeView();
  else if(A.view==='settings') h+=settingsView();
  else if(A.view==='teacher') h+=teacherView();
  root.innerHTML=h;
  if(A.view==='teacher' && A.tab==='pages') drawPages();
}

// ---------- home ----------
function homeView(){
  var ids=Object.keys(A.T).sort(function(a,b){ return (A.T[a].name||'').localeCompare(A.T[b].name||''); });
  var h='<div class="pad"><div class="row gap"><button class="btn pri" data-act="newT">+ নতুন শিক্ষক</button><button class="btn" data-act="settings">⚙ সেটিংস ও পে-ম্যাট্রিক্স</button></div>'+
    '<div class="row gap wrap" style="margin-top:8px"><button class="btn sm2" data-act="backup">⬇ ব্যাকআপ ফাইল নামাও</button><button class="btn sm2" data-act="restore">⬆ ব্যাকআপ থেকে ফেরত আনো</button></div>'+
    (STANDALONE?'<div class="muted sm">অ্যাপের সংস্করণ: '+esc(window.SB_VERSION||'')+'</div><div class="muted sm">সব তথ্য শুধু এই '+(/Android|iPhone|iPad/i.test(navigator.userAgent)?'ফোনে':'যন্ত্রে')+' সেভ থাকে, কোথাও পাঠানো হয় না। ফোন হারালে বা বদলালে তথ্য যাতে না হারায়, মাঝে মাঝে ব্যাকআপ ফাইল নামিয়ে রাখুন।'+(A.lastBackup?' শেষ ব্যাকআপ: '+esc(A.lastBackup):'')+'</div>':'');
  var empties=ids.filter(function(id){ var T=A.T[id]; return !T.name && !(T.events||[]).length; });
  if(empties.length>1) h+='<div class="row gap"><button class="btn sm2 danger" data-act="delEmpty">🗑 নাম ছাড়া খালি '+empties.length+'টি খাতা একসঙ্গে মুছুন</button></div>';
  if(!ids.length) h+='<div class="empty">এখনও কোনো শিক্ষক যোগ করা হয়নি। “+ নতুন শিক্ষক” টিপে শুরু করুন।</div>';
  ids.forEach(function(id){ var T=A.T[id]; var H=SB.computeHistory(T,A.S); var last=H.postings[H.postings.length-1];
    h+='<div class="card tcard" data-act="openT" data-id="'+id+'"><button class="btn sm2 danger tdel" data-act="delTid" data-id="'+id+'">🗑 মুছুন</button><div class="tn">'+esc(T.name||'(নাম নেই)')+'</div><div class="muted sm">'+esc(last?last.school.split('\n')[0]:'কোনো স্কুল যোগ হয়নি')+'</div>'+
      '<div class="sm">বর্তমান বেতন: <b>'+(H.finalPay!=null?SB.money(H.finalPay):'—')+'</b>'+(H.flags.length?' <span class="flag">⚠ '+H.flags.length+'টি অমিল</span>':'')+'</div></div>'; });
  return h+'</div>';
}

// ---------- teacher ----------
var TABS=[['info','১. ব্যক্তিগত তথ্য'],['schools','🏫 স্কুল'],['paytab','💰 বেতনের সারি'],['events','২. চাকরির ঘটনা'],['leave','৩. ছুটির হিসাব'],['pages','৪. বইয়ের পাতা'],['da','৫. বেতন ও DA']];
function teacherView(){
  var T=A.T[A.tid]; if(!T){ A.view='home'; return homeView(); }
  var h='<div class="tabs">'+TABS.map(function(t){ return '<button class="tab'+(A.tab===t[0]?' on':'')+'" data-act="tab" data-tab="'+t[0]+'">'+t[1]+'</button>'; }).join('')+'</div><div class="pad">';
  if(A.tab==='info') h+=infoForm(T); else if(A.tab==='schools') h+=schoolsView(T); else if(A.tab==='paytab') h+=payTableView(T); else if(A.tab==='events') h+=eventsView(T); else if(A.tab==='leave') h+=leaveView(T); else if(A.tab==='da') h+=daView(T); else h+=pagesView(T);
  return h+'</div>';
}
function fld(lbl,key,val,type,hint,extra){
  var inp = type==='textarea' ? '<textarea data-k="'+key+'" rows="3">'+esc(val)+'</textarea>'
    : type==='select' ? '<select data-k="'+key+'">'+extra.map(function(o){ return '<option value="'+esc(o[0])+'"'+(String(val||'')===String(o[0])?' selected':'')+'>'+esc(o[1])+'</option>'; }).join('')+'</select>'
    : '<input data-k="'+key+'" type="'+(type||'text')+'" value="'+esc(val)+'"'+(type==='number'?' inputmode="numeric"':'')+'>';
  return '<label class="f"><span>'+lbl+'</span>'+inp+(hint?'<small>'+hint+'</small>':'')+'</label>';
}
function infoForm(T){
  return '<div class="form" data-form="info">'+
  fld('নাম (ইংরেজিতে, বইয়ে যেমন লিখবেন)','name',T.name)+
  fld('লিঙ্গ','sex',T.sex||'M','select','বয়ানে He/She, Sri/Smt. ঠিক করার জন্য',[['M','পুরুষ (Sri, He)'],['F','মহিলা (Smt., She)']])+
  fld('পদের সংক্ষিপ্ত নাম','desigShort',T.desigShort||'A.T.','text','যেমন A.T. — ছুটির পাতায় ও সার্টিফিকেটে বসবে')+
  fld('ঠিকানা (Residence)','residence',T.residence,'textarea')+
  fld('জন্ম তারিখ','dob',T.dob,'date','কথায় লেখাটা অ্যাপ নিজে তৈরি করবে')+
  fld('জন্ম তারিখের সার্টিফিকেট কে দিয়েছে','dobSource',T.dobSource||'West Bengal Board of Secondary Education')+
  fld('যোগদানের সময় যোগ্যতা','qualEntry',T.qualEntry)+
  fld('পরে বাড়ানো যোগ্যতা (তারিখসহ)','qualLater',T.qualLater,'textarea')+
  fld('উচ্চতা','height',T.height)+
  fld('শনাক্তকরণ চিহ্ন','idMarks',T.idMarks)+
  fld('বাবা/স্বামীর নাম ও ঠিকানা','father',T.father,'textarea')+
  '<div class="prev"><b>জন্ম তারিখের বয়ান:</b><pre>'+esc(SB.dobLine(T.dob,T.dobSource))+'</pre><b>অবসরের তারিখ:</b> '+esc(SB.fmt(SB.superannuation(T.dob),A.S.dateFmt))+'</div>'+
  '<button class="btn danger sm2" data-act="delT">এই শিক্ষককে মুছে ফেলুন</button></div>';
}

// ----- events -----
var ETYPES=[
 ['join','স্কুলে যোগদান (প্রথম বা নতুন স্কুল)'],['inc','ইনক্রিমেন্ট'],['fix','পে-রিভিশন / ফিক্সেশন (ROPA-2019 বা নতুন পে কমিশন)'],['fix2009','ROPA 2009 ফিক্সেশন'],
 ['benefit','১০ বছর / CAS সুবিধা'],['payrow','অন্য বেতনের সারি (যেমন Actual benefit)'],['status','পদ/চাকরি স্থায়ী (Permanent) হওয়া'],
 ['resign','পদত্যাগ (Resignation)'],['release','রিলিজ / বদলি (Utsashree ইত্যাদি)'],['verify','ভেরিফিকেশন সার্টিফিকেট'],['note','নিজের লেখা নোট']];
function tname(t){ for(var i=0;i<ETYPES.length;i++) if(ETYPES[i][0]===t) return ETYPES[i][1]; return t; }
function commOpts(){ return (A.S.commissions||[]).map(function(c){ return [c.name,c.name]; }); }
function applyComm(e){ var C=SB.commByName(A.S,e.commission); if(!C) return; e.method=C.method; e.factor=C.factor===''?'':String(C.factor); e.date=C.date||e.date; e.actualFrom=C.actualFrom||''; e.go=C.go||''; if(C.date){ var y=+C.date.slice(0,4); e.nextInc=y+'-07-01'; }
  if(C.method==='matrix'){ var lv=A.S.levels.filter(function(L){return L.commission===C.name;}); if(lv.length && !lv.some(function(L){return L.id===e.level;})) e.level=lv[0].id; } }
function levelOpts(){ return A.S.levels.map(function(L){ return [L.id, L.name+' — '+L.commission]; }); }
function schema(type){
  var S=A.S, lt=['leaveText','ছুটির কলম (9)','text','খালি রাখলে: '+S.leaveTextDefault];
  var payOv=['pay','বইয়ে লেখা বেতন (না থাকলে খালি রাখুন)','number','খালি রাখলে অ্যাপ নিজে হিসাব করবে। আলাদা লিখলে অমিল দেখাবে।'];
  var follow=['follow','পরের হিসাব কোন সংখ্যা থেকে চলবে','select','',[['','বইয়ের সংখ্যা থেকে'],['false','অ্যাপের হিসাব থেকে (বইয়ের সংখ্যা ভুল মনে হলে)']]];
  var end=['end','শেষ তারিখ (7) নিজে দিতে চাইলে','date','সাধারণত খালি রাখুন — পরের সারি দেখে অ্যাপ বসাবে'];
  switch(type){
   case 'join': return [['date','যোগদানের তারিখ','date'],['post','পদ','text','যেমন Assistant Teacher'],['school','স্কুলের নাম ও পুরো ঠিকানা','textarea'],
     ['recog','স্কুলের স্বীকৃতির ইতিহাস (কলম 1-এর নিচে)','textarea','প্রতি লাইনে একটা'],['scale','বেতনক্রম (কলম 2)','textarea','যেমন PB-4 (Rs. 9000-40500) + GP Rs. 4800'],
     ['sys','বেতনের হিসাব কোন নিয়মে','select','',[['2009','ROPA 2009 (মোট বেতনের 3%, 10-এ রাউন্ড)'],['manual','নিজে বসাব (পুরনো স্কেল)']].concat(levelOpts())],
     ['pay','যোগদানের বেতন','number','নতুন স্কুলে খালি রাখলে আগের স্কুলের শেষ বেতন (LPC) বসবে'],
     ['postStatus','পদ (3)','select','',[['Temporary','Temporary'],['Permanent','Permanent']]],['apptStatus','নিয়োগের ধরন (4)','select','',[['Temporary','Temporary'],['Permanent','Permanent'],['Officiating','Officiating']]],
     ['through','কার মাধ্যমে নিয়োগ','text','যেমন WBRSSC / M.C.'],['apptMemo','সুপারিশ/নিয়োগ মেমো নম্বর'],['apptDate','মেমোর তারিখ','date'],
     ['mcRes','M.C. রেজোলিউশন নম্বর'],['mcDate','রেজোলিউশনের তারিখ','date'],
     ['approvedBy','অনুমোদন কে দিয়েছেন','text','যেমন D.I. of Schools (SE), Purulia'],['approvalMemo','অনুমোদন মেমো নম্বর'],['approvalDate','অনুমোদনের তারিখ','date'],['approvalWef','কোন তারিখ থেকে (w.e.f.)','date'],
     ['sanction','পদ মঞ্জুরির তথ্য','text','যেমন Date and No. of sanctioning of the post ...'],['extra','আরও লাইন (কলম 3–7)','textarea','প্রতি লাইনে একটা — নম্বর দিয়ে বসবে'],['noIncNote','নিচে আলাদা নোট (কলম 5–7)','textarea'],end];
   case 'inc': return [['date','তারিখ','date'],payOv,follow,['notional','নোশনাল?','select','',[['','নিজে বুঝে নাও'],['yes','হ্যাঁ'],['no','না']]],['reason','কলম 8 নিজে লিখতে চাইলে','text','খালি রাখলে: '+S.incLabel],lt,end];
   case 'benefit': return [['date','তারিখ','date'],['level','নতুন লেভেলে গেলে (না গেলে খালি)','select','খালি থাকলে একই লেভেলে একঘর উপরে',[['','একই লেভেল']].concat(levelOpts())],payOv,follow,['reason','কলম 8','text'],lt,end];
   case 'payrow': return [['date','তারিখ','date'],payOv,follow,['reason','কলম 8','text','যেমন Actual benefit'],lt,end];
   case 'fix': return [['commission','কোন পে কমিশন','select','বাছলে গুণক, তারিখ, G.O. নিজে বসবে',commOpts()],['method','ফিক্সেশনের পদ্ধতি','select','',[['matrix','গুণ করে পে-ম্যাট্রিক্সের পরের ঘর (ROPA-2019 ধাঁচ)'],['band','গুণ করে ১০-এ রাউন্ড + গ্রেড পে (ROPA-2009 ধাঁচ)'],['manual','নিজে বেতন বসাব']]],
     ['date','নোশনাল ফিক্সেশনের তারিখ','date'],['factor','গুণক (fitment factor)','text'],
     ['level','লেভেল (ম্যাট্রিক্স পদ্ধতিতে)','select','',levelOpts()],['gp','গ্রেড পে (ব্যান্ড পদ্ধতিতে)','number'],['bandText','পে-ব্যান্ড (ব্যান্ড পদ্ধতিতে)','text','যেমন PB-4 (Rs. 9000-40500)'],
     ['preText','আগের স্কেল (খালি রাখলে লেভেলের তথ্য)','text'],['go','G.O. নম্বর ও তারিখ','text'],['actualFrom','আসল টাকা কবে থেকে','date'],['nextInc','পরের ইনক্রিমেন্টের তারিখ','date'],
     payOv,follow,['reason','কলম 8','text'],lt,['text','পুরো ফিক্সেশন নোট নিজে লিখতে চাইলে','textarea'],end];
   case 'fix2009': return [['date','কোন জায়গায় বসবে (তারিখ অনুযায়ী ক্রম)','date','সাধারণত G.O.-র তারিখ'],['showDate','কলম 5-এ যে তারিখ দেখাবে','date'],['pay','ফিক্স হওয়া বেতন','number'],['wef','কবে থেকে (w.e.f.)','date'],
     ['scaleText','পে-ব্যান্ড ও গ্রেড পে','text'],['go','G.O.','text'],['reason','কলম 8','text'],lt,['extra','নিচের ছোট নোট (কলম 5–7)','textarea'],['text','পুরো নোট নিজে লিখতে চাইলে','textarea'],end];
   case 'status': return [['date','তারিখ','date'],['which','কী স্থায়ী হলো','select','',[['both','পদ ও চাকরি দুটোই'],['post','শুধু পদ (কলম 3)'],['appt','শুধু চাকরি/নিয়োগ (কলম 4)']]],['newStatus','নতুন অবস্থা','select','',[['Permanent','Permanent'],['Temporary','Temporary']]],
     ['memo','মেমো নম্বর'],['memoDate','মেমোর তারিখ','date'],['by','কে দিয়েছেন','text','যেমন DI/S(SE) Purulia'],['text','পুরো বয়ান নিজে লিখতে চাইলে','textarea']];
   case 'resign': return [['date','তারিখ','date'],['time','সময়','text','যেমন 4 P.M.'],['accepted','কে গ্রহণ করেছে','text','যেমন M.C. No. 09/13 dt. 14-12-2013'],['reason','কলম 8 নিজে লিখতে চাইলে','text'],['c9','কলম 9 নিজে লিখতে চাইলে','textarea']];
   case 'release': return [['date','রিলিজের তারিখ','date'],['reason','কলম 8','text',"যেমন Transferred through 'Utsashree'"],['cert','স্কুল ছাড়ার সার্টিফিকেট','select','',[['','হ্যাঁ, বসাও'],['false','না']]],
     ['ml','মেডিক্যাল ছুটি নেওয়া (দিন)','text','খালি রাখলে ছুটির হিসাব থেকে নেবে'],['hapl','হাফ-পে ছুটি','text'],['eol','অসাধারণ (EOL) ছুটি','text'],['joinText','শেষ লাইন','text','খালি রাখলে: to join in another school'],['text','পুরো সার্টিফিকেট নিজে লিখতে চাইলে','textarea']];
   case 'verify': return [['date','সার্টিফিকেটের তারিখ','date'],['style','কোন ধরন','select','',[['stamp','ছোট স্ট্যাম্প (কলম 12)'],['cert','বড় সার্টিফিকেট (দুই পাতা জুড়ে)']]],['from','কবে থেকে','date'],['to','কবে পর্যন্ত','date'],['di','বড় সার্টিফিকেটে D.I. অফিস','text'],['text','পুরো বয়ান নিজে লিখতে চাইলে','textarea']];
   case 'note': return [['date','কোন জায়গায় বসবে (তারিখ)','date'],['textL','বাঁ পাতার লেখা','textarea'],['fromL','বাঁ পাতায় কোন কলম থেকে শুরু','select','',[['2','কলম 2'],['1','কলম 1'],['3','কলম 3'],['5','কলম 5']]],['textR','ডান পাতার লেখা','textarea']];
  } return [];
}
function eventsView(T){
  var H=SB.fullHistory(T,A.S).H, h='';
  var todo=[], PH='(স্কুলের নাম ও ঠিকানা লিখুন)';
  SB.sortEvents(T.events||[]).forEach(function(e){ if(e.type!=='join') return;
    if(!e.school || !e.school.trim() || e.school.trim()===PH) todo.push('<li>'+esc(SB.fmt(e.date,A.S.dateFmt))+'-এর যোগদানে <b>স্কুলের নাম ও ঠিকানা</b> লেখা নেই <button class="btn sm2" data-act="editE" data-id="'+e.id+'">এখানে লিখুন</button></li>');
    else if(!e.scale || !e.scale.trim()) todo.push('<li>'+esc(SB.fmt(e.date,A.S.dateFmt))+'-এর যোগদানে <b>বেতনক্রম (কলম 2)</b> লেখা নেই <button class="btn sm2" data-act="editE" data-id="'+e.id+'">এখানে লিখুন</button></li>'); });
  if((T.events||[]).some(function(e){return e.type==='join';}) && !(T.events||[]).some(function(e){return e.type==='status';}) && !(T.events||[]).some(function(e){return e.type==='join' && (e.postStatus==='Permanent'||e.apptStatus==='Permanent');}))
    todo.push('<li>পদ/চাকরি কবে <b>Permanent</b> হলো লেখা নেই, তাই সব সারিতে Temporary আসছে <button class="btn sm2" data-act="pickE" data-t="status">যোগ করুন</button></li>');
  var evs0=SB.sortEvents(T.events||[]), lastJ=evs0.filter(function(e){return e.type==='join';}).pop();
  if(lastJ && evs0.some(function(e){ return (e.type==='release'||e.type==='resign') && e.date>=lastJ.date; }) && T.noNewJoin===undefined)
    todo.push('<li>শেষ স্কুল ছাড়ার পর <b>এখনকার স্কুল</b> দেওয়া নেই <button class="btn sm2" data-act="autoFill">এখনকার স্কুল দিন</button></li>');
  if(todo.length) h+='<div class="todobox"><b>📝 যা এখনও লেখা বাকি:</b><ul>'+todo.join('')+'</ul></div>';
  if(H.flags.length) h+='<div class="flagbox"><b>⚠ হিসাবের সঙ্গে মিলছে না — মূল অর্ডার দেখে নিন:</b><ul>'+H.flags.map(function(f){return '<li>'+esc(f.msg)+'</li>';}).join('')+'</ul></div>';
  h+='<div class="row gap wrap"><button class="btn pri" data-act="autoFill">✍ আজ পর্যন্ত লিখে দাও</button><button class="btn" data-act="addE">+ নতুন ঘটনা</button><button class="btn" data-act="genInc">১ জুলাইয়ের ইনক্রিমেন্টগুলো নিজে বসাও</button><button class="btn" data-act="readT">📄 PDF/ছবি থেকে পড়ো</button><button class="btn" data-act="pasteG">✎ Gemini থেকে পেস্ট করুন</button>'+(STANDALONE?'<button class="btn" data-act="readAI">🤖 AI দিয়ে পড়ো (হাতের লেখা)</button>':'')+'</div>';
  var evs=SB.sortEvents(T.events||[]);
  if(!evs.length) h+='<div class="empty">প্রথমে “স্কুলে যোগদান” ঘটনা যোগ করুন।</div>';
  var rowsBy={}; H.rows.forEach(function(r){ if(r.ev) (rowsBy[r.ev]=rowsBy[r.ev]||[]).push(r); });
  evs.forEach(function(e){
    var rs=rowsBy[e.id]||[], pay=null, txt=[];
    rs.forEach(function(r){ if(r.kind==='pay'){ pay=r.c6; if(r.c8) txt.push('(8) '+r.c8); } (r.spans||[]).forEach(function(s){ txt.push(s.text); }); });
    h+='<div class="card ev"><div class="evh"><span class="ed">'+esc(SB.fmt(e.date,A.S.dateFmt))+'</span><span class="et">'+esc(tname(e.type))+'</span>'+(pay?'<span class="ep">'+esc(pay)+'</span>':'')+'</div>'+
      (e._flag?'<div class="flag">⚠ '+esc(e._flag)+'</div>':'')+
      (txt.length?'<div class="evt">'+esc(txt.join('\n')).replace(/\n/g,'<br>')+'</div>':'')+
      '<div class="row gap"><button class="btn sm2" data-act="editE" data-id="'+e.id+'">বদলান</button><button class="btn sm2 danger" data-act="delE" data-id="'+e.id+'">মুছুন</button></div></div>';
  });
  return h;
}

// ----- event dialog -----
var DLG=null;
function openEvent(type,id){
  var T=A.T[A.tid]; var e=id? JSON.parse(JSON.stringify((T.events||[]).filter(function(x){return x.id===id;})[0]||{})) : {type:type, id:uid(), seq:Date.now()};
  if(!id){ // defaults
    if(type==='fix'){ e.commission='ROPA-2019'; e.level=SB.levelById(A.S,'L15')?'L15':(A.S.levels[0]||{}).id; applyComm(e); }
    if(type==='join'){ e.post='Assistant Teacher'; e.sys='2009'; e.postStatus='Temporary'; e.apptStatus='Temporary'; }
    if(type==='status'){ e.which='both'; e.newStatus='Permanent'; }
    if(type==='verify'){ e.style='stamp'; }
    if(type==='fix2009'){ e.wef='2006-01-01'; e.scaleText='PB-4 (Rs. 9000-40500) + GP Rs. 4800'; e.go='G.O. No. 46-SE(B) dt. 27/02/09'; }
    if(type==='release'){ e.reason="Transferred through 'Utsashree'"; }
    if(type==='inc'){ var y=new Date().getFullYear(); e.date=y+'-07-01'; }
  }
  DLG={e:e, isNew:!id};
  drawDialog();
}
function drawDialog(){
  var e=DLG.e, sc=schema(e.type), d=$('#dlg');
  var h='<div class="dlgbox"><div class="dlgh"><b>'+esc(tname(e.type))+'</b><button class="ib" data-act="closeD">✕</button></div><div class="dlgb form" data-form="ev">';
  sc.forEach(function(f){ var v=e[f[0]]; if(f[0]==='follow') v=e.follow===false?'false':''; if(f[0]==='cert') v=e.cert===false?'false':''; h+=fld(f[1],f[0],v==null?'':v,f[2],f[3],f[4]); });
  h+='<div class="prev"><b>বইয়ে যা লেখা হবে:</b><div id="evprev"></div></div></div><div class="dlgf"><button class="btn" data-act="closeD">বাতিল</button><button class="btn pri" data-act="saveE">সেভ করুন</button></div></div>';
  d.innerHTML=h; d.classList.add('on'); evPreview();
}
function evPreview(){
  var T=JSON.parse(JSON.stringify(A.T[A.tid])); var e=DLG.e;
  T.events=(T.events||[]).filter(function(x){return x.id!==e.id;}).concat([e]);
  var H=SB.fullHistory(T,A.S).H, out=[];
  H.rows.forEach(function(r){ if(r.ev!==e.id) return;
    if(r.kind==='pay') out.push('(5) '+r.c5+'   (6) '+r.c6+'   (7) '+(r.c7||'—')+'\n(3) '+r.c3+'   (4) '+r.c4+(r.c8?'\n(8) '+r.c8:'')+(r.c9?'\n(9) '+r.c9:''));
    (r.spans||[]).forEach(function(s){ out.push('[কলম '+s.from+(s.to!==s.from?'–'+s.to:'')+'] '+s.text); });
    if(r.c1 && r.kind!=='pay') out.push('[কলম 1] '+r.c1);
    if(r.c12) out.push('[কলম 12] '+r.c12);
  });
  var x=H.rows.filter(function(r){return r.ev===e.id;})[0]; var ev2=T.events.filter(function(z){return z.id===e.id;})[0];
  var extra=''; if(e.type==='fix' && ev2 && ev2._pre!=null) extra='\n\nহিসাব: আগের বেতন '+ev2._pre+' × '+(e.factor||2.57)+' = '+ev2._tgt+' → লেভেলের পরের ঘর '+(ev2._exp!=null?ev2._exp:'?');
  if(ev2 && ev2._flag) extra+='\n⚠ '+ev2._flag;
  var el=$('#evprev'); if(el) el.innerHTML='<pre>'+esc(out.join('\n\n')+extra)+'</pre>';
}
function closeDialog(){ DLG=null; var d=$('#dlg'); d.classList.remove('on'); d.innerHTML=''; }

// ----- leave -----
function leaveView(T){
  var FH=SB.fullHistory(T,A.S), H=FH.H, LV=FH.LV;
  var h='<div class="muted sm">প্রতি বছরের পাওনা অ্যাপ নিজে বসায় (মেডিক্যাল '+A.S.leave.mc+', হাফ-পে '+A.S.leave.hap+', হাফ-পে সর্বোচ্চ '+A.S.leave.hapCap+')। বইয়ে অন্য সংখ্যা থাকলে বা ছুটি নিলে এখানে লিখুন।</div>';
  if(!LV.rows.length) h+='<div class="empty">আগে “চাকরির ঘটনা”-তে যোগদান যোগ করুন।</div>';
  LV.rows.forEach(function(r){
    if(r.kind==='lnote'){ var v=(T.leave&&T.leave.notes&&T.leave.notes[r.key])||''; h+='<div class="card"><b>যাচাইয়ের নোট (স্কুল ছাড়ার পর)</b><div class="evt">'+esc(r.text)+'</div><label class="f"><span>নিজে লিখতে চাইলে</span><textarea data-lnote="'+r.key+'" rows="2">'+esc(v)+'</textarea></label></div>'; return; }
    var o=r._o||{};
    function li(k,lbl,ph){ return '<label class="lf"><span>'+lbl+'</span><input data-lk="'+r.key+'" data-f="'+k+'" inputmode="numeric" value="'+esc(o[k]||'')+'" placeholder="'+esc(ph||'')+'"></label>'; }
    h+='<div class="card lcard"><div class="evh"><span class="ed">'+r.c2a+' → '+r.c2b+'</span><span class="ep">জমা: M.C. '+r.c13+' | H.A.P. '+r.c14+'</span></div>'+
      '<div class="lgrid">'+li('mc','পাওনা M.C. 4(a)',String(r._auto.mc))+li('hap','পাওনা H.A.P. 4(b)',String(r._auto.hap))+li('t7','নেওয়া M.C. (7)','0')+li('t8','নেওয়া H.A.P. (8)','0')+
      li('eol','EOL (11)','')+li('m10a','মাতৃত্ব পূর্ণ (10a)','')+li('vd','Vac. Det. 4(c)','')+li('t9','Vac. Det. নেওয়া (9)','')+'</div>'+
      '<label class="f"><span>মন্তব্য (17)</span><input data-lk="'+r.key+'" data-f="rem" value="'+esc(o.rem||'')+'"></label></div>';
  });
  return h;
}

// ----- pages -----
function pagesView(T){
  return '<div class="row gap wrap"><button class="btn pri" data-act="pdf">PDF ডাউনলোড</button><button class="btn" data-act="html">প্রিন্টের HTML ফাইল</button></div>'+
    '<div class="muted sm">পাতাগুলো আসল সার্ভিস বুকের ধাঁচে সাজানো। নীল লেখাটা হাতে কপি করবেন; সই, স্ট্যাম্প আর আঙুলের ছাপের জায়গা ফাঁকা।</div><div id="pagesWrap"></div>';
}
function drawPages(){
  var T=A.T[A.tid], W=$('#pagesWrap'); if(!W) return;
  var res=BOOK.allPages(T,A.S); var avail=Math.min(W.clientWidth||360, 820); var sc=avail/BOOK.PW;
  W.innerHTML=res.pages.map(function(p){ return '<div class="pfit" style="width:'+(BOOK.PW*sc)+'px;height:'+(BOOK.PH*sc)+'px"><div style="transform:scale('+sc+');transform-origin:0 0">'+p+'</div></div>'; }).join('');
}
function loadScript(src){ return new Promise(function(ok,no){ var s=document.createElement('script'); s.src=src; s.onload=ok; s.onerror=no; document.head.appendChild(s); }); }
function saveFile(name,data){
  if(!A.dl){ try{ var blob=data instanceof Blob?data:new Blob([data],{type:/\.html$/.test(name)?'text/html':(/\.json$/.test(name)?'application/json':'application/octet-stream')}); var u=URL.createObjectURL(blob); var an=document.createElement('a'); an.href=u; an.download=name; document.body.appendChild(an); an.click(); setTimeout(function(){ URL.revokeObjectURL(u); an.remove(); },4000); toast('ফাইল নামানো হচ্ছে: '+name); }catch(e){ toast('ডাউনলোড হয়নি'); } return Promise.resolve(); }
  return A.dl.save({filename:name,data:data}).then(function(){ toast('ফাইল সেভ হয়েছে'); }).catch(function(e){ if(e&&e.code==='declined') return; toast('ডাউনলোড হয়নি: '+(e&&e.code||e)); });
}
function fileName(T,ext){ return 'ServiceBook_'+String(T.name||'teacher').replace(/[^A-Za-z0-9]+/g,'_')+'.'+ext; }
function exportPdf(){
  var T=A.T[A.tid]; toast('PDF তৈরি হচ্ছে… একটু সময় লাগবে');
  Promise.all([window.html2canvas?1:loadScript(new URL('vendor/html2canvas.min.js',location.href).href), (window.jspdf?1:loadScript(new URL('vendor/jspdf.umd.min.js',location.href).href))])
  .then(function(){ return document.fonts?document.fonts.ready:null; })
  .then(function(){
    var res=BOOK.allPages(T,A.S); var host=document.createElement('div'); host.style.cssText='position:fixed;left:-10000px;top:0;width:794px'; document.body.appendChild(host);
    var pdf=new window.jspdf.jsPDF({unit:'pt',format:'a4',compress:true}); var i=0;
    function next(){ if(i>=res.pages.length){ document.body.removeChild(host); return saveFile(fileName(T,'pdf'),pdf.output('blob')); }
      host.innerHTML=res.pages[i]; return window.html2canvas(host.firstChild,{scale:2,backgroundColor:'#ffffff',logging:false}).then(function(cv){
        if(i>0) pdf.addPage(); pdf.addImage(cv.toDataURL('image/jpeg',0.92),'JPEG',0,0,595.28,841.89); i++; return next(); }); }
    return next();
  }).catch(function(e){ toast('PDF তৈরি হয়নি: '+(e&&e.message||e)); });
}
function exportHtml(){
  var T=A.T[A.tid], res=BOOK.allPages(T,A.S);
  var doc='<!DOCTYPE html><html><head><meta charset="utf-8"><title>Service Book - '+esc(T.name||'')+'</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif:wght@400;700&family=Roboto+Condensed:wght@400;700&display=swap"><style>@page{size:A4;margin:0}body{margin:0;background:#888}.bpage{margin:0 auto 10px;page-break-after:always}@media print{body{background:#fff}.bpage{margin:0}}'+BOOK.CSS+'</style></head><body>'+res.pages.join('')+'</body></html>';
  saveFile(fileName(T,'html'),doc);
}
var toastT=null; function toast(t){ var el=$('#toast'); el.textContent=t; el.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(function(){ el.classList.remove('on'); },3500); }

// ---------- settings ----------
function settingsView(){
  var S=A.S, h='<div class="form" data-form="S">'+
  fld('স্কুলের নাম (উপরে দেখাবে)','schoolName',S.schoolName)+
  fld('তারিখ লেখার ধরন','dateFmt',S.dateFmt,'select','',[['dd-mm-yyyy','24-01-2008'],['dd.mm.yyyy','24.01.2008'],['dd-mm-yy','24-01-08'],['dd.mm.yy','24.01.08'],['dd/mm/yyyy','24/01/2008']])+
  fld('ইনক্রিমেন্টের কলম 8-এর লেখা','incLabel',S.incLabel,'text','যেমন Increment বা Annual Increment')+
  fld('নোশনাল হলে আগে বসবে','notionalPrefix',S.notionalPrefix)+
  fld('ছুটির কলম (9)-এর সাধারণ লেখা','leaveTextDefault',S.leaveTextDefault)+
  fld('ROPA 2009: ইনক্রিমেন্ট %','r2009.pct',S.r2009.pct,'number')+fld('ROPA 2009: কত টাকায় রাউন্ড (উপরের দিকে)','r2009.roundTo',S.r2009.roundTo,'number')+
  fld('ইনক্রিমেন্টের মাস','inc.month',S.inc.month,'number','7 = জুলাই')+fld('ইনক্রিমেন্টের দিন','inc.day',S.inc.day,'number')+fld('প্রথম ইনক্রিমেন্টের আগে কত মাস চাকরি লাগবে','inc.minMonths',S.inc.minMonths,'number')+
  fld('বছরে মেডিক্যাল ছুটি পাওনা','leave.mc',S.leave.mc,'number')+fld('বছরে হাফ-পে ছুটি পাওনা','leave.hap',S.leave.hap,'number')+fld('হাফ-পে ছুটি সর্বোচ্চ জমা','leave.hapCap',S.leave.hapCap,'number')+
  fld('পাতা নম্বর: প্রথম পাতা','pages.part',S.pages.part,'number')+fld('পাতা নম্বর: আঙুলের ছাপ','pages.finger',S.pages.finger,'number')+fld('পাতা নম্বর: History of Service শুরু','pages.hist',S.pages.hist,'number')+fld('পাতা নম্বর: Leave Account শুরু','pages.leave',S.pages.leave,'number')+
  fld('প্রতি পাতায় দাগের সংখ্যা','lines',S.lines,'number','বইয়ের পাতার সঙ্গে মেলাতে বদলান (১৬–২৪)')+'</div>';
  if(STANDALONE) h+='<h3>AI (Gemini) key</h3><div class="muted sm">হাতের লেখা পড়ার জন্য। '+(gk()?'key রাখা আছে।':'এখনও key দেওয়া হয়নি।')+'</div><button class="btn sm2" data-act="gemKeyChange">key দিন / বদলান</button>';
  h+='<h3>DA-র তালিকা</h3><div class="muted sm">সবার জন্য একই। নতুন DA ঘোষণা হলে যেকোনো তারিখে, যেকোনো % যোগ করুন — বছরে যতবার খুশি। এটা শুধু “৫. বেতন ও DA” পাতায় কাজে লাগে; সার্ভিস বুকের পাতা বদলায় না।</div>';
  (S.da||[]).forEach(function(x,i){ h+='<div class="card form darow" data-form="D" data-i="'+i+'">'+fld('কবে থেকে','from',x.from,'date')+fld('DA %','pct',x.pct,'number')+fld('G.O./মেমো','go',x.go)+'<button class="btn sm2 danger" data-act="delD" data-i="'+i+'">মুছুন</button></div>'; });
  h+='<div class="row gap wrap"><button class="btn" data-act="addD">+ নতুন DA</button><button class="btn" data-act="readDA">📄 DA-র G.O. PDF থেকে পড়ো</button></div>';
  h+='<h3>পে কমিশন</h3><div class="muted sm">প্রতিটা পে কমিশনের ফিক্সেশনের নিয়ম। নতুন কমিশনের G.O. বেরোলে গুণক, তারিখ আর ইনক্রিমেন্টের হার এখানে বসান, বা নিচের বোতাম দিয়ে G.O.-র PDF থেকে পড়ান।</div>';
  (S.commissions||[]).forEach(function(C,i){ h+='<div class="card form" data-form="C" data-i="'+i+'">'+fld('নাম','name',C.name)+fld('পদ্ধতি','method',C.method,'select','',[['matrix','গুণ করে পে-ম্যাট্রিক্সের পরের ঘর'],['band','গুণ করে রাউন্ড + গ্রেড পে'],['manual','নিজে বসানো']])+
    fld('গুণক (fitment factor)','factor',C.factor,'text','খালি = এখনও ঘোষণা হয়নি')+fld('নোশনাল তারিখ','date',C.date,'date')+fld('আসল টাকা কবে থেকে','actualFrom',C.actualFrom,'date')+fld('G.O.','go',C.go)+
    fld('ইনক্রিমেন্ট %','incPct',C.incPct,'number','এখন 3%। বদলালে নতুন লেভেলের ঘর এই হারে তৈরি হবে')+(C.method==='band'?fld('গুণের পর রাউন্ড (টাকা)','round',C.round,'number')+fld('ইনক্রিমেন্ট রাউন্ড (টাকা)','incRound',C.incRound,'number'):fld('ম্যাট্রিক্সের ঘর রাউন্ড (টাকা)','cellRound',C.cellRound||100,'number'))+
    (C.note?'<small class="muted">'+esc(C.note)+'</small>':'')+'<div class="row gap" style="margin-top:8px"><button class="btn sm2 danger" data-act="delC" data-i="'+i+'">মুছুন</button></div></div>'; });
  h+='<div class="row gap wrap"><button class="btn" data-act="addC">+ নতুন পে কমিশন</button><button class="btn pri" data-act="readGO">📄 G.O.-র PDF থেকে গুণক ও পে-ম্যাট্রিক্স পড়ো</button></div>';
  h+='<h3>পে-ম্যাট্রিক্স (লেভেল)</h3><div class="muted sm">নতুন পে কমিশন এলে এখানে নতুন লেভেল যোগ করুন, তারপর ঘটনায় “পে-রিভিশন” দিন। পুরনো এন্ট্রি বদলাবে না। প্রথম ঘর দিলে বাকি ঘর 3% করে 100-তে রাউন্ড হয়ে তৈরি হয় — সরকারি তালিকার সঙ্গে মিলিয়ে নেবেন।</div>';
  S.levels.forEach(function(L,i){
    h+='<div class="card form" data-form="L" data-i="'+i+'">'+fld('লেভেলের নাম','name',L.name)+fld('পে কমিশন','commission',L.commission,'select','',commOpts().concat(commOpts().some(function(o){return o[0]===L.commission;})?[]:[[L.commission,L.commission]]))+fld('আগের পে-ব্যান্ড ও গ্রেড পে','pre',L.pre)+
      fld('সব ঘর (কমা দিয়ে)','cells',L.cells.join(', '),'textarea',L.note||'')+
      '<div class="row gap"><button class="btn sm2" data-act="genL" data-i="'+i+'">প্রথম ঘর থেকে বাকিগুলো তৈরি</button><button class="btn sm2 danger" data-act="delL" data-i="'+i+'">লেভেল মুছুন</button></div></div>'; });
  h+='<button class="btn pri" data-act="addL">+ নতুন লেভেল</button>';
  return '<div class="pad">'+h+'</div>';
}

// ---------- confirm ----------
function ask(msg,ok){ var d=$('#dlg'); d.innerHTML='<div class="dlgbox small"><div class="dlgb"><p>'+esc(msg)+'</p></div><div class="dlgf"><button class="btn" data-act="closeD">না</button><button class="btn danger" id="askYes">হ্যাঁ</button></div></div>'; d.classList.add('on');
  $('#askYes').onclick=function(){ closeDialog(); ok(); }; }

// ---------- events wiring ----------
document.addEventListener('click',function(ev){
  var b=ev.target.closest('[data-act]'); if(!b) return; var act=b.getAttribute('data-act'), id=b.getAttribute('data-id');
  if(act==='home'){ A.view='home'; render(); }
  else if(act==='settings'){ A.view='settings'; render(); }
  else if(act==='newT'){ var nid=uid(); A.T[nid]={id:nid, name:'', sex:'M', desigShort:'A.T.', dobSource:'West Bengal Board of Secondary Education', events:[], leave:{ov:{},notes:{}}}; pendingNew[nid]=1; A.tid=nid; A.view='teacher'; A.tab='info'; render(); scheduleSave('T',nid); }
  else if(act==='delTid'){ ev.stopPropagation(); var T0=A.T[id]; ask('“'+(T0&&T0.name||'নাম নেই')+'” — এই শিক্ষকের সব তথ্য মুছে যাবে, ফেরত আনা যাবে না। মুছবেন?',function(){ delete A.T[id]; delete pendingNew[id]; render(); if(A.mode==='db') doSave('del',id); else lsPut(); toast('মুছে ফেলা হলো'); }); return; }
  else if(act==='delEmpty'){ var em=Object.keys(A.T).filter(function(k){ var t=A.T[k]; return !t.name && !(t.events||[]).length; }); ask('নাম ছাড়া, কোনো ঘটনা ছাড়া '+em.length+'টি খালি খাতা মুছে যাবে। মুছবেন?',function(){ em.forEach(function(k){ delete A.T[k]; delete pendingNew[k]; if(A.mode==='db') doSave('del',k); }); if(A.mode!=='db') lsPut(); render(); toast(em.length+'টি খালি খাতা মোছা হলো'); }); return; }
  else if(act==='openT'){ A.tid=id; A.view='teacher'; A.tab='events'; render(); }
  else if(act==='tab'){ A.tab=b.getAttribute('data-tab'); render(); }
  else if(act==='delT'){ ask('এই শিক্ষকের সব তথ্য মুছে যাবে, ফেরত আনা যাবে না। মুছবেন?',function(){ var t=A.tid; delete A.T[t]; A.view='home'; render(); if(A.mode==='db') doSave('del',t); else lsPut(); }); }
  else if(act==='addE'){ var d=$('#dlg'); d.innerHTML='<div class="dlgbox"><div class="dlgh"><b>কোন ঘটনা যোগ করবেন?</b><button class="ib" data-act="closeD">✕</button></div><div class="dlgb">'+ETYPES.map(function(t){ return '<button class="btn block" data-act="pickE" data-t="'+t[0]+'">'+t[1]+'</button>'; }).join('')+'</div></div>'; d.classList.add('on'); }
  else if(act==='pickE'){ openEvent(b.getAttribute('data-t')); }
  else if(act==='editE'){ var T=A.T[A.tid]; var e=(T.events||[]).filter(function(x){return x.id===id;})[0]; if(e) openEvent(e.type,id); }
  else if(act==='delE'){ ask('এই ঘটনাটা মুছবেন?',function(){ var T=A.T[A.tid]; T.events=T.events.filter(function(x){return x.id!==id;}); render(); scheduleSave('T',A.tid); }); }
  else if(act==='closeD'){ closeDialog(); }
  else if(act==='saveE'){ var T2=A.T[A.tid]; var e2=DLG.e; if(!e2.date){ toast('তারিখ দিন'); return; } ['_flag','_exp','_pre','_tgt'].forEach(function(k){ delete e2[k]; });
    T2.events=(T2.events||[]).filter(function(x){return x.id!==e2.id;}).concat([e2]); closeDialog(); render(); scheduleSave('T',A.tid); }
  else if(act==='genInc'){ var T3=A.T[A.tid]; var add=SB.genIncrements(T3,A.S); add.forEach(function(x,i){ x.id=uid(); x.seq=Date.now()+i; }); T3.events=(T3.events||[]).concat(add); render(); if(add.length){ scheduleSave('T',A.tid); toast(add.length+'টি ইনক্রিমেন্ট যোগ হলো'); } else toast('নতুন কোনো ইনক্রিমেন্ট বাকি নেই'); }
  else if(act==='pdf'){ exportPdf(); } else if(act==='html'){ exportHtml(); }
  else if(act==='backup'){ doBackup(); }
  else if(act==='restore'){ doRestore(); }
  else if(act==='reloadApp'){ location.reload(); }
  else if(act==='addSlot'){ var Ts=A.T[A.tid]; Ts.extraSlots=(Ts.extraSlots||0)+1; render(); scheduleSave('T',A.tid); }
  else if(act==='addPayRow'){ var Tp=A.T[A.tid]; var last=SB.sortEvents(Tp.events||[]).filter(function(e){return SB.PAYTYPES[e.type];}).pop(); var y=last?(+last.date.slice(0,4)+(last.date.slice(5)>='07-01'?1:0)):new Date().getFullYear(); Tp.events.push({id:uid(), seq:Date.now(), type:'inc', date:y+'-07-01'}); render(); scheduleSave('T',A.tid); }
  else if(act==='addD'){ A.S.da=A.S.da||[]; A.S.da.push({from:SB.todayStr(), pct:'', go:''}); render(); scheduleSave('S'); }
  else if(act==='delD'){ var di=+b.getAttribute('data-i'); ask('এই DA লাইনটা মুছবেন?',function(){ A.S.da.splice(di,1); render(); scheduleSave('S'); }); }
  else if(act==='readDA'){ pickFile(importDA); }
  else if(act==='applyDA'){ applyDAImport(); }
  else if(act==='autoFill'){ autoFill(); }
  else if(act==='autoJoinSave'){ var T9=A.T[A.tid], e9=DLG.e; if(!e9.date){ toast('তারিখ দিন'); return; } if(!e9.school||!e9.school.trim()){ toast('স্কুলের নাম লিখুন'); return; } ['_flag','_exp','_pre','_tgt'].forEach(function(k){ delete e9[k]; }); T9.events.push(e9); closeDialog(); runAutoFill(T9); }
  else if(act==='noNewJoin'){ var T8=A.T[A.tid]; T8.noNewJoin=DLG.endDate; closeDialog(); runAutoFill(T8); }
  else if(act==='goPages'){ closeDialog(); A.tab='pages'; render(); }
  else if(act==='addC'){ A.S.commissions.push({name:'New Pay Commission', method:'matrix', factor:'', incPct:3, cellRound:100, date:'', actualFrom:'', go:''}); render(); scheduleSave('S'); }
  else if(act==='delC'){ var ci=+b.getAttribute('data-i'); ask('এই পে কমিশন মুছবেন?',function(){ A.S.commissions.splice(ci,1); render(); scheduleSave('S'); }); }
  else if(act==='readT'){ pickFile(importTeacher); }
  else if(act==='pasteG'){ pasteDialog(); }
  else if(act==='readAI'){ if(!gk()) askGemKey(function(){ pickFile(aiImportTeacher); }); else pickFile(aiImportTeacher); }
  else if(act==='gemKeyChange'){ askGemKey(function(){ toast('নতুন key রাখা হল'); }); }
  else if(act==='readGO'){ pickFile(importGO); }
  else if(act==='copyTxt'){ var tx=b.getAttribute('data-txt')||($('#rawtxt')||{}).value||''; try{ navigator.clipboard.writeText(tx).then(function(){ toast('কপি হয়েছে'); },function(){ toast('কপি হয়নি — লেখাটা লম্বা চেপে কপি করুন'); }); }catch(e){ toast('কপি হয়নি'); } }
  else if(act==='applyT'){ applyTeacherImport(); }
  else if(act==='applyGO'){ applyGOImport(); }
  else if(act==='addL'){ A.S.levels.push({id:uid(), commission:'ROPA-2019', name:'Level ', pre:'', cells:[]}); render(); scheduleSave('S'); }
  else if(act==='delL'){ var i=+b.getAttribute('data-i'); ask('এই লেভেল মুছবেন? যেসব ঘটনায় এটা ব্যবহার হয়েছে সেগুলোর হিসাব ভুল হয়ে যাবে।',function(){ A.S.levels.splice(i,1); render(); scheduleSave('S'); }); }
  else if(act==='genL'){ var j=+b.getAttribute('data-i'), L=A.S.levels[j]; if(!L.cells.length){ toast('আগে প্রথম ঘরটা লিখুন'); return; } var CC=SB.commByName(A.S,L.commission)||{}; L.cells=SB.genCells(L.cells[0],40,CC.incPct||3,CC.cellRound||100); render(); scheduleSave('S'); }
});
function setPath(o,path,v){ var p=path.split('.'); while(p.length>1){ o=o[p.shift()]; } o[p[0]]=v; }
document.addEventListener('input',function(ev){
  var tS=ev.target; if(tS.hasAttribute && tS.hasAttribute('data-sk')){ if(tS.type==='date'||tS.tagName==='SELECT') return; slotUpdate(+tS.getAttribute('data-si'),tS.getAttribute('data-sk'),tS.value); return; }
  if(tS.hasAttribute && tS.hasAttribute('data-pe')){ if(tS.type==='date'||tS.tagName==='SELECT') return; var Tq=A.T[A.tid], eq=(Tq.events||[]).filter(function(x){return x.id===tS.getAttribute('data-pe');})[0]; if(eq){ var fq=tS.getAttribute('data-pf'); if(tS.value==='') delete eq[fq]; else eq[fq]=tS.value; scheduleSave('T',A.tid); } return; }
  var t=ev.target, form=t.closest('[data-form]');
  if(t.hasAttribute('data-lk')){ var T=A.T[A.tid]; T.leave=T.leave||{ov:{},notes:{}}; T.leave.ov=T.leave.ov||{}; var k=t.getAttribute('data-lk'); var o=T.leave.ov[k]=T.leave.ov[k]||{}; o[t.getAttribute('data-f')]=t.value.trim(); scheduleSave('T',A.tid); return; }
  if(t.hasAttribute('data-lnote')){ var T5=A.T[A.tid]; T5.leave=T5.leave||{ov:{},notes:{}}; T5.leave.notes=T5.leave.notes||{}; T5.leave.notes[t.getAttribute('data-lnote')]=t.value; scheduleSave('T',A.tid); return; }
  if(!form || !t.hasAttribute('data-k')) return; var k2=t.getAttribute('data-k'), v=t.value, f=form.getAttribute('data-form');
  if(f==='info'){ A.T[A.tid][k2]=v; scheduleSave('T',A.tid); if(k2==='dob'||k2==='dobSource'){ var pv=form.querySelector('.prev pre'); if(pv) pv.textContent=SB.dobLine(A.T[A.tid].dob,A.T[A.tid].dobSource); } }
  else if(f==='ev'){ if(k2==='follow') DLG.e.follow=(v==='false'?false:undefined); else if(k2==='cert') DLG.e.cert=(v==='false'?false:undefined); else DLG.e[k2]=v; if(k2==='commission' && DLG.e.type==='fix'){ applyComm(DLG.e); drawDialog(); return; } evPreview(); }
  else if(f==='S'){ var num=t.type==='number'; setPath(A.S,k2,num?(+v):v); scheduleSave('S'); }
  else if(f==='C'){ var C=A.S.commissions[+form.getAttribute('data-i')]; var old=C.name; C[k2]=(t.type==='number'?+v:v); if(k2==='name'){ A.S.levels.forEach(function(L){ if(L.commission===old) L.commission=v; }); } scheduleSave('S'); if(k2==='method') render(); }
  else if(f==='D'){ var D=A.S.da[+form.getAttribute('data-i')]; D[k2]=(k2==='pct'?(v===''?'':+v):v); scheduleSave('S'); }
  else if(f==='L'){ var L=A.S.levels[+form.getAttribute('data-i')]; if(k2==='cells'){ L.cells=v.split(/[^0-9]+/).filter(Boolean).map(Number); } else L[k2]=v; scheduleSave('S'); }
});
document.addEventListener('change',function(ev){ var t0=ev.target;
  if(t0.hasAttribute && t0.hasAttribute('data-sk')){ var openIdx=[].map.call(document.querySelectorAll('details.scard'),function(d,i){return d.open?i:-1;}).filter(function(i){return i>=0;}); var rr=slotUpdate(+t0.getAttribute('data-si'),t0.getAttribute('data-sk'),t0.value); if(rr==='rerender' || t0.type==='date' || t0.tagName==='SELECT'){ var y=window.scrollY; render(); document.querySelectorAll('details.scard').forEach(function(d,i){ if(openIdx.indexOf(i)>=0) d.open=true; }); window.scrollTo(0,y); } return; }
  if(t0.hasAttribute && t0.hasAttribute('data-pe')){ var Tq=A.T[A.tid], eq=(Tq.events||[]).filter(function(x){return x.id===t0.getAttribute('data-pe');})[0]; if(eq){ var fq=t0.getAttribute('data-pf'); if(t0.value==='') delete eq[fq]; else eq[fq]=t0.value; scheduleSave('T',A.tid); var y2=window.scrollY; render(); window.scrollTo(0,y2); } return; } if(t0.hasAttribute && t0.hasAttribute('data-pk') && IMP && IMP.R){ var ii=+t0.getAttribute('data-pk'); IMP.R.pays[ii].kind=t0.value; var dlgb=$('#dlg .dlgb'), st0=dlgb?dlgb.scrollTop:0; snapshotImport(); drawTeacherImport(); var nb=$('#dlg .dlgb'); if(nb) nb.scrollTop=st0; return; } if(ev.target.tagName==='SELECT') ev.target.dispatchEvent(new Event('input',{bubbles:true})); });
window.addEventListener('resize',function(){ if(A.view==='teacher'&&A.tab==='pages') drawPages(); });

// ---------- offline reading (PDF/ছবি) ----------
var IMP=null;
function pickFile(cb){ var inp=document.createElement('input'); inp.type='file'; inp.accept='application/pdf,image/*'; inp.style.display='none'; document.body.appendChild(inp);
  inp.onchange=function(){ var f=inp.files[0]; document.body.removeChild(inp); if(f) cb(f); }; inp.click(); }
function busy(msg){ var d=$('#dlg'); d.innerHTML='<div class="dlgbox small"><div class="dlgb"><p><b>পড়ছি…</b></p><p id="busymsg" class="muted sm">'+esc(msg||'')+'</p><p class="muted sm">বড় PDF বা ছবিতে ১–২ মিনিট লাগতে পারে। প্রথমবার লেখা চেনার ফাইল (প্রায় ৭ MB) লোড হয়।</p></div></div>'; d.classList.add('on'); }
function prog(m){ var el=$('#busymsg'); if(el) el.textContent=m; }
function scanNote(R){ if(R.ai) return '<div class="flagbox">'+(R.pasted?'Gemini-র লেখা থেকে নেওয়া।':'AI (Gemini) হাতের লেখা পড়েছে।')+' বেশিরভাগ ঠিক আসে, তবে ১০০% নয় — যোগ করার আগে প্রতিটা তারিখ, বেতন আর নম্বর বইয়ের সঙ্গে মিলিয়ে নিন। ভুল থাকলে ঘরেই ঠিক করে দিন।</div>';
  if(!R.scanned.length) return '<div class="okbox">এটা টাইপ করা PDF — লেখা সরাসরি পড়া গেছে, ভুলের সম্ভাবনা কম।</div>';
  return '<div class="flagbox">পাতা '+R.scanned.join(', ')+' স্ক্যান করা ছবি — অ্যাপ নিজে লেখা চিনেছে (OCR)'+(R.conf!=null?', গড় নিশ্চয়তা '+R.conf+'%':'')+'। ছাপা লেখা মোটামুটি ঠিক আসে, <b>হাতের লেখা প্রায়ই ভুল পড়ে বা পড়তেই পারে না</b>। যোগ করার আগে প্রতিটা সংখ্যা মিলিয়ে নিন।</div>'; }
function rawBlock(R){ return '<details><summary>পুরো পড়া লেখা দেখুন / কপি করুন</summary><textarea id="rawtxt" rows="10" readonly style="width:100%;font-size:12px">'+esc(R.text)+'</textarea><button class="btn sm2" data-act="copyTxt">সব কপি</button></details>'; }
function refsBlock(R){ if(!R.refs.length) return ''; return '<h4>পাওয়া G.O./মেমো নম্বর (টিপলে কপি হবে)</h4>'+R.refs.slice(0,30).map(function(r){ return '<button class="btn sm2 block" data-act="copyTxt" data-txt="'+esc(r.text)+'">'+esc(r.text)+'</button>'; }).join(''); }

function importTeacher(file){
  busy('ফাইল খুলছি…');
  READER.read(file,prog).then(function(doc){ var R=READER.parse(doc); IMP={R:R}; drawTeacherImport(); })
  .catch(function(e){ closeDialog(); toast('পড়া যায়নি: '+(e&&e.message||e)); });
}
var INFO_LBL={name:'নাম',dob:'জন্ম তারিখ',father:'বাবা/স্বামীর নাম',height:'উচ্চতা'};
function guessComm(d){ var L=(A.S.commissions||[]).filter(function(c){return c.date && c.date<=d;}).sort(function(a,b){return b.date.localeCompare(a.date);}); return L[0]?L[0].name:''; }
function prepPays(R,T){
  if(R._prep) return; R._prep=true;
  R.pays.sort(function(a,b){ return a.date.localeCompare(b.date); });
  var P=R.pays, prev=null, prevDate='';
  P.forEach(function(p,i){
    if(prev!=null && p.pay>prev*1.8 && p.kind!=='join'){ p.kind='fix'; p.auto='বেতন একলাফে অনেক বেড়েছে, তাই পে-রিভিশন/ফিক্সেশন ধরা হলো'; }
    else if(prev!=null && p.kind==='inc' && p.date.slice(5)!=='07-01' && p.pay===prev && p.date!==prevDate){ p.kind='join'; p.auto='১ জুলাই নয় আর বেতন একই, তাই নতুন স্কুলে যোগদান ধরা হলো — ঠিক না হলে বদলে দিন'; }
    else if(prev!=null && p.kind==='inc' && p.date.slice(5)!=='07-01' && p.date.slice(5)!=='01-01' && p.pay>prev){ p.kind='benefit'; p.auto='১ জুলাই নয়, তাই ১০ বছর/CAS সুবিধা ধরা হলো — ঠিক না হলে বদলে দিন'; }
    if(p.kind==='fix' && p.date<'2016-01-01'){ p.kind='fix2009'; }
    var nxt=null; for(var j=i+1;j<P.length;j++){ nxt=P[j].pay; break; }
    var ref=prev!=null?prev:(nxt||0);
    if(ref && p.pay<ref*0.7){ p.sus=true; return; }
    prev=p.pay; prevDate=p.date; });
  var hasJoin=(T.events||[]).some(function(e){return e.type==='join';});
  if(!hasJoin && P.length){ var f=P.filter(function(p){return !p.sus;})[0]; if(f && f.kind!=='join'){ f.kind='join'; f.auto='প্রথম সারি, তাই যোগদান ধরা হলো'; } }
}
function snapshotImport(){ var d=$('#dlg'), R=IMP.R; d.querySelectorAll('[data-pi]').forEach(function(c){ var i=+c.getAttribute('data-pi'), p=R.pays[i]; if(!p) return; p.sus=!c.checked;
    var dd=d.querySelector('[data-pd="'+i+'"]'), pp=d.querySelector('[data-pp="'+i+'"]'), ps=d.querySelector('[data-ps="'+i+'"]'); if(dd) p.date=dd.value; if(pp) p.pay=+pp.value.replace(/[^0-9]/g,'')||p.pay; if(ps) p.school=ps.value; }); }
function drawTeacherImport(){
  var R=IMP.R, T=A.T[A.tid], h='<div class="dlgbox"><div class="dlgh"><b>ফাইল থেকে যা পাওয়া গেল</b><button class="ib" data-act="closeD">✕</button></div><div class="dlgb">'+scanNote(R);
  var keys=Object.keys(R.info);
  if(keys.length){ h+='<h4>ব্যক্তিগত তথ্য</h4>'; keys.forEach(function(k){ var cur=T[k]; h+='<label class="chk"><input type="checkbox" data-ik="'+k+'"'+(cur?'':' checked')+'> <span>'+INFO_LBL[k]+'</span> <input class="imv" data-iv="'+k+'" type="'+(k==='dob'?'date':'text')+'" value="'+esc(R.info[k])+'">'+(cur?'<small>এখন আছে: '+esc(cur)+'</small>':'')+'</label>'; }); }
  var have={}; (T.events||[]).forEach(function(e){ if(SB.PAYTYPES[e.type]) have[e.date]=e; });
  prepPays(R,T);
  if(R.pays.length){ h+='<h4>বেতনের সারি ('+R.pays.length+'টি)</h4><div class="muted sm">একই তারিখের ঘটনা আগে থেকে থাকলে শুধু বেতনটা বসবে, আর হিসাবের সঙ্গে না মিললে লাল দাগ দেখাবে।</div>';
    R.pays.forEach(function(p,i){ var ex=have[p.date];
      h+='<div class="imrow"><label class="chk"><input type="checkbox" data-pi="'+i+'"'+(p.sus?'':' checked')+'></label><input type="date" data-pd="'+i+'" value="'+p.date+'"><select data-pk="'+i+'">'+[['inc','ইনক্রিমেন্ট'],['join','যোগদান (নতুন স্কুল)'],['fix2009','ROPA-2009 ফিক্সেশন'],['fix','পে-রিভিশন (ROPA-2019/নতুন)'],['benefit','১০ বছর/CAS'],['payrow','অন্য সারি']].map(function(o){ return '<option value="'+o[0]+'"'+(o[0]===p.kind?' selected':'')+'>'+o[1]+'</option>'; }).join('')+'</select><input data-pp="'+i+'" inputmode="numeric" value="'+p.pay+'">'+(p.kind==='join'?'<input class="imsch" data-ps="'+i+'" placeholder="যোগদানের স্কুলের নাম ও ঠিকানা লিখুন" value="'+esc(p.school||'')+'">':'')+
        '<small class="muted">'+(p.sus?'<b class="flag">⚠ আগের সারির চেয়ে অনেক কম — সম্ভবত গ্রেড পে বা ভুল পড়া, তাই টিক তুলে রাখা হলো। </b>':'')+(p.auto?'<b>'+esc(p.auto)+'। </b>':'')+(ex?'আগে থেকে আছে · ':'')+esc((p.line||'').slice(0,90))+'</small></div>'; });
    h+='<div class="muted sm">নতুন স্কুলে যোগ দেওয়ার সারিটা “যোগদান (নতুন স্কুল)” করে দিন — না হলে বেতনের হিসাব ভুল মিলবে।</div>'; }
  if(R.pays.length && !(T.events||[]).some(function(e){return e.type==='join';}) && !R.pays.some(function(p){return p.kind==='join';})) h+='<div class="flagbox">এই শিক্ষকের “স্কুলে যোগদান” এখনও দেওয়া হয়নি। সারিগুলো যোগ হবে, কিন্তু বেতনের হিসাব মেলানোর জন্য পরে যোগদানটা দিয়ে দিন।</div>';
  if(R.schools && R.schools.length){ h+='<h4>স্কুল ('+R.schools.length+'টি)</h4><div class="muted sm">একই তারিখের যোগদানের সারিতে স্কুলের নাম, ঠিকানা, বেতনক্রম আর স্বীকৃতির লাইন বসবে।</div>';
    R.schools.forEach(function(s,i){ h+='<label class="chk"><input type="checkbox" data-sc="'+i+'" checked> <span><b>'+esc(s.date?SB.fmt(s.date,A.S.dateFmt):'তারিখ নেই')+'</b> — '+esc(s.post)+'<br>'+esc(s.school).replace(/\n/g,' ')+(s.scale?'<br><small>বেতনক্রম: '+esc(s.scale)+'</small>':'')+(s.recog.length?'<br><small>স্বীকৃতি: '+s.recog.length+' লাইন</small>':'')+'</span></label>'; }); }
  if(R.notes && R.notes.length){ h+='<h4>বয়ান / নোট ('+R.notes.length+'টি)</h4><div class="muted sm">হুবহু তারিখ অনুযায়ী বইয়ের পাতায় বসবে। “permanent” লেখা থাকলে পরের সারিগুলো Permanent হবে।</div>';
    var WH={skip:'❌ বসবে না (অন্য পাতার লেখা বা অ্যাপ নিজে লেখে)', verify:'➡ ডান পাতায় যাচাই (কলম 12 / সার্টিফিকেট)', status:'স্থায়ী হওয়ার ঘটনা', join:'যোগদানের ঘরে (মেমো/অনুমোদন)', note:'বাঁ পাতায় নোট'};
    R.notes.forEach(function(n,i){ var nk=noteKind(n.text); h+='<label class="chk"><input type="checkbox" data-nt="'+i+'"'+(n.date&&nk!=='skip'?' checked':'')+'> <span>'+esc(n.date?SB.fmt(n.date,A.S.dateFmt):'তারিখ নেই (টিক দিলে বসবে না)')+': '+esc(n.text.slice(0,160))+'<br><small><b>'+WH[nk]+'</b></small></span></label>'; }); }
  if(R.releases && R.releases.length){ h+='<h4>স্কুল ছাড়া ('+R.releases.length+'টি)</h4>'; R.releases.forEach(function(r,i){ h+='<label class="chk"><input type="checkbox" data-rl="'+i+'" checked> <span>'+esc(SB.fmt(r.date,A.S.dateFmt))+': '+esc(r.reason)+'</span></label>'; }); }
  if(R.leave && R.leave.length){ h+='<h4>নেওয়া ছুটি ('+R.leave.length+'টি সারি)</h4>'; R.leave.forEach(function(l,i){ h+='<label class="chk"><input type="checkbox" data-lv="'+i+'" checked> <span>'+esc(SB.fmt(l.from,A.S.dateFmt))+(l.to?' – '+esc(SB.fmt(l.to,A.S.dateFmt)):'')+': M.C. '+(+l.mlTaken||0)+' দিন'+(+l.hapTaken?', H.A.P. '+(+l.hapTaken)+' দিন':'')+'</span></label>'; }); h+='<div class="muted sm">ছুটির হিসাবের যে বছরের মধ্যে এই তারিখ পড়ে, সেই বছরে বসবে।</div>'; }
  if(!keys.length && !R.pays.length && !(R.schools&&R.schools.length) && !(R.notes&&R.notes.length)) h+='<div class="empty">কাজের মতো তারিখ-বেতন কিছু খুঁজে পাওয়া যায়নি। নিচের পুরো লেখাটা দেখে নিজে বসাতে পারেন।</div>';
  h+=refsBlock(R)+rawBlock(R)+'</div><div class="dlgf"><button class="btn" data-act="closeD">বাতিল</button><button class="btn pri" data-act="applyT">টিক দেওয়াগুলো যোগ করো</button></div></div>';
  var d=$('#dlg'); d.innerHTML=h; d.classList.add('on');
}
function applyTeacherImport(){
  var R=IMP.R, T=A.T[A.tid], d=$('#dlg'), nInfo=0, nNew=0, nUpd=0;
  d.querySelectorAll('[data-ik]').forEach(function(c){ if(!c.checked) return; var k=c.getAttribute('data-ik'); var v=d.querySelector('[data-iv="'+k+'"]').value.trim(); if(v){ T[k]=v; nInfo++; } });
  T.events=T.events||[]; var have={}; T.events.forEach(function(e){ if(SB.PAYTYPES[e.type]) have[e.date]=e; });
  var hasJoin=T.events.some(function(e){return e.type==='join';});
  d.querySelectorAll('[data-pi]').forEach(function(c){ if(!c.checked) return; var i=c.getAttribute('data-pi');
    var date=d.querySelector('[data-pd="'+i+'"]').value, k=d.querySelector('[data-pk="'+i+'"]').value, pay=d.querySelector('[data-pp="'+i+'"]').value.replace(/[^0-9]/g,'');
    if(!date) return; var ex=have[date];
    if(ex){ ex.pay=pay; nUpd++; return; }
    var e={id:uid(), seq:Date.now()+nNew, type:k, date:date, pay:pay};
    var pr0=R.pays[+i]||{}; var sIn=d.querySelector('[data-ps="'+i+'"]'); if(sIn && sIn.value.trim()) pr0.school=sIn.value.trim();
    if(k==='join'){ e.type='join'; e.post='Assistant Teacher'; e.school=pr0.school||'(স্কুলের নাম ও ঠিকানা লিখুন)'; e.sys=date>='2016-01-01'?((A.S.levels[0]||{}).id||'2009'):(date>='2006-01-01'?'2009':'manual'); e.postStatus='Temporary'; e.apptStatus='Temporary'; hasJoin=true; }
    if(e.type==='fix2009'){ e.showDate=date; e.wef='2006-01-01'; e.scaleText='PB-4 (Rs. 9000-40500) + GP Rs. 4800'; e.go='G.O. No. 46-SE(B) dt. 27/02/09'; e.reason='Pay fixed as per ROPA 2009'; }
    if(e.type==='fix'){ e.commission=guessComm(date)||'ROPA-2019'; var keepPay=e.pay, keepDate=e.date; applyComm(e); e.pay=keepPay; e.date=keepDate;
      if(e.method==='matrix'){ var pn=+pay, lv=A.S.levels.filter(function(L){ return L.cells.indexOf(pn)>=0; }); var lc=lv.filter(function(L){return L.commission===e.commission;}); var pick=(lc[0]||lv[0]); if(pick) e.level=pick.id; else if(!e.level) e.level=(A.S.levels[0]||{}).id; } }
    T.events.push(e); have[date]=e; nNew++; });
  var nExtra=0;
  if(R.schools){ d.querySelectorAll('[data-sc]').forEach(function(c){ if(!c.checked) return; var s=R.schools[+c.getAttribute('data-sc')];
      var j=T.events.filter(function(e){ return e.type==='join' && s.date && e.date===s.date; })[0];
      if(!j && !s.date) j=SB.sortEvents(T.events).filter(function(e){ return e.type==='join'; })[0]; // no date: first school
      if(!j && s.date){ j={id:uid(), seq:Date.now()+nExtra, type:'join', date:s.date, sys:s.date>='2016-01-01'?((A.S.levels[0]||{}).id||'2009'):(s.date>='2006-01-01'?'2009':'manual'), postStatus:'Temporary', apptStatus:'Temporary'}; T.events.push(j); }
      if(!j) return; if(s.post) j.post=s.post; if(s.school) j.school=s.school; if(s.scale){ j.scale=s.scale; if(/\d{3,5}\s*-\s*\d{2,4}\s*-\s*\d{3,5}\s*-/.test(s.scale) && !/\bPB|grade\s*pay|\bG\.?P\b|level/i.test(s.scale)) j.sys='manual'; } if(s.recog.length) j.recog=s.recog.join('\n'); nExtra++; }); }
  if(R.notes){ d.querySelectorAll('[data-nt]').forEach(function(c){ if(!c.checked) return; var n=R.notes[+c.getAttribute('data-nt')]; if(!n.date) return;
      var nk=noteKind(n.text); if(nk==='skip') return;
      if(nk==='verify'){ var ve=verifyEvent(n.text, n.date); ve.id=uid(); ve.seq=Date.now()+nExtra; if(ve.date){ T.events.push(ve); nExtra++; } return; }
      if(nk==='status'){ var mp=memoParts(n.text); T.events.push({id:uid(), seq:Date.now()+nExtra, type:'status', date:mp.wef||n.date, which:/post/i.test(n.text)&&!/service/i.test(n.text)?'post':'both', newStatus:'Permanent', memo:mp.no, memoDate:mp.date, by:mp.by, text:n.text}); }
      else if(noteToJoin(n.text) && T.events.some(function(e){return e.type==='join';})){ var f=noteToJoin(n.text), js=SB.sortEvents(T.events).filter(function(e){return e.type==='join';});
        var jj=js.filter(function(e){ return e.date<=n.date; }).pop()||js[0];
        if(Object.keys(f).some(function(k){ return jj[k]; })){ jj.extra=(jj.extra?jj.extra+'\n':'')+n.text; } else Object.keys(f).forEach(function(k){ jj[k]=f[k]; }); }
      else T.events.push({id:uid(), seq:Date.now()+nExtra, type:'note', date:n.date, textL:n.text, fromL:'3'}); nExtra++; }); }
  if(R.releases){ d.querySelectorAll('[data-rl]').forEach(function(c){ if(!c.checked) return; var r=R.releases[+c.getAttribute('data-rl')];
      if(T.events.some(function(e){ return (e.type==='release'||e.type==='resign') && e.date===r.date; })) return;
      T.events.push(/resign/i.test(r.reason)?{id:uid(), seq:Date.now()+nExtra, type:'resign', date:r.date, reason:r.reason}:{id:uid(), seq:Date.now()+nExtra, type:'release', date:r.date, reason:r.reason}); nExtra++; }); }
  var nLv=0; if(R.leave){ T.leave=T.leave||{ov:{},notes:{}}; T.leave.ov=T.leave.ov||{}; var FH=SB.fullHistory(T,A.S);
    d.querySelectorAll('[data-lv]').forEach(function(c){ if(!c.checked) return; var l=R.leave[+c.getAttribute('data-lv')];
      var per=FH.LV.rows.filter(function(r){ return r.kind==='leave' && r.from<=l.from && r.to>=l.from; })[0]; if(!per) return;
      var o=T.leave.ov[per.key]=T.leave.ov[per.key]||{}; if(+l.mlTaken) o.t7=String((+o.t7||0)+(+l.mlTaken)); if(+l.hapTaken) o.t8=String((+o.t8||0)+(+l.hapTaken)); nLv++; }); }
  closeDialog(); A.tab='events'; render(); scheduleSave('T',A.tid);
  toast('যোগ হলো: তথ্য '+nInfo+', নতুন সারি '+nNew+', বেতন বসানো '+nUpd+(nExtra?', স্কুল/বয়ান '+nExtra:'')+(nLv?', ছুটি '+nLv:''));
}

function importGO(file){
  busy('ফাইল খুলছি…');
  READER.read(file,prog).then(function(doc){ var R=READER.parse(doc); IMP={R:R}; drawGOImport(); })
  .catch(function(e){ closeDialog(); toast('পড়া যায়নি: '+(e&&e.message||e)); });
}
function drawGOImport(){
  var R=IMP.R, h='<div class="dlgbox"><div class="dlgh"><b>G.O. থেকে যা পাওয়া গেল</b><button class="ib" data-act="closeD">✕</button></div><div class="dlgb">'+scanNote(R);
  h+='<label class="f form"><span>কোন পে কমিশনে বসাব</span><select id="goComm">'+commOpts().map(function(o,i){ return '<option value="'+esc(o[0])+'"'+(i===commOpts().length-1?' selected':'')+'>'+esc(o[1])+'</option>'; }).join('')+'</select></label>';
  h+='<label class="chk"><input type="checkbox" id="goFacChk"'+(R.factor?' checked':'')+'> <span>গুণক (fitment factor)</span> <input class="imv" id="goFac" value="'+(R.factor||'')+'"></label>'+(R.factor?'':'<small class="muted">লেখায় গুণক খুঁজে পাওয়া যায়নি।</small>');
  if(R.refs.length){ var gref=R.refs.filter(function(r){return /^G/i.test(r.kind);})[0]||R.refs[0]; h+='<label class="chk"><input type="checkbox" id="goRefChk" checked> <span>G.O.</span> <input class="imv" id="goRef" value="'+esc(gref.text)+'"></label>'; }
  if(R.levels.length){ h+='<h4>পে-ম্যাট্রিক্সের কলাম ('+R.levels.length+'টি)</h4><div class="muted sm">প্রতিটা কলাম একটা লেভেল হিসেবে যোগ হবে। নামগুলো G.O. দেখে ঠিক করে দিন।</div>';
    R.levels.forEach(function(L,i){ h+='<div class="imrow"><label class="chk"><input type="checkbox" data-li="'+i+'" checked></label><input data-ln="'+i+'" value="'+esc(L.name||('Level '+(i+1)))+'"><small class="muted">'+L.cells.length+'টি ঘর: '+L.cells.slice(0,5).join(', ')+' … '+L.cells[L.cells.length-1]+'</small></div>'; }); }
  else h+='<div class="muted sm">পে-ম্যাট্রিক্সের সংখ্যার কলাম খুঁজে পাওয়া যায়নি। লেভেলের প্রথম ঘর নিজে লিখে “প্রথম ঘর থেকে বাকিগুলো তৈরি” টিপতে পারেন।</div>';
  h+=refsBlock(R)+rawBlock(R)+'</div><div class="dlgf"><button class="btn" data-act="closeD">বাতিল</button><button class="btn pri" data-act="applyGO">টিক দেওয়াগুলো বসাও</button></div></div>';
  var d=$('#dlg'); d.innerHTML=h; d.classList.add('on');
}
function applyGOImport(){
  var R=IMP.R, d=$('#dlg'), cn=$('#goComm').value, C=SB.commByName(A.S,cn), n=0;
  if(C && $('#goFacChk') && $('#goFacChk').checked && $('#goFac').value.trim()){ C.factor=+$('#goFac').value.trim()||$('#goFac').value.trim(); }
  if(C && $('#goRefChk') && $('#goRefChk').checked){ C.go=$('#goRef').value.trim(); }
  d.querySelectorAll('[data-li]').forEach(function(c){ if(!c.checked) return; var i=+c.getAttribute('data-li'); A.S.levels.push({id:uid(), commission:cn, name:d.querySelector('[data-ln="'+i+'"]').value, pre:'', cells:R.levels[i].cells.slice(), note:'G.O. থেকে পড়া — মিলিয়ে নিন'}); n++; });
  closeDialog(); render(); scheduleSave('S'); toast('বসানো হলো'+(n?': '+n+'টি লেভেল':''));
}


// ---------- auto fill up to today ----------
function autoFill(){
  var T=A.T[A.tid], evs=SB.sortEvents(T.events||[]);
  var joins=evs.filter(function(e){return e.type==='join';});
  if(!joins.length){ toast('আগে প্রথম স্কুলে যোগদান যোগ করুন'); openEvent('join'); return; }
  var lastJ=joins[joins.length-1], endE=evs.filter(function(e){ return (e.type==='release'||e.type==='resign') && e.date>=lastJ.date; })[0];
  if(endE && T.noNewJoin!==endE.date){ askNewJoin(T,lastJ,endE); return; }
  runAutoFill(T);
}
function askNewJoin(T,lastJ,endE){
  var H=SB.fullHistory(T,A.S).H, st=H.state;
  var e={type:'join', id:uid(), seq:Date.now(), date:SB.addDays(endE.date,1), post:lastJ.post||'Assistant Teacher', school:'', scale:'', postStatus:'Permanent', apptStatus:'Permanent',
    sys: st.sys==='matrix'?st.level:(st.sys==='2009'?'2009':'manual')};
  var L=SB.levelById(A.S,e.sys); if(L) e.scale=L.name+'\n'+L.pre;
  DLG={e:e, isNew:true, auto:true, endDate:endE.date};
  var d=$('#dlg'); d.innerHTML='<div class="dlgbox"><div class="dlgh"><b>'+esc(SB.fmt(endE.date,A.S.dateFmt))+'-এ আগের স্কুল ছেড়েছেন। নতুন স্কুলে যোগ দিয়েছেন?</b><button class="ib" data-act="closeD">✕</button></div><div class="dlgb form" data-form="ev">'+
    fld('নতুন স্কুলে যোগদানের তারিখ','date',e.date,'date')+fld('পদ','post',e.post)+fld('স্কুলের নাম ও পুরো ঠিকানা','school','','textarea')+fld('স্কুলের স্বীকৃতির ইতিহাস (না জানলে খালি)','recog','','textarea')+fld('বেতনক্রম (কলম 2)','scale',e.scale,'textarea')+
    '<div class="muted sm">বেতন আগের স্কুলের শেষ বেতন থেকে চলবে: <b>'+(H.finalPay!=null?SB.money(H.finalPay):'—')+'</b></div><div class="prev"><b>বইয়ে যা লেখা হবে:</b><div id="evprev"></div></div></div>'+
    '<div class="dlgf"><button class="btn" data-act="noNewJoin">না, যোগ দিইনি</button><button class="btn pri" data-act="autoJoinSave">হ্যাঁ, সেভ করে লেখো</button></div></div>';
  d.classList.add('on'); evPreview();
}
function runAutoFill(T){
  var today=SB.todayStr(), added={inc:0, fix:[]}, notes=[];
  T.events=T.events||[];
  var evs=SB.sortEvents(T.events), first=(evs.filter(function(e){return e.type==='join';})[0]||{}).date||'';
  (A.S.commissions||[]).forEach(function(C){
    if(!C.date || C.date<first || C.date>today) return;
    var applied=T.events.some(function(e){ return e.type==='fix' && (e.commission===C.name || e.date===C.date); }) || (C.name==='ROPA-2009' && T.events.some(function(e){return e.type==='fix2009';}));
    if(applied) return;
    if(C.method!=='manual' && (C.factor===''||C.factor==null)){ notes.push(C.name+': গুণক এখনও বসানো হয়নি, তাই এই ফিক্সেশন বাদ রাখলাম। G.O. বেরোলে সেটিংসে গুণক বসিয়ে বোতামটা আবার টিপবেন।'); return; }
    var e={id:uid(), seq:Date.now(), type:'fix', commission:C.name}; applyComm(e);
    if(C.method==='matrix'){ var lv=A.S.levels.filter(function(L){return L.commission===C.name;}); if(!lv.length){ notes.push(C.name+': এই কমিশনের পে-ম্যাট্রিক্স (লেভেল) বসানো নেই, তাই ফিক্সেশন বাদ রাখলাম।'); return; }
      var jb=SB.sortEvents(T.events).filter(function(x){ return x.type==='join' && x.date<=C.date; }).pop(), byGP=null;
      SB.sortEvents(T.events).filter(function(x){ return x.type==='join' && x.date<=C.date; }).forEach(function(x){ byGP=levelFromText(x.scale,C.name)||byGP; });
      var cur=SB.sortEvents(T.events).filter(function(x){ return x.type==='join'; }).map(function(x){ return SB.levelById(A.S,x.sys); }).filter(function(L){ return L && L.commission===C.name; })[0];
      e.level=byGP||(cur&&cur.id)||lv[0].id; var Lp=SB.levelById(A.S,e.level);
      if(!byGP && !cur && lv.length>1) notes.push(C.name+': বেতনক্রমে গ্রেড পে লেখা নেই, তাই লেভেল হিসেবে '+Lp.name+' ধরেছি — ভুল হলে “চাকরির ঘটনা”-তে '+SB.fmt(C.date,A.S.dateFmt)+'-এর পে-রিভিশন খুলে লেভেল বদলান (যেমন GP 4800 হলে Level 15)।'); }
    T.events.push(e); added.fix.push(C.name);
  });
  var inc=SB.genIncrements(T,A.S,today); inc.forEach(function(x,i){ x.id=uid(); x.seq=Date.now()+i+1; }); T.events=T.events.concat(inc); added.inc=inc.length;
  render(); scheduleSave('T',A.tid);
  var FH=SB.fullHistory(T,A.S), lv2=FH.LV.rows.filter(function(r){return r.kind==='leave';}), lastLv=lv2[lv2.length-1];
  var d=$('#dlg'); d.innerHTML='<div class="dlgbox"><div class="dlgh"><b>আজ ('+esc(SB.fmt(today,A.S.dateFmt))+') পর্যন্ত লেখা হলো</b><button class="ib" data-act="closeD">✕</button></div><div class="dlgb">'+
    '<ul><li>নতুন ইনক্রিমেন্ট: <b>'+added.inc+'টি</b>'+(added.inc?' (ছুটির কলমে “'+esc(A.S.leaveTextDefault)+'”)':'')+'</li>'+(added.fix.length?'<li>পে-রিভিশন: <b>'+esc(added.fix.join(', '))+'</b></li>':'')+
    '<li>এখনকার বেতন: <b>'+(FH.H.finalPay!=null?SB.money(FH.H.finalPay):'—')+'</b></li>'+(lastLv?'<li>ছুটির হিসাব '+esc(lastLv.c2b)+' পর্যন্ত — জমা M.C. <b>'+esc(lastLv.c13)+'</b>, H.A.P. <b>'+esc(lastLv.c14)+'</b></li>':'')+'</ul>'+
    (notes.length?'<div class="flagbox"><ul>'+notes.map(function(n){return '<li>'+esc(n)+'</li>';}).join('')+'</ul></div>':'')+
    '<div class="muted sm">কোনো বছরে ছুটি নিয়ে থাকলে “৩. ছুটির হিসাব”-এ সেই বছরে দিন লিখুন। কোনো সারিতে আলাদা লেখা লাগলে “বদলান” টিপুন। চলতি বছরের ছুটির সারি বছর পূর্ণ হলে নিজে আসবে।</div></div>'+
    '<div class="dlgf"><button class="btn" data-act="closeD">ঠিক আছে</button><button class="btn pri" data-act="goPages">বইয়ের পাতা দেখাও</button></div></div>';
  d.classList.add('on');
}


// ---------- pay + DA page ----------
function daView(T){
  var FH=SB.fullHistory(T,A.S), rows=SB.payDaRows(T,A.S,FH.H), F=A.S.dateFmt;
  var h='<div class="muted sm">DA বেসিকের উপর আলাদা শতাংশ — বেসিক, ইনক্রিমেন্ট বা সার্ভিস বুকের পাতা এতে বদলায় না। DA-র হার “সেটিংস”-এর DA-র তালিকা থেকে আসে (নতুন DA সেখানে যোগ করুন)।</div>';
  if(!rows.length) return h+'<div class="empty">DA-র তালিকা বা বেতনের তথ্য নেই।</div>';
  var cur=rows[rows.length-1];
  h+='<div class="card"><div class="sm">এখন ('+esc(SB.fmt(cur.from,F))+' থেকে)</div><div class="dabig">বেসিক '+SB.money(cur.basic)+' + DA '+cur.pct+'% ('+SB.money(cur.da)+') = <b>'+SB.money(cur.total)+'</b></div></div>';
  h+='<div class="tw"><table class="dat"><thead><tr><th>কবে থেকে</th><th>কবে পর্যন্ত</th><th>বেসিক</th><th>DA %</th><th>DA-র টাকা</th><th>মোট</th></tr></thead><tbody>'+
    rows.slice().reverse().map(function(r){ return '<tr><td>'+esc(SB.fmt(r.from,F))+'</td><td>'+esc(r.to?SB.fmt(r.to,F):'চলছে')+'</td><td>'+SB.money(r.basic)+'</td><td>'+r.pct+'%</td><td>'+SB.money(r.da)+'</td><td><b>'+SB.money(r.total)+'</b></td></tr>'; }).join('')+'</tbody></table></div>';
  h+='<div class="muted sm">ROPA-2019 চালু হওয়ার আগের DA (ROPA-2009-এর %) এই তালিকায় নেই; দরকার হলে সেটিংসে যোগ করুন।</div>';
  return h;
}
function importDA(file){
  busy('ফাইল খুলছি…');
  READER.read(file,prog).then(function(doc){ var R=READER.parse(doc); var found=[];
    R.lines.forEach(function(l,ix){ var t=l.text+' '+((R.lines[ix+1]||{}).text||''); var m=/(?:@|at the rate of|rate of)?\s*(\d{1,3}(?:\.\d+)?)\s*%/i.exec(l.text); if(!m) return;
      if(!/dearness|D\.?A\.?\b/i.test(t) && !/dearness/i.test(R.text)) return;
      var ds=READER.dates(t); var wef=/(?:w\.?\s*e\.?\s*f\.?|with effect from)\s*:?\s*(\d{1,2}\s*[.\-\/]\s*\d{1,2}\s*[.\-\/]\s*\d{2,4})/i.exec(t); var d=wef?READER.dates(wef[1])[0]:ds[0];
      if(d) found.push({from:d.iso, pct:+m[1]}); });
    var seen={}; found=found.filter(function(f){ var k=f.from+'|'+f.pct; if(seen[k]) return false; seen[k]=1; return true; });
    var gref=R.refs.filter(function(r){return /^(G|Memo|No)/i.test(r.kind);})[0];
    IMP={da:found, go:gref?gref.text:''};
    var h='<div class="dlgbox"><div class="dlgh"><b>DA-র অর্ডার থেকে যা পাওয়া গেল</b><button class="ib" data-act="closeD">✕</button></div><div class="dlgb">'+scanNote(R);
    if(!found.length) h+='<div class="empty">DA-র % আর তারিখ একসঙ্গে খুঁজে পাওয়া যায়নি। নিচের লেখা দেখে “+ নতুন DA” দিয়ে নিজে বসান।</div>';
    found.forEach(function(f,i){ h+='<div class="imrow"><label class="chk"><input type="checkbox" data-di="'+i+'"'+(i===0?' checked':'')+'></label><input type="date" data-dd="'+i+'" value="'+f.from+'"><input data-dp="'+i+'" value="'+f.pct+'"><input data-dg="'+i+'" value="'+esc(IMP.go)+'"></div>'; });
    h+=rawBlock(R)+'</div><div class="dlgf"><button class="btn" data-act="closeD">বাতিল</button><button class="btn pri" data-act="applyDA">টিক দেওয়াগুলো যোগ করো</button></div></div>';
    var d=$('#dlg'); d.innerHTML=h; d.classList.add('on');
  }).catch(function(e){ closeDialog(); toast('পড়া যায়নি: '+(e&&e.message||e)); });
}
function applyDAImport(){ var d=$('#dlg'), n=0; A.S.da=A.S.da||[];
  d.querySelectorAll('[data-di]').forEach(function(c){ if(!c.checked) return; var i=c.getAttribute('data-di'); var fr=d.querySelector('[data-dd="'+i+'"]').value, p=+d.querySelector('[data-dp="'+i+'"]').value;
    if(!fr||isNaN(p)) return; var ex=A.S.da.filter(function(x){return x.from===fr;})[0]; if(ex){ ex.pct=p; ex.go=d.querySelector('[data-dg="'+i+'"]').value; } else A.S.da.push({from:fr,pct:p,go:d.querySelector('[data-dg="'+i+'"]').value}); n++; });
  A.S.da.sort(function(a,b){return (a.from||'').localeCompare(b.from||'');}); closeDialog(); render(); scheduleSave('S'); toast(n+'টি DA বসানো হলো'); }


// ---------- backup / restore ----------
function doBackup(){
  var d=new Date(), stamp=d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
  var data={app:'service-book', version:1, saved:new Date().toISOString(), S:A.S, T:JSON.parse(JSON.stringify(A.T,function(k,v){return k.charAt(0)==='_'?undefined:v;}))};
  saveFile('ServiceBook_backup_'+stamp+'.json', JSON.stringify(data));
  A.lastBackup=SB.fmt(stamp,A.S.dateFmt); try{ localStorage.setItem('sbk_lastBackup',A.lastBackup); }catch(e){}
}
function doRestore(){
  var inp=document.createElement('input'); inp.type='file'; inp.accept='.json,application/json'; inp.style.display='none'; document.body.appendChild(inp);
  inp.onchange=function(){ var f=inp.files[0]; inp.remove(); if(!f) return; f.text().then(function(txt){
    var data; try{ data=JSON.parse(txt); }catch(e){ toast('এটা ঠিক ব্যাকআপ ফাইল নয়'); return; }
    if(!data || data.app!=='service-book' || !data.T){ toast('এটা সার্ভিস বুকের ব্যাকআপ ফাইল নয়'); return; }
    var n=Object.keys(data.T).length, same=Object.keys(data.T).filter(function(k){return A.T[k];}).length;
    ask('ব্যাকআপে '+n+' জন শিক্ষকের তথ্য আছে'+(same?' (এর মধ্যে '+same+' জন এখানেও আছেন — তাঁদের তথ্য ব্যাকআপেরটা দিয়ে বদলে যাবে)':'')+'। সেটিংস, DA আর পে-ম্যাট্রিক্সও ব্যাকআপ থেকে বসবে। তুলব?', function(){
      if(data.S) A.S=SB.mergeSettings(data.S);
      Object.keys(data.T).forEach(function(k){ var t=data.T[k]; t.id=k; A.T[k]=t; pendingNew[k]=1; });
      render(); scheduleSave('S'); Object.keys(data.T).forEach(function(k){ scheduleSave('T',k); }); toast(n+' জন শিক্ষকের তথ্য তোলা হলো'); });
  }); }; inp.click();
}
// ---------- standalone: offline install + auto update ----------
if(STANDALONE){
  try{ A.lastBackup=localStorage.getItem('sbk_lastBackup')||''; }catch(e){}
  try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); }catch(e){}
  if('serviceWorker' in navigator){
    var hadCtl=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(function(reg){
      reg.update().catch(function(){});
      document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='visible') reg.update().catch(function(){}); });
      setInterval(function(){ reg.update().catch(function(){}); }, 60*60*1000);
    }).catch(function(){});
    navigator.serviceWorker.addEventListener('controllerchange',function(){
      if(!hadCtl){ hadCtl=true; return; }
      if(!$('#dlg').classList.contains('on')) location.reload(); else { A.updateReady=true; render(); }
    });
  }
}

// ---------- AI reading (Google Gemini, the person's own free key; standalone app only) ----------
var GEMBASE='https://generativelanguage.googleapis.com/v1beta/';
function gk(){ try{ return (localStorage.getItem('gemKey')||'').trim(); }catch(e){ return ''; } }
function gkSet(v){ try{ localStorage.setItem('gemKey',v); localStorage.removeItem('gemModel'); }catch(e){} }
var GEMMSG={g_bad_key:'Gemini key ঠিক নয়। aistudio.google.com থেকে key আবার কপি করে বসান।', g_quota:'Google-এর ফ্রি সীমা এখন শেষ। কিছুক্ষণ পরে বা কাল আবার চেষ্টা করুন।',
  g_denied:'Google এই key দিয়ে ব্যবহার করতে দিচ্ছে না। AI Studio-তে নতুন key বানিয়ে দেখুন।', g_http:'Gemini থেকে ঠিকমতো উত্তর এল না। একটু পরে আবার চেষ্টা করুন।', offline:'ইন্টারনেট নেই। AI দিয়ে পড়ার জন্য ইন্টারনেট লাগবে।', g_json:'Gemini-র উত্তর বোঝা গেল না। আবার চেষ্টা করুন।'};
function gemErr(r){ return r.json().catch(function(){return {};}).then(function(j){ var m=(j.error&&j.error.message)||'', d=JSON.stringify((j.error&&j.error.details)||'');
  if((r.status===400&&/API_KEY_INVALID|API key not valid|expired/i.test(m+d))||r.status===401) return {code:'g_bad_key'};
  if(r.status===429||/RESOURCE_EXHAUSTED|quota/i.test(m)) return {code:'g_quota'}; if(r.status===403) return {code:'g_denied'}; return {code:'g_http',message:m}; }); }
function gemModel(key){
  var c=''; try{ c=localStorage.getItem('gemModel')||''; }catch(e){} if(c) return Promise.resolve(c);
  return fetch(GEMBASE+'models?pageSize=200',{headers:{'x-goog-api-key':key}}).catch(function(){ throw {code:'offline'}; }).then(function(r){
    if(!r.ok) return gemErr(r).then(function(e){ throw e; });
    return r.json().then(function(j){ var ver=function(n){ var x=String(n).match(/gemini-(\d+(?:\.\d+)?)/); return x?+x[1]:0; };
      var ok=(j.models||[]).filter(function(m){ return (m.supportedGenerationMethods||[]).indexOf('generateContent')>=0 && /flash/.test(m.name) && !/lite|image|tts|live|audio|embed|exp|8b/.test(m.name); })
        .sort(function(a,b){ return ((/preview/.test(a.name))-(/preview/.test(b.name))) || ver(b.name)-ver(a.name); });
      var name=(ok[0]&&ok[0].name)||'models/gemini-2.5-flash'; try{ localStorage.setItem('gemModel',name); }catch(e){} return name; }); }); }
var AI_PROMPT='These are photos/scans of pages of a West Bengal (India) school teacher\'s handwritten SERVICE BOOK (or service-related orders). Read the handwriting carefully and return ONLY JSON with this shape:\n'+
 '{"info":{"name":"","dob":"YYYY-MM-DD","father":"","residence":"","height":"","idMarks":"","qualEntry":"","qualLater":""},'+
 '"rows":[{"date":"YYYY-MM-DD","pay":0,"kind":"join|inc|fix|benefit|payrow|release|resign","school":"","text":""}],'+
 '"leave":[{"from":"YYYY-MM-DD","to":"YYYY-MM-DD","mlTaken":0,"hapTaken":0}],"refs":[""]}\n'+
 'Rules: rows = every dated pay entry in the History of Service (date of appointment/increment = column 5, pay = column 6 as a plain number). kind: join = first joining at a school (put school name+address in "school"), inc = annual increment, fix = pay fixation/ROPA revision, benefit = 10-year/CAS benefit, payrow = any other pay line, release/resign = leaving a school. "text" = the reason/notes written for that row, copied as written. leave = Leave Account rows with medical leave (M.C.) days taken (col 7) and half-pay days taken (col 8), 0 if none. refs = every G.O./memo/resolution number with its date, copied exactly. Dates written like 24.1.08 mean 2008-01-24 (day.month.year). Use "" or omit fields you cannot read; never guess. Ignore signatures and stamps.';
function gemAsk(key,model,imgs){
  var parts=imgs.map(function(b){ return {inline_data:{mime_type:'image/jpeg',data:b}}; }); parts.push({text:AI_PROMPT});
  var v=(String(model).match(/gemini-(\d+(?:\.\d+)?)/)||[])[1], n=v?+v:0; var gc={temperature:0,maxOutputTokens:16000,responseMimeType:'application/json'};
  if(n>=3) gc.thinkingConfig={thinkingLevel:'low'}; else if(n>=2.5) gc.thinkingConfig={thinkingBudget:1024};
  function call(cfg){ return fetch(GEMBASE+model+':generateContent',{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts:parts}],generationConfig:cfg})}).catch(function(){ throw {code:'offline'}; }); }
  return call(gc).then(function(r){ if(r.status===400 && gc.thinkingConfig){ var g2=Object.assign({},gc); delete g2.thinkingConfig; return call(g2); } return r; })
  .then(function(r){ if(!r.ok) return gemErr(r).then(function(e){ if(r.status===404){ try{ localStorage.removeItem('gemModel'); }catch(x){} } throw e; });
    return r.json(); }).then(function(j){ var t=((((j.candidates||[])[0]||{}).content||{}).parts||[]).map(function(p){return p.text||'';}).join('');
    t=t.replace(/^```(?:json)?\s*/,'').replace(/```\s*$/,''); try{ return JSON.parse(t); }catch(e){ var m=/\{[\s\S]*\}/.exec(t); if(m){ try{ return JSON.parse(m[0]); }catch(e2){} } throw {code:'g_json'}; } });
}
function fileImages(file,progress){
  function canvasB64(cv){ return cv.toDataURL('image/jpeg',0.85).split(',')[1]; }
  if(/pdf$/i.test(file.type)||/\.pdf$/i.test(file.name)){
    return READER.ensurePdf().then(function(){ return file.arrayBuffer(); }).then(function(buf){ return window.pdfjsLib.getDocument({data:buf}).promise; }).then(function(pdf){
      var out=[], i=0; function next(){ i++; if(i>pdf.numPages) return out; progress('পাতা '+i+'/'+pdf.numPages+' তৈরি করছি…');
        return pdf.getPage(i).then(function(pg){ var v1=pg.getViewport({scale:1}), sc=1800/Math.max(v1.width,v1.height), v=pg.getViewport({scale:sc}); var cv=document.createElement('canvas'); cv.width=v.width; cv.height=v.height;
          return pg.render({canvasContext:cv.getContext('2d'),viewport:v}).promise.then(function(){ out.push(canvasB64(cv)); return next(); }); }); }
      return next(); }); }
  return new Promise(function(ok,no){ var img=new Image(); img.onload=function(){ var s=Math.min(1,1800/Math.max(img.width,img.height)); var cv=document.createElement('canvas'); cv.width=img.width*s; cv.height=img.height*s; cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height); ok([canvasB64(cv)]); }; img.onerror=function(){ no(new Error('ছবি খোলা যায়নি')); }; img.src=URL.createObjectURL(file); });
}
function askGemKey(then){
  var d=$('#dlg'); d.innerHTML='<div class="dlgbox"><div class="dlgh"><b>Gemini key দিন (একবারই)</b><button class="ib" data-act="closeD">✕</button></div><div class="dlgb">'+
   '<p class="sm">হাতের লেখা পড়ার জন্য Google-এর ফ্রি Gemini লাগে। Pankaj Question Maker-এ যে key দিয়েছিলেন সেটাই দিলে চলবে।</p>'+
   '<ol class="sm"><li>নতুন key লাগলে <b>aistudio.google.com/apikey</b> খুলে Google অ্যাকাউন্টে ঢুকুন।</li><li><b>Create API key</b> চাপুন, তারপর <b>AQ.</b> বা <b>AIza</b> দিয়ে শুরু লম্বা লেখাটা কপি করুন।</li><li>নিচের ঘরে পেস্ট করে <b>রাখুন</b> চাপুন।</li></ol>'+
   '<input id="gkIn" class="imv" style="width:100%" type="password" placeholder="AQ.… বা AIza…" autocomplete="off"><p class="muted sm">key শুধু এই যন্ত্রে থাকে।</p></div>'+
   '<div class="dlgf"><button class="btn" data-act="closeD">বাতিল</button><button class="btn pri" id="gkSave">রাখুন</button></div></div>'; d.classList.add('on');
  $('#gkSave').onclick=function(){ var v=$('#gkIn').value.trim(); if(!/^(AIza[0-9A-Za-z_\-]{20,}|AQ\.[0-9A-Za-z_\-.]{20,})$/.test(v)){ toast('এটা Gemini key মনে হচ্ছে না। key শুরু হয় AQ. বা AIza দিয়ে।'); return; } gkSet(v); closeDialog(); then(); };
}
function aiImportTeacher(file){
  var key=gk(); if(!key){ askGemKey(function(){ aiImportTeacher(file); }); return; }
  busy('ফাইল খুলছি…');
  var model;
  fileImages(file,prog).then(function(imgs){
    return gemModel(key).then(function(m){ model=m;
      var batches=[]; for(var i=0;i<imgs.length;i+=4) batches.push(imgs.slice(i,i+4)); var res=[], k=0;
      function next(){ if(k>=batches.length) return res; prog('AI পড়ছে: '+(k*4+1)+'–'+Math.min(imgs.length,k*4+batches[k].length)+' / '+imgs.length+' পাতা… (প্রতি দফায় ১–২ মিনিট লাগতে পারে)');
        return gemAsk(key,model,batches[k]).then(function(j){ res.push(j); k++; return next(); }); }
      return next(); }); })
  .then(function(list){
    var R={info:{}, pays:[], refs:[], scanned:[], conf:null, ai:true, leave:[], text:''};
    var ik=['name','dob','father','residence','height','idMarks','qualEntry','qualLater'];
    list.forEach(function(j){ var inf=j.info||{}; ik.forEach(function(k){ var v=inf[k]; if(v && !R.info[k]){ if(k==='dob' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return; R.info[k]=String(v).trim(); } });
      (j.rows||[]).forEach(function(r){ if(!r || !/^\d{4}-\d{2}-\d{2}$/.test(r.date||'')) return; var p=+String(r.pay||'').replace(/[^0-9.]/g,''); if(!p) return;
        R.pays.push({date:r.date, pay:Math.round(p), kind:/^(join|inc|fix|benefit|payrow|release|resign)$/.test(r.kind)?r.kind:'inc', school:r.school||'', note:r.text||'', line:(r.text||'')+(r.school?' — '+r.school:'')}); });
      (j.leave||[]).forEach(function(l){ if(l && /^\d{4}-\d{2}-\d{2}$/.test(l.from||'') && (+l.mlTaken||+l.hapTaken) && !R.leave.some(function(x){ return x.from===l.from && +x.mlTaken===+l.mlTaken && +x.hapTaken===+l.hapTaken; })) R.leave.push(l); });
      (j.refs||[]).forEach(function(t){ if(t && typeof t==='string') R.refs.push({kind:'ref', text:t.trim()}); }); });
    var seen={}; R.pays=R.pays.filter(function(p){ var k=p.date+'|'+p.pay; if(seen[k]) return false; seen[k]=1; return true; }).sort(function(a,b){ return a.date.localeCompare(b.date); });
    R.pays.forEach(function(p){ if(p.kind==='release'||p.kind==='resign') p.kind='payrow'; });
    R.text=JSON.stringify(list,null,1); IMP={R:R}; drawTeacherImport();
  }).catch(function(e){ closeDialog(); var c=e&&e.code; toast(GEMMSG[c]||('AI দিয়ে পড়া যায়নি: '+(e&&(e.message||e.code)||e))); });
}

// ---------- paste from Gemini app (no key needed) ----------
var PASTE_PROMPT='এই ছবিগুলো পশ্চিমবঙ্গের এক শিক্ষকের হাতে লেখা সার্ভিস বুকের পাতা। হাতের লেখা মন দিয়ে পড়ে নিচের ধাঁচে, শুধু এই লাইনগুলো লেখো। টেবিল, বুলেট, মোটা অক্ষর, শিরোনাম বা অন্য কোনো কথা লিখবে না — প্রতিটা লাইন NAME:/DOB:/ROW: এরকম শব্দ দিয়ে শুরু হবে। উদাহরণ:\nROW: 01-07-2009 | 16440 | Increment |\nROW: 17-12-2013 | 18520 | Join | Dhamsa P.C. Sen Institution\nROW: 01-01-2016 | 50900 | ROPA |\n\nএবার এই ধাঁচে লেখো:\n'+
 'NAME: (নাম, ইংরেজিতে যেমন লেখা)\nDOB: DD-MM-YYYY\nFATHER: (বাবা/স্বামীর নাম)\nRESIDENCE: (ঠিকানা)\nHEIGHT: \nMARK: (শনাক্তকরণ চিহ্ন)\nQUAL: (যোগ্যতা)\n'+
 'SCHOOL: যোগদানের তারিখ DD-MM-YYYY | পদ | স্কুলের নাম ও পুরো ঠিকানা (এক লাইনে, কমা দিয়ে) | বেতনক্রম (কলম 2-এ যা লেখা)\n'+
 'RECOG: (ঠিক আগের SCHOOL-এর কলম 1-এর নিচে লেখা স্কুলের স্বীকৃতির প্রতিটা লাইন, একটা করে)\n'+
 'NOTE: DD-MM-YYYY | কলম 3–7 বা পুরো পাতা জুড়ে লেখা প্রতিটা বয়ান হুবহু (নিয়োগ, অনুমোদন, পদ স্থায়ী হওয়া, ফিক্সেশনের নোট, ভেরিফিকেশন সার্টিফিকেট ইত্যাদি)\n'+
 'RELEASE: DD-MM-YYYY | স্কুল ছাড়ার কারণ যেমন লেখা (Resignation / Transferred … / Released)\n'+
 'ROW: DD-MM-YYYY | বেতন (শুধু সংখ্যা) | Join / Increment / ROPA / 10yr / Other | স্কুলের নাম বা পাশে লেখা কথা\n'+
 'LEAVE: DD-MM-YYYY | মেডিক্যাল ছুটি কত দিন | হাফ-পে ছুটি কত দিন\nREF: (G.O./মেমো নম্বর ও তারিখ, যেমন লেখা)\n\n'+
 'নিয়ম: History of Service-এর প্রতিটা তারিখ-বেতনের লাইনের জন্য একটা করে ROW (কলম 5-এর তারিখ, কলম 6-এর মোট বেতন)। গ্রেড পে (যেমন 4800) বা স্কেলের সংখ্যা (যেমন 9000-40500) কখনো বেতন হিসেবে লিখবে না। প্রথম স্কুলের প্রথম লাইন আর যেখানে কলম 1-এ নতুন স্কুলের নাম শুরু হয়েছে সেই লাইন Join, পাশে স্কুলের নাম। Increment লেখা লাইন Increment। ROPA/ফিক্সেশনের লাইন ROPA। ১০ বছর পূর্তির লাইন 10yr। একই তারিখ-বেতন দুবার লিখবে না। Leave Account-এ যে বছরে ছুটি নেওয়া হয়েছে শুধু সেগুলোর জন্য LEAVE। প্রতিটা স্কুলের জন্য একটা SCHOOL, তার নিচে RECOG লাইনগুলো। প্রতিটা G.O./মেমো নম্বরের জন্য একটা REF। যেটা পড়া যাচ্ছে না সেটা বাদ দাও, আন্দাজে লিখবে না। সই ও স্ট্যাম্প বাদ দাও।';
function pdate(s){ var d=READER.dates(String(s||'')); return d.length?d[0].iso:''; }
function kindWord(s){ s=String(s||'').toLowerCase();
  if(/join|যোগ|appoint/.test(s)) return 'join'; if(/ropa|fix|revis|ফিক্স/.test(s)) return 'fix';
  if(/10|cas|benefit|সুবিধা/.test(s)) return 'benefit'; if(/incr|ইনক্রি/.test(s)) return 'inc'; return /other|অন্য/.test(s)?'payrow':'inc'; }
// ---------- free-style Gemini text: understand any layout ----------
function bnDigits(s){ return String(s||'').replace(/[০-৯]/g,function(c){ return String('০১২৩৪৫৬৭৮৯'.indexOf(c)); }); }
function freeLines(t){ var out=[];
  bnDigits(t).replace(/\r/g,'').split('\n').forEach(function(raw){ var L=raw.trim(); if(!L) return;
    if(/^\|?\s*:?-{2,}/.test(L)) return; // table divider
    if(/^\|.*\|$/.test(L)){ var cells=L.replace(/^\||\|$/g,'').split('|').map(function(c){return c.replace(/\*\*/g,'').trim();}).filter(Boolean); L=cells.join(' | '); }
    L=L.replace(/^[\s*\-•>#`]+/,'').replace(/\*\*|__/g,'').replace(/^\d{1,2}[.)]\s+(?=\D)/,'').trim();
    if(L) out.push(L); });
  return out; }
function freePay(L){ // the pay figure on a line, not a memo no., grade pay, scale or date part
  var s=L.replace(/\b(?:memo|no|nos|vide|g\.?\s*o|order|notification|resolution|letter)\.?\s*(?:no\.?)?\s*[:\-]?\s*[A-Za-z0-9()\/\-.]*\d[A-Za-z0-9()\/\-.]*/gi,' ')
         .replace(/\b(?:g\.?\s*p\.?|grade\s*pay)\s*(?:of\s*)?(?:rs\.?|₹)?\s*[:\-]?\s*\d[\d,]*/gi,' ')
         .replace(/\d[\d,]*\s*[-–]\s*\d[\d,]*/g,' ');
  var mp=/(?:\bpay\b|basic|বেতন|rs\.?|₹)[^0-9]{0,15}(\d{1,3}(?:,\d{2,3})+|\d{4,6})/i.exec(s);
  if(mp){ var n=+mp[1].replace(/,/g,''); if(n>=3000 && n<=400000) return n; }
  var am=READER.amounts(s).map(function(a){return a.n;}).filter(function(n){ return n>=3000 && n<=400000; });
  return am.length?Math.max.apply(null,am):0; }
var FR={ recog:/recogni[sz]|\brecog\b|স্বীকৃ|upgrad|salary\s*deficit|deficit\s*scheme|উন্নীত/i,
  release:/\breleas|resign|relieved|utsashree|transferred|পদত্যাগ|বদলি|অব্যাহতি/i,
  memo:/\bmemo|\bvide\b|\bno\.?\s*\S*\d\S*\s*,?\s*(?:dt|dated)|approv|sanction|appointed|appointment|permanent|confirm|verif|certif|lien|নিয়োগ|অনুমোদ|মঞ্জুর|স্থায়ী/i,
  scale:/\b\d{3,5}\s*-\s*\d{2,4}\s*-\s*\d{3,5}\s*-|\bPB\s*-?\s*\d|pay\s*band|grade\s*pay|\bG\.?P\.?\b|\blevel\s*-?\s*\d|scale\s*of\s*pay|বেতনক্রম|বেতন\s*স্কেল/i,
  school:/institution|vidyalaya|vidyapith|vidyapeeth|vidyamandir|vidyaniketan|siksha|high\s*school|h\.?\s*s\.?\s*school|madrasah|\bschool\b|বিদ্যালয়|বিদ্যাপীঠ|বিদ্যামন্দির|শিক্ষা\s*নিকেতন|শিক্ষানিকেতন|মাদ্রাসা/i,
  kindw:/increment|incr\b|ropa|fixation|fixed|revis|10\s*y|ten\s*year|cas\b|career\s*adv|ইনক্রিমেন্ট|বৃদ্ধি|ফিক্স/i };
function infoKey(L){ var m=/^([^:：|]{2,40})\s*[:：|]\s*(.+)$/.exec(L); if(!m) return null; var k=m[1].toLowerCase(), v=m[2].trim();
  if(/father|husband|পিতা|বাবা|স্বামী/.test(k)) return ['father',v];
  if(/birth|d\.?\s*o\.?\s*b|জন্ম/.test(k)) return ['dob',v];
  if(/^(?:full\s*)?name|^নাম|name of (?:the )?(?:employee|teacher)|শিক্ষকের নাম/.test(k)) return ['name',v];
  if(/residence|home\s*address|permanent\s*address|^address|ঠিকানা|বাসস্থান/.test(k)) return ['residence',v];
  if(/height|উচ্চতা/.test(k)) return ['height',v];
  if(/identification|mark|চিহ্ন/.test(k)) return ['idMarks',v];
  if(/qualif|যোগ্যতা/.test(k)) return ['qualEntry',v];
  return null; }
function cleanSchool(L){ return L.split('|').map(function(c){return c.trim();}).filter(function(c){ return c && FR.school.test(c); })[0] || L; }
function parseFree(lines){
  var R={info:{}, pays:[], refs:[], schools:[], notes:[], releases:[], leave:[]}, cur=null, lastDate='';
  function school(date,name,post){ var nm=name.replace(/^\s*(?:school|name of (?:the )?school|institution|বিদ্যালয়|স্কুল|স্কুলের নাম)\s*[:：\-]\s*/i,'').replace(/\b(?:pay|basic|বেতন)\s*(?:rs\.?|₹)?\s*[\d,]+(?:\/-)?/gi,' ').replace(/যোগদান(?:ের তারিখ)?|যোগ দিয়েছেন|তারিখ/g,' ').replace(/\b(?:joined|joining|join|date of joining|appointed|as|at|in|on)\b/gi,' ').replace(/\b\d{1,2}\s*[.\-\/]\s*\d{1,2}\s*[.\-\/]\s*\d{2,4}\b/g,' ').replace(/\b(?:assistant|asstt?\.?)\s*teacher|head\s*master|headmistress|teacher/gi,' ').replace(/[|:]+/g,' ').replace(/\s{2,}/g,' ').replace(/\s*[,\-–—]\s*(?=,|$)/g,'').replace(/\s*[—–]\s*/g,', ').replace(/^[\s,.\-–—]+|[\s,\-–—]+$/g,'');
    var key=nm.toLowerCase().replace(/[^a-zঀ-৿]/g,'').slice(0,18);
    var ex=R.schools.filter(function(s){ return s._k===key || (date && s.date===date); })[0];
    if(ex){ if(date && !ex.date) ex.date=date; if(nm.length>ex.school.length) ex.school=nm.replace(/\s*,\s*/g,',\n'); cur=ex; return ex; }
    cur={date:date||'', post:post||'Assistant Teacher', school:nm.replace(/\s*,\s*/g,',\n'), scale:'', recog:[], _k:key}; R.schools.push(cur); return cur; }
  var prev='';
  lines.forEach(function(L){
    var was=prev; prev='';
    if(cur && was==='school' && /^\s*(?:P\.?\s*O\.?|P\.?\s*S\.?|Dist|Vill|Pin|Block|Sub[-\s]?div|ডাক|জেলা|গ্রাম|থানা)\b/i.test(L)){ cur.school+=',\n'+L.replace(/\s*,\s*/g,',\n'); prev='school'; return; }
    if(cur && was==='scale' && /^\s*(?:as per|vide|\(|G\.?\s*O)/i.test(L) && !READER.dates(L).some(function(x){return x.iso>='2009-01-01';})){ cur.scale+='\n'+L; prev='scale'; return; }
    var ds=READER.dates(L), d0=ds.length?ds[0].iso:'';
    var ik=infoKey(L);
    if(ik && !(ik[0]==='name' && FR.school.test(ik[1]))){ var v=ik[1];
      if(ik[0]==='dob'){ var dd=READER.dates(v); if(dd.length && !R.info.dob) R.info.dob=dd[0].iso; return; }
      if(!R.info[ik[0]]) R.info[ik[0]]=v; return; }
    if(/^(?:recognition|স্বীকৃতি)\s*[:：]?\s*$/i.test(L)) return;
    if(FR.recog.test(L) && !FR.kindw.test(L)){ if(!cur) cur=school('', '', ''); cur.recog.push(L.replace(/^(?:recognition|স্বীকৃতি)\s*[:：\-]\s*/i,'')); return; }
    if(/\b(?:m\.?\s*l\.?|medical\s*leave|half\s*pay|h\.?\s*a\.?\s*p\.?|h\.?\s*p\.?\s*l\.?)\b|মেডিক্যাল|অর্ধ\s*বেতন|হাফ/i.test(L) && !FR.kindw.test(L) && d0){
      var ml=/(?:m\.?\s*l\.?|medical(?:\s*leave)?|মেডিক্যাল(?:\s*ছুটি)?)\D{0,12}(\d{1,3})/i.exec(L), hp=/(?:half\s*pay(?:\s*leave)?|h\.?\s*a\.?\s*p\.?|h\.?\s*p\.?\s*l\.?|হাফ[^\d]{0,10}|অর্ধ\s*বেতন[^\d]{0,10})\D{0,12}(\d{1,3})/i.exec(L);
      var mN=ml?+ml[1]:0, hN=hp?+hp[1]:0; if(mN||hN){ R.leave.push({from:d0, mlTaken:mN, hapTaken:hN}); return; } }
    if(FR.release.test(L) && d0 && !FR.kindw.test(L)){ R.releases.push({date:d0, reason:L.replace(/\b\d{1,2}\s*[.\-\/]\s*\d{1,2}\s*[.\-\/]\s*\d{2,4}\b/g,' ').replace(/\s{2,}/g,' ').replace(/^[\s|:,\-–]+/,'').replace(/[\s,|]*(?:w\.?\s*e\.?\s*f\.?|on|from|dated|dt\.?)?[\s,.|]*$/i,'').trim()||'Released'}); return; }
    var pay=freePay(L);
    if(/liability|loan and advance|non-recovery/i.test(L)) return; // part of the certificate the app writes itself
    var isSchool=FR.school.test(L) && !/^\s*(?:he|she|his|her|the school|school came)\b/i.test(L) && !/\bschools\b|district inspector|D\.?\s*I\.?\s*of/i.test(L) && !FR.memo.test(L.replace(/appointed|appointment/ig,''));
    if(isSchool){ var post=(/head\s*master|headmistress|প্রধান শিক্ষক/i.exec(L)||[])[0]?'Headmaster':(/assistant|asstt|সহকারী/i.test(L)?'Assistant Teacher':'');
      var sc=school(d0, cleanSchool(L), post);
      if(FR.scale.test(L) && !sc.scale){ var mS=/(?:PB|pay\s*band|scale)[^|]*/i.exec(L); if(mS) sc.scale=mS[0].trim(); }
      if(d0 && pay) R.pays.push({date:d0, pay:pay, kind:'join', school:sc.school, line:L});
      if(d0) lastDate=d0; prev='school'; return; }
    if(FR.scale.test(L) && !(d0 && pay && FR.kindw.test(L))){ if(!cur) cur=school('', '', ''); if(!cur.scale){ cur.scale=L.replace(/^(?:scale(?:\s*of\s*pay)?|বেতনক্রম)\s*[:：\-]\s*/i,''); prev='scale'; } if(!d0||!pay) return; }
    if(FR.memo.test(L) && !(d0 && pay && FR.kindw.test(L))){
      var nd=d0||(cur&&cur.date)||lastDate;
      R.notes.push({date:nd, text:L.replace(/^(?:note|নোট|remarks?)\s*[:：\-]\s*/i,'')});
      if(/\b(?:memo|g\.?\s*o|no)\b/i.test(L)) R.refs.push({kind:'ref', text:L}); return; }
    if(d0 && pay){ var k=READER.parse; var kw=L.toLowerCase(), kd='inc';
      if(/ropa|fixation|fixed|revis|ফিক্স/.test(kw)) kd='fix'; else if(/10\s*y|ten\s*year|cas\b|career\s*adv|benefit/.test(kw)) kd='benefit'; else if(/join|appoint|যোগ/.test(kw)) kd='join';
      if(kd==='join' && cur && !cur.date) cur.date=d0;
      R.pays.push({date:d0, pay:pay, kind:kd, school:kd==='join'&&cur?cur.school:'', line:L}); lastDate=d0; return; }
    if(d0) lastDate=d0;
  });
  R.schools.forEach(function(s){ delete s._k; });
  return R; }
window.__parseFree=function(t){ return parseFree(freeLines(t)); };
// a memo/approval line -> the matching boxes of the joining dialog
function memoParts(L){ L=bnDigits(L);
  var no=/(?:memo|resolution|res\.|order|letter|\bno)\.?\s*(?:no\.?)?\s*[:\-]?\s*([A-Za-z0-9()\/\-.&]*\d[A-Za-z0-9()\/\-.&]*)/i.exec(L);
  var dt=/(?:\bdt|dated|date[d]?|তারিখ)\.?\s*[:\-]?\s*(\d{1,2}\s*[.\-\/]\s*\d{1,2}\s*[.\-\/]\s*\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+,?\s+\d{4})/i.exec(L);
  var wef=/w\.?\s*e\.?\s*f\.?\s*[:\-]?\s*(\d{1,2}\s*[.\-\/]\s*\d{1,2}\s*[.\-\/]\s*\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+,?\s+\d{4})/i.exec(L);
  var by=/\bby\s+(?:the\s+)?(.+?)(?=\s+(?:vide|memo|under|w\.?e\.?f|on|dt|dated|no\.?)\b|[;]|$)/i.exec(L);
  var ds=READER.dates(L);
  return {no:no?no[1].replace(/[.,]+$/,''):'', date:dt?pdate(dt[1]):(ds.length?ds[ds.length-1].iso:''), wef:wef?pdate(wef[1]):'', by:by?by[1].replace(/[\s,.]+$/,''):''}; }
function noteToJoin(L){ var m=memoParts(L), f={};
  if(/resolution|managing\s*committee|\bM\.\s*C\.|\bMC\b/i.test(L) && !/recommend|approv/i.test(L)){ f.mcRes=m.no; f.mcDate=m.date; }
  else if(/recommend|WBRSSC|\bS\.?S\.?C\b|সুপারিশ|school service commission/i.test(L)){ f.through=/WBRSSC|S\.?S\.?C|commission/i.test(L)?'WBRSSC':(m.by||''); f.apptMemo=m.no; f.apptDate=m.date; }
  else if(/approv|অনুমোদ/i.test(L)){ f.approvedBy=m.by; f.approvalMemo=m.no; f.approvalDate=m.date; f.approvalWef=m.wef; }
  else if(/sanction|মঞ্জুর/i.test(L)){ f.sanction=L.replace(/^(?:note|নোট)\s*[:\-]\s*/i,''); }
  else if(/appoint|নিয়োগ/i.test(L) && !/permanent/i.test(L)){ f.through=m.by; f.apptMemo=m.no; f.apptDate=m.date; }
  else return null;
  Object.keys(f).forEach(function(k){ if(!f[k]) delete f[k]; });
  return Object.keys(f).length?f:null; }
// what a pasted note really is, so it goes to the right page and column
function noteKind(t){ var L=String(t||'');
  var hdr=(L.match(/period of duty|institution|average pay|leave at credit|remarks|name of post|scale of pay|whether post|nature of appointment|date of termination|signature|half avg|detention/gi)||[]).length;
  if(hdr>=2) return 'skip'; // a copied table heading
  if(/date of birth by christian era|^\s*\d+\s*\.?\s*\|/i.test(L)) return 'skip'; // particulars page
  if(/leave\s*account\s*verified/i.test(L)) return 'skip'; // leave page writes this itself
  if(/no liability|loan and advance|non-recovery/i.test(L) && !/verif|certif/i.test(L)) return 'skip'; // part of the certificate the app writes
  if(/verif|certified that|certificate of/i.test(L)) return 'verify';
  if(/permanent/i.test(L) && /post|service|retain|confirm|appoint/i.test(L)) return 'status';
  if(noteToJoin(L)) return 'join';
  return 'note'; }
function stripSign(t){ return String(t||'').replace(/\s*[`'"]?\s*\[[^\]]*(?:স্বাক্ষর|sign|headmaster|head master|counter|inspector)[^\]]*\]\s*[`'".]*/gi,' ').replace(/\(?পাতা\s*\d+\)?/g,'').replace(/^\s*(?:verification|certificate of verification)\s*[:\-]\s*/i,'').replace(/\s{2,}/g,' ').trim(); }
function verifyEvent(t, fallbackDate){ var L=bnDigits(t), m=/from\s+(\d{1,2}\s*[.\-\/]\s*\d{1,2}\s*[.\-\/]\s*\d{2,4})\s*(?:to|till|upto)\s+(\d{1,2}\s*[.\-\/]\s*\d{1,2}\s*[.\-\/]\s*\d{2,4})/i.exec(L);
  var from=m?pdate(m[1]):'', to=m?pdate(m[2]):'';
  var sg=/\[[^\]]*?(\d{1,2}\s*[.\-\/]\s*\d{1,2}\s*[.\-\/]\s*\d{2,4})[^\]]*\]/.exec(L), sd=sg?pdate(sg[1]):'';
  var cert=/certified that|certificate of|counter\s*sign|continuous/i.test(L);
  var di=/(district inspector[^,;\]]*|D\.?\s*I\.?\s*(?:\/\s*S|of schools)[^,;\]]*)/i.exec(L);
  var e={type:'verify', style:cert?'cert':'stamp', from:from, to:to, date:(cert?to:(to||sd))||sd||fallbackDate};
  if(cert){ if(di) e.di=di[1].replace(/counter\s*signed\s*:?/i,'').trim(); } else e.text=stripSign(t);
  return e; }
function parsePasted(txt){
  var R={info:{}, pays:[], refs:[], scanned:[], conf:null, ai:true, pasted:true, leave:[], text:txt};
  var t=String(txt||'').replace(/\r/g,'');
  // JSON (if Gemini answered in JSON)
  var mj=/\{[\s\S]*\}/.exec(t), j=null; if(mj){ try{ j=JSON.parse(mj[0]); }catch(e){} }
  if(j && (j.rows||j.info)){
    var inf=j.info||{}; ['name','dob','father','residence','height','idMarks','qualEntry','qualLater'].forEach(function(k){ if(inf[k]) R.info[k]=k==='dob'?(pdate(inf[k])||(/^\d{4}-\d{2}-\d{2}$/.test(inf[k])?inf[k]:'')):String(inf[k]); });
    if(!R.info.dob) delete R.info.dob;
    (j.rows||[]).forEach(function(r){ var d=/^\d{4}-\d{2}-\d{2}$/.test(r.date||'')?r.date:pdate(r.date); var p=+String(r.pay||'').replace(/[^0-9.]/g,''); if(d&&p) R.pays.push({date:d,pay:Math.round(p),kind:kindWord(r.kind),school:r.school||'',line:(r.text||'')+(r.school?' — '+r.school:'')}); });
    (j.leave||[]).forEach(function(l){ var d=/^\d{4}-\d{2}-\d{2}$/.test(l.from||'')?l.from:pdate(l.from); if(d&&(+l.mlTaken||+l.hapTaken)) R.leave.push({from:d,mlTaken:+l.mlTaken||0,hapTaken:+l.hapTaken||0}); });
    (j.refs||[]).forEach(function(x){ if(typeof x==='string'&&x.trim()) R.refs.push({kind:'ref',text:x.trim()}); });
  } else {
    var rest=[];
    t.split('\n').forEach(function(line){ var L=line.replace(/^[\s*\-•>#`]+/,'').replace(/\*\*/g,'').trim(); if(!L) return;
      var m=/^(NAME|DOB|FATHER|RESIDENCE|HEIGHT|MARK|QUAL|ROW|LEAVE|REF|SCHOOL|RECOG|NOTE|RELEASE)\s*[:：\-]\s*(.*)$/i.exec(L); if(!m || (/^(ROW|LEAVE|SCHOOL|RELEASE)$/i.test(m[1]) && m[2].indexOf('|')<0)){ rest.push(line); return; } var k=m[1].toUpperCase(), v=m[2].trim(); if(!v) return;
      if(k==='RESIDENCE'){ R.info.residence=v; return; }
      if(k==='SCHOOL'){ var s=v.split('|').map(function(x){return x.trim();}); var sd=pdate(s[0]); R.schools=R.schools||[]; R.schools.push({date:sd, post:s[1]||'', school:(s[2]||'').replace(/\s*,\s*/g,',\n').replace(/,\n(?=[^\n]*$)/,',\n'), scale:s[3]||'', recog:[]}); return; }
      if(k==='RECOG'){ R.schools=R.schools||[]; if(!R.schools.length) R.schools.push({date:'',post:'',school:'',scale:'',recog:[]}); R.schools[R.schools.length-1].recog.push(v); return; }
      if(k==='NOTE'){ var nn=v.split('|'); var nd=pdate(nn[0]); var nt=(nd?nn.slice(1):nn).join('|').trim(); if(nt && FR.recog.test(nt) && !FR.kindw.test(nt)){ R.schools=R.schools||[]; if(!R.schools.length) R.schools.push({date:'',post:'',school:'',scale:'',recog:[]}); R.schools[R.schools.length-1].recog.push(v.replace(/\s*\|\s*/g,' ')); return; } if(nt){ R.notes=R.notes||[]; R.notes.push({date:nd, text:nt}); } return; }
      if(k==='RELEASE'){ var rr=v.split('|').map(function(x){return x.trim();}); var rd=pdate(rr[0]); if(rd){ R.releases=R.releases||[]; R.releases.push({date:rd, reason:rr.slice(1).join(' | ')||'Released'}); } return; }
      if(k==='NAME') R.info.name=v; else if(k==='FATHER') R.info.father=v; else if(k==='HEIGHT') R.info.height=v; else if(k==='MARK') R.info.idMarks=v; else if(k==='QUAL') R.info.qualEntry=v;
      else if(k==='DOB'){ var d=pdate(v); if(d) R.info.dob=d; }
      else if(k==='REF') R.refs.push({kind:'ref',text:v});
      else if(k==='ROW'){ var c=v.split('|').map(function(x){return x.trim();}); var d2=pdate(c[0]); var p=+String(c[1]||'').replace(/[^0-9.]/g,''); if(d2&&p) R.pays.push({date:d2,pay:Math.round(p),kind:kindWord(c[2]),school:kindWord(c[2])==='join'?(c[3]||''):'',line:(c[2]||'')+(c[3]?' — '+c[3]:'')}); }
      else if(k==='LEAVE'){ var c2=v.split('|').map(function(x){return x.trim();}); var d3=pdate(c2[0]); var ml=+String(c2[1]||'').replace(/[^0-9]/g,'')||0, hp=+String(c2[2]||'').replace(/[^0-9]/g,'')||0; if(d3&&(ml||hp)) R.leave.push({from:d3,mlTaken:ml,hapTaken:hp}); }
    });
    if(rest.length){ // anything not in the strict format: understand it line by line
      var F=parseFree(freeLines(rest.join('\n')));
      Object.keys(F.info).forEach(function(k){ if(!R.info[k]) R.info[k]=F.info[k]; });
      F.pays.forEach(function(p){ if(!R.pays.some(function(q){ return q.date===p.date; })) R.pays.push(p); });
      ['refs','leave'].forEach(function(k){ R[k]=R[k].concat(F[k]); });
      ['schools','notes','releases'].forEach(function(k){ if(F[k].length) R[k]=(R[k]||[]).concat(F[k]); });
      if(!R.pays.length){ var items=rest.map(function(s,i){ return {t:bnDigits(s), x:0, y:i*20, w:100, h:10, page:1}; });
        var G=READER.parse({pages:[{page:1,items:items}],scanned:[]}); R.pays=G.pays; if(!R.refs.length) R.refs=G.refs; } }
  }
  var seen={}; R.pays=R.pays.filter(function(p){ var k=p.date+'|'+p.pay; if(seen[k]) return false; seen[k]=1; return true; }).sort(function(a,b){return a.date.localeCompare(b.date);});
  return R;
}
window.__parsePasted=parsePasted;
function pasteDialog(){
  var d=$('#dlg'); d.innerHTML='<div class="dlgbox"><div class="dlgh"><b>Gemini থেকে পেস্ট করুন</b><button class="ib" data-act="closeD">✕</button></div><div class="dlgb">'+
   '<ol class="sm"><li>নিচের <b>নির্দেশ কপি করুন</b> চাপুন।</li><li>ফোনের <b>Gemini</b> অ্যাপ খুলে সার্ভিস বুকের পাতার ছবি দিন (একসঙ্গে কয়েকটা দেওয়া যায়), তারপর কপি করা নির্দেশটা পেস্ট করে পাঠান।</li>'+
   '<li>Gemini উত্তর লিখলে তার নিচের <b>কপি</b> চিহ্ন চাপুন।</li><li>এখানে নিচের ঘরে পেস্ট করে <b>পড়ো</b> চাপুন। বাকি পাতাগুলোর জন্য আবার একইভাবে করবেন।</li></ol>'+
   '<button class="btn sm2" id="cpPrompt">📋 নির্দেশ কপি করুন</button>'+
   '<details><summary>নির্দেশটা দেখুন (কপি না হলে এখান থেকে লম্বা চেপে কপি করুন)</summary><textarea readonly rows="8" style="width:100%;font-size:12px">'+esc(PASTE_PROMPT)+'</textarea></details>'+
   '<label class="f form"><span>Gemini-র উত্তর এখানে পেস্ট করুন</span><textarea id="pasteIn" rows="9" placeholder="NAME: …&#10;DOB: …&#10;ROW: …"></textarea></label></div>'+
   '<div class="dlgf"><button class="btn" data-act="closeD">বাতিল</button><button class="btn pri" id="pasteGo">পড়ো</button></div></div>';
  d.classList.add('on');
  $('#cpPrompt').onclick=function(){ try{ navigator.clipboard.writeText(PASTE_PROMPT).then(function(){ toast('নির্দেশ কপি হয়েছে — এবার Gemini-তে পেস্ট করুন'); },function(){ toast('কপি হয়নি — নিচের “নির্দেশটা দেখুন” থেকে কপি করুন'); }); }catch(e){ toast('কপি হয়নি — নিচের “নির্দেশটা দেখুন” থেকে কপি করুন'); } };
  $('#pasteGo').onclick=function(){ var v=$('#pasteIn').value; if(!v.trim()){ toast('আগে Gemini-র উত্তর পেস্ট করুন'); return; } IMP={R:parsePasted(v)}; drawTeacherImport(); };
}

// ---------- simple pages: স্কুল (slots) and বেতনের সারি (table) ----------
var ORD_BN=['প্রথম','দ্বিতীয়','তৃতীয়','চতুর্থ','পঞ্চম','ষষ্ঠ','সপ্তম','অষ্টম','নবম','দশম'];
function schoolSlots(T){
  var evs=SB.sortEvents(T.events||[]), joins=evs.filter(function(e){return e.type==='join';});
  var slots=joins.map(function(j,ix){ var nextJ=joins[ix+1];
    var rel=evs.filter(function(e){ return (e.type==='release'||e.type==='resign') && e.date>=j.date && (!nextJ || e.date<nextJ.date); })[0];
    return {join:j, rel:rel}; });
  var n=Math.max(5,(T.extraSlots||0)+slots.length); while(slots.length<n) slots.push({join:null, rel:null});
  return slots;
}
function sfld(i,lbl,key,val,type,opts,hint){
  var a=' data-sk="'+key+'" data-si="'+i+'"';
  var inp= type==='textarea'?'<textarea'+a+' rows="3">'+esc(val||'')+'</textarea>'
    : type==='select'?'<select'+a+'>'+opts.map(function(o){ return '<option value="'+esc(o[0])+'"'+(String(val||'')===String(o[0])?' selected':'')+'>'+esc(o[1])+'</option>'; }).join('')+'</select>'
    : '<input'+a+' type="'+(type||'text')+'" value="'+esc(val||'')+'"'+(type==='number'?' inputmode="numeric"':'')+'>';
  return '<label class="f"><span>'+lbl+'</span>'+inp+(hint?'<small>'+hint+'</small>':'')+'</label>';
}
function schoolsView(T){
  var slots=schoolSlots(T), H=SB.fullHistory(T,A.S).H;
  var h='<div class="muted sm">প্রতিটা স্কুলের ঘর পূরণ করুন। যে স্কুলে এখনও আছেন, তার “ছাড়ার তারিখ” খালি রাখুন। লিখতে লিখতেই সেভ হয়ে যায়। ইনক্রিমেন্টগুলো পরে “✍ আজ পর্যন্ত লিখে দাও” বা “💰 বেতনের সারি” থেকে বসবে।</div>';
  slots.forEach(function(s,i){ var j=s.join||{}, r=s.rel||{};
    var title=(ORD_BN[i]||((i+1)+'তম'))+' স্কুল', sub=j.date?(SB.fmt(j.date,A.S.dateFmt)+' থেকে '+(r.date?SB.fmt(r.date,A.S.dateFmt):'এখনও চলছে')):'এখনও লেখা হয়নি';
    var relKind=r.type==='resign'?'resign':(r.date?'release':'');
    h+='<details class="card scard"'+(i===0||j.date?' open':'')+'><summary><b>'+title+'</b> <span class="muted sm">— '+esc(j.school?j.school.split('\n')[0]:'')+' ('+sub+')</span></summary><div class="form">'+
      sfld(i,'স্কুলের নাম ও পুরো ঠিকানা','school',j.school==='(স্কুলের নাম ও ঠিকানা লিখুন)'?'':j.school,'textarea')+
      '<div class="g2">'+sfld(i,'পদ','post',j.post||'Assistant Teacher')+sfld(i,'যোগদানের তারিখ','date',j.date,'date')+'</div>'+
      '<div class="g2">'+sfld(i,'যোগদানের বেতন','pay',j.pay,'number',null,i>0?'খালি রাখলে আগের স্কুলের শেষ বেতন বসবে':'')+sfld(i,'বেতনের হিসাব কোন নিয়মে','sys',j.sys||(i>0?'':'2009'),'select',(i>0?[['','আগের স্কুলের মতোই (সাধারণত এটাই)']]:[]).concat([['2009','ROPA 2009 (3%, 10-এ রাউন্ড)'],['manual','নিজে বসাব (পুরনো স্কেল)']]).concat(levelOpts()))+'</div>'+
      sfld(i,'বেতনক্রম (কলম 2)','scale',j.scale,'textarea',null,'যেমন PB-4 (Rs. 9000-40500) + GP Rs. 4800 — গ্রেড পে লিখলে অ্যাপ ROPA-2019-এর লেভেল নিজে বুঝবে')+
      '<div class="g2">'+sfld(i,'পদ (কলম 3)','postStatus',j.postStatus||'Temporary','select',[['Temporary','Temporary'],['Permanent','Permanent']])+sfld(i,'নিয়োগ (কলম 4)','apptStatus',j.apptStatus||'Temporary','select',[['Temporary','Temporary'],['Permanent','Permanent'],['Officiating','Officiating']])+'</div>'+
      sfld(i,'স্কুলের স্বীকৃতির ইতিহাস','recog',j.recog,'textarea',null,'প্রতি লাইনে একটা — কলম 1-এর নিচে বসবে')+
      sfld(i,'নিয়োগ, অনুমোদন, মেমো নম্বর ইত্যাদির বিবরণ','extra',j.extra,'textarea',null,'প্রতি লাইনে একটা — কলম 3–7-এ নম্বর দিয়ে বসবে')+
      '<div class="g2">'+sfld(i,'ছাড়ার তারিখ (এখনও থাকলে খালি)','relDate',r.date,'date')+sfld(i,'কেন ছাড়লেন','relKind',relKind,'select',[['','—'],['release','বদলি / রিলিজ'],['resign','পদত্যাগ (Resignation)']])+'</div>'+
      sfld(i,'ছাড়ার কারণ যেমন বইয়ে লিখবেন','relReason',r.reason,'text',null,"যেমন Transferred through 'Utsashree'")+
      '</div></details>'; });
  h+='<button class="btn" data-act="addSlot">+ আরও একটা স্কুল</button>';
  return h;
}
function sysAt(T,date){ var T2={events:(T.events||[]).filter(function(e){ return e.date<date; })}; if(!T2.events.length) return null;
  var st=SB.computeHistory(T2,A.S).state; return st.sys==='matrix'?st.level:(st.sys==='2009'?'2009':(st.sys==='manual'?'manual':null)); }
function levelFromText(txt,comm){ var m=/(?:GP|G\.P\.|Grade\s*Pay)[^0-9]{0,15}(\d{4})/i.exec(txt||''); if(!m) return null;
  var L=A.S.levels.filter(function(l){ return (!comm||l.commission===comm) && new RegExp('\\b'+m[1]+'\\b').test(l.pre||''); }); return L[0]?L[0].id:null; }
function slotUpdate(i,key,val){
  var T=A.T[A.tid]; T.events=T.events||[]; var s=schoolSlots(T)[i]; var j=s.join;
  if(!j){ if(key!=='date' || !val){ (T._draft=T._draft||{})[i]=Object.assign((T._draft||{})[i]||{}, (function(o){o[key]=val;return o;})({})); return; }
    var sys0=sysAt(T,val); j={id:uid(), seq:Date.now(), type:'join', date:val, post:'Assistant Teacher', sys:sys0?'':(val>='2016-01-01'?((A.S.levels[0]||{}).id||'2009'):(val>='2006-01-01'?'2009':'manual')), postStatus:sys0?'Permanent':'Temporary', apptStatus:sys0?'Permanent':'Temporary'};
    var dr=(T._draft||{})[i]||{}; Object.keys(dr).forEach(function(k){ if(['relDate','relKind','relReason'].indexOf(k)<0) j[k]=dr[k]; }); if(T._draft) delete T._draft[i];
    T.events.push(j); scheduleSave('T',A.tid); return 'rerender'; }
  if(['relDate','relKind','relReason'].indexOf(key)>=0){
    var r=s.rel; var rd=key==='relDate'?val:(r&&r.date)||'', rk=key==='relKind'?val:(r?(r.type==='resign'?'resign':'release'):''), rr=key==='relReason'?val:(r&&r.reason)||'';
    if(!rd){ if(r) T.events=T.events.filter(function(e){return e.id!==r.id;}); scheduleSave('T',A.tid); return 'rerender'; }
    if(!r){ r={id:uid(), seq:Date.now(), type:rk==='resign'?'resign':'release', date:rd}; T.events.push(r); }
    r.type=rk==='resign'?'resign':'release'; r.date=rd; if(rr) r.reason=rr; else delete r.reason;
    scheduleSave('T',A.tid); return key==='relDate'?'rerender':''; }
  if(key==='pay' && !val) delete j.pay; else j[key]=val;
  scheduleSave('T',A.tid); return key==='date'?'rerender':'';
}
var PAYKINDS=[['inc','ইনক্রিমেন্ট'],['benefit','১০ বছর/CAS'],['payrow','অন্য সারি'],['fix','পে-রিভিশন'],['fix2009','ROPA-2009 ফিক্সেশন'],['join','যোগদান']];
function payTableView(T){
  var FH=SB.fullHistory(T,A.S), H=FH.H, rowsBy={}; H.rows.forEach(function(r){ if(r.kind==='pay') rowsBy[r.ev]=r; });
  var evs=SB.sortEvents(T.events||[]).filter(function(e){ return SB.PAYTYPES[e.type]; });
  var h='<div class="muted sm">প্রতিটা সারিতে তারিখ আর বইয়ে লেখা বেতন দিন। বেতন খালি রাখলে অ্যাপ নিজে হিসাব করবে। হিসাবের সঙ্গে না মিললে লাল দেখাবে। যোগদান আর পে-রিভিশন বদলাতে “🏫 স্কুল” বা “চাকরির ঘটনা” ব্যবহার করুন।</div>';
  h+='<div class="row gap wrap"><button class="btn pri" data-act="autoFill">✍ আজ পর্যন্ত সব নিজে বসাও</button><button class="btn" data-act="addPayRow">+ নতুন সারি</button></div><div class="muted sm">“আজ পর্যন্ত সব নিজে বসাও” প্রতি বছরের ১ জুলাইয়ের ইনক্রিমেন্ট আর ROPA-2019 ফিক্সেশন বসিয়ে দেয়।</div>';
  h+='<div class="tw"><table class="dat ptab"><thead><tr><th>তারিখ</th><th>ধরন</th><th>বইয়ে বেতন</th><th>হিসাবে</th><th>ছুটির কলম (9)</th><th></th></tr></thead><tbody>';
  evs.forEach(function(e){ var r=rowsBy[e.id]||{}, locked=(e.type==='join'||e.type==='fix'||e.type==='fix2009');
    var exp=e._exp!=null?SB.money(e._exp):'—', bad=e._flag?' class="bad"':'';
    h+='<tr'+bad+'><td>'+(locked?esc(SB.fmt(e.date,A.S.dateFmt)):'<input type="date" data-pe="'+e.id+'" data-pf="date" value="'+esc(e.date)+'">')+'</td>'+
      '<td>'+(locked?esc((PAYKINDS.filter(function(k){return k[0]===e.type;})[0]||['',''])[1]):'<select data-pe="'+e.id+'" data-pf="type">'+PAYKINDS.slice(0,3).map(function(k){ return '<option value="'+k[0]+'"'+(k[0]===e.type?' selected':'')+'>'+k[1]+'</option>'; }).join('')+'</select>')+'</td>'+
      '<td>'+(locked&&e.type==='join'?esc(r.c6||''):'<input data-pe="'+e.id+'" data-pf="pay" inputmode="numeric" placeholder="নিজে" value="'+esc(e.pay||'')+'">')+'</td>'+
      '<td>'+exp+(e._flag?'<br><small>⚠ মিলছে না</small>':'')+'</td>'+
      '<td>'+(locked?'':'<input data-pe="'+e.id+'" data-pf="leaveText" placeholder="'+esc(A.S.leaveTextDefault)+'" value="'+esc(e.leaveText||'')+'">')+'</td>'+
      '<td>'+(locked?'<button class="btn sm2" data-act="editE" data-id="'+e.id+'">বদলান</button>':'<button class="btn sm2 danger" data-act="delE" data-id="'+e.id+'">✕</button>')+'</td></tr>'; });
  h+='</tbody></table></div>';
  if(!evs.length) h+='<div class="empty">আগে “🏫 স্কুল”-এ প্রথম স্কুল আর যোগদানের তারিখ লিখুন।</div>';
  return h;
}

var st=document.createElement('style'); st.textContent=BOOK.CSS; document.head.appendChild(st);
init();
})();
