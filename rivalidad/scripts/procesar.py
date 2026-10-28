#!/usr/bin/env python3
"""Procesa los datos crudos (scripts/raw/) y genera rivalidad/data/*.json y *.js.

Lee los game logs de Retrosheet (formato documentado en
https://www.retrosheet.org/gamelogs/glfields.txt), los juegos de 2026 y las
tablas de posiciones de la MLB Stats API, y produce:

  data/juegos.json      todos los juegos NYY–BOS desde 1903
  data/temporadas.json  resumen por temporada
  data/resumen.json     marcador histórico y fuentes
  data/parques.json     catálogo de parques usados

Cada JSON se duplica como .js (window.RIVALIDAD.<clave> = ...) para que la
página abra desde file:// sin servidor. momentos.json se edita a mano y aquí
solo se valida y se convierte a .js.

Uso: python3 procesar.py
"""
import csv
import datetime as dt
import glob
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(AQUI, "raw")
DATA = os.path.join(os.path.dirname(AQUI), "data")

PRIMER_ANIO = 1903
RS = {"NYA": "NYY", "BOS": "BOS"}          # códigos Retrosheet → nuestros
MLB_ID = {147: "NYY", 111: "BOS"}
SERIES = {"F": "ALWC", "D": "ALDS", "L": "ALCS", "W": "WS"}

AVISO_RETROSHEET = ("The information used here was obtained free of charge from and is "
                    "copyrighted by Retrosheet. Interested parties may contact Retrosheet "
                    "at \"www.retrosheet.org\".")

# Posiciones de los campos en el game log de Retrosheet (índice base 0).
F_FECHA, F_NUM, F_DIA, F_VIS, F_HOME, F_VSC, F_HSC, F_OUTS, F_DN = 0, 1, 2, 3, 6, 9, 10, 11, 12
F_FORFEIT, F_PARQUE, F_ASIST, F_DUR, F_VLINE, F_HLINE = 14, 16, 17, 18, 19, 20
F_VOF, F_HOF = 21, 49                      # inicio del bloque ofensivo (AB, H, 2B, 3B, HR, ...)
F_VDEF, F_HDEF = 43, 71                    # inicio del bloque defensivo (PO, A, E, ...)
F_MGR_V, F_MGR_H = 90, 92                  # nombres de managers
F_WP, F_LP, F_SV = 94, 96, 98              # nombres de lanzadores ganador/perdedor/salvamento
F_ST_V, F_ST_H = 102, 104                  # nombres de abridores
F_INFO = 159


def entero(s):
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


def positivo(v):
    """Retrosheet usa -1 o vacío cuando no conoce el dato."""
    return v if v is not None and v >= 0 else None


def tipo_de_archivo(nombre):
    base = os.path.basename(nombre)
    return {"glws.txt": "W", "gllc.txt": "L", "gldv.txt": "D", "glwc.txt": "F"}.get(base, "R")


def leer_retrosheet():
    juegos = []
    rutas = glob.glob(os.path.join(RAW, "retrosheet", "gl*.txt"))
    for ruta in sorted(rutas):
        tipo = tipo_de_archivo(ruta)
        with open(ruta, newline="", encoding="latin-1") as f:
            for fila in csv.reader(f):
                if len(fila) < 105:
                    continue
                vis, home = fila[F_VIS], fila[F_HOME]
                if {vis, home} != {"NYA", "BOS"}:
                    continue
                anio = int(fila[F_FECHA][:4])
                if anio < PRIMER_ANIO:
                    continue
                juegos.append(convertir_retrosheet(fila, tipo))
    return juegos


