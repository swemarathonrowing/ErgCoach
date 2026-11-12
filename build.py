import os
import os; d=os.path.dirname(os.path.abspath(__file__))+'/'
h=open(d+'head.html').read().replace('%%BASECSS%%',open(d+'base.css').read())
logo=open(d+'logo.svg').read().replace('class="logoWrap" ','').replace('mask0_gate','mask0_btn')
h=h.replace('%%LOGO_BTN%%',logo)
cfg='<script src="config.js" onerror="0"></script>\n'
js='\n'.join(open(d+f).read() for f in ['util.js','team.js','game.js','core.js','analysis.js','video.js','workout.js','qrlib.js','lowpoly.js','athlete.js','athsess.js'])+"\nbtCheck(); pmUi(); window.EC={LIVE,S,PM,DEMO,VID,TEAM,API,analyseVideo,summarize,findings,curveMetrics,addStroke,showView,videoFindings,saveCloud};\n"
open(d+'index.html','w').write(h+cfg+'<script>\n'+js+'</script>\n</body>\n</html>\n')
if not os.path.exists(d+'config.js'):
    open(d+'config.js','w').write("// Fill in after creating the Supabase project. Leave empty for the local demo server.\n// window.ERG_CFG = { url:'https://xxxx.supabase.co', key:'anon public key' };\n")

ch=open(d+'coach-head.html').read()
cj='\n'.join(open(d+f).read() for f in ['util.js','qrlib.js','team.js','game.js','analysis.js','workout.js','lowpoly.js','gfx.js','coach.js','coachsess.js'])
open(d+'coach.html','w').write(ch+cfg+'<script>\n'+cj+'</script>\n</body>\n</html>\n')
