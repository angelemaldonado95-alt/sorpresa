#!/usr/bin/env python3
"""Descarga las fuentes crudas de El Monumento en scripts/crudo/.

Fuentes:
  - Lahman Baseball Database (paquete Lahman de CRAN, datos 1871-2025).
  - Retrosheet: game logs de temporada regular 1903-2025 y de postemporada.
  - Chadwick Bureau Register: equivalencia de IDs (Lahman/bbref <-> MLBAM).
  - MLB Stats API (statsapi.mlb.com): temporada en curso o más reciente no
    cubierta por Lahman/Retrosheet (por omisión 2026).
  - Sitio oficial de los Yankees en MLB.com: lista de números retirados.

Uso:  python3 scripts/descargar.py [--temporada 2026]
"""
import argparse, io, json, os, sys, tarfile, time, urllib.request, zipfile

AQUI = os.path.dirname(os.path.abspath(__file__))
CRUDO = os.path.join(AQUI, "crudo")
UA = {"User-Agent": "Mozilla/5.0 (El Monumento; museo digital sin fines de lucro)"}

LAHMAN_CRAN = "https://cran.r-project.org/src/contrib/Lahman_14.0-0.tar.gz"
LAHMAN_ARCHIVO = "https://cran.r-project.org/src/contrib/Archive/Lahman/Lahman_14.0-0.tar.gz"
RETRO = "https://www.retrosheet.org/gamelogs/"
REGISTER = "https://raw.githubusercontent.com/chadwickbureau/register/master/data/people-{}.csv"
API = "https://statsapi.mlb.com/api/v1/"
RETIRADOS = "https://www.mlb.com/yankees/history/retired-numbers"
NYY = 147


def bajar(url, intentos=4):
    for i in range(intentos):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read()
        except Exception as e:  # red inestable: reintento con espera exponencial
            if i == intentos - 1:
                raise
            print(f"  reintento {url}: {e}", file=sys.stderr)
            time.sleep(2 ** (i + 1))


def guardar(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "wb") as f:
        f.write(datos)


def api(ruta, nombre):
    datos = bajar(API + ruta)
    guardar(os.path.join(CRUDO, "statsapi", nombre), datos)
    return json.loads(datos)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--temporada", type=int, default=2026,
                    help="temporada que se toma de la MLB Stats API (no cubierta por Lahman)")
    ap.add_argument("--ultimo-retro", type=int, default=2025,
                    help="último año con game logs publicados en Retrosheet")
    args = ap.parse_args()

    print("Lahman (CRAN)…")
    try:
        tgz = bajar(LAHMAN_CRAN)
    except Exception:
        tgz = bajar(LAHMAN_ARCHIVO)
    with tarfile.open(fileobj=io.BytesIO(tgz)) as t:
        for m in t.getmembers():
            if m.name.startswith("Lahman/data/") and m.name.endswith(".RData"):
                guardar(os.path.join(CRUDO, "lahman", os.path.basename(m.name)), t.extractfile(m).read())

    print("Retrosheet game logs…")
    for a in range(1903, args.ultimo_retro + 1):
        z = zipfile.ZipFile(io.BytesIO(bajar(f"{RETRO}gl{a}.zip")))
        for n in z.namelist():
            guardar(os.path.join(CRUDO, "retrosheet", n.upper()), z.read(n))
    for p in ("ws", "lc", "dv", "wc"):
        z = zipfile.ZipFile(io.BytesIO(bajar(f"{RETRO}gl{p}.zip")))
        for n in z.namelist():
            guardar(os.path.join(CRUDO, "retrosheet", n.upper()), z.read(n))

    print("Chadwick Register…")
    for c in "0123456789abcdef":
        guardar(os.path.join(CRUDO, "register", f"people-{c}.csv"), bajar(REGISTER.format(c)))

    s = args.temporada
    print(f"MLB Stats API, temporada {s}…")
    api(f"standings?leagueId=103,104&season={s}&standingsTypes=regularSeason", f"standings-{s}.json")
    api(f"schedule?sportId=1&teamId={NYY}&season={s}&gameType=R,F,D,L,W&hydrate=decisions,linescore,venue",
        f"schedule-{s}.json")
    roster = api(f"teams/{NYY}/roster?season={s}&rosterType=fullSeason&hydrate=person", f"roster-{s}.json")
    # El endpoint /stats agregado omite a jugadores que ya no están en el equipo;
    # por eso se piden las líneas año por año de cada jugador del roster completo.
    lineas = []
    for r in roster["roster"]:
        pid = r["person"]["id"]
        d = json.loads(bajar(f"{API}people/{pid}/stats?stats=yearByYear&group=hitting,pitching"))
        for bloque in d.get("stats", []):
            for sp in bloque.get("splits", []):
                if sp.get("season") == str(s) and sp.get("team", {}).get("id") == NYY:
                    lineas.append({"grupo": bloque["group"]["displayName"], "persona": pid, **sp})
    guardar(os.path.join(CRUDO, "statsapi", f"stats-jugadores-{s}.json"),
            json.dumps(lineas, ensure_ascii=False).encode())
    api(f"teams/{NYY}/coaches?season={s}", f"coaches-{s}.json")

    print("Números retirados (MLB.com)…")
    guardar(os.path.join(CRUDO, "mlbcom", "retired-numbers.html"), bajar(RETIRADOS))
    print("Listo.")


if __name__ == "__main__":
    main()
