head=open('head.html').read()
out=head+''.join('<script>'+open(f).read()+'</script>\n' for f in ['core.js','render.js','reader.js','app.js'])+'</body></html>'
open('index.html','w').write(out); print(len(out))