def convertir_retrosheet(f, tipo):
    vis, home = RS[f[F_VIS]], RS[f[F_HOME]]
    vsc, hsc = int(f[F_VSC]), int(f[F_HSC])
    outs = entero(f[F_OUTS])
    fecha = f[F_FECHA]
    anio = int(fecha[:4])
    # El juego de desempate del 2 de octubre de 1978 (Fenway Park, NYY 5–BOS 4) está
    # en el archivo de temporada regular porque cuenta oficialmente como regular;
    # es el único juego de desempate entre los dos equipos.
    if tipo == "R" and fecha == "19781002":
        tipo = "T"
    j = {
        "id": f"{fecha}-{f[F_NUM]}",
        "fecha": f"{fecha[:4]}-{fecha[4:6]}-{fecha[6:]}",
        "temporada": anio,
        "tipo": tipo,
        "serie": SERIES.get(tipo),
        "numJuego": entero(f[F_NUM]) if f[F_NUM].isdigit() else f[F_NUM],
        "dia": f[F_DIA],
        "local": home,
        "visita": vis,
        "carreras": {vis: vsc, home: hsc},
        "hits": {vis: positivo(entero(f[F_VOF + 1])), home: positivo(entero(f[F_HOF + 1]))},
        "errores": {vis: positivo(entero(f[F_VDEF + 2])), home: positivo(entero(f[F_HDEF + 2]))},
        "jonrones": {vis: positivo(entero(f[F_VOF + 4])), home: positivo(entero(f[F_HOF + 4]))},
        "entradas": {vis: f[F_VLINE] or None, home: f[F_HLINE] or None},
        "outs": outs,
        "numEntradas": num_entradas(f[F_VLINE], f[F_HLINE], outs),
        "ganador": vis if vsc > hsc else home if hsc > vsc else None,
        "margen": abs(vsc - hsc),
        "parque": f[F_PARQUE] or None,
        "asistencia": positivo(entero(f[F_ASIST])) or None,
        "duracionMin": positivo(entero(f[F_DUR])) or None,
        "diaNoche": f[F_DN] or None,
        "lanzadores": {
            "ganador": nombre(f[F_WP]), "perdedor": nombre(f[F_LP]), "salvamento": nombre(f[F_SV]),
            "abridor" + vis: nombre(f[F_ST_V]), "abridor" + home: nombre(f[F_ST_H]),
        },
        "managers": {vis: nombre(f[F_MGR_V]), home: nombre(f[F_MGR_H])},
        "fuente": "retrosheet",
    }
    if f[F_FORFEIT]:
        j["forfeit"] = f[F_FORFEIT]
    if f[F_INFO]:
        j["nota"] = f[F_INFO]
    return j


def nombre(s):
    return s if s and s != "(none)" else None


