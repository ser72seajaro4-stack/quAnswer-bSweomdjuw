import json,sys,subprocess,os
here=os.path.dirname(os.path.abspath(__file__)); root=os.path.dirname(here)
subprocess.run([sys.executable,f'{here}/parse.py',f'{root}/raw',f'{root}/rows.json'],check=True,stdout=subprocess.DEVNULL)
subprocess.run([sys.executable,f'{here}/agg.py',f'{root}/rows.json',f'{root}/agg.json'],check=True)
agg=open(f'{root}/agg.json').read(); cmt=json.load(open(f'{root}/plain/comments.json')); cmt.pop('_note',None)
t=open(f'{here}/template.html').read().replace('__AGG__',agg).replace('__CMT__',json.dumps(cmt,ensure_ascii=False))
os.makedirs(f'{root}/plain',exist_ok=True); open(f'{root}/plain/summary.html','w').write(t); print('built plain/summary.html', json.loads(agg)['n'])
