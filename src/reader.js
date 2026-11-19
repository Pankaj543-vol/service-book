// ===== Offline document reader: PDF text layer + Tesseract OCR (no AI) =====
var READER=(function(){
'use strict';
function abs(p){ return new URL(p, location.href).href; }
function loadScript(src){ return new Promise(function(ok,no){ var s=document.createElement('script'); s.src=src; s.onload=ok; s.onerror=function(){ no(new Error('লাইব্রেরি লোড হয়নি: '+src)); }; document.head.appendChild(s); }); }
var pdfReady=null, ocrWorker=null;
// tesseract's worker reads language data from IndexedDB (idb-keyval: db 'keyval-store', store 'keyval')
function idbPut(key,val){ return new Promise(function(ok,no){ try{ var rq=indexedDB.open('keyval-store',1);
  rq.onupgradeneeded=function(){ rq.result.createObjectStore('keyval'); };
  rq.onerror=function(){ no(new Error('এই ব্রাউজারে স্টোরেজ চালু নেই, তাই ছবি থেকে লেখা চেনা যাচ্ছে না')); };
  rq.onsuccess=function(){ var db=rq.result; var tx=db.transaction('keyval','readwrite'); tx.objectStore('keyval').put(val,key); tx.oncomplete=function(){ db.close(); ok(); }; tx.onerror=function(){ no(tx.error); }; };
 }catch(e){ no(new Error('এই ব্রাউজারে স্টোরেজ চালু নেই, তাই ছবি থেকে লেখা চেনা যাচ্ছে না')); } }); }
function ensurePdf(){ if(!pdfReady) pdfReady=loadScript(abs('vendor/pdf.min.js')).then(function(){ window.pdfjsLib.GlobalWorkerOptions.workerSrc=abs('vendor/pdf.worker.min.js'); }); return pdfReady; }
function ensureOcr(progress){
  if(ocrWorker) return Promise.resolve(ocrWorker);
  return (window.Tesseract?Promise.resolve():loadScript(abs('vendor/tesseract.min.js'))).then(function(){
    progress&&progress('লেখা চেনার ফাইল লোড হচ্ছে (প্রথমবার)…');
    return fetch(abs('vendor/lang/eng.traineddata.txt')).then(function(r){ if(!r.ok) throw new Error('ভাষার ফাইল পাওয়া যায়নি'); return r.text(); }).then(function(b64){
      var bin=atob(b64.trim()), u=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
      return idbPut('./eng.traineddata',u); }).then(function(){
      return window.Tesseract.createWorker('eng',1,{workerPath:abs('vendor/worker.min.js'), corePath:abs('vendor/core'), langPath:abs('vendor/lang'), workerBlobURL:false, cacheMethod:'readOnly',
      logger:function(m){ if(progress && m && m.status) progress('OCR: '+m.status+(m.progress?' '+Math.round(m.progress*100)+'%':'')); }}); });
  }).then(function(w){ ocrWorker=w; return w; });
}

// items: {t,x,y,w,h,page}
function fromPdf(file,progress){
  return ensurePdf().then(function(){ return file.arrayBuffer(); }).then(function(buf){
    return window.pdfjsLib.getDocument({data:buf}).promise; }).then(function(pdf){
    var out={pages:[], scanned:[]}; var i=0;
    function next(){ i++; if(i>pdf.numPages) return out; progress&&progress('পাতা '+i+'/'+pdf.numPages+' পড়ছি…');
      return pdf.getPage(i).then(function(pg){ var vp=pg.getViewport({scale:1});
        return pg.getTextContent().then(function(tc){
          var items=tc.items.filter(function(it){return it.str&&it.str.trim();}).map(function(it){ return {t:it.str, x:it.transform[4], y:vp.height-it.transform[5], w:it.width, h:Math.abs(it.transform[3])||10, page:i}; });
          var chars=items.reduce(function(s,a){return s+a.t.trim().length;},0);
          if(chars>40){ out.pages.push({page:i, items:items, src:'text'}); return next(); }
          // scanned page -> render & OCR
          var sc=2.2, v2=pg.getViewport({scale:sc}), cv=document.createElement('canvas'); cv.width=v2.width; cv.height=v2.height;
          return pg.render({canvasContext:cv.getContext('2d'), viewport:v2}).promise.then(function(){ return ocrCanvas(cv,i,progress); }).then(function(p){ p.items.forEach(function(it){ it.x/=sc; it.y/=sc; it.w/=sc; it.h/=sc; }); out.pages.push(p); out.scanned.push(i); return next(); });
        }); }); }
    return next(); });
}
function ocrCanvas(src,page,progress){
  return ensureOcr(progress).then(function(w){ progress&&progress('পাতা '+page+': লেখা চিনছি (OCR)…'); return w.recognize(src); }).then(function(r){
    var items=[]; (r.data.lines||[]).forEach(function(l){ (l.words||[]).forEach(function(wd){ if(wd.confidence<35) return; items.push({t:wd.text, x:wd.bbox.x0, y:wd.bbox.y1, w:wd.bbox.x1-wd.bbox.x0, h:wd.bbox.y1-wd.bbox.y0, page:page, conf:wd.confidence}); }); });
    return {page:page, items:items, src:'ocr', conf:r.data.confidence};
  });
}
function fromImage(file,progress){
  return new Promise(function(ok,no){ var img=new Image(); img.onload=function(){ var cv=document.createElement('canvas'); var s=Math.min(1,2600/Math.max(img.width,img.height)); cv.width=img.width*s; cv.height=img.height*s; cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height); ok(cv); }; img.onerror=function(){ no(new Error('ছবি খোলা যায়নি')); }; img.src=URL.createObjectURL(file); })
  .then(function(cv){ return ocrCanvas(cv,1,progress); }).then(function(p){ return {pages:[p], scanned:[1]}; });
}
function read(file,progress){ return /pdf$/i.test(file.type)||/\.pdf$/i.test(file.name) ? fromPdf(file,progress) : fromImage(file,progress); }

// ---------- lines ----------
function toLines(doc){
  var lines=[];
  doc.pages.forEach(function(p){
    var its=p.items.slice().sort(function(a,b){ return a.y-b.y || a.x-b.x; }), cur=null;
    its.forEach(function(it){ var tol=Math.max(4,(it.h||10)*0.55);
      if(cur && Math.abs(it.y-cur.y)<=tol){ cur.items.push(it); } else { cur={y:it.y,items:[it],page:p.page}; lines.push(cur); } });
  });
  lines.forEach(function(l){ l.items.sort(function(a,b){return a.x-b.x;}); l.text=l.items.map(function(i){return i.t;}).join(' ').replace(/\s+/g,' ').trim(); });
  return lines.filter(function(l){return l.text;});
}

// ---------- parsing helpers ----------
var MON={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
function y4(y){ y=+y; if(y<100) y+= (y<50?2000:1900); return y; }
function iso(y,m,d){ y=y4(y); m=+m; d=+d; if(m<1||m>12||d<1||d>31||y<1950||y>2070) return null; return y+'-'+(m<10?'0':'')+m+'-'+(d<10?'0':'')+d; }
var RX_DATE=/\b(\d{1,2})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{4}|\d{2})\b|\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[,.]?\s+(\d{4})\b/gi;
function dates(s){ var out=[], m; RX_DATE.lastIndex=0; while((m=RX_DATE.exec(s))){ var d= m[1]? iso(m[3],m[2],m[1]) : iso(m[6],MON[m[5].toLowerCase().slice(0,3)],m[4]); if(d) out.push({iso:d, raw:m[0], at:m.index}); } return out; }
function amounts(s){ var out=[], m, re=/(?:Rs\.?\s*)?\b(\d{1,3}(?:,\d{2,3})+|\d{4,6})(?:\s*\/-)?/g;
  while((m=re.exec(s))){ var raw=m[0], n=+m[1].replace(/,/g,''); var before=s.slice(Math.max(0,m.index-3),m.index);
    if(/[.\-\/]\s*$/.test(before) || /^\d{1,2}\s*[.\-\/]/.test(s.slice(m.index+m[0].length)) ) continue; // part of date
    if(n>=1950 && n<=2070 && !/Rs|,|\/-/.test(raw)) continue; // looks like a year
    if(n<1000) continue; out.push({n:n, raw:raw}); }
  return out; }
function kind(s){ s=s.toLowerCase();
  if(/ropa|revision|fixation|fixed/.test(s)) return 'fix';
  if(/10\s*y|ten year|cas\b|career advancement|benefit/.test(s)) return 'benefit';
  if(/increment|incr\b/.test(s)) return 'inc';
  if(/join|appoint/.test(s)) return 'join';
  if(/release|transfer|utsashree/.test(s)) return 'release';
  if(/resign/.test(s)) return 'resign';
  return 'inc'; }

function parse(doc){
  var lines=toLines(doc), all=lines.map(function(l){return l.text;}).join('\n');
  var R={lines:lines, text:all, info:{}, pays:[], refs:[], factor:null, levels:[], scanned:doc.scanned||[], conf:null};
  var confs=doc.pages.filter(function(p){return p.conf!=null;}).map(function(p){return p.conf;}); if(confs.length) R.conf=Math.round(confs.reduce(function(a,b){return a+b;},0)/confs.length);
  lines.forEach(function(l,ix){ var t=l.text, low=t.toLowerCase();
    var mName=/\bname\b[^A-Za-z]{0,6}([A-Z][A-Za-z.]+(?:\s+[A-Z][A-Za-z.]+){1,4})/.exec(t); if(mName && !R.info.name && !/father|husband|school|institution|post/i.test(t.slice(0,mName.index))) R.info.name=mName[1].trim();
    if(/birth/i.test(t)){ var dd=dates(t); if(dd.length && !R.info.dob) R.info.dob=dd[0].iso; }
    var mF=/father'?s?(?:\/husband'?s?)?\s*name[^A-Za-z]{0,8}([A-Z][A-Za-z.]+(?:\s+[A-Z][A-Za-z.]+){0,4})/i.exec(t); if(mF && !R.info.father) R.info.father=mF[1].trim();
    var mH=/height[^0-9]{0,20}(\d{2,3}\s*(?:c\.?\s*m|cm))/i.exec(t); if(mH && !R.info.height) R.info.height=mH[1].replace(/\s+/g,' ').toUpperCase();
    // pay rows: a line with a date and an amount
    var ds=dates(t), am=amounts(t);
    if(ds.length && am.length){ R.pays.push({date:ds[0].iso, end:ds[1]?ds[1].iso:'', pay:am[am.length-1].n, kind:kind(t), line:t, page:l.page}); }
    // references
    var re=/\b(G\.?\s*O\.?|Memo\.?|Notification|Resolution)\s*(?:No\.?)?\s*[:\-]?\s*([A-Za-z0-9()\/\-.&]+(?:\s*\([A-Za-z0-9]+\))?(?:[\/\-][A-Za-z0-9()\/\-.&]+)*)[^\n]{0,40}?(?:dt\.?|dated|date)\s*[:\-]?\s*(\d{1,2}\s*[.\-\/]\s*\d{1,2}\s*[.\-\/]\s*\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+,?\s+\d{4})/gi, m;
    while((m=re.exec(t))){ var dd2=dates(m[3]); R.refs.push({kind:m[1].replace(/\s/g,''), no:m[2], date:dd2.length?dd2[0].iso:'', text:(m[1].replace(/\s+/g,'')+' No. '+m[2]+' dt. '+m[3]).replace(/\s+/g,' ')}); }
    if(!/(G\.?\s*O\.?|Memo|Notification|Resolution)\s*(No)?/i.test(t)){ var mno=/\bNo\.?\s*[:\-]?\s*([A-Za-z0-9()\/\-.&]*\d[A-Za-z0-9()\/\-.&]*)\s*,?\s*(?:dt\.?|dated|date)\s*[:\-]?\s*(\d{1,2}\s*[.\-\/]\s*\d{1,2}\s*[.\-\/]\s*\d{2,4})/i.exec(t);
      if(mno){ var dd3=dates(mno[2]); R.refs.push({kind:'No', no:mno[1], date:dd3.length?dd3[0].iso:'', text:(mno[1]+' dt. '+mno[2]).replace(/\s+/g,' ')}); } }
    var mfac=/(?:factor|multipl\w*)\D{0,25}?(\d\.\d{1,3})\b/i.exec(t); if(mfac && !R.factor) R.factor=+mfac[1];
  });
  // de-duplicate pays by date
  var seen={}; R.pays=R.pays.filter(function(p){ var k=p.date+'|'+p.pay; if(seen[k]) return false; seen[k]=1; return true; });
  R.levels=matrixCols(doc);
  return R;
}
// pay-matrix columns: numeric items grouped by x, increasing ~2-6% down the column
function matrixCols(doc){
  var out=[];
  doc.pages.forEach(function(p){
    var nums=p.items.map(function(it){ var s=it.t.replace(/[,\s]/g,''); return /^\d{4,6}$/.test(s)?{n:+s,x:it.x+it.w/2,y:it.y}:null; }).filter(Boolean).filter(function(o){return o.n>=5000&&o.n<=400000;});
    var cols=[]; nums.forEach(function(o){ var c=null; for(var i=0;i<cols.length;i++) if(Math.abs(cols[i].x-o.x)<14){ c=cols[i]; break; } if(!c){ c={x:o.x,v:[]}; cols.push(c); } c.v.push(o); });
    cols.forEach(function(c){ c.v.sort(function(a,b){return a.y-b.y;}); var seq=[]; c.v.forEach(function(o){ var last=seq[seq.length-1]; if(!last || (o.n/last>1.015 && o.n/last<1.07)) seq.push(o.n); else if(seq.length<5) seq=[o.n]; });
      if(seq.length>=5){ var nm='', best=1e9; var top=c.v[0].y; p.items.forEach(function(it){ var m=/Level\s*[-:]?\s*(\d{1,2}[A-Z]?)/i.exec(it.t); if(m && it.y<top){ var dx=Math.abs(it.x+it.w/2-c.x), dy=top-it.y; if(dx<60 && dx+dy<best){ best=dx+dy; nm='Level '+m[1]; } } });
        out.push({page:p.page, cells:seq, name:nm}); } });
  });
  return out;
}
return {ensurePdf:ensurePdf, read:read, parse:parse, dates:dates, amounts:amounts, toLines:toLines};
})();
