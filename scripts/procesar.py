#!/usr/bin/env python3
"""Convierte las fuentes crudas (scripts/crudo/) en los datos del museo (data/).

Cada archivo se escribe dos veces:
  data/<nombre>.json  — el dato limpio, para consulta y verificación.
  data/<nombre>.js    — el mismo dato envuelto en JavaScript, para que el sitio
                        funcione abriendo index.html con doble clic (file://),
                        donde el navegador no permite fetch() de archivos locales.

Uso:  python3 scripts/procesar.py [--temporada 2026]
"""
import argparse, csv, datetime as dt, glob, html, json, os, re, warnings
from collections import defaultdict

warnings.filterwarnings("ignore")
import rdata  # pip install rdata

AQUI = os.path.dirname(os.path.abspath(__file__))
CRUDO = os.path.join(AQUI, "crudo")
DATA = os.path.join(os.path.dirname(AQUI), "data")
NYY_API = 147
PRIMER_ANO = 1903

MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]

RONDAS = {
    "WS": "Serie Mundial",
    "ALCS": "Serie de Campeonato de la Liga Americana",
    "ALDS1": "Serie Divisional", "ALDS2": "Serie Divisional",
    "AEDIV": "Serie Divisional (temporada dividida)",
    "ALWC": "Juego de Comodín", "ALWC1": "Serie de Comodines", "ALWC2": "Serie de Comodines",
    "ALWC3": "Serie de Comodines", "ALWC4": "Serie de Comodines",
}
ORDEN_RONDA = {"WC": 0, "DS": 1, "CS": 2, "WS": 3}


def tipo_ronda(r):
    if r == "WS":
        return "WS"
    if r == "ALCS":
        return "CS"
    if r.startswith("ALDS") or r.endswith("DIV"):
        return "DS"
    return "WC"


# ---------------------------------------------------------------- utilidades

def lahman(nombre):
    df = list(rdata.read_rda(os.path.join(CRUDO, "lahman", nombre + ".RData")).values())[0]
    filas = []
    cols = list(df.columns)
    for t in df.itertuples(index=False):
        d = {}
        for c, v in zip(cols, t):
            try:
                if v != v:  # NaN
                    v = None
            except Exception:
                pass
            if v is not None and hasattr(v, "item"):
                v = v.item()
            if v is not None and str(v) == "<NA>":
                v = None
            d[str(c)] = v
        filas.append(d)
    return filas


def n(v):
    """Entero o 0."""
    try:
        return int(v) if v is not None else 0
    except (TypeError, ValueError):
        return 0


def escribir(nombre, obj):
    os.makedirs(DATA, exist_ok=True)
    texto = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(DATA, nombre + ".json"), "w", encoding="utf-8") as f:
        f.write(texto)
    with open(os.path.join(DATA, nombre + ".js"), "w", encoding="utf-8") as f:
        f.write("window.MONUMENTO=window.MONUMENTO||{};\nMONUMENTO." + nombre + "=" + texto + ";\n")
    print(f"  data/{nombre}.json  {len(texto)/1024:.0f} KB")


def fecha_larga(f):
    return f"{f.day} de {MESES[f.month - 1]} de {f.year}"


def miles(x):
    return f"{x:,}".replace(",", " ")


def ip_texto(outs):
    return f"{outs // 3}.{outs % 3}"


# ---------------------------------------------------------------- Retrosheet

def leer_gamelog(ruta):
    with open(ruta, encoding="latin-1", newline="") as f:
        for fila in csv.reader(f):
            if len(fila) < 161:
                continue
            yield fila


def juego_desde_log(f, tipo):
    """Normaliza una línea de game log de Retrosheet desde el punto de vista de NYA."""
    vis, loc = f[3], f[6]
    if "NYA" not in (vis, loc):
        return None
    local = loc == "NYA"
    # Índices (base 0) según https://www.retrosheet.org/gamelogs/glfields.txt
    lado_v = dict(ab=21, h=22, d2=23, d3=24, hr=25, bb=30, k=32, hbp=29, ci=36, pu=38, po=43, e=45)
    lado_l = dict(ab=49, h=50, d2=51, d3=52, hr=53, bb=58, k=60, hbp=57, ci=64, pu=66, po=71, e=73)
    ny, op = (lado_l, lado_v) if local else (lado_v, lado_l)
    cv, cl = n(f[9]), n(f[10])
    return {
        "fecha": f[0], "num": f[1], "tipo": tipo, "local": local,
        "rival": vis if local else loc, "lg_rival": f[4] if local else f[7],
        "ny": cl if local else cv, "op": cv if local else cl,
        "outs": n(f[11]), "completo": f[13], "parque": f[16], "asist": n(f[17]),
        "linea_v": f[19], "linea_l": f[20],
        "h_ny": n(f[ny["h"]]), "h_op": n(f[op["h"]]), "hr_ny": n(f[ny["hr"]]),
        "bb_op": n(f[op["bb"]]), "hbp_op": n(f[op["hbp"]]), "ci_op": n(f[op["ci"]]),
        "e_ny": n(f[ny["e"]]), "e_op": n(f[op["e"]]), "po_ny": n(f[ny["po"]]),
        "k_ny_pit": n(f[op["k"]]), "pu_ny": n(f[ny["pu"]]),
        "gp": (f[93], f[94]), "pp": (f[95], f[96]), "sv": (f[97], f[98]),
        "ab_ny": f[101:103] if not local else f[103:105],
        "ab_op": f[103:105] if not local else f[101:103],
        "info": f[159],
    }


def entradas(j):
    """Entradas jugadas, a partir de las líneas de anotación."""
    def cuenta(linea):
        k, i = 0, 0
        while i < len(linea):
            if linea[i] == "(":
                i = linea.index(")", i) + 1
            else:
                i += 1
            k += 1
        return k
    return max(cuenta(j["linea_v"]), cuenta(j["linea_l"]))


def carreras_por_entrada(linea):
    out, i = [], 0
    while i < len(linea):
        if linea[i] == "(":
            k = linea.index(")", i)
            out.append(linea[i + 1:k]); i = k + 1
        else:
            out.append(linea[i]); i += 1
    return out


# ---------------------------------------------------------------- nombres en español