def num_entradas(vline, hline, outs):
    """Número de entradas jugadas, a partir del linescore (los dígitos ≥10 van entre paréntesis)."""
    def contar(line):
        n, i = 0, 0
        while i < len(line):
            if line[i] == "(":
                i = line.index(")", i) + 1
            else:
                i += 1
            n += 1
        return n
    if vline:
        return max(contar(vline), contar(hline or ""))
    if outs:
        return -(-outs // 6)
    return None


def linescore_mlb(innings, lado):
    partes = []
    for e in innings:
        r = e.get(lado, {}).get("runs")
        if r is None:
            partes.append("x")
        elif r >= 10:
            partes.append(f"({r})")
        else:
            partes.append(str(r))
    return "".join(partes) or None


def leer_mlb_juegos():
    juegos = []
    for ruta in sorted(glob.glob(os.path.join(RAW, "mlb", "juegos_*.json"))):
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
        for fecha in d.get("dates", []):
            for g in fecha["games"]:
                if g["status"].get("codedGameState") != "F":
                    continue           # pospuestos, suspendidos o no jugados
                juegos.append(convertir_mlb(g))
    return juegos


def convertir_mlb(g):
    away, home = g["teams"]["away"], g["teams"]["home"]
    vis, loc = MLB_ID[away["team"]["id"]], MLB_ID[home["team"]["id"]]
    vsc, hsc = away["score"], home["score"]
    ls = g.get("linescore", {})
    innings = ls.get("innings", [])
    lst = ls.get("teams", {})
    tipo = g["gameType"]
    fecha = g["officialDate"]
    num = g.get("gameNumber", 1)
    num_rs = 0 if not g.get("doubleHeader", "N") in ("Y", "S") else num
    dec = g.get("decisions", {})
    outs = None
    if innings:
        outs = len(innings) * 6
        ultima = innings[-1]
        if ultima.get("home", {}).get("runs") is None:
            outs -= 3
    dia = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][dt.date.fromisoformat(fecha).weekday()]
    venue = g.get("venue", {})
    return {
        "id": f"{fecha.replace('-', '')}-{num_rs}",
        "fecha": fecha,
        "temporada": int(g["season"]),
        "tipo": tipo,
        "serie": SERIES.get(tipo),
        "numJuego": num_rs,
        "dia": dia,
        "local": loc,
        "visita": vis,
        "carreras": {vis: vsc, loc: hsc},
        "hits": {vis: lst.get("away", {}).get("hits"), loc: lst.get("home", {}).get("hits")},
        "errores": {vis: lst.get("away", {}).get("errors"), loc: lst.get("home", {}).get("errors")},
        "jonrones": {vis: None, loc: None},
        "entradas": {vis: linescore_mlb(innings, "away"), loc: linescore_mlb(innings, "home")},
        "outs": outs,
        "numEntradas": len(innings) or None,
        "ganador": vis if vsc > hsc else loc if hsc > vsc else None,
        "margen": abs(vsc - hsc),
        "parque": parque_mlb(venue, loc),
        "asistencia": None,
        "duracionMin": None,
        "diaNoche": {"day": "D", "night": "N"}.get(g.get("dayNight")),
        "lanzadores": {
            "ganador": dec.get("winner", {}).get("fullName"),
            "perdedor": dec.get("loser", {}).get("fullName"),
            "salvamento": dec.get("save", {}).get("fullName"),
            "abridor" + vis: (away.get("probablePitcher") or {}).get("fullName"),
            "abridor" + loc: (home.get("probablePitcher") or {}).get("fullName"),
        },
        "managers": {vis: None, loc: None},
        "fuente": "mlb",
        "mlbGamePk": g["gamePk"],
    }


def parque_mlb(venue, local):
    n = (venue or {}).get("name", "")
    if "Fenway" in n:
        return "BOS07"
    if "Yankee Stadium" in n:
        return "NYC21"
    return n or None


def leer_parques(codigos):
    parques = {}
    ruta = os.path.join(RAW, "retrosheet", "parkcode.txt")
    with open(ruta, newline="", encoding="latin-1") as f:
        for fila in csv.DictReader(f):
            if fila["PARKID"] in codigos:
                parques[fila["PARKID"]] = {"nombre": fila["NAME"], "ciudad": fila["CITY"],
                                           "estado": fila["STATE"],
                                           "alias": fila["AKA"] or None}
    for c in codigos:
        if c and c not in parques:
            parques[c] = {"nombre": c, "ciudad": None, "estado": None, "alias": None}
    return parques


def nombre_grupo(record, anio):
    div = record.get("division")
    if div and anio >= 1969:
        return {201: "Este de la Liga Americana", 202: "Central de la Liga Americana",
                200: "Oeste de la Liga Americana"}.get(div.get("id"), "Liga Americana")
    return "Liga Americana"


