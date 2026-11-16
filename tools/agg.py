import json, re, sys
from collections import Counter, OrderedDict
rows=json.load(open(sys.argv[1]))
IGNORE=('同意','7-7')
rows=[{k:v for k,v in r.items() if not k.startswith(IGNORE)} for r in rows]
N=len(rows)
def get(r,prefix,sub=None):
    for k,v in r.items():
        if k.startswith(prefix+' ') and (sub is None and '［' not in k or sub and '［'+sub in k):
            if k.endswith('#2'): continue
            return None if v in ('（未回答）','') else v
    return None
def getall(r,prefix):
    return [v for k,v in r.items() if k.startswith(prefix+' ') and v not in ('（未回答）','')]
def items(v):
    if not v: return []
    out=[]
    for x in v.split('、'):
        x=x.strip()
        if x.startswith('その他'): x='その他'
        out.append(x)
    return out
def num(v):
    if not v: return None
    if 'すぐ' in v: return 0
    h=re.search(r'(\d+)\s*時間',v); m=re.search(r'(\d+)\s*分',v); o=re.search(r'(\d+)\s*(%|組)',v)
    if h or m: return (int(h.group(1))*60 if h else 0)+(int(m.group(1)) if m else 0)
    return int(o.group(1)) if o else None
A=OrderedDict(); A['n']=N
def multi(key,prefix,sub=None,order=None):
    c=Counter(); answered=0
    for r in rows:
        it=items(get(r,prefix,sub))
        if it: answered+=1
        c.update(set(it))
    keys=(order+[k for k in sorted(c,key=lambda k:(-c[k],k)) if k not in order]) if order else sorted(c,key=lambda k:(-c[k],k))
    A[key]={'type':'multi','answered':answered,'items':[[k,c.get(k,0)] for k in keys]}
def single(key,prefix,sub=None,order=None):
    c=Counter(get(r,prefix,sub) for r in rows); c.pop(None,None)
    keys=(order+[k for k in sorted(c,key=lambda k:(-c[k],k)) if k not in order]) if order else sorted(c,key=lambda k:(-c[k],k))
    A[key]={'type':'single','answered':sum(c.values()),'items':[[k,c.get(k,0)] for k in keys]}
def numeric(key,prefix,sub=None):
    vals=sorted(x for x in (num(get(r,prefix,sub)) for r in rows) if x is not None)
    A[key]={'type':'num','values':vals}
# --- 0 回答者（集約して表示）
shop=Counter()
for r in rows:
    s=get(r,'0-1')
    if s in('本店','両方'): shop['本店に入る']+=1
    if s in('駅前店','両方'): shop['駅前店に入る']+=1
A['shop']={'type':'multi','answered':N,'items':[[k,shop[k]] for k in ['本店に入る','駅前店に入る']]}
multi('slot','0-3',order=['午前（9〜12時）','昼（12〜17時）','夕方〜夜（17〜22時）'])
# 勤務歴は「3年未満／3年以上」の2区分に丸める
ten=Counter('3年以上' if get(r,'0-2')=='3年以上' else '3年未満' for r in rows)
A['tenure']={'type':'single','answered':N,'items':[['3年未満',ten['3年未満']],['3年以上',ten['3年以上']]]}
# --- 1 部屋
def rooms(v):
    return re.findall(r'(本店|駅前店) (\d{3})',v or '')
def roomcount(key,prefix,sub=None):
    c=Counter(); answered=0
    for r in rows:
        rr=rooms(get(r,prefix,sub))
        if rr: answered+=1
        c.update(f'{s} {n}' for s,n in set(rr))
    A[key]={'type':'rooms','answered':answered,'counts':dict(sorted(c.items()))}
roomcount('room_big','1-1')
roomcount('room_pop','1-8','部屋')
roomcount('room_tele','1-9')
# 客層別の避けたい部屋
avoid={}; avoid_answered=Counter()
for r in rows:
  for k,v in r.items():
    if not k.startswith('1-10 ') or v in ('（未回答）',''): continue
    m=re.match(r'客層：(.*?)／避けている部屋：(.*?)／理由：(.*)',v)
    if not m: continue
    seg=m.group(1).replace('その他：','')
    avoid_answered[seg]+=1
    c=avoid.setdefault(seg,Counter()); c.update(f'{s} {n}' for s,n in set(rooms(m.group(2))))
