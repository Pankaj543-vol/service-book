import re,hashlib,os,json,shutil,subprocess
subprocess.run(['python3','build.py'],check=True); shutil.copy('index.html','site/index.html')
fonts=None
if os.path.isdir('pwa/fonts'): fonts=True; shutil.copytree('pwa/fonts','/tmp/sbfonts',dirs_exist_ok=True)
shutil.rmtree('pwa',ignore_errors=True); os.makedirs('pwa')
shutil.copytree('site/vendor','pwa/vendor'); shutil.copytree('/tmp/sbfonts','pwa/fonts')
h=open('index.html').read()
h=re.sub(r'<link rel="preconnect"[^>]*>','',h)
h=re.sub(r'<link rel="stylesheet" href="https://fonts.googleapis.com[^>]*>','<link rel="stylesheet" href="fonts/fonts.css"><link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon-192.png"><link rel="apple-touch-icon" href="icon-192.png"><meta name="theme-color" content="#1f3b73">',h,count=1)
h=h.replace('<title>সার্ভিস বুক</title>','<title>শিক্ষকদের সার্ভিস বুক তৈরি করার অ্যাপ</title>')
h=h.replace('<div id="app"></div>','<div id="app"></div><script>window.SB_STANDALONE=true;</script>',1)
open('pwa/index.html','w').write(h)
json.dump({"name":"শিক্ষকদের সার্ভিস বুক তৈরি করার অ্যাপ","short_name":"সার্ভিস বুক","start_url":"./","scope":"./","display":"standalone","background_color":"#f3f1ec","theme_color":"#1f3b73","lang":"bn",
 "icons":[{"src":"icon-192.png","sizes":"192x192","type":"image/png"},{"src":"icon-512.png","sizes":"512x512","type":"image/png"},{"src":"icon-maskable-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"}]},open('pwa/manifest.webmanifest','w'),ensure_ascii=False,indent=1)
from PIL import Image, ImageDraw
def icon(sz,mask=False):
  im=Image.new('RGBA',(sz,sz),(0,0,0,0)); d=ImageDraw.Draw(im); s=sz/512
  if mask: d.rectangle([0,0,sz,sz],fill=(31,59,115,255))
  else: d.rounded_rectangle([0,0,sz-1,sz-1],radius=int(96*s),fill=(31,59,115,255))
  cx=sz/2; top=sz*(0.30 if mask else 0.24); bot=sz*(0.72 if mask else 0.78); w=sz*(0.30 if mask else 0.36)
  d.polygon([(cx,top+12*s),(cx-w,top),(cx-w,bot-10*s),(cx,bot)],fill=(255,253,248,255))
  d.polygon([(cx,top+12*s),(cx+w,top),(cx+w,bot-10*s),(cx,bot)],fill=(240,235,222,255))
  for i in range(5):
    y=top+(40+i*36)*s*(0.8 if mask else 1)
    d.line([(cx-w+22*s,y),(cx-18*s,y+8*s)],fill=(27,58,154,255),width=max(2,int(7*s)))
    d.line([(cx+18*s,y+8*s),(cx+w-22*s,y)],fill=(27,58,154,255),width=max(2,int(7*s)))
  d.line([(cx,top+12*s),(cx,bot)],fill=(31,59,115,255),width=max(2,int(6*s)))
  return im
icon(192).save('pwa/icon-192.png'); icon(512).save('pwa/icon-512.png'); icon(512,True).save('pwa/icon-maskable-512.png')
files=[]
for root,_,fs in os.walk('pwa'):
  for f in fs:
    p=os.path.relpath(os.path.join(root,f),'pwa')
    if p!='sw.js': files.append(p)
dig=hashlib.sha1(b''.join(open(os.path.join('pwa',p),'rb').read() for p in sorted(files))).hexdigest()[:10]
files=['./']+sorted(files)
sw="""// সার্ভিস বুক — অফলাইন ও আপডেট
var VERSION='sb-%s';
var FILES=%s;
self.addEventListener('install',function(e){ e.waitUntil(caches.open(VERSION).then(function(c){ return c.addAll(FILES); }).then(function(){ return self.skipWaiting(); })); });
self.addEventListener('activate',function(e){ e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){return k!==VERSION;}).map(function(k){return caches.delete(k);})); }).then(function(){ return self.clients.claim(); })); });
self.addEventListener('fetch',function(e){
  var req=e.request; if(req.method!=='GET') return;
  var url=new URL(req.url); if(url.origin!==location.origin) return;
  var isPage=req.mode==='navigate' || /\\/(index\\.html)?$/.test(url.pathname);
  if(isPage){
    e.respondWith(fetch(req).then(function(r){ var cp=r.clone(); caches.open(VERSION).then(function(c){ c.put('./',cp); }); return r; }).catch(function(){ return caches.match('./').then(function(r){ return r||caches.match('index.html'); }); }));
    return; }
  e.respondWith(caches.match(req,{ignoreSearch:true}).then(function(r){ return r||fetch(req); }));
});
"""%(dig,json.dumps(files,ensure_ascii=False))
open('pwa/sw.js','w').write(sw)
print('version',dig,len(files),'files')