def leer_posiciones(anio):
    ruta = os.path.join(RAW, "mlb", f"standings_{anio}.json")
    if not os.path.exists(ruta):
        return None
    with open(ruta, encoding="utf-8") as f:
        d = json.load(f)
    equipos = {}
    with open(os.path.join(RAW, "mlb", f"equipos_{anio}.json"), encoding="utf-8") as f:
        for t in json.load(f)["teams"]:
            equipos[t["id"]] = t["name"]
    for rec in d.get("records", []):
        ids = {t["team"]["id"] for t in rec["teamRecords"]}
        if not {147, 111} <= ids:
            continue
        grupo = nombre_grupo(rec, anio)
        salida = {"grupo": grupo}
        clave_lugar = "divisionRank" if anio >= 1969 else "leagueRank"
        lider = None
        primero = min(rec["teamRecords"], key=lambda t: entero(t.get(clave_lugar)) or 99)
        for t in rec["teamRecords"]:
            lugar = entero(t.get(clave_lugar))
            if lugar == 1:
                lider = equipos.get(t["team"]["id"], t["team"]["name"])
            if t["team"]["id"] in MLB_ID:
                # Juegos detrás calculados a partir de los récords, porque la API deja "-"
                # en empates (p. ej. Yankees y Blue Jays 94-68 en 2025).
                jd = ((primero["wins"] - t["wins"]) + (t["losses"] - primero["losses"])) / 2
                salida[MLB_ID[t["team"]["id"]]] = {
                    "g": t["wins"], "p": t["losses"], "lugar": lugar,
                    "jd": "-" if lugar == 1 else f"{jd:g}", "nombre": equipos.get(t["team"]["id"]),
                }
        salida["lider"] = lider
        salida["equiposEnGrupo"] = len(rec["teamRecords"])
        return salida
    return None


# Notas de contexto para temporadas atípicas (hechos documentados, no cálculos).
NOTAS_TEMPORADA = {
    1904: "No hubo Serie Mundial: los Giants de Nueva York (LN) se negaron a jugarla. "
          "El banderín de la Liga Americana se decidió en los últimos juegos entre ambos.",
    1918: "Temporada acortada por la Primera Guerra Mundial.",
    1981: "Temporada dividida en dos mitades por la huelga de jugadores; la tabla muestra el "
          "récord global. Los Yankees ganaron la primera mitad del Este.",
    1994: "La huelga de jugadores canceló el resto de la temporada y la postemporada en agosto.",
    1995: "Temporada de 144 juegos por la huelga de 1994–95.",
    2020: "Temporada de 60 juegos por la pandemia de COVID-19.",
}


def resumir_temporadas(juegos, hasta):
    por_anio = {}
    for j in juegos:
        por_anio.setdefault(j["temporada"], []).append(j)
    acum = {"NYY": 0, "BOS": 0, "empates": 0}
    acum_post = {"NYY": 0, "BOS": 0}
    temporadas = []
    for anio in range(PRIMER_ANIO, hasta + 1):
        js = por_anio.get(anio, [])
        reg = {"NYY": 0, "BOS": 0, "empates": 0}
        post = {"NYY": 0, "BOS": 0, "serie": None}
        for j in js:
            if j["tipo"] in ("R", "T"):
                if j["ganador"]:
                    reg[j["ganador"]] += 1
                else:
                    reg["empates"] += 1
            else:
                post[j["ganador"]] += 1
                post["serie"] = {"nombre": j["serie"], "NYY": post["NYY"], "BOS": post["BOS"]}
        if post["serie"]:
            s = post["serie"]
            s["ganador"] = "NYY" if s["NYY"] > s["BOS"] else "BOS"
        for k in acum:
            acum[k] += reg[k]
        acum_post["NYY"] += post["NYY"]
        acum_post["BOS"] += post["BOS"]
        decididos = [j for j in js if j["ganador"]]
        cerrados = sorted(decididos, key=lambda j: (j["margen"], -(j["numEntradas"] or 0), j["fecha"]))[:3]
        carreras = sorted(js, key=lambda j: (-sum(j["carreras"].values()), j["fecha"]))[:3]
        temporadas.append({
            "temporada": anio,
            "regular": reg,
            "postemporada": post,
            "acumulado": dict(acum),
            "acumuladoPost": dict(acum_post),
            "posiciones": leer_posiciones(anio),
            "masCerrados": [j["id"] for j in cerrados],
            "masCarreras": [j["id"] for j in carreras],
            "juegos": len(js),
            "sinJuegos": len(js) == 0,
            "nota": NOTAS_TEMPORADA.get(anio),
        })
    return temporadas


