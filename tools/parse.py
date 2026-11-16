import sys, glob, json, re, os
def parse(path):
    lines=open(path,encoding='utf-8').read().splitlines()
    i=lines.index('Name\tValue')+1 if 'Name\tValue' in lines else next(k for k,l in enumerate(lines) if l.startswith('Name'))+1
    d={}; last=None
    for l in lines[i:]:
        if not l.strip(): continue
        if '\t' in l:
            k,v=l.split('\t',1); k=k.strip(); v=v.strip()
            if k in d: k=k+'#2'
            d[k]=v; last=k
        elif last: d[last]+=' '+l.strip()
    return d
rows=[parse(p) for p in sorted(glob.glob(sys.argv[1]+'/*.txt'))]
json.dump(rows,open(sys.argv[2],'w'),ensure_ascii=False,indent=1)
print(len(rows))
keys=[]
for r in rows:
    for k in r:
        if k not in keys: keys.append(k)
for k in keys: print(k)