APODOS = {
    "Red Sox": "Medias Rojas", "White Sox": "Medias Blancas", "Americans": "Americans", "Pilgrims": "Pilgrims",
    "Blue Jays": "Azulejos", "Devil Rays": "Devil Rays", "Rays": "Rays", "Orioles": "Orioles",
    "Tigers": "Tigres", "Indians": "Indios", "Guardians": "Guardianes", "Naps": "Naps", "Bronchos": "Bronchos",
    "Blues": "Blues", "Twins": "Mellizos", "Royals": "Reales", "Athletics": "Atléticos", "Senators": "Senadores",
    "Browns": "Cafés", "Pilots": "Pilotos", "Brewers": "Cerveceros", "Mariners": "Marineros", "Rangers": "Rangers",
    "Angels": "Angelinos", "Astros": "Astros", "Dodgers": "Dodgers", "Robins": "Robins", "Giants": "Gigantes",
    "Cardinals": "Cardenales", "Pirates": "Piratas", "Reds": "Rojos", "Braves": "Bravos", "Phillies": "Filis",
    "Cubs": "Cachorros", "Mets": "Mets", "Expos": "Expos", "Nationals": "Nacionales", "Marlins": "Marlins",
    "Rockies": "Rockies", "Diamondbacks": "Diamondbacks", "Padres": "Padres", "Highlanders": "Highlanders",
    "Yankees": "Yankees",
}
CIUDADES = {
    "New York": "Nueva York", "St. Louis": "San Luis", "Philadelphia": "Filadelfia", "Los Angeles": "Los Ángeles",
    "Los Angeles Angels of Anaheim": "Los Ángeles", "Tampa Bay": "Tampa Bay", "Brooklyn": "Brooklyn",
}


def equipo_es(nombre, mayus=False):
    """'Boston Red Sox' -> 'los Medias Rojas de Boston'. Si no se reconoce, 'los <nombre>'."""
    if nombre == "Athletics":
        r = "los Atléticos"
    elif nombre == "Los Angeles Angels of Anaheim":
        r = "los Angelinos de Los Ángeles de Anaheim"
    else:
        r = None
        for ap in sorted(APODOS, key=len, reverse=True):
            if nombre.endswith(" " + ap):
                ciudad = nombre[: -len(ap) - 1]
                r = f"los {APODOS[ap]} de {CIUDADES.get(ciudad, ciudad)}"
                break
        if r is None:
            r = "los " + nombre
    return ("L" + r[1:]) if mayus else r


def parque_es(nombre):
    if nombre == "Yankee Stadium I":
        return "Yankee Stadium (1923–2008)"
    if nombre == "Yankee Stadium II":
        return "Yankee Stadium"
    return re.sub(r" (I|II|III|IV|V|VI)$", "", nombre)