def resumen(juegos, temporadas, hasta):
    ultima = temporadas[-1]
    reg = dict(ultima["acumulado"])
    reg["juegos"] = sum(1 for j in juegos if j["tipo"] in ("R", "T"))
    series = [dict(t["postemporada"]["serie"], temporada=t["temporada"])
              for t in temporadas if t["postemporada"]["serie"]]
    post = dict(ultima["acumuladoPost"])
    post["juegos"] = sum(1 for j in juegos if j["tipo"] not in ("R", "T"))
    post["series"] = series
    post["seriesGanadas"] = {"NYY": sum(1 for s in series if s["ganador"] == "NYY"),
                             "BOS": sum(1 for s in series if s["ganador"] == "BOS")}
    return {
        "generado": dt.date.today().isoformat(),
        "primeraTemporada": PRIMER_ANIO,
        "ultimaTemporada": hasta,
        "regular": reg,
        "postemporada": post,
        "total": {"NYY": reg["NYY"] + post["NYY"], "BOS": reg["BOS"] + post["BOS"],
                  "empates": reg["empates"], "juegos": reg["juegos"] + post["juegos"]},
        "primerJuego": juegos[0]["id"],
        "ultimoJuego": juegos[-1]["id"],
        "fuentes": [
            {"nombre": "Retrosheet — Game Logs (temporada regular 1903–2025 y postemporada)",
             "url": "https://www.retrosheet.org/gamelogs/index.html",
             "nota": "Pizarras, linescores, lanzadores, managers, parques, asistencia y duración."},
            {"nombre": "Retrosheet — Catálogo de parques (parkcode.txt)",
             "url": "https://www.retrosheet.org/parkcode.txt",
             "nota": "Nombres y ciudades de los estadios."},
            {"nombre": "MLB Stats API (statsapi.mlb.com)",
             "url": "https://statsapi.mlb.com/api/v1/schedule",
             "nota": "Juegos de 2026 (que Retrosheet aún no publica) y tablas de posiciones finales "
                     "de la Liga Americana 1903–2026."},
        ],
        "avisoRetrosheet": AVISO_RETROSHEET,
    }


def escribir(nombre, clave, obj):
    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, nombre + ".json"), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    with open(os.path.join(DATA, nombre + ".js"), "w", encoding="utf-8") as f:
        f.write("window.RIVALIDAD = window.RIVALIDAD || {};\n")
        f.write(f"window.RIVALIDAD.{clave} = ")
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")


def validar_momentos(juegos):
    ruta = os.path.join(DATA, "momentos.json")
    if not os.path.exists(ruta):
        return []
    with open(ruta, encoding="utf-8") as f:
        momentos = json.load(f)
    ids = {j["id"] for j in juegos}
    for m in momentos:
        for jid in m.get("juegos", []):
            if jid not in ids:
                sys.exit(f"momentos.json: el juego {jid} ({m['id']}) no existe en juegos.json")
    return momentos


def main():
    juegos = leer_retrosheet() + leer_mlb_juegos()
    vistos = set()
    unicos = []
    for j in sorted(juegos, key=lambda j: (j["fecha"], str(j["numJuego"]), j["tipo"])):
        if j["id"] in vistos:
            continue
        vistos.add(j["id"])
        unicos.append(j)
    juegos = unicos
    hasta = max(j["temporada"] for j in juegos)
    temporadas = resumir_temporadas(juegos, hasta)
    res = resumen(juegos, temporadas, hasta)
    parques = leer_parques({j["parque"] for j in juegos})
    momentos = validar_momentos(juegos)

    escribir("juegos", "juegos", juegos)
    escribir("temporadas", "temporadas", temporadas)
    escribir("resumen", "resumen", res)
    escribir("parques", "parques", parques)
    if momentos:
        escribir("momentos", "momentos", momentos)

    print(f"{len(juegos)} juegos, {PRIMER_ANIO}–{hasta}")
    print("Regular:", res["regular"])
    print("Postemporada:", {k: v for k, v in res["postemporada"].items() if k != "series"})
    for s in res["postemporada"]["series"]:
        print("  ", s)


if __name__ == "__main__":
    main()
