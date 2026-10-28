#!/usr/bin/env python3
"""Convierte los CSV de Lahman en los archivos de datos del simulador.

Genera:
    data/indice.js              lista de temporadas de los Yankees (NYA) con resumen
    data/liga.js                promedios de la Liga Americana por año + entorno de referencia
    data/temporadas/AAAA.js     bateadores, lanzadores y fildeo de cada temporada

Los archivos son JS planos (no JSON) para que el sitio abra con doble clic
(file://) sin servidor. Cada uno sólo asigna sobre el objeto global SIM_DATOS.

Uso:
    python3 scripts/procesar.py [carpeta_csv]       (por defecto: lahman_csv/)

Campos vacíos en Lahman (p. ej. CS antes de 1920, SF antes de 1954, GIDP antes
de 1939) se guardan como null: el motor los sustituye por la tasa de liga del
año. Nunca se inventa un número.
"""
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

EQUIPO = "NYA"
LIGA = "AL"
RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "data"

CAMPOS_BAT = ["G", "AB", "H", "2B", "3B", "HR", "BB", "SO", "HBP", "SB", "CS", "SH", "SF", "GIDP"]
CAMPOS_PIT = ["W", "L", "G", "GS", "CG", "SV", "IPouts", "H", "ER", "HR", "BB", "SO", "HBP", "BFP"]


def entero(v):
    return None if v in ("", None) else int(v)


def suma(a, b):
    """Suma dos valores que pueden ser None (None + None = None)."""
    if a is None:
        return b
    if b is None:
        return a
    return a + b


