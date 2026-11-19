// সার্ভিস বুক — অফলাইন ও আপডেট
var VERSION='sb-b32c9081c9';
var FILES=["./", "fonts/fonts.css", "fonts/noto-sans-bengali-bengali-400-normal.woff2", "fonts/noto-sans-bengali-bengali-700-normal.woff2", "fonts/noto-serif-latin-400-normal.woff2", "fonts/noto-serif-latin-700-normal.woff2", "fonts/roboto-condensed-latin-400-normal.woff2", "fonts/roboto-condensed-latin-700-normal.woff2", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "index.html", "manifest.webmanifest", "vendor/core/tesseract-core-lstm.wasm.js", "vendor/core/tesseract-core-simd-lstm.wasm.js", "vendor/html2canvas.min.js", "vendor/jspdf.umd.min.js", "vendor/lang/eng.traineddata.txt", "vendor/pdf.min.js", "vendor/pdf.worker.min.js", "vendor/tesseract.min.js", "vendor/worker.min.js"];
self.addEventListener('install',function(e){ e.waitUntil(caches.open(VERSION).then(function(c){ return c.addAll(FILES.map(function(u){ return new Request(u,{cache:'reload'}); })); }).then(function(){ return self.skipWaiting(); })); });
self.addEventListener('activate',function(e){ e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){return k!==VERSION;}).map(function(k){return caches.delete(k);})); }).then(function(){ return self.clients.claim(); })); });
self.addEventListener('fetch',function(e){
  var req=e.request; if(req.method!=='GET') return;
  var url=new URL(req.url); if(url.origin!==location.origin) return;
  var isPage=req.mode==='navigate' || /\/(index\.html)?$/.test(url.pathname);
  if(isPage){
    e.respondWith(fetch(req,{cache:'no-store'}).then(function(r){ var cp=r.clone(); caches.open(VERSION).then(function(c){ c.put('./',cp); }); return r; }).catch(function(){ return caches.match('./').then(function(r){ return r||caches.match('index.html'); }); }));
    return; }
  e.respondWith(caches.match(req,{ignoreSearch:true}).then(function(r){ return r||fetch(req); }));
});
