#!/usr/bin/env python3
"""Descarga los CSV de la SABR Lahman Baseball Database (versión 2025).

Fuente oficial: https://sabr.org/lahman-database/ (carpeta pública en Box,
«Comma-delimited version»). Sólo se bajan las tablas que usa el simulador.

Uso:
    python3 scripts/descargar.py [carpeta_destino]      (por defecto: lahman_csv/)
"""
import sys
import urllib.request
from pathlib import Path

SHARED = "y1prhc795jk8zvmelfd3jq7tl389y6cd"  # enlace público de SABR
BASE = ("https://sabr.box.com/index.php?rm=box_download_shared_file"
        f"&shared_name={SHARED}&file_id=f_")

# Ids de archivo dentro de la carpeta compartida (lahman_1871-2025_csv).
ARCHIVOS = {
    "readme2025.txt": "2084259918153",
    "People.csv":     "2084263017537",
    "Teams.csv":      "2084266946255",
    "Batting.csv":    "2084272468053",
    "Pitching.csv":   "2084261668691",
    "Fielding.csv":   "2084272585201",
}


def main():
    destino = Path(sys.argv[1] if len(sys.argv) > 1 else "lahman_csv")
    destino.mkdir(parents=True, exist_ok=True)
    for nombre, fid in ARCHIVOS.items():
        ruta = destino / nombre
        if ruta.exists() and ruta.stat().st_size > 0:
            print(f"ya existe  {ruta}")
            continue
        print(f"bajando    {nombre} ...", end=" ", flush=True)
        with urllib.request.urlopen(BASE + fid, timeout=120) as r, open(ruta, "wb") as f:
            total = 0
            while True:
                bloque = r.read(1 << 16)
                if not bloque:
                    break
                f.write(bloque)
                total += len(bloque)
        print(f"{total/1e6:.1f} MB")
    print("listo:", destino)


if __name__ == "__main__":
    main()
