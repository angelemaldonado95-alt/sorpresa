#!/usr/bin/env python3
"""Descarga los datos crudos de la rivalidad Yankees–Red Sox.

Fuentes:
  * Retrosheet, game logs de temporada regular (1871–2025) y de postemporada
    (Serie Mundial, series de campeonato, divisionales y comodín).
  * Retrosheet, catálogo de parques (parkcode.txt).
  * MLB Stats API (statsapi.mlb.com): juegos de temporadas que Retrosheet aún no
    publica (2026) y las tablas de posiciones de la Liga Americana 1903–2026.

Todo se guarda en rivalidad/scripts/raw/ (ignorado por git). Luego corre
procesar.py para generar los JSON de rivalidad/data/.

Uso: python3 descargar.py [--hasta 2026]
"""
import argparse
import io
import json
import os
import sys
import time
import urllib.request
import zipfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(AQUI, "raw")

RETROSHEET = "https://www.retrosheet.org/gamelogs/"
GL_TODO = "gl1871_2025.zip"          # temporada regular, un archivo por año
GL_POST = ["glws.zip", "gllc.zip", "gldv.zip", "glwc.zip"]
PARKS = "https://www.retrosheet.org/parkcode.txt"

MLB = "https://statsapi.mlb.com/api/v1/"
NYY, BOS = 147, 111
PRIMER_ANIO = 1903
ULTIMO_ANIO_RETROSHEET = 2025


def bajar(url, intentos=4):
    ultimo = None
    for i in range(intentos):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            ultimo = e
            time.sleep(2 ** (i + 1))
    raise RuntimeError(f"No se pudo descargar {url}: {ultimo}")


def guardar(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "wb") as f:
        f.write(datos)


def retrosheet():
    destino = os.path.join(RAW, "retrosheet")
    for nombre in [GL_TODO] + GL_POST:
        print("Retrosheet:", nombre)
        z = zipfile.ZipFile(io.BytesIO(bajar(RETROSHEET + nombre)))
        for miembro in z.namelist():
            if miembro.lower().endswith(".txt"):
                guardar(os.path.join(destino, miembro.lower()), z.read(miembro))
    print("Retrosheet: parkcode.txt")
    guardar(os.path.join(destino, "parkcode.txt"), bajar(PARKS))


def mlb_juegos(anio):
    """Todos los juegos NYY–BOS de un año según la MLB Stats API, con linescore."""
    url = (f"{MLB}schedule?sportId=1&season={anio}&teamId={NYY}&opponentId={BOS}"
           "&gameTypes=R,F,D,L,W&hydrate=linescore,decisions,probablePitcher,venue")
    return json.loads(bajar(url))


def mlb_standings(anio):
    url = f"{MLB}standings?leagueId=103&season={anio}&standingsTypes=regularSeason"
    return json.loads(bajar(url))


def mlb_equipos(anio):
    url = f"{MLB}teams?sportId=1&season={anio}"
    return json.loads(bajar(url))


def mlb(hasta):
    destino = os.path.join(RAW, "mlb")
    for anio in range(ULTIMO_ANIO_RETROSHEET + 1, hasta + 1):
        print("MLB Stats API: juegos", anio)
        guardar(os.path.join(destino, f"juegos_{anio}.json"),
                json.dumps(mlb_juegos(anio)).encode())
    for anio in range(PRIMER_ANIO, hasta + 1):
        ruta = os.path.join(destino, f"standings_{anio}.json")
        if os.path.exists(ruta) and anio < hasta:
            continue
        print("MLB Stats API: standings", anio)
        guardar(ruta, json.dumps(mlb_standings(anio)).encode())
        guardar(os.path.join(destino, f"equipos_{anio}.json"),
                json.dumps(mlb_equipos(anio)).encode())


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--hasta", type=int, default=2026)
    p.add_argument("--solo", choices=["retrosheet", "mlb"])
    a = p.parse_args()
    if a.solo != "mlb":
        retrosheet()
    if a.solo != "retrosheet":
        mlb(a.hasta)
    print("Listo. Datos crudos en", RAW)


if __name__ == "__main__":
    sys.exit(main())
