// ===== Book page renderer (DOM) =====
var BOOK=(function(){
'use strict';
var PW=794, PH=1123, PAD=40, LH=13, LPR=3, RH=40, FONT='11px "Roboto Condensed", "Arial Narrow", Arial, sans-serif';
var ctx=null;
function measure(t){ if(!ctx){ ctx=document.createElement('canvas').getContext('2d'); } ctx.font=FONT; return ctx.measureText(t).width; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

// column widths
var HL=[170,92,82,120,78,84,88], HR=[130,140,150,150,144];
var LL=[150,62,62,50,50,62,62,52,58,58,48], LR=[50,50,46,46,46,50,46,46,58,58,46,104,68];
var HLH=['Name of post with full address of the Institution','Scale of Pay with stages of increment','Whether post is permanent or temporary','Nature of appointment permanent/ temporary/ Officiating Extension','Date of appointment/ increment','Pay and Special Pay, if any','Date of termination of appointment'];
var HRH=['Reason for termination of appointment (Such as promotion, Pay revision, resignation, dismissal etc.)','Nature and duration of leave taken','Signature of employee','Signature of Head of Institution','Certificate of verification of Service'];

function W(arr,a,b){ var s=0; for(var i=a;i<=b;i++) s+=arr[i]; return s; }
function inner(w){ return w-6; }

// pair-wrap: text flowing across left width then right width per visual line
function pairWrap(text,w1,w2){
  var L=[],R=[]; String(text||'').split('\n').forEach(function(par){
    var ws=par.trim()?par.trim().split(/\s+/):[]; if(!ws.length){ L.push(''); R.push(''); return; }
    var i=0; while(i<ws.length){
      var l=''; while(i<ws.length && (l===''||measure(l+' '+ws[i])<=w1)){ if(l===''&&measure(ws[i])>w1){ l=ws[i]; i++; break; } l=l?l+' '+ws[i]:ws[i]; i++; }
      var r=''; while(i<ws.length && (r===''||measure(r+' '+ws[i])<=w2)){ if(r===''&&measure(ws[i])>w2){ r=ws[i]; i++; break; } r=r?r+' '+ws[i]:ws[i]; i++; }
      L.push(l); R.push(r);
    } });
  return {L:L,R:R};
}

// ---- build a layout row: {units, left:[{col,span,lines}], right:[...]}
function layoutHist(r){
  var cells={}; for(var c=1;c<=12;c++) cells[c]=r['c'+c]||'';
  var covered={}, Lc=[], Rc=[];
  var spans=r.spans||[];
  spans.forEach(function(s){
    if(s.from<=7 && s.to>=8){ // cross-page
      var pw=pairWrap(s.text,inner(W(HL,s.from-1,6)),inner(W(HR,0,s.to-8)));
      Lc.push({from:s.from,to:7,lines:pw.L,box:r.box,cert:r.cert}); Rc.push({from:8,to:s.to,lines:pw.R,cert:r.cert});
    } else if(s.to<=7){ Lc.push({from:s.from,to:s.to,lines:SB.wrap(s.text,inner(W(HL,s.from-1,s.to-1)),measure),box:r.box}); }
    else { Rc.push({from:s.from,to:s.to,lines:SB.wrap(s.text,inner(W(HR,s.from-8,s.to-8)),measure)}); }
    for(var k=s.from;k<=s.to;k++) covered[k]=1;
  });
  if(r._wideR && !covered[9]){ // resignation text spans 9-12
    Rc.push({from:9,to:12,lines:SB.wrap(cells[9],inner(W(HR,1,4)),measure)}); for(var k2=9;k2<=12;k2++) covered[k2]=1; }
  for(var c2=1;c2<=12;c2++){ if(covered[c2]) continue;
    var w=c2<=7?HL[c2-1]:HR[c2-8]; var cell={from:c2,to:c2,lines:cells[c2]?SB.wrap(cells[c2],inner(w),measure):[]};
    if(c2===6||c2===5||c2===7) cell.nowrapCenter=true;
    (c2<=7?Lc:Rc).push(cell); }
  var mx=1; Lc.concat(Rc).forEach(function(x){ if(x.lines.length>mx) mx=x.lines.length; });
  Lc.sort(function(a,b){return a.from-b.from;}); Rc.sort(function(a,b){return a.from-b.from;});
  return {units:Math.max(1,Math.ceil(mx/LPR)), L:Lc, R:Rc, src:r};
}

function paginate(items,cap,carryFn){
  var pages=[], cur=[], used=0;
  items.forEach(function(it){
    if(it.units>cap){ // split long row by lines
      var parts=splitRow(it,cap); parts.forEach(function(p){ push(p); }); return; }
    push(it);
  });
  function push(it){
    if(used+it.units>cap){ pages.push(cur); cur=[]; used=0; }
    if(cur.length===0 && pages.length>0 && carryFn){ var it2=carryFn(it); if(it2){ if(it2.units>cap) it2=it; it=it2; } }
    cur.push(it); used+=it.units; }
  if(cur.length) pages.push(cur);
  if(!pages.length) pages.push([]);
  return pages;
}
function splitRow(it,cap){
  var per=cap*LPR, total=it.units*LPR, out=[];
  for(var o=0;o<total;o+=per){
    var cut=function(arr){ return arr.map(function(c){ var n=Object.assign({},c); n.lines=c.lines.slice(o,o+per); return n; }); };
    var L=cut(it.L), R=cut(it.R), mx=1; L.concat(R).forEach(function(x){ if(x.lines.length>mx) mx=x.lines.length; });
    out.push({units:Math.max(1,Math.ceil(mx/LPR)),L:L,R:R,src:it.src});
  }
  return out;
}

function colgroup(ws){ return '<colgroup>'+ws.map(function(w){return '<col style="width:'+w+'px">';}).join('')+'</colgroup>'; }
function cellsHtml(cells,base,ws,units){
  return cells.map(function(c){ var span=c.to-c.from+1; var cls='ent'+(c.box?' box':'')+(c.nowrapCenter?' ctr':'');
    return '<td colspan="'+span+'" class="cl"><div class="'+cls+'" style="height:'+(units*RH-2)+'px">'+esc(c.lines.join('\n'))+'</div></td>'; }).join('');
}
function bodyRows(page,side,ws,cap){
  var h='', used=0;
  page.forEach(function(it){ h+='<tr style="height:'+(it.units*RH)+'px" class="ru">'+cellsHtml(side==='L'?it.L:it.R,0,ws,it.units)+'</tr>'; used+=it.units; });
  for(;used<cap;used++){ h+='<tr style="height:'+RH+'px" class="ru">'+ws.map(function(){return '<td class="cl"></td>';}).join('')+'</tr>'; }
  return h;
}

// ---------- page builders ----------
function pageWrap(inner,num,side){ return '<div class="bpage"><div class="pnum '+(side||'r')+'">'+(num!=null?num:'')+'</div>'+inner+'</div>'; }

function particulars(T,S){
  var F=S.dateFmt; var V=function(s){ return '<span class="val">'+esc(s||'').replace(/\n/g,'<br>')+'</span>'; };
  var h='<div class="ptitle">SERVICE BOOK</div><div class="psub">PARTICULARS OF THE EMPLOYEE</div><div class="plist">'+
  '<div class="pl"><span class="lb">1.&nbsp; Name—</span>'+V(T.name)+'</div>'+
  '<div class="pl"><span class="lb">2.&nbsp; Residence—</span>'+V(T.residence)+'</div>'+
  '<div class="pl dob"><span class="lb small">3.&nbsp; Date of birth by Christian era— (To be ascertained and entered— in accordance with the instruction contained in rule 11 of Pension Rules, Vide G. O. No. 16-10-Edn. (S) dated 18.7.68.)</span>'+V(SB.dobLine(T.dob,T.dobSource))+'</div>'+
  '<div class="pl"><span class="lb">4.&nbsp; Educational Qualification—</span>'+V(T.qualEntry)+'</div>'+
  '<div class="pl ind"><span class="lb">(a)&nbsp; At the time of entry—</span>'+V(T.qualEntry)+'</div>'+
  '<div class="pl ind"><span class="lb">(b)&nbsp; Subsequent improvement in qualification with date</span>'+V(T.qualLater)+'</div>'+
  '<div class="pl"><span class="lb">5.&nbsp; Exact height by measurement—</span>'+V(T.height)+'</div>'+
  '<div class="pl"><span class="lb">6.&nbsp; Personal marks for identification—</span>'+V(T.idMarks)+'</div>'+
  '<div class="pl"><span class="lb">7.&nbsp; Father\'s/Husband\'s name and residence—</span>'+V(T.father)+'</div>'+
  '<div class="pl"><span class="lb">*8.&nbsp; Signature of employee—</span></div>'+
  '<div class="pl"><span class="lb">†9.&nbsp; Signature of the Head of Institution—</span></div></div>'+
  '<div class="pfoot"><div>* The signature in line 8 should be renewed or reattested at least every five years and signature in lines 8 and 9 should be dated.</div><div>† If the employee is the Head of Institution, the Signature in line 9 should be made by the District Inspector/Inspectress of Schools concerned.</div></div>';
  return pageWrap(h,S.pages.part,'r');
}
function finger(T,S){
  var rows=['THUMB—','FORE-FINGER—','MIDDLE-FINGER—','RING-FINGER—','LITTLE-FINGER—'].map(function(x){return '<div class="fg"><span class="lb">'+x+'</span></div>';}).join('');
  var h='<div class="hcenter">SERVICE BOOK</div><div class="fsub">(C) Finger Impression</div><div class="fsub2">Left-hand thumb &amp; Finger impressions of employee</div>'+
   '<div class="fg"><span class="lb">NAME—</span><span class="val">'+esc(T.name||'')+'</span></div>'+rows;
  return pageWrap(h,S.pages.finger,'r');
}

function histPages(T,S,H){
  var cap=S.lines||20;
  var items=H.rows.map(layoutHist);
  var carry=function(it){ var r=it.src; if(!r.posting) return null; var hasC1=it.L.some(function(c){return c.from===1 && c.lines.length;}); if(hasC1) return null;
    if(it.L.some(function(c){return c.from===1 && c.to>1;})) return null;
    var r2=Object.assign({},r); r2.c1=r.posting.post+'\n'+r.posting.school; if(!r2.c2 && !(r.spans||[]).some(function(s){return s.from<=2&&s.to>=2;})) r2.c2=r.posting.scale||''; return layoutHist(r2); };
  var pages=paginate(items,cap,carry), out=[];
  pages.forEach(function(pg,i){
    var nL=S.pages.hist+i*2;
    var thL='<thead><tr>'+HLH.map(function(t){return '<th>'+t+'</th>';}).join('')+'</tr><tr class="num">'+HLH.map(function(t,k){return '<th>('+(k+1)+')</th>';}).join('')+'</tr></thead>';
    var thR='<thead><tr>'+HRH.map(function(t){return '<th>'+t+'</th>';}).join('')+'</tr><tr class="num">'+HRH.map(function(t,k){return '<th>('+(k+8)+')</th>';}).join('')+'</tr></thead>';
    out.push(pageWrap('<div class="hrow"><span></span><span class="hc">SERVICE BOOK</span><span class="hbig">(e) HISTORY OF</span></div><table class="bt">'+colgroup(HL)+thL+'<tbody>'+bodyRows(pg,'L',HL,cap)+'</tbody></table>',nL,'l'));
    out.push(pageWrap('<div class="hrow"><span class="hbig">SERVICE</span><span class="hc">SERVICE BOOK</span><span></span></div><table class="bt">'+colgroup(HR)+thR+'<tbody>'+bodyRows(pg,'R',HR,cap)+'</tbody></table>',nL+1,'r'));
  });
  return out;
}

function leavePages(T,S,H,LV){
  var cap=S.lines||20, F=S.dateFmt, items=[];
  // col1 distribution per posting
  var byPost={}; LV.rows.forEach(function(r){ if(r.kind==='leave'){ var k=r.posting.id; (byPost[k]=byPost[k]||[]).push(r); } });
  Object.keys(byPost).forEach(function(k){ var rs=byPost[k], p=rs[0].posting;
    var lines=SB.wrap((T.desigShort||'A.T.')+'\n'+p.school,inner(LL[0]),measure); var i=0;
    rs.forEach(function(r,ix){ var take=ix===rs.length-1?lines.slice(i):lines.slice(i,i+LPR); i+=take.length; r._c1=take; }); });
  var lk=['c2a','c2b','c3a','c3b','c4a','c4b','c4c','c5a','c5b','c6'], rk=['c7','c8','c9','c10a','c10b','c11','c12a','c12b','c13','c14','c15','c16','c17'];
  LV.rows.forEach(function(r){
    if(r.kind==='leave'){
      var L=[{from:1,to:1,lines:r._c1||[]}].concat(lk.map(function(k,i){ return {from:i+2,to:i+2,lines:SB.wrap(r[k],inner(LL[i+1]),measure),nowrapCenter:true}; }));
      var R=rk.map(function(k,i){ return {from:i+1,to:i+1,lines:SB.wrap(r[k],inner(LR[i]),measure),nowrapCenter:true}; });
      var mx=1; L.concat(R).forEach(function(x){ if(x.lines.length>mx) mx=x.lines.length; });
      items.push({units:Math.max(1,Math.ceil(mx/LPR)),L:L,R:R,src:r});
    } else {
      var pw=pairWrap(r.text,inner(W(LL,0,10)),inner(W(LR,0,12)));
      items.push({units:Math.max(1,Math.ceil(pw.L.length/LPR)),L:[{from:1,to:11,lines:pw.L,cert:true}],R:[{from:1,to:13,lines:pw.R,cert:true}],src:r});
    }
  });
  var pages=paginate(items,cap,null), out=[];
  var first=(H.postings[0]||{}).start||'';
  var thL='<thead><tr><th rowspan="2">Institution served under</th><th colspan="2">Period of duty</th><th colspan="2">Vacation</th><th colspan="3">Leave earned on</th><th colspan="3">Leave at Credit on</th></tr>'+
    '<tr><th>From</th><th>To</th><th>From</th><th>To</th><th>Average Pay on Medical Certificate</th><th>Half Average Pay</th><th>Vacation Detention</th><th>Average Pay on M.C. [Total of Cols. 13 &amp; 4(a)]</th><th>Half average Pay [Total of Cols. 14 &amp; 4(b)]</th><th>Vacation detention leave [Total of Cols. 15 &amp; 4(c)]</th></tr>'+
    '<tr class="num"><th>(1)</th><th>2(a)</th><th>2(b)</th><th>3(a)</th><th>3(b)</th><th>4(a)</th><th>4(b)</th><th>4(c)</th><th>5(a)</th><th>5(b)</th><th>(6)</th></tr></thead>';
  var thR='<thead><tr><th colspan="3">Leave taken</th><th colspan="2">Maternity Leave</th><th rowspan="2">Extra ordinary Leave</th><th colspan="2">Special Leave</th><th colspan="3">Balance (on return from) Leave</th><th rowspan="2">Signature of the Head of Institution</th><th rowspan="2">Remarks</th></tr>'+
    '<tr><th>On average Pay on M.C.</th><th>On Half average Pay</th><th>Vacation Deten- tion</th><th>Full Pay</th><th>Half Pay</th><th>Full Pay</th><th>Half Pay</th><th>On average Pay on M.C.</th><th>On Half average Pay</th><th>Vacation Deten- tion</th></tr>'+
    '<tr class="num"><th>(7)</th><th>(8)</th><th>(9)</th><th>10(a)</th><th>10(b)</th><th>(11)</th><th>12(a)</th><th>12(b)</th><th>(13)</th><th>(14)</th><th>(15)</th><th>(16)</th><th>(17)</th></tr></thead>';
  pages.forEach(function(pg,i){
    var n=S.pages.leave+i*2;
    var headL='<div class="hrow"><span></span><span class="hc">SERVICE BOOK</span><span class="hbig">(g) LEAVE</span></div>'+
      '<div class="lh">Leave Account of <span class="val u">'+esc(T.name||'')+'</span> Designation <span class="val u">'+esc(T.desigShort||'A.T.')+'</span></div>'+
      '<div class="lh">Date of Commencement of Service <span class="val u">'+esc(SB.fmt(first,F))+'</span></div>';
    var headR='<div class="hrow"><span class="hbig">ACCOUNT</span><span class="hc">SERVICE BOOK</span><span></span></div>'+
      '<div class="lh">Date of attaining the age of Superannuation <span class="val u">'+esc(SB.fmt(SB.superannuation(T.dob),F))+'</span></div><div class="lh">&nbsp;</div>';
    out.push(pageWrap(headL+'<table class="bt lv">'+colgroup(LL)+thL+'<tbody>'+bodyRows(pg,'L',LL,cap)+'</tbody></table>',n,'l'));
    out.push(pageWrap(headR+'<table class="bt lv">'+colgroup(LR)+thR+'<tbody>'+bodyRows(pg,'R',LR,cap)+'</tbody></table>',n+1,'r'));
  });
  return out;
}

function allPages(T,S){
  var FH=SB.fullHistory(T,S), H=FH.H;
  // posting scale for carry
  (T.events||[]).forEach(function(e){ if(e.type==='join'){ H.postings.forEach(function(p){ if(p.id===e.id){ var L=SB.levelById(S,e.sys); p.scale=e.scale||(L?L.name+'\n'+L.pre:''); } }); } });
  var LV=FH.LV;
  return {H:H, LV:LV, pages:[particulars(T,S),finger(T,S)].concat(histPages(T,S,H)).concat(leavePages(T,S,H,LV))};
}

var CSS=[
'.bpage{width:794px;height:1123px;background:#fffdf8;position:relative;padding:34px 40px 30px;box-sizing:border-box;font-family:"Noto Serif",Georgia,serif;color:#111;overflow:hidden}',
'.bpage .pnum{position:absolute;top:14px;font-size:12px}.bpage .pnum.l{left:40px}.bpage .pnum.r{right:40px}',
'.bpage .val{font-family:"Roboto Condensed","Arial Narrow",Arial,sans-serif;color:#1b3a9a;font-size:15px}',
'.bpage .val.u{border-bottom:1px dotted #555;padding:0 6px}',
'.ptitle{text-align:center;font-weight:700;font-size:26px;margin-top:20px}.psub{text-align:center;font-family:Arial,sans-serif;font-weight:700;font-size:16px;margin:6px 0 26px}',
'.plist .pl{display:flex;gap:14px;align-items:flex-start;min-height:62px;font-size:13px}.plist .pl .lb{flex:0 0 auto;max-width:260px}.plist .pl.dob{min-height:110px}.plist .pl .lb.small{font-size:11px;font-style:italic;max-width:230px}.plist .pl.ind{padding-left:24px}',
'.plist .pl .val{flex:1;line-height:1.35}',
'.pfoot{position:absolute;bottom:34px;left:40px;right:40px;font-size:10.5px;border-top:1px solid #333;padding-top:6px;line-height:1.4}',
'.hcenter{text-align:center;font-weight:700;font-size:15px;margin-top:4px;border-bottom:1px solid #333;padding-bottom:6px}.fsub{text-align:center;font-family:Arial,sans-serif;font-weight:700;font-size:13px;margin-top:8px}.fsub2{text-align:center;font-family:Arial,sans-serif;font-weight:700;font-size:13px;margin:12px 0 30px}',
'.fg{border-bottom:1px solid #333;height:150px;display:flex;align-items:center;gap:20px;font-size:13px}.fg:first-of-type{height:90px}',
'.hrow{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:6px}.hrow .hc{font-weight:700;font-size:13px}.hrow .hbig{font-family:Arial,sans-serif;font-size:22px;letter-spacing:1px}.hrow span{flex:1}.hrow .hc{text-align:center}.hrow span:last-child{text-align:right}',
'.lh{font-family:Arial,sans-serif;font-weight:700;font-size:12.5px;margin:3px 0}',
'table.bt{border-collapse:collapse;table-layout:fixed;width:714px}',
'table.bt th{border:1px solid #222;font-family:Arial,sans-serif;font-weight:400;font-size:9px;line-height:1.15;padding:3px 2px;vertical-align:middle;text-align:center;height:120px}',
'table.bt.lv th{height:auto;font-size:8.5px}table.bt tr.num th{height:16px;font-size:9px}',
'table.bt td.cl{border-left:1px solid #222;border-right:1px solid #222;padding:0;vertical-align:top}',
'table.bt tr.ru{-webkit-print-color-adjust:exact;print-color-adjust:exact;background-image:repeating-linear-gradient(to bottom,transparent 0,transparent '+(RH-1)+'px,#9a9a9a '+(RH-1)+'px,#9a9a9a '+RH+'px)}',
'table.bt tbody tr:last-child td{border-bottom:1px solid #222}',
'.ent{font-family:"Roboto Condensed","Arial Narrow",Arial,sans-serif;font-size:11px;line-height:'+LH+'px;color:#1b3a9a;white-space:pre;padding:1px 3px 0;overflow:hidden}',
'.ent.ctr{text-align:center}.ent.box{font-weight:700}'
].join('\n');

return {allPages:allPages, CSS:CSS, PW:PW, PH:PH, measure:measure};
})();
