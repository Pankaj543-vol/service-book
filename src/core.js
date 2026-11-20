// ===== Service Book core logic (pure, no DOM) =====
var SB = (function(){
'use strict';

// ---------- dates ----------
function pd(s){ if(!s) return null; var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if(!m) return null; return Date.UTC(+m[1],+m[2]-1,+m[3]); }
function ds(t){ var d=new Date(t); return d.getUTCFullYear()+'-'+p2(d.getUTCMonth()+1)+'-'+p2(d.getUTCDate()); }
function p2(n){ return (n<10?'0':'')+n; }
function addDays(s,n){ return ds(pd(s)+n*86400000); }
function addYears(s,n){ var t=new Date(pd(s)); return ds(Date.UTC(t.getUTCFullYear()+n,t.getUTCMonth(),t.getUTCDate())); }
function addMonths(s,n){ var t=new Date(pd(s)); var y=t.getUTCFullYear(), m=t.getUTCMonth()+n, d=t.getUTCDate();
  var last=new Date(Date.UTC(y,m+1,0)).getUTCDate(); return ds(Date.UTC(y,m,Math.min(d,last))); }
function daysBetween(a,b){ return Math.round((pd(b)-pd(a))/86400000)+1; } // inclusive
function fmt(s,f){ if(!s) return ''; var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if(!m) return s;
  var y=m[1], mo=m[2], d=m[3];
  switch(f){ case 'dd.mm.yyyy': return d+'.'+mo+'.'+y; case 'dd-mm-yy': return d+'-'+mo+'-'+y.slice(2);
    case 'dd/mm/yyyy': return d+'/'+mo+'/'+y; case 'dd.mm.yy': return d+'.'+mo+'.'+y.slice(2); default: return d+'-'+mo+'-'+y; } }
function todayStr(){ var d=new Date(); return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate()); }

// ---------- words ----------
var ONES=['','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
var TENS=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
var ORD={one:'first',two:'second',three:'third',five:'fifth',eight:'eighth',nine:'ninth',twelve:'twelfth'};
function w99(n){ if(n<20) return ONES[n]; return TENS[Math.floor(n/10)]+(n%10?' '+ONES[n%10]:''); }
function words(n){ if(n===0) return 'zero'; var out=[];
  if(n>=1000){ out.push(w99(Math.floor(n/1000))+' thousand'); n%=1000; }
  if(n>=100){ out.push(ONES[Math.floor(n/100)]+' hundred'); n%=100; }
  if(n>0) out.push(w99(n)); return out.join(' '); }
function ordinalWords(n){ var w=w99(n), parts=w.split(' '), last=parts.pop();
  var o=ORD[last] || (/y$/.test(last)? last.slice(0,-1)+'ieth' : last+'th'); parts.push(o); return parts.join(' '); }
function ordSuffix(n){ var j=n%10,k=n%100; if(j==1&&k!=11) return 'st'; if(j==2&&k!=12) return 'nd'; if(j==3&&k!=13) return 'rd'; return 'th'; }
var MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
function dobLine(s,src){ if(!s) return ''; var t=new Date(pd(s)), d=t.getUTCDate(), m=t.getUTCMonth(), y=t.getUTCFullYear();
  var a=d+ordSuffix(d)+' '+MONTHS[m]+' '+y;
  var b='(The '+ordinalWords(d)+' '+MONTHS[m]+' '+words(y)+(src?' as per certificate issued by '+src:'')+')';
  return a+'\n'+b; }
function superannuation(dob,age){ if(!dob) return ''; var t=new Date(pd(dob)); var y=t.getUTCFullYear()+(age||60), m=t.getUTCMonth(), d=t.getUTCDate();
  if(d===1) m=m-1; return ds(Date.UTC(y,m+1,0)); }
function money(n){ if(n==null||n==='') return ''; n=Math.round(+n); var s=String(n);
  if(s.length<=3) return s+'/-'; var last=s.slice(-3), rest=s.slice(0,-3); return rest.replace(/\B(?=(\d{2})+(?!\d))/g,',')+','+last+'/-'; }

// ---------- settings ----------
function genCells(entry,n,pct,rnd){ pct=+pct||3; rnd=+rnd||100; var c=[+entry]; for(var i=1;i<(n||40);i++){ c.push(Math.round(c[i-1]*(1+pct/100)/rnd)*rnd); } return c; }
function defaultDA(){ return [
  {from:'2021-01-01', pct:3, go:'78-F dt. 08.01.2021'},
  {from:'2023-03-01', pct:6, go:'850-F dt. 24.02.2023'},
  {from:'2024-01-01', pct:10, go:'56-F dt. 03.01.2024'},
  {from:'2024-04-01', pct:14, go:'1090-F dt. 01.03.2024'},
  {from:'2025-04-01', pct:18, go:''},
  {from:'2026-10-01', pct:38, go:'2834-F(P2) dt. 04/08/2026'}]; }
// pay + DA periods (separate page; does not touch service book)
function payDaRows(T,S,H){
  var da=(S.da||[]).filter(function(x){return x.from && x.pct!==''&&x.pct!=null;}).slice().sort(function(a,b){return a.from.localeCompare(b.from);});
  if(!da.length) return [];
  var pays=H.rows.filter(function(r){return r.kind==='pay' && r._pay!=null;}).map(function(r){return {d:r._date,p:r._pay};}).sort(function(a,b){return a.d.localeCompare(b.d);});
  if(!pays.length) return [];
  var today=todayStr(), start=da[0].from, posts=H.postings;
  function inService(d){ return posts.some(function(p){ return d>=p.start && (!p.end || d<=p.end); }); }
  function payOn(d){ var v=null; pays.forEach(function(x){ if(x.d<=d) v=x.p; }); return v; }
  function daOn(d){ var v=null; da.forEach(function(x){ if(x.from<=d) v=x; }); return v; }
  var b={}; pays.forEach(function(x){ if(x.d>=start) b[x.d]=1; }); da.forEach(function(x){ b[x.from]=1; });
  posts.forEach(function(p){ if(p.start>=start) b[p.start]=1; if(p.end){ b[addDays(p.end,1)]=1; } });
  var keys=Object.keys(b).filter(function(d){return d>=start && d<=today;}).sort(), out=[];
  keys.forEach(function(d,i){ if(!inService(d)) return; var p=payOn(d), x=daOn(d); if(p==null||!x) return;
    var end=keys[i+1]?addDays(keys[i+1],-1):''; posts.forEach(function(ps){ if(ps.end && d<=ps.end && (!end||ps.end<end)) end=ps.end; });
    var amt=Math.round(p*(+x.pct)/100), last=out[out.length-1];
    var isStart=posts.some(function(ps){return ps.start===d;});
    if(last && last.basic===p && last.pct===+x.pct && last.to && addDays(last.to,1)===d && !isStart){ last.to=end; return; }
    out.push({from:d, to:end, basic:p, pct:+x.pct, da:amt, total:p+amt, go:x.go||''}); });
  return out;
}
function commByName(S,n){ var L=S.commissions||[]; for(var i=0;i<L.length;i++) if(L[i].name===n) return L[i]; return null; }
function defaultCommissions(){ return [
  {name:'ROPA-2009', method:'band', factor:1.86, round:10, incPct:3, incRound:10, date:'2006-01-01', actualFrom:'2009-04-01', go:'G.O. No. 46-SE(B)/5B-1/2009 dt. 27.02.2009', note:'আগের বেসিক × 1.86, পরের ১০ টাকায় রাউন্ড = পে-ব্যান্ডের বেতন, তার সঙ্গে গ্রেড পে। ইনক্রিমেন্ট (ব্যান্ড + গ্রেড পে)-র 3%, ১০-এ রাউন্ড।'},
  {name:'ROPA-2019', method:'matrix', factor:2.57, incPct:3, cellRound:100, date:'2016-01-01', actualFrom:'2020-01-01', go:'G.O. No. 437-SE(P&B)/SL/5S-408/19 dt. 13.12.2019', note:'আগের (ব্যান্ড + গ্রেড পে) × 2.57, লেভেলের সমান বা ঠিক পরের ঘর। ইনক্রিমেন্ট = লেভেলের পরের ঘর।'},
  {name:'7th Pay Commission (WB)', method:'matrix', factor:'', incPct:3, cellRound:100, date:'2026-01-01', actualFrom:'', go:'', note:'২২.০৭.২০২৬-এ গঠিত। গুণক ও পে-ম্যাট্রিক্স এখনও ঘোষণা হয়নি — G.O. বেরোলে পূরণ করুন (PDF থেকে পড়ানো যাবে)। ইনক্রিমেন্ট এখন 3%; বদলালে এখানে বদলান।'}
]; }
function defaultSettings(){
  return {
    schoolName:'', dateFmt:'dd-mm-yyyy',
    incLabel:'Increment', notionalPrefix:'Notional ', leaveTextDefault:'No leave taken other than C.L.',
    r2009:{pct:3, roundTo:10}, commissions:defaultCommissions(), da:defaultDA(),
    inc:{month:7, day:1, minMonths:6},
    leave:{mc:15, hap:15, hapCap:60},
    pages:{part:3, finger:5, hist:8, leave:24}, lines:22,
    levels:[
      {id:'L14', commission:'ROPA-2019', name:'Level 14', pre:'PB-4 (Rs. 9000-40500) + GP Rs. 4700', cells:genCells(39900,33), note:'সরকারি অর্ডারে রেঞ্জ 39900–102800, ঘর মিলেছে'},
      {id:'L15', commission:'ROPA-2019', name:'Level 15', pre:'PB-4 (Rs. 9000-40500) + GP Rs. 4800', cells:genCells(42600,33), note:'সরকারি অর্ডারে রেঞ্জ 42600–109800, ঘর মিলেছে'},
      {id:'L10C', commission:'ROPA-2019', name:'Level 10C', pre:'PB-3 (min. Rs. 11720) + GP Rs. 4220', cells:genCells(42300,31), note:'প্রথম ১২টা ঘর 2830-F(P1) অর্ডারের সঙ্গে মিলেছে'}
    ]
  };
}
function mergeSettings(s){ var d=defaultSettings(); if(!s) return d; for(var k in s){ if(s[k]!==undefined) d[k]=s[k]; }
  if(!d.commissions||!d.commissions.length) d.commissions=defaultCommissions();
  if(!d.da) d.da=defaultDA();
  ['r2009','inc','leave','pages'].forEach(function(k){ var dd=defaultSettings()[k]; d[k]=Object.assign({},dd,(s&&s[k])||{}); }); return d; }
function levelById(S,id){ for(var i=0;i<S.levels.length;i++) if(S.levels[i].id===id) return S.levels[i]; return null; }

// ---------- pronouns ----------
function P(T){ var f=T.sex==='F'; return {He:f?'She':'He', he:f?'she':'he', his:f?'her':'his', His:f?'Her':'His', Sri:f?'Smt.':'Sri'}; }

// ---------- event ordering ----------
var ORDER={join:0, fix2009:1, status:2, fix:3, payrow:4, inc:5, benefit:6, note:7, verify:8, resign:9, release:9};
var PAYTYPES={join:1, inc:1, fix:1, fix2009:1, benefit:1, payrow:1};
function sortEvents(ev){ return ev.slice().sort(function(a,b){ var x=(a.ord||a.date||'').localeCompare(b.ord||b.date||''); if(x) return x;
  var o=(ORDER[a.type]||0)-(ORDER[b.type]||0); if(o) return o; return (a.seq||0)-(b.seq||0); }); }

// ---------- pay chain + history rows ----------
function ceilTo(x,r){ return Math.ceil(x/r - 1e-9)*r; }
function numOrNull(v){ if(v===''||v==null) return null; var n=+String(v).replace(/[^0-9.]/g,''); return isNaN(n)?null:n; }

function computeHistory(T,S,LVM){
  LVM=LVM||{};
  if(S.home) (T.events||[]).forEach(function(e){ if(e.type==='join' && e.home){ if(S.home.school) e.school=S.home.school; if(S.home.recog) e.recog=S.home.recog; } });
  var F=S.dateFmt, pr=P(T), evs=sortEvents(T.events||[]);
  var st={sys:null, pay:null, level:null, idx:-1, post:'Temporary', appt:'Temporary', posting:null, fixes:[]};
  var rows=[], flags=[], payRows=[], postings=[];
  function fd(s){ return fmt(s,F); }
  function lvl(){ return levelById(S,st.level); }
  var curDate=''; st.hist=[];
  function payOn(d){ var v=null; st.hist.forEach(function(h){ if(h.d<=d) v=h.p; }); return v; }
  function setPay(p){ st.pay=p; if(p!=null && curDate) st.hist.push({d:curDate,p:p}); if(st.sys==='matrix'){ var L=lvl(); st.idx=L?L.cells.indexOf(p):-1; } }
  function nextIncr(){ if(st.pay==null) return null;
    if(st.sys==='2009') return st.pay+ceilTo(st.pay*(st.incPct||S.r2009.pct)/100,(st.incRound||S.r2009.roundTo));
    if(st.sys==='matrix'){ var L=lvl(); if(!L) return null; if(st.idx<0){ for(var i=0;i<L.cells.length;i++) if(L.cells[i]>st.pay) return L.cells[i]; return null; } return L.cells[st.idx+1]||null; }
    return null; }
  function notionalFor(date){ for(var i=0;i<st.fixes.length;i++){ var f=st.fixes[i]; if(f.actualFrom && date>=f.date && date<f.actualFrom) return true; } return false; }
  function resolvePay(e,expected,label){ var ov=numOrNull(e.pay); var shown=ov!=null?ov:expected;
    if(ov!=null && expected!=null && ov!==expected){ flags.push({id:e.id, date:e.date, msg:label+': বইয়ে '+ov+', হিসাবে আসে '+expected}); e._flag='হিসাবে আসে '+expected; }
    else e._flag='';
    var base=(ov!=null && e.follow!==false)? ov : (expected!=null?expected:ov);
    return {shown:shown, base:base}; }
  function postText(){ var p=st.posting; return p? (p.post+'\n'+p.school) : ''; }
  function addPayRow(e,shown,c8,c9,extra){ var r={kind:'pay', ev:e.id, c1:'', c2:'', c3:st.post, c4:st.appt, c5:fd(e.showDate||e.date), c6:money(shown), c7:'', c8:c8||'', c9:c9||'', c10:'', c11:'', c12:'',
      _date:e.date, _pay:(shown==null?null:+shown), _end:e.end||'', _isFix:e.type==='fix', posting:st.posting};
    if(extra) for(var k in extra) r[k]=extra[k]; rows.push(r); payRows.push(r); return r; }

  evs.forEach(function(e){
    e._exp=null; curDate=e.ord?'':e.date;
    var lt=e.leaveText!=null&&e.leaveText!==''? e.leaveText : S.leaveTextDefault;
    if(e.type==='join'){
      var prevPay=st.pay;
      var keepSys = st.sys && (!e.sys || (st.sys==='matrix' && (e.sys==='2009'||e.sys==='manual')));
      if(keepSys){ /* নতুন স্কুলে আগের বেতনের নিয়মই চলবে */ }
      else if(e.sys==='2009'){ st.sys='2009'; st.level=null; st.incPct=null; st.incRound=null; }
      else if(e.sys==='manual'){ st.sys='manual'; st.level=null; }
      else if(e.sys){ st.sys='matrix'; st.level=e.sys; }
      st.post=e.postStatus||'Temporary'; st.appt=e.apptStatus||'Temporary';
      var ov=numOrNull(e.pay); var pay=ov!=null?ov:prevPay; e._exp=prevPay;
      if(ov!=null && prevPay!=null && ov!==prevPay){ e._flag='আগের স্কুলের শেষ বেতন '+prevPay; flags.push({id:e.id,date:e.date,msg:'নতুন স্কুলে যোগদান: বইয়ে '+ov+', আগের স্কুলের শেষ বেতন '+prevPay}); } else e._flag='';
      setPay(pay);
      var L=lvl();
      st.posting={id:e.id, post:e.post||'Assistant Teacher', school:e.school||'', start:e.date, end:null};
      postings.push(st.posting);
      var scale=e.scale || (L? (L.name+'\n'+L.pre):'');
      var r=addPayRow(e,pay,e.c8||'',e.c9||'',{c1:postText(), c2:scale});
      var notes=joinNotes(e,T,S,pr);
      if((e.recog&&e.recog.trim()) || notes.length){
        rows.push({kind:'span', ev:e.id, c1:(e.recog||'').trim(), spans:[{from:3,to:7,text:notes.join('\n')}], posting:st.posting});
      }
      if(e.noIncNote) rows.push({kind:'span', ev:e.id, spans:[{from:5,to:7,text:e.noIncNote}]});
    }
    else if(e.type==='inc'){
      var exp=nextIncr(); e._exp=exp; var rp=resolvePay(e,exp,'ইনক্রিমেন্ট '+fd(e.date)); if(rp.base!=null) setPay(rp.base);
      var notional = e.notional==='yes' || (e.notional!=='no' && notionalFor(e.date));
      var c8=e.reason || ((notional?S.notionalPrefix:'')+S.incLabel);
      addPayRow(e,rp.shown,c8,lt);
    }
    else if(e.type==='benefit'){
      var exp2=null;
      if(e.level){ st.sys='matrix'; var oldPay=st.pay; st.level=e.level; var L2=lvl(); if(L2){ for(var i=0;i<L2.cells.length;i++) if(L2.cells[i]>oldPay){ exp2=L2.cells[i]; break; } } }
      else exp2=nextIncr();
      e._exp=exp2; var rp2=resolvePay(e,exp2,'সুবিধা '+fd(e.date)); if(rp2.base!=null) setPay(rp2.base);
      addPayRow(e,rp2.shown,e.reason||('Benefit on completion of 10 years\' service on '+fd(e.date)),lt);
    }
    else if(e.type==='payrow'){
      var rp3=resolvePay(e,st.pay,'সারি '+fd(e.date)); if(rp3.base!=null) setPay(rp3.base);
      addPayRow(e,rp3.shown,e.reason||'',lt);
    }
    else if(e.type==='fix2009'){
      var ov2=numOrNull(e.pay);
      var txt=e.text || ('The incumbent came under ROPA 2009 w.e.f. '+fd(e.wef||'2006-01-01')+' and accordingly '+pr.his+' pay is fixed at Rs. '+(ov2!=null?ov2:'____')+' in the '+(e.scaleText||'PB-4 (Rs. 9000-40500) + GP Rs. 4800')+(e.go?' as per '+e.go:'')+'.');
      rows.push({kind:'span', ev:e.id, spans:[{from:2,to:7,text:txt}], c8:e.c8||'', posting:st.posting});
      if(ov2!=null){ st.sys='2009'; st.level=null; setPay(ov2); addPayRow(e,ov2,e.reason||'Pay fixed as per ROPA 2009',lt); }
      if(e.extra && e.extra.trim()) rows.push({kind:'span', ev:e.id, spans:[{from:5,to:7,text:e.extra.trim()}]});
    }
    else if(e.type==='fix'){
      var comm=e.commission||'ROPA-2019', CM=commByName(S,comm)||{};
      var method=e.method||CM.method||'matrix';
      var factor=+(e.factor||CM.factor)||0; var pre=e.ord?(payOn(e.date)!=null?payOn(e.date):st.pay):st.pay; var exp3=null, L3=null, t;
      e._pre=pre; e._tgt=(pre!=null&&factor)?Math.round(pre*factor*100)/100:null;
      if(method==='matrix'){
        L3=levelById(S,e.level);
        if(L3 && pre!=null && factor){ var tgt=pre*factor; for(var j=0;j<L3.cells.length;j++){ if(L3.cells[j]>=tgt-1e-6){ exp3=L3.cells[j]; break; } } }
        e._exp=exp3; st.sys='matrix'; st.level=e.level;
      } else if(method==='band'){
        var gp=+(e.gp||0), rnd=+(CM.round||10);
        if(pre!=null && factor){ e._band=ceilTo(pre*factor,rnd); exp3=e._band+gp; }
        e._exp=exp3; st.sys='2009'; st.level=null; st.incPct=+(CM.incPct||S.r2009.pct); st.incRound=+(CM.incRound||S.r2009.roundTo);
      } else { e._exp=null; st.sys='manual'; st.level=null; }
      var rp4=resolvePay(e,exp3,'পে-রিভিশন '+fd(e.date)); if(rp4.base!=null) setPay(rp4.base);
      var actual=e.actualFrom||'';
      st.fixes.push({date:e.date, actualFrom:actual});
      var go=e.go||CM.go||'';
      if(method==='band'){
        t='FIXATION OF PAY VIDE '+comm.toUpperCase()+'\nPay is notionally fixed at Rs. '+(e._band!=null?e._band:'____')+' in the '+(e.bandText||'Pay Band')+' plus Grade Pay Rs. '+(e.gp||'____')+' (total Rs. '+(rp4.shown!=null?rp4.shown:'____')+') on '+fd(e.date)+(e.preText?' from '+e.preText:'')+' as per option exercised'+(go?' vide '+go:'')+'.'+(actual?' Pay is actually paid w.e.f. '+fd(actual)+'.':'')+(e.nextInc?' Next date of increment '+fd(e.nextInc)+'.':'');
      } else {
        t='FIXATION OF PAY VIDE '+comm.toUpperCase()+'\nPay is notionally fixed at Rs. '+(rp4.shown!=null?rp4.shown:'____')+' on '+fd(e.date)+' in the '+(L3?L3.name:'Level ___')+(e.preText||(L3&&L3.pre)?' from '+(e.preText||L3.pre):'')+' as per option exercised'+(go?' vide '+go:'')+'.'+(actual?' Pay is actually paid w.e.f. '+fd(actual)+'.':'')+(e.nextInc?' Next date of increment '+fd(e.nextInc)+'.':'');
      }
      if(e.text) t=e.text;
      rows.push({kind:'span', ev:e.id, c1:postText(), c2:'', spans:[{from:2,to:7,text:t}], box:true, posting:st.posting});
      addPayRow(e,rp4.shown,e.reason||((actual&&actual>e.date?S.notionalPrefix:'')+'Pay Revision as per '+comm),lt);
    }
    else if(e.type==='status'){
      var which=e.which||'both', ns=e.newStatus||'Permanent';
      if(which==='post'||which==='both') st.post=ns; if(which==='appt'||which==='both') st.appt=ns;
      var t2=e.text;
      if(!t2){ if(which==='post') t2='The sanctioned post became '+ns.toLowerCase()+' from '+fd(e.date);
        else if(which==='appt') t2=pr.His+' service is confirmed/approved as '+ns.toLowerCase()+' on and from '+fd(e.date);
        else t2='The post and '+pr.his+' service became '+ns.toLowerCase()+' from '+fd(e.date);
        t2+=(e.memo?' vide memo No. '+e.memo:'')+(e.memoDate?' dt. '+fd(e.memoDate):'')+(e.by?' by '+e.by:'')+'.'; }
      rows.push({kind:'span', ev:e.id, spans:[{from:3,to:7,text:t2}], posting:st.posting});
    }
    else if(e.type==='note'){
      var r2={kind:'span', ev:e.id, spans:[]};
      if(e.textL) r2.spans.push({from:+(e.fromL||2),to:7,text:e.textL});
      if(e.textR) r2.spans.push({from:8,to:12,text:e.textR});
      rows.push(r2);
    }
    else if(e.type==='verify'){
      var from=e.from||(st.posting&&st.posting.start)||'', to=e.to||e.date;
      if(e.style==='cert'){
        var p=st.posting||{};
        var t3=e.text||('1. Certified that entire period of service of '+pr.Sri+' '+(T.name||'')+' ('+(T.desig||'A.T.')+') from '+fd(from)+' to '+fd(to)+' is verified from the Attendance, Acquittance Rolls and other records of the school and found to be correct.\n2. Certified that the employee has no liability with the school'+(e.di?' and the '+e.di:'')+'.\n3. '+pr.His+' service from '+fd(from)+' to '+fd(to)+' was continuous and without any break.');
        rows.push({kind:'span', ev:e.id, spans:[{from:2,to:12,text:t3}], cert:true});
      } else {
        var t4=e.text||('Service/Leave Verified From '+fd(from)+' To '+fd(to)+' W.r.t. Acq. Roll, Leave Register, Attendance Register and other relevant records of the School and found correct.');
        // attach to latest pay row's col12 if empty, else own row
        var lastPay=payRows[payRows.length-1];
        if(lastPay && !lastPay.c12 && e.attach!==false) lastPay.c12=t4; else rows.push({kind:'span', ev:e.id, spans:[{from:12,to:12,text:t4}]});
      }
    }
    else if(e.type==='resign' || e.type==='release'){
      var lp=payRows[payRows.length-1];
      if(st.posting){ st.posting.end=e.date; }
      if(lp){ lp._end=lp._end||e.date; lp._termEnd=e.date; }
      if(e.type==='resign'){
        var c8r=e.reason||('Resignation on '+fd(e.date)+(e.time?' at '+e.time:''));
        var c9r=e.c9||('Resigned from the post on '+fd(e.date)+(e.time?' at '+e.time:'')+(e.accepted?' and resignation accepted by '+e.accepted:'')+'.');
        if(lp){ lp.c8=c8r; lp.c9=c9r; lp._wideR=true; } else rows.push({kind:'span',ev:e.id,c8:c8r,spans:[{from:9,to:12,text:c9r}]});
      } else {
        var c8t=e.reason||'Released';
        if(lp){ lp.c8=c8t; } else rows.push({kind:'span',ev:e.id,spans:[{from:8,to:8,text:c8t}]});
        if(e.cert!==false){
          var lv=(st.posting&&LVM[st.posting.id])||{}; var p2_=st.posting||{};
          var t5=e.text||('Certified that -\n1. Service of '+pr.Sri+' '+(T.name||'')+', '+(T.desigShort||'A.T.')+' from '+fd(p2_.start)+' to '+fd(e.date)+' is satisfactory.\n2. '+pr.He+' has no liability with the school in respect of non recovery of loan and advance.\n3. '+pr.He+' enjoyed the following leave :\n   (a) Medical leave enjoyed = '+(e.ml!=null&&e.ml!==''?e.ml:(lv.ml||'NIL'))+(lv.ml||e.ml?' days':'')+'\n   (b) Half average pay leave enjoyed = '+(e.hapl||lv.hap||'NIL')+'\n   (c) Extraordinary leave enjoyed = '+(e.eol||lv.eol||'NIL')+'\n4. No court case / departmental proceeding is pending against '+(pr.he==='she'?'her':'him')+'.\n'+pr.He+' has been released from this school on '+fd(e.date)+(e.joinText?' '+e.joinText:' to join in another school')+'.');
          rows.push({kind:'span', ev:e.id, spans:[{from:2,to:7,text:t5}], cert:true});
        }
      }
      st.posting=null;
    }
  });
  // end dates (col 7)
  for(var i=0;i<payRows.length;i++){
    var r=payRows[i]; if(r._end){ r.c7=fmt(r._end,F); continue; }
    var nxt=null; for(var j=i+1;j<payRows.length;j++){ if(!payRows[j]._isFix || r._isFix){ nxt=payRows[j]; break; } }
    var endD=null;
    if(nxt && nxt._date>r._date) endD=addDays(nxt._date,-1);
    if(r._termEnd && (!endD || r._termEnd<endD)) endD=r._termEnd;
    if(r.posting && r.posting.end && (!endD || r.posting.end<endD)) endD=r.posting.end;
    r.c7=endD?fmt(endD,F):'';
  }
  return {rows:rows, flags:flags, postings:postings, finalPay:st.pay, state:st};
}

function joinNotes(e,T,S,pr){
  var F=S.dateFmt, L=[];
  if(e.sanction) L.push(e.sanction);
  if(e.through) L.push('Appointed through '+e.through+(e.apptMemo?' vide memo No. '+e.apptMemo:'')+(e.apptDate?' dt. '+fmt(e.apptDate,F):'')+'.');
  if(e.mcRes) L.push(pr.He+' joined the school on '+fmt(e.date,F)+' vide M.C. Resolution No. '+e.mcRes+(e.mcDate?' dated '+fmt(e.mcDate,F):'')+'.');
  if(e.approvedBy) L.push((e.mcRes||e.through?pr.His+' service was approved':'Approved')+' by '+e.approvedBy+(e.approvalMemo?' vide memo No. '+e.approvalMemo:'')+(e.approvalDate?' dt. '+fmt(e.approvalDate,F):'')+(e.approvalWef?' w.e.f. '+fmt(e.approvalWef,F):'')+'.');
  if(e.extra) e.extra.split('\n').forEach(function(x){ if(x.trim()) L.push(x.trim()); });
  if(L.length>1) return L.map(function(x,i){ return (i+1)+'. '+x; });
  return L;
}

// ---------- increments generator ----------
function genIncrements(T,S,upto){
  var evs=T.events||[], have={}; evs.forEach(function(e){ if(e.type==='inc'||e.type==='benefit') have[e.date]=1; });
  var joins=sortEvents(evs).filter(function(e){return e.type==='join';}); if(!joins.length) return [];
  var ends=sortEvents(evs).filter(function(e){return e.type==='resign'||e.type==='release';});
  var first=joins[0].date, elig=addMonths(first,S.inc.minMonths||6), out=[];
  upto=upto||todayStr();
  var y=+first.slice(0,4);
  for(;;y++){
    var d=y+'-'+p2(S.inc.month)+'-'+p2(S.inc.day); if(d>upto) break; if(d<elig) continue;
    // must be inside some posting
    var inside=false; joins.forEach(function(j,ix){ var end=null; ends.forEach(function(x){ if(x.date>=j.date && (!end||x.date<end)) end=x.date; });
      var nextJ=joins[ix+1]; if(d>=j.date && (!end||d<=end) && (!nextJ||d<nextJ.date)) inside=true; });
    if(inside && !have[d]) out.push({type:'inc', date:d});
  }
  return out;
}

// ---------- leave account ----------
function computeLeave(T,S,H){
  var F=S.dateFmt, SF=/\./.test(F)?'dd.mm.yy':'dd-mm-yy', ov=(T.leave&&T.leave.ov)||{}, posts=H.postings, today=todayStr();
  if(!posts.length) return {rows:[], totals:{}};
  var start=posts[0].start, rows=[], bMC=0, bHAP=0, bVD=0;
  var anniv=function(s){ return start.slice(5); };
  posts.forEach(function(p,pi){
    var pEnd=p.end; var cur=p.start; var first=true, mlTaken=0, hapTaken=0, eolTaken=0;
    while(true){
      // next anniversary strictly after cur
      var y=+cur.slice(0,4), a=y+'-'+start.slice(5); if(a<=cur) a=(y+1)+'-'+start.slice(5);
      var to=addDays(a,-1); if(pEnd && pEnd<to) to=pEnd;
      if(!pEnd && to>=today) break; // incomplete year
      var o=ov[cur]||{}; var days=daysBetween(cur,to), full=(to===addDays(a,-1) && cur===addYears(a,-1));
      var baseMC=full?S.leave.mc:Math.round(S.leave.mc*days/365), baseHAP=full?S.leave.hap:Math.round(S.leave.hap*days/365);
      var eMC=o.mc!=null&&o.mc!==''?+o.mc:baseMC;
      var capRoom=Math.max(0,(S.leave.hapCap||9999)-bHAP); var eHAP=o.hap!=null&&o.hap!==''?+o.hap:Math.min(baseHAP,capRoom);
      var eVD=o.vd!=null&&o.vd!==''?+o.vd:0;
      var c5a=bMC+eMC, c5b=bHAP+eHAP, c6=bVD+eVD;
      var t7=+(o.t7||0), t8=+(o.t8||0), t9=+(o.t9||0);
      bMC=c5a-t7; bHAP=c5b-t8; bVD=c6-t9;
      mlTaken+=t7; hapTaken+=t8; eolTaken+=+(o.eol||0);
      rows.push({kind:'leave', key:cur, posting:p, first:first, from:cur, to:to, c1:'',
        c2a:fmt(cur,SF), c2b:fmt(to,SF), c3a:o.vf?fmt(o.vf,SF):'', c3b:o.vt?fmt(o.vt,SF):'',
        c4a:eMC?String(eMC):'-', c4b:eHAP?String(eHAP):'-', c4c:eVD?String(eVD):'',
        c5a:String(c5a), c5b:String(c5b), c6:c6?String(c6):'',
        c7:t7?String(t7):'-', c8:t8?String(t8):'-', c9:t9?String(t9):'', c10a:o.m10a||'', c10b:o.m10b||'', c11:o.eol||'', c12a:o.s12a||'', c12b:o.s12b||'',
        c13:String(bMC), c14:String(bHAP), c15:bVD?String(bVD):'', c16:'', c17:o.rem||'',
        _auto:{mc:baseMC, hap:Math.min(baseHAP,capRoom)}, _o:o});
      first=false;
      if(pEnd && to>=pEnd) break;
      cur=addDays(to,1);
      if(cur>today) break;
    }
    p._ml=mlTaken; p._hap=hapTaken; p._eol=eolTaken;
    if(pEnd){
      var nkey='v_'+p.id, nt=(T.leave&&T.leave.notes&&T.leave.notes[nkey]);
      var txt=nt!=null&&nt!==''?nt:('Leave account of '+P(T).Sri+' '+(T.name||'')+' (served from '+fmt(p.start,F)+' to '+fmt(pEnd,F)+') verified with reference to Leave Register and other relevant records and found to be correct.'+(mlTaken?' Total M.L. taken = '+mlTaken+' days.':''));
      rows.push({kind:'lnote', key:nkey, text:txt, posting:p});
    }
  });
  return {rows:rows};
}

// ---------- word wrap (needs measure fn) ----------
function wrap(text,width,measure){
  var out=[]; String(text==null?'':text).split('\n').forEach(function(par){
    if(par===''){ out.push(''); return; }
    var lead=(/^\s+/.exec(par)||[''])[0]; var ws=par.trim().split(/\s+/), line=lead;
    ws.forEach(function(w){ var t=line.trim()===''?lead+w:line+' '+w;
      if(measure(t)<=width || line.trim()===''){
        if(measure(t)>width && line.trim()===''){ // break long word
          var s=lead; for(var i=0;i<w.length;i++){ if(measure(s+w[i])>width && s.trim()!==''){ out.push(s); s=''; } s+=w[i]; } line=s; }
        else line=t; }
      else { out.push(line); line=lead+w; } });
    out.push(line); });
  return out;
}

function fullHistory(T,S){ var H1=computeHistory(T,S); var LV1=computeLeave(T,S,H1); var m={}; H1.postings.forEach(function(p){ m[p.id]={ml:p._ml||'',hap:p._hap||'',eol:p._eol||''}; });
  var H=computeHistory(T,S,m); var LV=computeLeave(T,S,H); return {H:H,LV:LV}; }
return {fullHistory:fullHistory, pd:pd, ds:ds, addDays:addDays, addYears:addYears, addMonths:addMonths, fmt:fmt, todayStr:todayStr, dobLine:dobLine, words:words, ordinalWords:ordinalWords,
  superannuation:superannuation, money:money, payDaRows:payDaRows, defaultDA:defaultDA, genCells:genCells, commByName:commByName, defaultCommissions:defaultCommissions, defaultSettings:defaultSettings, mergeSettings:mergeSettings, levelById:levelById,
  computeHistory:computeHistory, genIncrements:genIncrements, computeLeave:computeLeave, sortEvents:sortEvents, wrap:wrap, P:P, PAYTYPES:PAYTYPES};
})();
if(typeof module!=='undefined') module.exports=SB;