# ---------------------------------------------------------------- principal

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--temporada", type=int, default=2026)
    args = ap.parse_args()
    S_API = args.temporada

    print("Leyendo Lahman…")
    teams = lahman("Teams")
    people = {p["playerID"]: p for p in lahman("People")}
    por_retro = {p["retroID"]: pid for pid, p in people.items() if p.get("retroID")}
    batting = [r for r in lahman("Batting") if r["teamID"] == "NYA" and r["yearID"] >= PRIMER_ANO]
    pitching = [r for r in lahman("Pitching") if r["teamID"] == "NYA" and r["yearID"] >= PRIMER_ANO]
    appearances = lahman("Appearances")
    managers = [r for r in lahman("Managers") if r["teamID"] == "NYA"]
    seriespost = lahman("SeriesPost")
    battingpost = [r for r in lahman("BattingPost") if r["teamID"] == "NYA"]
    pitchingpost = [r for r in lahman("PitchingPost") if r["teamID"] == "NYA"]
    awards = lahman("AwardsPlayers")
    hof = [r for r in lahman("HallOfFame") if r["inducted"] == "Y"]
    parks = {p["park.key"]: p["park.name"] for p in lahman("Parks")}
    ULTIMO_LAHMAN = max(t["yearID"] for t in teams)

    nombre_equipo = {}
    for t in teams:
        nombre_equipo[(t["yearID"], t["teamID"])] = t["name"]
        if t.get("teamIDretro"):
            nombre_equipo[(t["yearID"], "R:" + t["teamIDretro"])] = t["name"]

    def nombre(pid):
        p = people.get(pid)
        if not p:
            return pid
        return f'{p["nameFirst"] or ""} {p["nameLast"]}'.strip()

    def nombre_retro(rid, crudo):
        pid = por_retro.get(rid)
        return (nombre(pid) if pid else crudo), pid

    # ------------------------------------------------ Stats API (temporada reciente)
    api_dir = os.path.join(CRUDO, "statsapi")
    standings = json.load(open(os.path.join(api_dir, f"standings-{S_API}.json")))
    schedule = json.load(open(os.path.join(api_dir, f"schedule-{S_API}.json")))
    roster = json.load(open(os.path.join(api_dir, f"roster-{S_API}.json")))
    lineas_api = json.load(open(os.path.join(api_dir, f"stats-jugadores-{S_API}.json")))
    coaches = json.load(open(os.path.join(api_dir, f"coaches-{S_API}.json")))

    print("Leyendo Chadwick Register…")
    mlbam_a_bbref = {}
    for ruta in glob.glob(os.path.join(CRUDO, "register", "people-*.csv")):
        with open(ruta, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r["key_mlbam"] and r["key_bbref"]:
                    mlbam_a_bbref[int(r["key_mlbam"])] = r["key_bbref"]
    bbref_a_lahman = {p["bbrefID"]: pid for pid, p in people.items() if p.get("bbrefID")}

    def id_api(mlbam):
        b = mlbam_a_bbref.get(mlbam)
        if b and b in bbref_a_lahman:
            return bbref_a_lahman[b]
        return f"mlb{mlbam}"

    # Equipos de la API -> teamID de Lahman (por nombre del último año de Lahman)
    nombre_a_lahman = {t["name"]: t["teamID"] for t in teams if t["yearID"] == ULTIMO_LAHMAN}

    # ------------------------------------------------ jugadores
    print("Jugadores…")
    bat = defaultdict(lambda: defaultdict(lambda: [0] * 14))
    for r in batting:
        a = bat[r["playerID"]][r["yearID"]]
        for i, k in enumerate(["G", "AB", "R", "H", "X2B", "X3B", "HR", "RBI", "SB", "BB", "SO", "HBP", "SF", "SH"]):
            a[i] += n(r[k])
    pit = defaultdict(lambda: defaultdict(lambda: [0] * 12))
    for r in pitching:
        a = pit[r["playerID"]][r["yearID"]]
        for i, k in enumerate(["W", "L", "G", "GS", "CG", "SHO", "SV", "IPouts", "H", "ER", "BB", "SO"]):
            a[i] += n(r[k])

    extra_api = {}  # jugadores de la temporada API que no están en Lahman
    personas_api = {r["person"]["id"]: r["person"] for r in roster["roster"]}
    for l in lineas_api:
        pid = id_api(l["persona"])
        s = l["stat"]
        if pid.startswith("mlb"):
            extra_api[pid] = personas_api.get(l["persona"], {"fullName": l["player"]["fullName"]})
        if l["grupo"] == "hitting":
            a = bat[pid][S_API]
            for i, k in enumerate(["gamesPlayed", "atBats", "runs", "hits", "doubles", "triples", "homeRuns",
                                   "rbi", "stolenBases", "baseOnBalls", "strikeOuts", "hitByPitch", "sacFlies", "sacBunts"]):
                a[i] += n(s.get(k))
        else:
            a = pit[pid][S_API]
            for i, k in enumerate(["wins", "losses", "gamesPitched", "gamesStarted", "completeGames", "shutouts",
                                   "saves", "outs", "hits", "earnedRuns", "baseOnBalls", "strikeOuts"]):
                a[i] += n(s.get(k))

    # Posición principal con NYA (Appearances)
    posiciones = defaultdict(lambda: defaultdict(int))
    for r in appearances:
        if r["teamID"] == "NYA" and r["yearID"] >= PRIMER_ANO:
            for k, ab in [("G_p", "P"), ("G_c", "C"), ("G_1b", "1B"), ("G_2b", "2B"), ("G_3b", "3B"),
                          ("G_ss", "SS"), ("G_lf", "LF"), ("G_cf", "CF"), ("G_rf", "RF"), ("G_dh", "DH")]:
                posiciones[r["playerID"]][ab] += n(r[k])
    for r in roster["roster"]:
        pid = id_api(r["person"]["id"])
        ab = r.get("position", {}).get("abbreviation")
        if ab and not posiciones[pid]:
            posiciones[pid][ab] += 1

    salon = {}
    for r in hof:
        salon.setdefault(r["playerID"], (r["yearID"], r["category"]))

    premios_ny = defaultdict(list)  # premios ganados en años con NYA
    anos_ny = defaultdict(set)
    for pid, d in bat.items():
        anos_ny[pid] |= set(d)
    for pid, d in pit.items():
        anos_ny[pid] |= set(d)
    PREMIOS = {"Most Valuable Player": "MVP", "Cy Young Award": "Cy Young", "Rookie of the Year": "Novato del Año",
               "World Series MVP": "MVP de la Serie Mundial", "Triple Crown": "Triple Corona",
               "Pitching Triple Crown": "Triple Corona de pitcheo", "ALCS MVP": "MVP de la Serie de Campeonato",
               "Gold Glove": "Guante de Oro", "Silver Slugger": "Bate de Plata", "Reliever of the Year Award": "Relevista del Año",
               "Hank Aaron Award": "Premio Hank Aaron"}
    for r in awards:
        if r["awardID"] in PREMIOS and r["yearID"] in anos_ny.get(r["playerID"], ()):
            # Confirmar que ese año jugó solo o también con NYA; el premio se lista con el año.
            premios_ny[r["playerID"]].append([r["yearID"], PREMIOS[r["awardID"]]])

    jugadores = {}
    for pid in sorted(anos_ny):
        p = people.get(pid)
        if p:
            nom = nombre(pid)
            nac = [p["birthYear"], p["birthMonth"], p["birthDay"]] if p.get("birthYear") else None
            mue = [p["deathYear"], p["deathMonth"], p["deathDay"]] if p.get("deathYear") else None
            lugar = ", ".join(x for x in [p.get("birthCity"), p.get("birthState"), p.get("birthCountry")] if x)
            debut, final, bats, throws = p.get("debut"), p.get("finalGame"), p.get("bats"), p.get("throws")
        else:
            e = extra_api.get(pid, {})
            nom = e.get("fullName", pid)
            bd = e.get("birthDate")
            nac = [int(x) for x in bd.split("-")] if bd else None
            mue = None
            lugar = ", ".join(x for x in [e.get("birthCity"), e.get("birthStateProvince"), e.get("birthCountry")] if x)
            debut, final = e.get("mlbDebutDate"), None
            bats = e.get("batSide", {}).get("code")
            throws = e.get("pitchHand", {}).get("code")
        pos = posiciones.get(pid, {})
        pos_prin = max(pos, key=pos.get) if pos and max(pos.values()) > 0 else ""
        filas_b = [[a] + v for a, v in sorted(bat[pid].items())] if pid in bat else []
        filas_p = [[a] + v for a, v in sorted(pit[pid].items())] if pid in pit else []
        jugadores[pid] = {
            "n": nom, "nac": nac, "lugar": lugar, "mue": mue, "debut": debut, "final": final,
            "bt": [bats, throws], "pos": pos_prin,
            "hof": salon.get(pid, [None])[0] if pid in salon else None,
            "premios": sorted(premios_ny.get(pid, [])),
            "b": filas_b, "p": filas_p,
        }

    # ------------------------------------------------ temporadas
    print("Temporadas…")
    temporadas = []
    teams_ny = {t["yearID"]: t for t in teams if t["teamID"] == "NYA" and t["yearID"] >= PRIMER_ANO}

    def lideres(ano, g_equipo):
        filas_b = [(pid, d[ano]) for pid, d in bat.items() if ano in d]
        filas_p = [(pid, d[ano]) for pid, d in pit.items() if ano in d]
        out = {}

        def mejor(filas, clave, fmt, menor=False, filtro=lambda v: True):
            cands = [(clave(v), pid) for pid, v in filas if filtro(v)]
            cands = [c for c in cands if c[0] is not None]
            if not cands:
                return None
            v = min(cands)[0] if menor else max(cands)[0]
            if not menor and v <= 0:
                return None
            quienes = sorted([pid for x, pid in cands if x == v], key=nombre_j)
            return {"id": quienes, "v": fmt(v)}

        def nombre_j(pid):
            return jugadores.get(pid, {}).get("n", pid)

        pa = lambda v: v[1] + v[9] + v[11] + v[12] + v[13]
        calif_b = lambda v: pa(v) >= 3.1 * g_equipo
        out["avg"] = mejor(filas_b, lambda v: v[3] / v[1] if v[1] else None,
                           lambda x: f"{x:.3f}".lstrip("0"), filtro=calif_b)
        out["hr"] = mejor(filas_b, lambda v: v[6], str)
        out["rbi"] = mejor(filas_b, lambda v: v[7], str)
        out["h"] = mejor(filas_b, lambda v: v[3], str)
        out["sb"] = mejor(filas_b, lambda v: v[8], str)
        out["w"] = mejor(filas_p, lambda v: v[0], str)
        out["era"] = mejor(filas_p, lambda v: v[9] * 27 / v[7] if v[7] else None,
                           lambda x: f"{x:.2f}", menor=True, filtro=lambda v: v[7] >= 3 * g_equipo)
        out["so"] = mejor(filas_p, lambda v: v[11], str)
        out["sv"] = mejor(filas_p, lambda v: v[6], str)
        return {k: v for k, v in out.items() if v}

    def postemporada(ano):
        res = []
        for r in seriespost:
            if r["yearID"] != ano or "NYA" not in (r["teamIDwinner"], r["teamIDloser"]):
                continue
            gano = r["teamIDwinner"] == "NYA"
            rival = r["teamIDloser"] if gano else r["teamIDwinner"]
            res.append({"ronda": r["round"], "tipo": tipo_ronda(r["round"]), "nombre": RONDAS.get(r["round"], r["round"]),
                        "rival": rival, "rivalN": nombre_equipo.get((ano, rival), rival),
                        "rivalEs": equipo_es(nombre_equipo.get((ano, rival), rival)),
                        "g": n(r["wins"]) if gano else n(r["losses"]),
                        "p": n(r["losses"]) if gano else n(r["wins"]), "e": n(r["ties"]), "gano": gano})
        return sorted(res, key=lambda x: ORDEN_RONDA[x["tipo"]])

    def nombre_mgr(pid):
        return nombre(pid) if pid in people else pid

    for ano in range(PRIMER_ANO, ULTIMO_LAHMAN + 1):
        t = teams_ny[ano]
        mgrs = sorted([m for m in managers if m["yearID"] == ano], key=lambda m: m["inseason"])
        post = postemporada(ano)
        temporadas.append({
            "a": ano, "nombre": t["name"], "lg": t["lgID"], "div": t["divID"], "lugar": n(t["Rank"]),
            "g": n(t["G"]), "w": n(t["W"]), "l": n(t["L"]), "r": n(t["R"]), "ra": n(t["RA"]),
            "hr": n(t["HR"]), "era": t["ERA"], "parque": parque_es(t["park"] or ""), "asist": n(t["attendance"]),
            "mgr": [{"id": m["playerID"], "n": nombre_mgr(m["playerID"]), "w": n(m["W"]), "l": n(m["L"])} for m in mgrs],
            "banderin": t["LgWin"] == "Y", "ws": t["WSWin"] == "Y", "div_gano": t["DivWin"] == "Y",
            "post": post, "lideres": lideres(ano, n(t["G"])),
        })

    # Temporada de la Stats API
    if S_API > ULTIMO_LAHMAN:
        rec = None
        for blk in standings["records"]:
            for tr in blk["teamRecords"]:
                if tr["team"]["id"] == NYY_API:
                    rec = tr
        juegos_api = [g for d in schedule["dates"] for g in d["games"]]
        reg = [g for g in juegos_api if g["gameType"] == "R" and g["status"]["abstractGameState"] == "Final"]
        def lado(g):
            return ("home", "away") if g["teams"]["home"]["team"]["id"] == NYY_API else ("away", "home")
        r_a = sum(g["teams"][lado(g)[0]].get("score", 0) for g in reg)
        ra_a = sum(g["teams"][lado(g)[1]].get("score", 0) for g in reg)
        hr_a = sum(v[6] for d in bat.values() for a, v in d.items() if a == S_API)
        er = sum(v[9] for d in pit.values() for a, v in d.items() if a == S_API)
        ipo = sum(v[7] for d in pit.values() for a, v in d.items() if a == S_API)
        mgr = [c for c in coaches["roster"] if c["job"] == "Manager"]
        mgr_id = id_api(mgr[0]["person"]["id"]) if mgr else None
        if mgr_id and mgr_id.startswith("mlb"):
            mgr_id = None
        # postemporada desde el calendario
        series = defaultdict(lambda: {"g": 0, "p": 0})
        for g in juegos_api:
            if g["gameType"] in ("F", "D", "L", "W") and g["status"]["abstractGameState"] == "Final":
                yo, el = lado(g)
                riv = g["teams"][el]["team"]["name"]
                k = (g["gameType"], riv)
                if g["teams"][yo].get("isWinner"):
                    series[k]["g"] += 1
                else:
                    series[k]["p"] += 1
        mapa_tipo = {"F": ("WC", "ALWC"), "D": ("DS", "ALDS"), "L": ("CS", "ALCS"), "W": ("WS", "WS")}
        post = []
        for (gt, riv), v in series.items():
            tipo, ronda = mapa_tipo[gt]
            necesita = {"WC": 2, "DS": 3, "CS": 4, "WS": 4}[tipo]
            gano = v["g"] >= necesita
            post.append({"ronda": ronda, "tipo": tipo, "nombre": RONDAS.get(ronda, "Serie Divisional" if tipo == "DS" else "Serie de Comodines"),
                         "rival": nombre_a_lahman.get(riv, riv), "rivalN": riv, "rivalEs": equipo_es(riv), "g": v["g"], "p": v["p"], "e": 0,
                         "gano": gano, "completa": gano or v["p"] >= necesita})
        post.sort(key=lambda x: ORDEN_RONDA[x["tipo"]])
        for x in post:
            if x["tipo"] == "DS":
                x["nombre"] = "Serie Divisional"
            if x["tipo"] == "WC":
                x["nombre"] = "Serie de Comodines"
        t_ant = teams_ny[ULTIMO_LAHMAN]
        temporadas.append({
            "a": S_API, "nombre": "New York Yankees", "lg": "AL", "div": "E",
            "lugar": n(rec["divisionRank"]), "g": rec["wins"] + rec["losses"], "w": rec["wins"], "l": rec["losses"],
            "r": r_a, "ra": ra_a, "hr": hr_a, "era": round(er * 27 / ipo, 2) if ipo else None,
            "parque": parque_es(t_ant["park"] or ""), "asist": None,
            "mgr": [{"id": mgr_id, "n": mgr[0]["person"]["fullName"], "w": rec["wins"], "l": rec["losses"]}] if mgr else [],
            "banderin": any(x["tipo"] == "CS" and x["gano"] for x in post),
            "ws": any(x["tipo"] == "WS" and x["gano"] for x in post),
            "div_gano": rec.get("divisionChamp", False) or n(rec["divisionRank"]) == 1,
            "post": post, "lideres": lideres(S_API, rec["wins"] + rec["losses"]), "fuente": "statsapi",
        })

    # ------------------------------------------------ juegos (Retrosheet + API)
    print("Juegos (Retrosheet)…")
    juegos = []
    for ano in range(PRIMER_ANO, ULTIMO_LAHMAN + 1):
        ruta = os.path.join(CRUDO, "retrosheet", f"GL{ano}.TXT")
        for f in leer_gamelog(ruta):
            j = juego_desde_log(f, "R")
            if j:
                juegos.append(j)
    post_logs = []
    for cod, tipo in [("WS", "WS"), ("LC", "CS"), ("DV", "DS"), ("WC", "WC")]:
        for f in leer_gamelog(os.path.join(CRUDO, "retrosheet", f"GL{cod}.TXT")):
            j = juego_desde_log(f, tipo)
            if j and int(j["fecha"][:4]) >= PRIMER_ANO:
                post_logs.append(j)

    # ------------------------------------------------ Series Mundiales
    print("Series Mundiales…")
    mvps_ws = {r["yearID"]: r["playerID"] for r in awards if r["awardID"] == "World Series MVP"}
    mvps_ws_todos = defaultdict(list)
    for r in awards:
        if r["awardID"] == "World Series MVP":
            mvps_ws_todos[r["yearID"]].append(r["playerID"])
    series_out = []
    for t in temporadas:
        for s in t["post"]:
            if s["tipo"] != "WS":
                continue
            ano = t["a"]
            js = sorted([j for j in post_logs if j["tipo"] == "WS" and j["fecha"].startswith(str(ano))],
                        key=lambda j: (j["fecha"], j["num"]))
            juegos_s = []
            for i, j in enumerate(js, 1):
                gp_n, gp_id = nombre_retro(*j["gp"]) if j["gp"][0] else (None, None)
                pp_n, pp_id = nombre_retro(*j["pp"]) if j["pp"][0] else (None, None)
                sv_n, sv_id = nombre_retro(*j["sv"]) if j["sv"][0] else (None, None)
                f = dt.date(int(j["fecha"][:4]), int(j["fecha"][4:6]), int(j["fecha"][6:]))
                res = "E" if j["ny"] == j["op"] else ("G" if j["ny"] > j["op"] else "P")
                juegos_s.append({
                    "n": i, "fecha": f.isoformat(), "local": j["local"], "ny": j["ny"], "op": j["op"], "res": res,
                    "parque": parque_es(parks.get(j["parque"], j["parque"])), "asist": j["asist"], "inn": entradas(j),
                    "lv": carreras_por_entrada(j["linea_v"]), "ll": carreras_por_entrada(j["linea_l"]),
                    "gp": gp_n, "gpId": gp_id, "pp": pp_n, "ppId": pp_id, "sv": sv_n if j["sv"][0] else None,
                    "h_ny": j["h_ny"], "h_op": j["h_op"], "e_ny": j["e_ny"], "e_op": j["e_op"],
                })
            # líderes individuales de la serie
            bp = [r for r in battingpost if r["yearID"] == ano and r["round"] == "WS"]
            pp = [r for r in pitchingpost if r["yearID"] == ano and r["round"] == "WS"]
            bateo = sorted([{
                "id": r["playerID"], "n": nombre(r["playerID"]), "g": n(r["G"]), "ab": n(r["AB"]), "r": n(r["R"]),
                "h": n(r["H"]), "d2": n(r["X2B"]), "d3": n(r["X3B"]), "hr": n(r["HR"]), "rbi": n(r["RBI"]),
                "bb": n(r["BB"]), "so": n(r["SO"]), "sb": n(r["SB"])} for r in bp if n(r["AB"]) > 0],
                key=lambda x: (-(x["h"] + x["hr"] * 2 + x["rbi"]), -x["ab"]))
            pitcheo = sorted([{
                "id": r["playerID"], "n": nombre(r["playerID"]), "g": n(r["G"]), "gs": n(r["GS"]), "w": n(r["W"]),
                "l": n(r["L"]), "sv": n(r["SV"]), "ipo": n(r["IPouts"]), "h": n(r["H"]), "er": n(r["ER"]),
                "bb": n(r["BB"]), "so": n(r["SO"]), "cg": n(r["CG"]), "sho": n(r["SHO"])} for r in pp],
                key=lambda x: (-x["ipo"], x["er"]))
            mvp = [{"id": m, "n": nombre(m), "ny": any(b["id"] == m for b in bateo + pitcheo)} for m in mvps_ws_todos.get(ano, [])]
            serie = {
                "a": ano, "gano": s["gano"], "rival": s["rival"], "rivalN": s["rivalN"], "rivalEs": s["rivalEs"], "g": s["g"], "p": s["p"],
                "e": s["e"], "juegos": juegos_s, "bateo": bateo, "pitcheo": pitcheo, "mvp": mvp,
                "mgr": t["mgr"][-1]["n"] if t["mgr"] else None, "record": [t["w"], t["l"]],
            }
            serie["cronica"] = cronica(serie)
            series_out.append(serie)

    # ------------------------------------------------ juegos sin hit (derivados de Retrosheet)
    sin_hit = []
    for j in juegos + post_logs:
        if j["h_op"] == 0 and j["po_ny"] >= 27:
            perfecto = j["bb_op"] == 0 and j["hbp_op"] == 0 and j["e_ny"] == 0 and j["ci_op"] == 0
            nom, pid = nombre_retro(*j["ab_ny"])
            sin_hit.append({"fecha": j["fecha"], "tipo": j["tipo"], "pitcher": nom, "id": pid, "combinado": j["pu_ny"] > 1,
                            "perfecto": perfecto, "ny": j["ny"], "op": j["op"], "rival": j["rival"], "k": j["k_ny_pit"]})
    sin_hit_contra = []
    for j in juegos + post_logs:
        if j["h_ny"] == 0 and j["outs"] - j["po_ny"] >= 27:
            nom, pid = nombre_retro(*j["ab_op"])
            sin_hit_contra.append({"fecha": j["fecha"], "tipo": j["tipo"], "pitcher": nom, "ny": j["ny"], "op": j["op"],
                                   "rival": j["rival"], "combinado": None})

    # ------------------------------------------------ efemérides
    print("Este día…")
    ef = defaultdict(list)

    def agregar(fecha_txt, ano, tipo, texto, peso, extra=None):
        ef[fecha_txt].append({"a": ano, "t": tipo, "x": texto, "w": peso, **(extra or {})})

    def md(f):
        return f[4:6] + "-" + f[6:8]

    def riv_nombre(j):
        return nombre_equipo.get((int(j["fecha"][:4]), "R:" + j["rival"]), j["rival"])

    # Series Mundiales: cada juego, con el que decide la serie destacado
    for s in series_out:
        for k, j in enumerate(s["juegos"]):
            ultimo = k == len(s["juegos"]) - 1
            f = j["fecha"].replace("-", "")
            if ultimo:
                if s["gano"]:
                    texto = (f"Los Yankees ganan la Serie Mundial de {s['a']} al vencer {j['ny']}-{j['op']} a "
                             f"{equipo_es(s['rivalN'])} en el juego {j['n']}. La serie terminó {s['g']}-{s['p']}"
                             + (f" con {s['e']} empate" + ("s" if s['e'] > 1 else "") if s["e"] else "") + ".")
                    agregar(md(f), s["a"], "titulo", texto, 100)
                else:
                    texto = (f"{equipo_es(s['rivalN'], True)} se llevan la Serie Mundial de {s['a']} al derrotar "
                             f"{j['op']}-{j['ny']} a los Yankees en el juego {j['n']}. La serie terminó {s['p']}-{s['g']}.")
                    agregar(md(f), s["a"], "serie", texto, 40)
            else:
                v = {"G": "ganan", "P": "pierden", "E": "empatan"}[j["res"]]
                texto = (f"Juego {j['n']} de la Serie Mundial de {s['a']}: los Yankees {v} {j['ny']}-{j['op']} ante "
                         f"{equipo_es(s['rivalN'])}" + (f" en {j['inn']} entradas" if j["inn"] > 9 else "") + f", en el {j['parque']}.")
                agregar(md(f), s["a"], "serie", texto, 30)

    # Postemporada (otras rondas): solo los juegos que deciden una serie
    otras = defaultdict(list)
    for j in post_logs:
        if j["tipo"] != "WS":
            otras[(j["fecha"][:4], j["tipo"], j["rival"])].append(j)
    for (ano, tipo, riv), js in otras.items():
        js.sort(key=lambda j: (j["fecha"], j["num"]))
        j = js[-1]
        g = sum(1 for x in js if x["ny"] > x["op"]); p = len(js) - g
        t = next((t for t in temporadas if t["a"] == int(ano)), None)
        nombre_s = next((s["nombre"] for s in (t["post"] if t else []) if s["tipo"] == tipo), "postemporada")
        if j["ny"] > j["op"]:
            texto = f"Los Yankees eliminan a {equipo_es(riv_nombre(j))} en la {nombre_s} de {ano} al ganar {j['ny']}-{j['op']} el juego decisivo ({g}-{p} en la serie)."
            agregar(md(j["fecha"]), int(ano), "post", texto, 60 if tipo == "CS" else 45)
        else:
            texto = f"{equipo_es(riv_nombre(j), True)} eliminan a los Yankees en la {nombre_s} de {ano} con triunfo de {j['op']}-{j['ny']} ({p}-{g} en la serie)."
            agregar(md(j["fecha"]), int(ano), "post", texto, 25)

    # Juegos sin hit y perfectos
    for s in sin_hit:
        f = dt.date(int(s["fecha"][:4]), int(s["fecha"][4:6]), int(s["fecha"][6:]))
        riv = nombre_equipo.get((f.year, "R:" + s["rival"]), s["rival"])
        donde = " en la Serie Mundial" if s["tipo"] == "WS" else (" en postemporada" if s["tipo"] != "R" else "")
        if s["perfecto"]:
            texto = f"{s['pitcher']} lanza un juego perfecto{donde}: los Yankees vencen {s['ny']}-{s['op']} a {equipo_es(riv)}. Ningún bateador rival llegó a base."
            agregar(md(s["fecha"]), f.year, "perfecto", texto, 95, {"id": s["id"]})
        elif s["combinado"]:
            texto = f"Juego sin hit combinado de los Yankees{donde}, abierto por {s['pitcher']}: {s['ny']}-{s['op']} sobre {equipo_es(riv)}."
            agregar(md(s["fecha"]), f.year, "sinhit", texto, 80, {"id": s["id"]})
        else:
            res = "ganan" if s["ny"] > s["op"] else "pierden"
            texto = f"{s['pitcher']} lanza un juego sin hit{donde}; los Yankees {res} {s['ny']}-{s['op']} ante {equipo_es(riv)}."
            agregar(md(s["fecha"]), f.year, "sinhit", texto, 85, {"id": s["id"]})

    for s in sin_hit_contra:
        f = int(s["fecha"][:4])
        riv = nombre_equipo.get((f, "R:" + s["rival"]), s["rival"])
        agregar(md(s["fecha"]), f, "contra",
                f"{s['pitcher']}, de {equipo_es(riv)}, abre un juego en el que los Yankees no conectan hit; marcador final {s['op']}-{s['ny']}.", 35)

    # Inauguraciones de parques y primeros juegos
    por_parque = defaultdict(list)
    for j in juegos:
        if j["local"]:
            por_parque[j["parque"]].append(j)
    for parque, js in por_parque.items():
        js.sort(key=lambda j: (j["fecha"], j["num"]))
        if len(js) < 150:  # solo casas habituales, no sedes ocasionales
            continue
        a, z = js[0], js[-1]
        nomp = parque_es(parks.get(parque, parque))
        res = lambda j: "ganan" if j["ny"] > j["op"] else ("pierden" if j["ny"] < j["op"] else "empatan")
        if int(a["fecha"][:4]) > PRIMER_ANO or True:
            agregar(md(a["fecha"]), int(a["fecha"][:4]), "parque",
                    f"Primer juego de los Yankees como locales en el {nomp}: {res(a)} {a['ny']}-{a['op']} ante {equipo_es(riv_nombre(a))}"
                    + (f", con {miles(a['asist'])} aficionados." if a["asist"] else "."), 90)
        if int(z["fecha"][:4]) < ULTIMO_LAHMAN:
            agregar(md(z["fecha"]), int(z["fecha"][:4]), "parque",
                    f"Último juego de los Yankees como locales en el {nomp}: {res(z)} {z['ny']}-{z['op']} ante {equipo_es(riv_nombre(z))}.", 80)

    # Juegos de 18 o más entradas y palizas récord
    for j in juegos:
        inn = entradas(j)
        if inn >= 18:
            res = "ganan" if j["ny"] > j["op"] else ("pierden" if j["ny"] < j["op"] else "empatan")
            agregar(md(j["fecha"]), int(j["fecha"][:4]), "maraton",
                    f"Maratón de {inn} entradas: los Yankees {res} {j['ny']}-{j['op']} ante {equipo_es(riv_nombre(j))}.", 50)
        if j["ny"] - j["op"] >= 18 or j["ny"] >= 22:
            agregar(md(j["fecha"]), int(j["fecha"][:4]), "paliza",
                    f"Los Yankees anotan {j['ny']} carreras y vencen {j['ny']}-{j['op']} a {equipo_es(riv_nombre(j))}.", 45)

    # Día inaugural de cada temporada
    por_ano = defaultdict(list)
    for j in juegos:
        por_ano[j["fecha"][:4]].append(j)
    for ano, js in por_ano.items():
        js.sort(key=lambda j: (j["fecha"], j["num"]))
        a = js[0]
        res = "ganan" if a["ny"] > a["op"] else ("pierden" if a["ny"] < a["op"] else "empatan")
        agregar(md(a["fecha"]), int(ano), "inaugural",
                f"Día inaugural de {ano}: los Yankees {res} {a['ny']}-{a['op']} " + ("en casa" if a["local"] else "de visita")
                + f" ante {equipo_es(riv_nombre(a))}.", 20)

    # Debuts en Grandes Ligas con los Yankees, nacimientos y fallecimientos
    juegos_ny = {pid: sum(v[0] for v in d.values()) for pid, d in bat.items()}
    for pid, d in pit.items():
        juegos_ny[pid] = max(juegos_ny.get(pid, 0), sum(v[2] for v in d.values()))
    equipos_debut = defaultdict(set)
    for r in appearances:
        p = people.get(r["playerID"])
        if p and p.get("debut") and str(p["debut"])[:4] == str(r["yearID"]):
            equipos_debut[r["playerID"]].add(r["teamID"])

    def peso_jugador(pid):
        g = juegos_ny.get(pid, 0)
        w = min(70, 5 + g // 25)
        if pid in salon:
            w += 15
        return w

    for pid, j in jugadores.items():
        g = juegos_ny.get(pid, 0)
        p = people.get(pid)
        if p and p.get("debut") and equipos_debut.get(pid) == {"NYA"} and g >= 50:
            f = p["debut"]
            agregar(f[5:7] + "-" + f[8:10], int(f[:4]), "debut",
                    f"{j['n']} debuta en Grandes Ligas con los Yankees. Jugaría {g} partidos con el equipo.", peso_jugador(pid), {"id": pid})
        if g >= 100 or pid in salon:
            if j["nac"] and len(j["nac"]) == 3 and all(j["nac"]):
                y, m, d_ = j["nac"]
                lugar = f" en {j['lugar']}" if j["lugar"] else ""
                agregar(f"{m:02d}-{d_:02d}", y, "nacimiento", f"Nace {j['n']}{lugar}.", peso_jugador(pid) - 5, {"id": pid})
            if j["mue"] and len(j["mue"]) == 3 and all(j["mue"]):
                y, m, d_ = j["mue"]
                agregar(f"{m:02d}-{d_:02d}", y, "fallecimiento", f"Muere {j['n']}.", peso_jugador(pid) - 8, {"id": pid})

    # Juegos de la temporada de la API (postemporada)
    if S_API > ULTIMO_LAHMAN:
        js = [g for d in schedule["dates"] for g in d["games"] if g["status"]["abstractGameState"] == "Final"]
        js.sort(key=lambda g: g["gameDate"])
        for g in js:
            if g["gameType"] == "R":
                continue
        # decisiones de serie
        ult = {}
        for g in js:
            if g["gameType"] in ("F", "D", "L", "W"):
                riv = g["teams"]["away" if g["teams"]["home"]["team"]["id"] == NYY_API else "home"]["team"]["name"]
                ult[(g["gameType"], riv)] = g
        t = temporadas[-1]
        for (gt, riv), g in ult.items():
            s = next(x for x in t["post"] if x["rivalN"] == riv)
            if not s.get("completa"):
                continue
            yo = "home" if g["teams"]["home"]["team"]["id"] == NYY_API else "away"
            el = "away" if yo == "home" else "home"
            a, b = g["teams"][yo]["score"], g["teams"][el]["score"]
            f = g["officialDate"]
            if s["gano"]:
                texto = f"Los Yankees eliminan a {equipo_es(riv)} en la {s['nombre']} de {S_API} al ganar {a}-{b} el juego decisivo ({s['g']}-{s['p']} en la serie)."
                agregar(f[5:], S_API, "post", texto, 45)
            else:
                texto = f"{equipo_es(riv, True)} eliminan a los Yankees en la {s['nombre']} de {S_API} con triunfo de {b}-{a} ({s['p']}-{s['g']} en la serie)."
                agregar(f[5:], S_API, "post", texto, 25)
        reg = [g for g in js if g["gameType"] == "R"]
        if reg:
            g = reg[0]
            yo = "home" if g["teams"]["home"]["team"]["id"] == NYY_API else "away"
            el = "away" if yo == "home" else "home"
            a, b = g["teams"][yo]["score"], g["teams"][el]["score"]
            res = "ganan" if a > b else "pierden"
            agregar(g["officialDate"][5:], S_API, "inaugural",
                    f"Día inaugural de {S_API}: los Yankees {res} {a}-{b} " + ("en casa" if yo == "home" else "de visita")
                    + f" ante {equipo_es(g['teams'][el]['team']['name'])}.", 20)

    # Récord histórico en cada fecha del calendario (temporada regular)
    rec_fecha = defaultdict(lambda: [0, 0, 0])
    for j in juegos:
        k = md(j["fecha"])
        rec_fecha[k][0 if j["ny"] > j["op"] else (1 if j["ny"] < j["op"] else 2)] += 1
    if S_API > ULTIMO_LAHMAN:
        for d in schedule["dates"]:
            for g in d["games"]:
                if g["gameType"] == "R" and g["status"]["abstractGameState"] == "Final":
                    yo = "home" if g["teams"]["home"]["team"]["id"] == NYY_API else "away"
                    rec_fecha[g["officialDate"][5:]][0 if g["teams"][yo].get("isWinner") else 1] += 1

    # Respaldo: si una fecha tiene menos de tres efemérides, se agregan el mejor
    # triunfo de esa fecha y nacimientos/fallecimientos de cualquier jugador del equipo.
    mejor_fecha = {}
    for j in juegos:
        k = md(j["fecha"])
        if j["ny"] > j["op"] and (k not in mejor_fecha or j["ny"] - j["op"] > mejor_fecha[k]["ny"] - mejor_fecha[k]["op"]):
            mejor_fecha[k] = j
    for k, j in mejor_fecha.items():
        if len(ef.get(k, [])) < 3:
            agregar(k, int(j["fecha"][:4]), "juego",
                    f"El triunfo más amplio de los Yankees en un {int(k[3:])} de {MESES[int(k[:2]) - 1]}: "
                    f"{j['ny']}-{j['op']} sobre {equipo_es(riv_nombre(j))}.", 15)
    for pid, j in jugadores.items():
        g = juegos_ny.get(pid, 0)
        if g >= 100 or pid in salon:
            continue
        for campo, verbo, tipo in (("nac", "Nace", "nacimiento"), ("mue", "Muere", "fallecimiento")):
            v = j[campo]
            if v and len(v) == 3 and all(v):
                k = f"{v[1]:02d}-{v[2]:02d}"
                if len(ef.get(k, [])) < 3:
                    agregar(k, v[0], tipo, f"{verbo} {j['n']}, que jugó {g} partido{'s' if g != 1 else ''} con los Yankees.", 3, {"id": pid})

    efemerides = {}
    inicio = dt.date(2024, 1, 1)  # año bisiesto: incluye el 29 de febrero
    for i in range(366):
        f = inicio + dt.timedelta(days=i)
        k = f"{f.month:02d}-{f.day:02d}"
        evs = sorted(ef.get(k, []), key=lambda e: (-e["w"], e["a"]))
        efemerides[k] = {"ev": evs, "rec": rec_fecha.get(k)}
    vacias = [k for k, v in efemerides.items() if not v["ev"]]
    print(f"  fechas sin efeméride: {len(vacias)} {vacias[:10]}")

    # ------------------------------------------------ Monument Park (números retirados)
    print("Números retirados…")
    retirados = leer_retirados(os.path.join(CRUDO, "mlbcom", "retired-numbers.html"))
    por_nombre = defaultdict(list)
    for pid, j in jugadores.items():
        por_nombre[normaliza(j["n"])].append(pid)
    mgr_ids = {m["playerID"] for m in managers}
    for r in retirados:
        cands = por_nombre.get(normaliza(r["n"]), [])
        if not cands:  # mánagers que no jugaron con NYA (Stengel, Torre)
            cands = [pid for pid in mgr_ids if normaliza(nombre(pid)) == normaliza(r["n"])]
        r["id"] = cands[0] if len(cands) == 1 else None
        r["mgr"] = None
        if r["id"] in mgr_ids:
            ms = [m for m in managers if m["playerID"] == r["id"]]
            r["mgr"] = {"anos": sorted({m["yearID"] for m in ms}), "w": sum(n(m["W"]) for m in ms), "l": sum(n(m["L"]) for m in ms),
                        "ws": sorted({m["yearID"] for m in ms if teams_ny[m["yearID"]]["WSWin"] == "Y"})}
        if r["id"] and r["id"] not in jugadores and r["id"] in people:
            p = people[r["id"]]
            r["ficha"] = {"nac": [p["birthYear"], p["birthMonth"], p["birthDay"]],
                          "mue": [p["deathYear"], p["deathMonth"], p["deathDay"]] if p.get("deathYear") else None,
                          "lugar": ", ".join(x for x in [p.get("birthCity"), p.get("birthState"), p.get("birthCountry")] if x),
                          "hof": salon.get(r["id"], [None])[0]}

    # ------------------------------------------------ meta
    meta = {
        "generado": dt.date.today().isoformat(),
        "lahman": {"version": "14.0 (datos 1871-%d)" % ULTIMO_LAHMAN, "ultimo": ULTIMO_LAHMAN},
        "api": {"temporada": S_API},
        "retrosheet_ultimo": ULTIMO_LAHMAN,
        "sin_hit": [{**s, "fecha": f"{s['fecha'][:4]}-{s['fecha'][4:6]}-{s['fecha'][6:]}",
                     "rivalN": nombre_equipo.get((int(s["fecha"][:4]), "R:" + s["rival"]), s["rival"])} for s in sin_hit],
    }

    print("Escribiendo data/…")
    escribir("temporadas", temporadas)
    escribir("jugadores", jugadores)
    escribir("series", series_out)
    escribir("efemerides", efemerides)
    escribir("retirados", retirados)
    escribir("meta", meta)


# ---------------------------------------------------------------- crónica

def cronica(s):
    """Crónica breve, sobria, construida solo con los datos de la serie."""
    js = s["juegos"]
    partes = []
    total = f"{s['g']}-{s['p']}" + (f" (con {s['e']} empate{'s' if s['e'] > 1 else ''})" if s["e"] else "")
    if s["gano"]:
        if s["p"] == 0:
            partes.append(f"Barrida. Los Yankees de {s['mgr']} despacharon a {equipo_es(s['rivalN'])} en {len(js)} juegos, sin conocer la derrota.")
        else:
            partes.append(f"Los Yankees de {s['mgr']}, que habían ganado {s['record'][0]} juegos en la temporada regular, vencieron {total} a {equipo_es(s['rivalN'])}.")
    else:
        if s["g"] == 0:
            partes.append(f"{equipo_es(s['rivalN'], True)} barrieron a los Yankees de {s['mgr']} en {len(js)} juegos.")
        else:
            partes.append(f"{equipo_es(s['rivalN'], True)} se impusieron {s['p']}-{s['g']} a los Yankees de {s['mgr']}, que venían de ganar {s['record'][0]} juegos en la temporada regular.")
    # remontada o ventaja perdida
    g = p = 0
    max_def = 0
    for j in js:
        if j["res"] == "G": g += 1
        elif j["res"] == "P": p += 1
        max_def = max(max_def, p - g)
    if s["gano"] and max_def >= 2:
        partes.append(f"Llegaron a estar abajo por {max_def} juegos en la serie y remontaron.")
    elif s["gano"] and js and js[0]["res"] == "P" and s["p"] > 0:
        partes.append("Perdieron el primer juego y respondieron.")
    # juego más largo / cerrado
    largos = [j for j in js if j["inn"] > 9]
    if largos:
        j = max(largos, key=lambda j: j["inn"])
        v = {"G": "ganaron", "P": "perdieron", "E": "empataron"}[j["res"]]
        partes.append(f"El juego {j['n']} se fue a {j['inn']} entradas y lo {v} {j['ny']}-{j['op']}.")
    goleada = max(js, key=lambda j: j["ny"] - j["op"]) if js else None
    if goleada and goleada["ny"] - goleada["op"] >= 7:
        partes.append(f"La mayor diferencia llegó en el juego {goleada['n']}: {goleada['ny']}-{goleada['op']}.")
    # figura ofensiva y de pitcheo
    if s["bateo"]:
        b = s["bateo"][0]
        prom = f"{b['h'] / b['ab']:.3f}".lstrip("0") if b["ab"] else "-"
        txt = f"{b['n']} bateó {b['h']} de {b['ab']} ({prom})"
        extras = []
        if b["hr"]: extras.append(f"{b['hr']} jonrón" + ("es" if b["hr"] > 1 else ""))
        if b["rbi"]: extras.append(f"{b['rbi']} carrera" + ("s" if b["rbi"] > 1 else "") + " impulsada" + ("s" if b["rbi"] > 1 else ""))
        if extras: txt += " con " + " y ".join(extras)
        partes.append(txt + ".")
    if s["pitcheo"]:
        p_ = max(s["pitcheo"], key=lambda x: (x["w"], x["ipo"], -x["er"]))
        if p_["ipo"] >= 15:
            era = p_["er"] * 27 / p_["ipo"]
            txt = f"En la loma, {p_['n']} trabajó {ip_texto(p_['ipo'])} entradas"
            if p_["w"] or p_["l"]:
                txt += f" con marca de {p_['w']}-{p_['l']}"
            txt += f" y efectividad de {era:.2f}."
            partes.append(txt)
    ny_mvp = [m for m in s["mvp"] if m["ny"]]
    if ny_mvp:
        partes.append(f"{' y '.join(m['n'] for m in ny_mvp)} fue nombrado Jugador Más Valioso de la Serie.")
    elif s["mvp"]:
        partes.append(f"El Jugador Más Valioso de la Serie fue {' y '.join(m['n'] for m in s['mvp'])}, del equipo rival.")
    return " ".join(partes)


# ---------------------------------------------------------------- MLB.com

def normaliza(s):
    import unicodedata
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z ]", "", s).replace("  ", " ").strip()


def leer_retirados(ruta):
    t = open(ruta, encoding="utf-8", errors="ignore").read()
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", t, flags=re.S)
    t = re.sub(r"<[^>]+>", "\n", t)
    lineas = [html.unescape(l).strip() for l in t.split("\n")]
    lineas = [l for l in lineas if l]
    out = []
    for i, l in enumerate(lineas):
        m = re.fullmatch(r"#(\d+)", l)
        if not m or i == 0:
            continue
        nom = lineas[i - 1]
        bloque = []
        for b in lineas[i + 1:i + 12]:
            if re.fullmatch(r"#\d+", b):
                break
            bloque.append(b)
        patron = r"retired (?:throughout baseball )?in (\d{4})"
        ano = next((re.search(patron, b).group(1) for b in bloque if re.search(patron, b)), None)
        if not ano:
            continue
        out.append({"num": int(m.group(1)), "n": nom, "retirado": int(ano),
                    "toda_mlb": any("throughout baseball" in b for b in bloque)})
    return out


if __name__ == "__main__":
    main()
