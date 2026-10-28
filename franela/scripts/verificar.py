#!/usr/bin/env python3
"""Coteja una muestra de fichas de data/players.js contra la MLB Stats API (temporada por temporada, equipo 147).
Uso: python3 verificar.py [id ...]   (sin argumentos toma una muestra fija)."""
import json, re, sys, urllib.request
HERE = __import__('os').path.dirname(__import__('os').path.abspath(__file__))
P = json.loads(re.sub(r'^.*?= ', '', open(HERE + '/../data/players.js', encoding='utf-8').read(), count=1, flags=re.S).rstrip(';\n'))
by = {p['id']: p for p in P}
ids = sys.argv[1:] or ['ruthba01', 'gehrilo01', 'dimagjo01', 'mantlmi01', 'berrayo01', 'jeterde01', 'riverma01', 'judgeaa01',
                       'loaizes01', 'amaroru01', 'sanchce01', 'rodrial01', 'guidrro01', 'sotoju01', 'colege01', 'aceveju01']
def api(path):
    with urllib.request.urlopen('https://statsapi.mlb.com/api/v1' + path, timeout=60) as r:
        return json.load(r)
ok = 0
for pid in ids:
    p = by.get(pid)
    if not p or not p['mlbam']:
        print(pid, 'sin ficha o sin id MLBAM'); continue
    out = [p['name'], p['span']]
    diffs = []
    for g in ('hitting', 'pitching'):
        d = api(f"/people/{p['mlbam']}/stats?stats=yearByYear&group={g}")
        splits = [s for s in d['stats'][0]['splits'] if s.get('team', {}).get('id') == 147] if d['stats'] else []
        if not splits: continue
        yrs = sorted({int(s['season']) for s in splits})
        if yrs != p['yrs'] and not (g == 'hitting' and p['primary'] == 'P') and not (g == 'pitching' and p['primary'] != 'P'): diffs.append(f"años {g}: api {yrs} vs {p['yrs']}")
        tot = {}
        for s in splits:
            for k, v in s['stat'].items():
                if isinstance(v, int): tot[k] = tot.get(k, 0) + v
        if g == 'hitting' and p['bat'] and p['primary'] != 'P':
            for a, b in (('G', 'gamesPlayed'), ('AB', 'atBats'), ('H', 'hits'), ('HR', 'homeRuns'), ('RBI', 'rbi'), ('R', 'runs'), ('SB', 'stolenBases'), ('BB', 'baseOnBalls')):
                if p['bat'][a] != tot.get(b, 0): diffs.append(f"{a}: franela {p['bat'][a]} vs api {tot.get(b)}")
            out.append(f"bateo J {p['bat']['G']} H {p['bat']['H']} HR {p['bat']['HR']}")
        if g == 'pitching' and p['pit']:
            for a, b in (('W', 'wins'), ('L', 'losses'), ('G', 'gamesPitched'), ('SV', 'saves'), ('SO', 'strikeOuts'), ('ER', 'earnedRuns')):
                if p['pit'][a] != tot.get(b, 0): diffs.append(f"{a}: franela {p['pit'][a]} vs api {tot.get(b)}")
            out.append(f"pitcheo {p['pit']['W']}-{p['pit']['L']} EFE {p['pit']['ERA']} SV {p['pit']['SV']}")
    per = api(f"/people/{p['mlbam']}")['people'][0]
    nac = (per.get('birthCity'), per.get('birthStateProvince'), per.get('birthCountry'), per.get('birthDate'))
    b = p['born'] or {}
    fecha = f"{b.get('y')}-{b.get('m', 0):02d}-{b.get('d', 0):02d}" if b else ''
    if fecha != nac[3]: diffs.append(f"nacimiento: franela {fecha} vs api {nac[3]}")
    if (p['city'] or '').lower() != (nac[0] or '').lower(): diffs.append(f"ciudad: franela {p['city']} vs api {nac[0]}")
    out.append(f"nac. {p['city']}, {p['country']} {fecha}")
    print(('OK   ' if not diffs else 'DIFF ') + ' · '.join(out))
    for d in diffs: print('      ', d)
    ok += not diffs
print(f"{ok}/{len(ids)} fichas coinciden con la MLB Stats API")