A['room_avoid_couple']={'type':'rooms','answered':avoid_answered['カップル'],'counts':dict(sorted(avoid.get('カップル',{}).items()))}
A['avoid_segments']=dict(sorted(avoid_answered.items()))
A['avoid_people']=sum(1 for r in rows if any(k.startswith('1-10 ') and v not in ('（未回答）','') for k,v in r.items()))
allrooms=set()
for k in ['room_big','room_pop','room_tele','room_avoid_couple']: allrooms|=set(A[k]['counts'])
for seg,c in avoid.items(): allrooms|=set(c)
A['allrooms']=sorted(allrooms,key=lambda x:(x.split()[0]!='本店',int(x.split()[1])))
single('bigcount','1-2',order=['1室','2室','3室'])
multi('small_in_big','1-3')
single('ask_model','1-4','聞いているか')
numeric('ask_model_pct','1-4','「空室')
lv=['いつも','ときどき','あまり','知らなかった']
single('rule_short','1-5',order=lv); single('rule_free','1-6',order=lv); single('rule_nomi','1-7',order=lv)
multi('pop_reason','1-8','人気の理由')
# --- 2 混雑
multi('busy_day','2-1',order=['月','火','水','木','金','土','日','祝日'])
slots=['9〜12時','12〜15時','15〜18時','18〜21時','21〜24時','24〜5時']
multi('busy_wd','2-2','平日',order=slots); multi('busy_we','2-2','土日',order=slots)
multi('busy_season','2-3')
def pattern(key,prefix,stopword):
    days=Counter(); sl=Counter(); lim=Counter(); none=0; used=0
    for r in rows:
        alls=' '.join(getall(r,prefix))
        if stopword in alls: none+=1; continue
        v=get(r,prefix,'パターン1')
        if not v: continue
        used+=1
        for part in v.split('／'):
            if part.startswith('曜日：'): days.update(part[3:].split('、'))
            elif part.startswith('時間帯：'): sl.update(part[4:].split('、'))
            else: lim[part.split('：',1)[1]]+=1
    A[key]={'type':'pattern','used':used,'none':none,'days':[[d,days[d]] for d in ['月','火','水','木','金','土','日','祝日']],'slots':[[s,sl[s]] for s in slots],'limit':sorted(lim.items(),key=lambda x:(-x[1],x[0]))}
pattern('cap_time','2-4','上限はかけていない')
pattern('cap_people','2-5','下限はかけていない')
multi('decline_content','2-6','伝えている内容')
single('noext_groups','2-7','待っている組数',order=['1組以上','2組以上','3組以上'])
numeric('noext_pct','2-7','空室')
multi('noext_other','2-7','ほかの判断材料')
numeric('wait_pad','2-8')
# --- 3 送客
numeric('transfer_wait','3-1','待ち時間')
multi('transfer_reason','3-1','ほかの理由')
multi('slip_fields','3-2')
multi('slip_tell','3-3','伝えている内容')
# --- 4 退室コール
numeric('call_early','4-1'); multi('call_early_when','4-2')
numeric('recall_wait','4-3'); numeric('visit_wait','4-4')
single('ask_nocall','4-5',order=['いつも聞く','ときどき聞く','聞かない'])
single('nocall_often','4-6',order=['多い','半々','少ない'])
# --- 5 清掃
numeric('clean_standby','5-1'); numeric('clean_waiting','5-2')
# --- 6 年齢・ドリンク
multi('id_when','6-1'); multi('minor_check','6-2')
single('car_ask','6-3',order=['毎回','ときどき','ほとんど聞かない'])
single('oned_ask','6-4',order=['いつも聞く','混んでいなければ聞く','ほとんど部屋のQRコードで案内する'])
# --- 7 ミス
multi('mistakes','7-1'); multi('stumble','7-2')
json.dump(A,open(sys.argv[2],'w'),ensure_ascii=False,indent=1)