def leer(ruta):
    with open(ruta, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def acumular(dest, fila, campos):
    for c in campos:
        dest[c] = suma(dest.get(c), entero(fila[c]))


def main():
    origen = Path(sys.argv[1] if len(sys.argv) > 1 else "lahman_csv")
    gente = {r["playerID"]: r for r in leer(origen / "People.csv")}
    equipos = leer(origen / "Teams.csv")
    bateo = leer(origen / "Batting.csv")
    pitcheo = leer(origen / "Pitching.csv")
    fildeo = leer(origen / "Fielding.csv")

    # ---------- promedios de liga por año (sólo AL) ----------
    liga_bat = defaultdict(dict)       # año -> totales de bateo
    liga_pit = defaultdict(dict)       # año -> totales de pitcheo
    for r in bateo:
        if r["lgID"] == LIGA:
            acumular(liga_bat[int(r["yearID"])], r, CAMPOS_BAT)
    for r in pitcheo:
        if r["lgID"] == LIGA:
            acumular(liga_pit[int(r["yearID"])], r, CAMPOS_PIT)
    liga_eq = defaultdict(lambda: defaultdict(int))
    for r in equipos:
        if r["lgID"] == LIGA:
            y = int(r["yearID"])
            for c in ("G", "R", "E", "IPouts", "HA", "HRA", "SOA", "BBA"):
                liga_eq[y][c] += int(r[c])
            liga_eq[y]["equipos"] += 1

    liga = {}
    for y in sorted(liga_bat):
        b, p, e = liga_bat[y], liga_pit[y], liga_eq[y]
        so = b.get("SO") if b.get("SO") else p.get("SO")
        hbp = b.get("HBP") if b.get("HBP") else p.get("HBP")
        sf = b.get("SF") or 0
        sh = b.get("SH") or 0
        pa = b["AB"] + b["BB"] + (hbp or 0) + sf + sh
        # bolas en juego contra el pitcheo de la liga: outs en juego + hits que no son HR
        bip = e["IPouts"] - e["SOA"] + e["HA"] - e["HRA"]
        # Un total de 0 en SF/CS/GIDP significa que Lahman no registra el dato ese año.
        def nulo_si_cero(v):
            return v if v else None
        liga[y] = {
            "PA": pa, "AB": b["AB"], "H": b["H"], "2B": b["2B"], "3B": b["3B"], "HR": b["HR"],
            "BB": b["BB"], "SO": so, "HBP": hbp, "SF": nulo_si_cero(b.get("SF")), "SH": sh,
            "SB": b.get("SB"), "CS": nulo_si_cero(b.get("CS")), "GIDP": nulo_si_cero(b.get("GIDP")),
            "E": e["E"], "BIP": bip, "G": e["G"] // 2, "R": e["R"], "equipos": e["equipos"],
        }

    # Entorno de referencia: toda la Liga Americana 1903-último año, ponderado por PA.
    # Cada campo guarda [total, PA de los años en que el dato existe] para que
    # los campos con huecos (SF, CS, GIDP) no queden subestimados.
    ref = {}
    for y, L in liga.items():
        if y < 1903:
            continue
        for k, v in L.items():
            if v is None or k == "equipos":
                continue
            r = ref.setdefault(k, [0, 0])
            r[0] += v
            r[1] += L["PA"]

    # ---------- temporadas de los Yankees ----------
    temporadas = {}
    info_eq = {int(r["yearID"]): r for r in equipos if r["teamID"] == EQUIPO}
    bat_x = defaultdict(lambda: defaultdict(dict))
    for r in bateo:
        if r["teamID"] == EQUIPO:
            acumular(bat_x[int(r["yearID"])][r["playerID"]], r, CAMPOS_BAT)
    pit_x = defaultdict(lambda: defaultdict(dict))
    for r in pitcheo:
        if r["teamID"] == EQUIPO:
            acumular(pit_x[int(r["yearID"])][r["playerID"]], r, CAMPOS_PIT)
    pos_x = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    for r in fildeo:
        if r["teamID"] == EQUIPO:
            pos_x[int(r["yearID"])][r["playerID"]][r["POS"]] += int(r["G"] or 0)

    def nombre(pid):
        g = gente[pid]
        return f'{g["nameFirst"]} {g["nameLast"]}'.strip()

    for y in sorted(bat_x):
        eq = info_eq[y]
        bateadores = []
        for pid, s in bat_x[y].items():
            if (s["AB"] or 0) + (s["BB"] or 0) == 0:
                continue
            g = gente[pid]
            d = {"id": pid, "nombre": nombre(pid), "b": g["bats"] or "R", "t": g["throws"] or "R"}
            d.update(s)
            d["pos"] = dict(sorted(pos_x[y][pid].items(), key=lambda kv: -kv[1]))
            bateadores.append(d)
        lanzadores = []
        for pid, s in pit_x[y].items():
            if (s["IPouts"] or 0) == 0:
                continue
            g = gente[pid]
            d = {"id": pid, "nombre": nombre(pid), "t": g["throws"] or "R"}
            d.update(s)
            lanzadores.append(d)
        bateadores.sort(key=lambda d: -((d["AB"] or 0) + (d["BB"] or 0)))
        lanzadores.sort(key=lambda d: -(d["IPouts"] or 0))
        temporadas[y] = {
            "anio": y, "equipo": eq["name"], "lg": LIGA, "dh": y >= 1973,
            "G": int(eq["G"]), "W": int(eq["W"]), "L": int(eq["L"]),
            "R": int(eq["R"]), "RA": int(eq["RA"]), "HR": int(eq["HR"]),
            "WSWin": eq["WSWin"] == "Y", "LgWin": eq["LgWin"] == "Y",
            "E": int(eq["E"]),
            "BIPc": int(eq["IPouts"]) - int(eq["SOA"]) + int(eq["HA"]) - int(eq["HRA"]),
            "bateadores": bateadores, "lanzadores": lanzadores,
        }

    # ---------- escribir ----------
    (SALIDA / "temporadas").mkdir(parents=True, exist_ok=True)
    comp = dict(separators=(",", ":"), ensure_ascii=False)
    cab = "// Generado por scripts/procesar.py a partir de la SABR Lahman Baseball Database 2025. No editar a mano.\n"
    for y, t in temporadas.items():
        (SALIDA / "temporadas" / f"{y}.js").write_text(
            cab + f"SIM_DATOS.temporadas[{y}]=" + json.dumps(t, **comp) + ";\n", encoding="utf-8")
    (SALIDA / "liga.js").write_text(
        cab + "SIM_DATOS.liga=" + json.dumps({"ref": ref, "AL": liga}, **comp) + ";\n", encoding="utf-8")
    indice = [{"anio": y, "equipo": t["equipo"], "W": t["W"], "L": t["L"], "R": t["R"], "RA": t["RA"],
               "WSWin": t["WSWin"], "LgWin": t["LgWin"], "dh": t["dh"]} for y, t in temporadas.items()]
    (SALIDA / "indice.js").write_text(
        cab + "var SIM_DATOS=window.SIM_DATOS=window.SIM_DATOS||{temporadas:{}};\n"
        + "SIM_DATOS.indice=" + json.dumps(indice, **comp) + ";\n", encoding="utf-8")
    print(f"{len(temporadas)} temporadas ({min(temporadas)}–{max(temporadas)}), "
          f"{len(liga)} años de liga, escrito en {SALIDA}")


if __name__ == "__main__":
    main()
