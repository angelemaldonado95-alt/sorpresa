#!/usr/bin/env python3
"""
Construye los datos de «La Franela» a partir de fuentes públicas.

    python3 build.py fetch    # descarga las fuentes a scripts/raw/ (se puede repetir)
    python3 build.py build    # procesa scripts/raw/ y escribe ../data/*.js
    python3 build.py          # ambas cosas

Fuentes:
  * SABR Lahman Baseball Database, versión 2025 (1871–2025), CSV (People, Appearances,
    Batting, Pitching). https://sabr.org/lahman-database/  — licencia CC BY-SA 3.0.
  * Chadwick Baseball Bureau Register (cruce de identificadores bbref ↔ MLBAM).
    https://github.com/chadwickbureau/register
  * MLB Stats API pública (statsapi.mlb.com): temporada 2026, números de uniforme,
    lugar de nacimiento de jugadores sin ficha en Lahman.
  * GeoNames (cities500, CC BY 4.0) para ubicar las ciudades de nacimiento.
  * world-atlas / us-atlas (Natural Earth, dominio público) para el mapa base.

Sin llaves de API. Nada se inventa: lo que no aparece en las fuentes queda vacío.
"""
import csv
import io
import json
import os
import re
import sys
import time
import unicodedata
import zipfile
from collections import defaultdict
from urllib.request import Request, urlopen

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
OUT = os.path.join(os.path.dirname(HERE), "data")
UA = {"User-Agent": "la-franela-build/1.0 (archivo estatico; contacto en README)"}

YANKEES_MLBAM = 147
LAHMAN_TEAM = "NYA"          # Highlanders/Yankees en Lahman, 1903–
FIRST_SEASON = 1903
CURRENT_SEASON = 2026
NUMBER_ROSTER_YEARS = range(1990, CURRENT_SEASON + 1)   # la API sólo trae números en épocas recientes

# Carpeta compartida de SABR en Box (versión 2025, publicada 2026-01-02). Los ids de archivo
# salen de la propia página compartida.
BOX_SHARE = "y1prhc795jk8zvmelfd3jq7tl389y6cd"
BOX_FILES = {
    "People.csv": "2084263017537",
    "Appearances.csv": "2084267195632",
    "Batting.csv": "2084272468053",
    "Pitching.csv": "2084261668691",
    "readme2025.txt": "2084259918153",
}
REGISTER_URL = "https://raw.githubusercontent.com/chadwickbureau/register/master/data/people-{}.csv"
GEONAMES_URL = "https://download.geonames.org/export/dump/cities500.zip"
WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json"
STATES_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json"
API = "https://statsapi.mlb.com/api/v1"


# ----------------------------------------------------------------------------- utilidades

def log(*a):
    print(*a, file=sys.stderr, flush=True)


def get(url, binary=False, retries=4):
    for i in range(retries):
        try:
            with urlopen(Request(url, headers=UA), timeout=120) as r:
                data = r.read()
            return data if binary else data.decode("utf-8-sig")
        except Exception as e:  # noqa
            log(f"  reintento {i+1} {url}: {e}")
            time.sleep(2 ** i)
    raise SystemExit(f"no se pudo descargar {url}")


def save(name, data):
    os.makedirs(RAW, exist_ok=True)
    mode = "wb" if isinstance(data, bytes) else "w"
    with open(os.path.join(RAW, name), mode, **({} if mode == "wb" else {"encoding": "utf-8"})) as f:
        f.write(data)


def load_text(name):
    with open(os.path.join(RAW, name), encoding="utf-8-sig") as f:
        return f.read()


def load_json(name):
    return json.loads(load_text(name))


def read_csv(name):
    return list(csv.DictReader(io.StringIO(load_text(name))))


def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("st.", "saint").replace("ste.", "sainte").replace("mt.", "mount").replace("ft.", "fort")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def to_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


# ----------------------------------------------------------------------------- descarga

def fetch():
    os.makedirs(RAW, exist_ok=True)
    for name, fid in BOX_FILES.items():
        if not os.path.exists(os.path.join(RAW, name)):
            log("Lahman:", name)
            url = f"https://sabr.box.com/index.php?rm=box_download_shared_file&shared_name={BOX_SHARE}&file_id=f_{fid}"
            save(name, get(url, binary=True))
    for h in "0123456789abcdef":
        name = f"register-{h}.csv"
        if not os.path.exists(os.path.join(RAW, name)):
            log("Register:", name)
            save(name, get(REGISTER_URL.format(h), binary=True))
    if not os.path.exists(os.path.join(RAW, "cities500.txt")):
        log("GeoNames cities500")
        z = zipfile.ZipFile(io.BytesIO(get(GEONAMES_URL, binary=True)))
        save("cities500.txt", z.read("cities500.txt"))
    for name, url in (("countries-110m.json", WORLD_URL), ("states-10m.json", STATES_URL)):
        if not os.path.exists(os.path.join(RAW, name)):
            log("Mapa base:", name)
            save(name, get(url, binary=True))

    # --- MLB Stats API
    def api(name, path):
        p = os.path.join(RAW, name)
        if os.path.exists(p):
            return json.load(open(p, encoding="utf-8"))
        log("MLB API:", path)
        txt = get(API + path)
        save(name, txt)
        return json.loads(txt)

    api("mlb_allTime.json", f"/teams/{YANKEES_MLBAM}/roster?rosterType=allTime&season={CURRENT_SEASON}")
    for y in NUMBER_ROSTER_YEARS:
        api(f"mlb_roster_{y}.json", f"/teams/{YANKEES_MLBAM}/roster?rosterType=fullSeason&season={y}")
    for g in ("hitting", "pitching"):
        api(f"mlb_{CURRENT_SEASON}_{g}.json",
            f"/stats?stats=season&group={g}&season={CURRENT_SEASON}&teamId={YANKEES_MLBAM}&playerPool=ALL&limit=500")

    # fichas de personas (nacimiento, número principal, entradas de roster) para todos los ids MLBAM
    ids = set()
    for x in load_json("mlb_allTime.json")["roster"]:
        ids.add(x["person"]["id"])
    for y in NUMBER_ROSTER_YEARS:
        for x in load_json(f"mlb_roster_{y}.json").get("roster", []):
            ids.add(x["person"]["id"])
    for g in ("hitting", "pitching"):
        for s in load_json(f"mlb_{CURRENT_SEASON}_{g}.json")["stats"][0]["splits"]:
            ids.add(s["player"]["id"])
    # también los Yankees de Lahman con id MLBAM conocido
    bbref_to_mlbam = {}
    for h in "0123456789abcdef":
        for r in read_csv(f"register-{h}.csv"):
            if r["key_bbref"] and r["key_mlbam"]:
                bbref_to_mlbam[r["key_bbref"]] = int(r["key_mlbam"])
    people = {r["playerID"]: r for r in read_csv("People.csv")}
    for r in read_csv("Appearances.csv"):
        if r["teamID"] == LAHMAN_TEAM:
            p = people.get(r["playerID"])
            if p:
                m = bbref_to_mlbam.get(p["bbrefID"] or p["playerID"])
                if m:
                    ids.add(m)
    ids = sorted(ids)
    log(f"MLB API: fichas de {len(ids)} personas")
    pfile = os.path.join(RAW, "mlb_people.json")
    have = {}
    if os.path.exists(pfile):
        have = {p["id"]: p for p in json.load(open(pfile, encoding="utf-8"))}
    missing = [i for i in ids if i not in have]
    for i in range(0, len(missing), 100):
        chunk = missing[i:i + 100]
        log(f"  personas {i}/{len(missing)}")
        d = json.loads(get(API + "/people?personIds=" + ",".join(map(str, chunk)) + "&hydrate=rosterEntries"))
        for p in d.get("people", []):
            have[p["id"]] = p
        json.dump(list(have.values()), open(pfile, "w", encoding="utf-8"))
        time.sleep(0.3)
    json.dump(list(have.values()), open(pfile, "w", encoding="utf-8"))


# ----------------------------------------------------------------------------- geografía

# Nombres de país tal como aparecen en Lahman y en la MLB Stats API → ISO 3166-1 alfa-2.
# Para entidades históricas se listan varios países candidatos (la ciudad decide).
COUNTRY_ISO = {
    "USA": ["US"], "United States": ["US"], "D.R.": ["DO"], "Dominican Republic": ["DO"], "P.R.": ["PR"],
    "Puerto Rico": ["PR"], "CAN": ["CA"], "Canada": ["CA"], "México": ["MX"], "Mexico": ["MX"],
    "Venezuela": ["VE"], "Cuba": ["CU"], "Japan": ["JP"], "Panama": ["PA"], "Ireland": ["IE"],
    "England": ["GB"], "Scotland": ["GB"], "Wales": ["GB"], "Northern Ireland": ["GB"], "United Kingdom": ["GB"],
    "Australia": ["AU"], "Germany": ["DE"], "West Germany": ["DE"], "East Germany": ["DE"], "Colombia": ["CO"],
    "South Korea": ["KR"], "Korea": ["KR"], "Taiwan": ["TW"], "Curaçao": ["CW"], "Curacao": ["CW"],
    "Nicaragua": ["NI"], "U.S. Virgin Islands": ["VI"], "Virgin Islands": ["VI"], "Netherlands": ["NL"],
    "Italy": ["IT"], "Bahamas": ["BS"], "Russia": ["RU"], "France": ["FR"], "Aruba": ["AW"],
    "Austria-Hungary": ["AT", "HU", "CZ", "SK", "HR", "SI", "PL", "UA", "RO", "RS", "BA"], "Sweden": ["SE"],
    "Jamaica": ["JM"], "Brazil": ["BR"], "Spain": ["ES"], "Poland": ["PL"], "Norway": ["NO"],
    "Czechoslovakia": ["CZ", "SK"], "Czech Republic": ["CZ"], "China": ["CN"], "Portugal": ["PT"], "Philippines": ["PH"],
    "Honduras": ["HN"], "Guam": ["GU"], "Prussia": ["DE", "PL", "RU", "LT"], "Austria": ["AT"],
    "South Africa": ["ZA"], "Saudi Arabia": ["SA"], "Afghanistan": ["AF"], "Greece": ["GR"],
    "Soviet Union": ["RU", "UA", "BY", "KZ", "LT", "LV", "EE", "GE", "AM", "AZ"], "South Vietnam": ["VN"],
    "Vietnam": ["VN"], "Denmark": ["DK"], "Switzerland": ["CH"], "Singapore": ["SG"], "Belgium": ["BE"],
    "Peru": ["PE"], "British Honduras": ["BZ"], "Belize": ["BZ"], "Indonesia": ["ID"], "Bohemia": ["CZ"],
    "Finland": ["FI"], "American Samoa": ["AS"], "Hong Kong": ["HK"], "Nigeria": ["NG"], "Lithuania": ["LT"],
    "Latvia": ["LV"], "Ukraine": ["UA"], "Hungary": ["HU"], "Slovakia": ["SK"], "Croatia": ["HR"],
    "Guatemala": ["GT"], "El Salvador": ["SV"], "Costa Rica": ["CR"], "Ecuador": ["EC"], "Argentina": ["AR"],
    "Chile": ["CL"], "Uruguay": ["UY"], "Paraguay": ["PY"], "Bolivia": ["BO"], "Haiti": ["HT"],
    "Trinidad and Tobago": ["TT"], "Barbados": ["BB"], "Bermuda": ["BM"], "Israel": ["IL"], "India": ["IN"],
    "New Zealand": ["NZ"], "Egypt": ["EG"], "Turkey": ["TR"], "Iran": ["IR"], "Iraq": ["IQ"], "Lebanon": ["LB"],
    "Jordan": ["JO"], "Thailand": ["TH"], "Malaysia": ["MY"], "Romania": ["RO"], "Serbia": ["RS"],
    "Slovenia": ["SI"], "Bulgaria": ["BG"], "Estonia": ["EE"], "Iceland": ["IS"], "Luxembourg": ["LU"],
    "Morocco": ["MA"], "Tunisia": ["TN"], "Ghana": ["GH"], "Kenya": ["KE"], "Uganda": ["UG"], "Ethiopia": ["ET"],
    "Pakistan": ["PK"], "Sri Lanka": ["LK"], "Bangladesh": ["BD"], "Mongolia": ["MN"], "Nepal": ["NP"],
    "Samoa": ["WS"], "Fiji": ["FJ"], "Papua New Guinea": ["PG"], "Northern Mariana Islands": ["MP"],
}

# América Latina: países de habla española y portuguesa del continente y el Caribe.
LATAM = {"MX", "GT", "HN", "SV", "NI", "CR", "PA", "CU", "DO", "PR", "CO", "VE", "EC", "PE", "BR", "BO", "PY",
         "UY", "AR", "CL"}

COUNTRY_ES = {
    "US": "Estados Unidos", "DO": "República Dominicana", "PR": "Puerto Rico", "CA": "Canadá", "MX": "México",
    "VE": "Venezuela", "CU": "Cuba", "JP": "Japón", "PA": "Panamá", "IE": "Irlanda", "GB": "Reino Unido",
    "AU": "Australia", "DE": "Alemania", "CO": "Colombia", "KR": "Corea del Sur", "TW": "Taiwán", "CW": "Curazao",
    "NI": "Nicaragua", "VI": "Islas Vírgenes de EE. UU.", "NL": "Países Bajos", "IT": "Italia", "BS": "Bahamas",
    "RU": "Rusia", "FR": "Francia", "AW": "Aruba", "AT": "Austria", "HU": "Hungría", "CZ": "Chequia",
    "SK": "Eslovaquia", "HR": "Croacia", "SI": "Eslovenia", "PL": "Polonia", "UA": "Ucrania", "RO": "Rumania",
    "RS": "Serbia", "BA": "Bosnia y Herzegovina", "SE": "Suecia", "JM": "Jamaica", "BR": "Brasil", "ES": "España",
    "NO": "Noruega", "CN": "China", "PT": "Portugal", "PH": "Filipinas", "HN": "Honduras", "GU": "Guam",
    "LT": "Lituania", "ZA": "Sudáfrica", "SA": "Arabia Saudita", "AF": "Afganistán", "GR": "Grecia",
    "BY": "Bielorrusia", "KZ": "Kazajistán", "LV": "Letonia", "EE": "Estonia", "GE": "Georgia", "AM": "Armenia",
    "AZ": "Azerbaiyán", "VN": "Vietnam", "DK": "Dinamarca", "CH": "Suiza", "SG": "Singapur", "BE": "Bélgica",
    "PE": "Perú", "BZ": "Belice", "ID": "Indonesia", "FI": "Finlandia", "AS": "Samoa Americana", "HK": "Hong Kong",
    "NG": "Nigeria", "GT": "Guatemala", "SV": "El Salvador", "CR": "Costa Rica", "EC": "Ecuador",
    "AR": "Argentina", "CL": "Chile", "UY": "Uruguay", "PY": "Paraguay", "BO": "Bolivia", "HT": "Haití",
    "TT": "Trinidad y Tobago", "BB": "Barbados", "BM": "Bermudas", "IL": "Israel", "IN": "India",
    "NZ": "Nueva Zelanda", "EG": "Egipto", "TR": "Turquía", "IR": "Irán", "IQ": "Irak", "LB": "Líbano",
    "JO": "Jordania", "TH": "Tailandia", "MY": "Malasia", "BG": "Bulgaria", "IS": "Islandia", "LU": "Luxemburgo",
    "MA": "Marruecos", "TN": "Túnez", "GH": "Ghana", "KE": "Kenia", "UG": "Uganda", "ET": "Etiopía",
    "PK": "Pakistán", "LK": "Sri Lanka", "BD": "Bangladés", "MN": "Mongolia", "NP": "Nepal", "WS": "Samoa",
    "FJ": "Fiyi", "PG": "Papúa Nueva Guinea", "MP": "Islas Marianas del Norte",
}

# Nombres históricos que conviene conservar en la ficha (tal cual Lahman) y su traducción.
HISTORIC_ES = {"Austria-Hungary": "Austria-Hungría", "Czechoslovakia": "Checoslovaquia", "Prussia": "Prusia",
               "West Germany": "Alemania Occidental", "East Germany": "Alemania Oriental", "Soviet Union": "Unión Soviética",
               "South Vietnam": "Vietnam del Sur", "British Honduras": "Honduras Británica", "Bohemia": "Bohemia",
               "England": "Inglaterra", "Scotland": "Escocia", "Wales": "Gales", "Northern Ireland": "Irlanda del Norte"}

US_STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado",
    "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia", "HI": "Hawái", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Luisiana", "ME": "Maine",
    "MD": "Maryland", "MA": "Massachusetts", "MI": "Míchigan", "MN": "Minnesota", "MS": "Misisipi", "MO": "Misuri",
    "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "Nuevo Hampshire", "NJ": "Nueva Jersey",
    "NM": "Nuevo México", "NY": "Nueva York", "NC": "Carolina del Norte", "ND": "Dakota del Norte", "OH": "Ohio",
    "OK": "Oklahoma", "OR": "Oregón", "PA": "Pensilvania", "RI": "Rhode Island", "SC": "Carolina del Sur",
    "SD": "Dakota del Sur", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia",
    "WA": "Washington", "WV": "Virginia Occidental", "WI": "Wisconsin", "WY": "Wyoming", "DC": "Distrito de Columbia",
}
# FIPS de us-atlas → sigla postal
US_FIPS = {"01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC",
           "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
           "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT",
           "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
           "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
           "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY", "72": "PR"}


class Geo:
    """Geocodificación sin llaves: GeoNames cities500 + centroides de estado/país como respaldo."""

    def __init__(self):
        self.by_country = defaultdict(lambda: defaultdict(list))   # cc → nombre normalizado → [(pop, lat, lon, admin1)]
        for line in load_text("cities500.txt").splitlines():
            f = line.split("\t")
            if len(f) < 15:
                continue
            cc, admin1, pop = f[8], f[10], to_int(f[14])
            lat, lon = float(f[4]), float(f[5])
            names = {f[1], f[2]} | set(f[3].split(",")) if f[3] else {f[1], f[2]}
            for n in names:
                n = norm(n)
                if n:
                    self.by_country[cc][n].append((pop, lat, lon, admin1))
        self.state_centroid = {}
        self.country_centroid = {}
        self.world_paths = []
        self.state_paths = []
        self._load_topo()

    # --- TopoJSON mínimo (arcs delta-codificados con transform)
    @staticmethod
    def _decode(topo, geom):
        tr = topo.get("transform")
        arcs = []
        for arc in topo["arcs"]:
            pts, x, y = [], 0, 0
            for dx, dy in arc:
                x += dx
                y += dy
                pts.append((x * tr["scale"][0] + tr["translate"][0], y * tr["scale"][1] + tr["translate"][1]) if tr else (x, y))
            arcs.append(pts)

        def ring(idx):
            out = []
            for i in idx:
                a = arcs[~i][::-1] if i < 0 else arcs[i]
                out.extend(a if not out else a[1:])
            return out

        polys = []
        if geom["type"] == "Polygon":
            polys.append([ring(r) for r in geom["arcs"]])
        elif geom["type"] == "MultiPolygon":
            for p in geom["arcs"]:
                polys.append([ring(r) for r in p])
        return polys

    @staticmethod
    def _centroid(polys):
        # centroide del anillo exterior más grande (por área con la fórmula del zapato)
        best, area_best = None, -1
        for p in polys:
            r = p[0]
            a, cx, cy = 0, 0, 0
            for i in range(len(r) - 1):
                x0, y0 = r[i]
                x1, y1 = r[i + 1]
                cross = x0 * y1 - x1 * y0
                a += cross
                cx += (x0 + x1) * cross
                cy += (y0 + y1) * cross
            if abs(a) > area_best and a != 0:
                area_best = abs(a)
                best = (cx / (3 * a), cy / (3 * a))
        return best

    def _load_topo(self):
        W, H = 1000, 500

        def proj(lon, lat):
            return round((lon + 180) / 360 * W, 1), round((90 - lat) / 180 * H, 1)

        def path(polys):
            parts = []
            for p in polys:
                for r in p:
                    pts = [proj(x, y) for x, y in r]
                    # simplificación ligera: quitamos puntos repetidos tras redondear
                    s, last = [], None
                    for q in pts:
                        if q != last:
                            s.append(q)
                            last = q
                    if len(s) >= 3:
                        parts.append("M" + " ".join(f"{x},{y}" for x, y in s) + "Z")
            return "".join(parts)

        world = load_json("countries-110m.json")
        for g in world["objects"]["countries"]["geometries"]:
            name = g["properties"]["name"]
            polys = self._decode(world, g)
            if name == "Antarctica":
                continue
            cc = COUNTRY_ISO_BY_NE_NAME.get(name)
            self.world_paths.append({"name": name, "cc": cc, "d": path(polys)})
            c = self._centroid(polys)
            if cc and c:
                self.country_centroid[cc] = (round(c[1], 3), round(c[0], 3))
        states = load_json("states-10m.json")
        for g in states["objects"]["states"]["geometries"]:
            st = US_FIPS.get(g["id"])
            polys = self._decode(states, g)
            c = self._centroid(polys)
            if st and c:
                self.state_centroid[st] = (round(c[1], 3), round(c[0], 3))
            if st and st != "PR":
                self.state_paths.append({"st": st, "d": path(polys)})

    def locate(self, city, state, country_name):
        """Devuelve (lat, lon, precisión) o None. precisión: 'ciudad' | 'estado' | 'pais'."""
        ccs = COUNTRY_ISO.get(country_name or "", [])
        if not ccs:
            return None
        n = norm(city)
        if n:
            cands = []
            for cc in ccs:
                for pop, lat, lon, admin1 in self.by_country[cc].get(n, []):
                    bonus = 0
                    if cc == "US":
                        if state and admin1 == state:
                            bonus = 10 ** 9
                        elif state:
                            continue   # en EE. UU. exigimos el estado
                    cands.append((bonus + pop, lat, lon))
            if cands:
                cands.sort(reverse=True)
                return cands[0][1], cands[0][2], "ciudad"
        if ccs[0] == "US" and state in self.state_centroid:
            lat, lon = self.state_centroid[state]
            return lat, lon, "estado"
        if len(ccs) == 1 and ccs[0] in self.country_centroid:
            lat, lon = self.country_centroid[ccs[0]]
            return lat, lon, "pais"
        return None


# Nombres de Natural Earth (world-atlas) → ISO2 para los que importan en el mapa.
COUNTRY_ISO_BY_NE_NAME = {
    "United States of America": "US", "Dominican Rep.": "DO", "Puerto Rico": "PR", "Canada": "CA", "Mexico": "MX",
    "Venezuela": "VE", "Cuba": "CU", "Japan": "JP", "Panama": "PA", "Ireland": "IE", "United Kingdom": "GB",
    "Australia": "AU", "Germany": "DE", "Colombia": "CO", "South Korea": "KR", "Taiwan": "TW", "Nicaragua": "NI",
    "Netherlands": "NL", "Italy": "IT", "Bahamas": "BS", "Russia": "RU", "France": "FR", "Austria": "AT",
    "Hungary": "HU", "Czechia": "CZ", "Slovakia": "SK", "Croatia": "HR", "Slovenia": "SI", "Poland": "PL",
    "Ukraine": "UA", "Romania": "RO", "Serbia": "RS", "Bosnia and Herz.": "BA", "Sweden": "SE", "Jamaica": "JM",
    "Brazil": "BR", "Spain": "ES", "Norway": "NO", "China": "CN", "Portugal": "PT", "Philippines": "PH",
    "Honduras": "HN", "Lithuania": "LT", "South Africa": "ZA", "Saudi Arabia": "SA", "Afghanistan": "AF",
    "Greece": "GR", "Belarus": "BY", "Kazakhstan": "KZ", "Latvia": "LV", "Estonia": "EE", "Georgia": "GE",
    "Armenia": "AM", "Azerbaijan": "AZ", "Vietnam": "VN", "Denmark": "DK", "Switzerland": "CH", "Belgium": "BE",
    "Peru": "PE", "Belize": "BZ", "Indonesia": "ID", "Finland": "FI", "Nigeria": "NG", "Guatemala": "GT",
    "El Salvador": "SV", "Costa Rica": "CR", "Ecuador": "EC", "Argentina": "AR", "Chile": "CL", "Uruguay": "UY",
    "Paraguay": "PY", "Bolivia": "BO", "Haiti": "HT", "Trinidad and Tobago": "TT", "Israel": "IL", "India": "IN",
    "New Zealand": "NZ", "Egypt": "EG", "Turkey": "TR", "Iran": "IR", "Iraq": "IQ", "Lebanon": "LB",
    "Jordan": "JO", "Thailand": "TH", "Malaysia": "MY", "Bulgaria": "BG", "Iceland": "IS", "Luxembourg": "LU",
    "Morocco": "MA", "Tunisia": "TN", "Ghana": "GH", "Kenya": "KE", "Uganda": "UG", "Ethiopia": "ET",
    "Pakistan": "PK", "Sri Lanka": "LK", "Bangladesh": "BD", "Mongolia": "MN", "Nepal": "NP",
    "Papua New Guinea": "PG", "Fiji": "FJ",
}


# ----------------------------------------------------------------------------- construcción

POS_ORDER = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "OF", "DH"]
APP_COLS = {"P": "G_p", "C": "G_c", "1B": "G_1b", "2B": "G_2b", "3B": "G_3b", "SS": "G_ss", "LF": "G_lf", "CF": "G_cf",
            "RF": "G_rf", "DH": "G_dh"}


def ymd(y, m, d):
    y, m, d = to_int(y), to_int(m), to_int(d)
    if not y:
        return None
    return {"y": y, "m": m or None, "d": d or None}


def span(years):
    """[1995, 1996, 1998] → '1995–1996, 1998'."""
    if not years:
        return ""
    years = sorted(set(years))
    out, start, prev = [], years[0], years[0]
    for y in years[1:] + [None]:
        if y is not None and y == prev + 1:
            prev = y
            continue
        out.append(f"{start}–{prev}" if start != prev else str(start))
        if y is not None:
            start = prev = y
    return ", ".join(out)


def build():
    os.makedirs(OUT, exist_ok=True)
    log("Leyendo Lahman…")
    people = {r["playerID"]: r for r in read_csv("People.csv")}
    apps = [r for r in read_csv("Appearances.csv") if r["teamID"] == LAHMAN_TEAM and to_int(r["yearID"]) >= FIRST_SEASON]
    bat = [r for r in read_csv("Batting.csv") if r["teamID"] == LAHMAN_TEAM]
    pit = [r for r in read_csv("Pitching.csv") if r["teamID"] == LAHMAN_TEAM]
    # equipos por jugador en toda su carrera (para saber si fue de una sola franquicia)
    career_teams = defaultdict(set)
    for r in read_csv("Appearances.csv"):
        career_teams[r["playerID"]].add(r["teamID"])

    log("Leyendo Register…")
    bbref_to_mlbam, mlbam_to_bbref = {}, {}
    for h in "0123456789abcdef":
        for r in read_csv(f"register-{h}.csv"):
            if r["key_bbref"] and r["key_mlbam"]:
                bbref_to_mlbam[r["key_bbref"]] = int(r["key_mlbam"])
                mlbam_to_bbref[int(r["key_mlbam"])] = r["key_bbref"]
    bbref_to_lahman = {}
    for pid, p in people.items():
        bbref_to_lahman[p["bbrefID"] or pid] = pid

    log("Leyendo MLB API…")
    mlb_people = {p["id"]: p for p in load_json("mlb_people.json")}
    all_time = {x["person"]["id"]: x for x in load_json("mlb_allTime.json")["roster"]}
    roster_num = defaultdict(lambda: defaultdict(set))   # mlbam → número → {años}
    for y in NUMBER_ROSTER_YEARS:
        for x in load_json(f"mlb_roster_{y}.json").get("roster", []):
            n = (x.get("jerseyNumber") or "").strip()
            if n:
                roster_num[x["person"]["id"]][n].add(y)
    cur_hit = {s["player"]["id"]: s for s in load_json(f"mlb_{CURRENT_SEASON}_hitting.json")["stats"][0]["splits"]}
    cur_pit = {s["player"]["id"]: s for s in load_json(f"mlb_{CURRENT_SEASON}_pitching.json")["stats"][0]["splits"]}

    geo = Geo()

    # --- jugadores: Lahman (1903–2025) + API (2026)
    players = {}

    def new_player(pid):
        return {"id": pid, "yrs": set(), "appg": defaultdict(int), "g": 0, "bat": defaultdict(int),
                "pit": defaultdict(int), "nums": defaultdict(lambda: {"yrs": set(), "src": set()})}

    for r in apps:
        pid = r["playerID"]
        pl = players.setdefault(pid, new_player(pid))
        y = to_int(r["yearID"])
        pl["yrs"].add(y)
        pl["g"] += to_int(r["G_all"])
        for pos, col in APP_COLS.items():
            pl["appg"][pos] += to_int(r[col])
        # jardineros sin desglose (temporadas antiguas): usamos G_of
        if to_int(r["G_of"]) and not (to_int(r["G_lf"]) or to_int(r["G_cf"]) or to_int(r["G_rf"])):
            pl["appg"]["OF"] += to_int(r["G_of"])
    for r in bat:
        pl = players.get(r["playerID"])
        if not pl:
            continue
        for k in ("G", "AB", "R", "H", "2B", "3B", "HR", "RBI", "SB", "BB", "SO", "HBP", "SF"):
            pl["bat"][k] += to_int(r[k])
    for r in pit:
        pl = players.get(r["playerID"])
        if not pl:
            continue
        for k in ("W", "L", "G", "GS", "CG", "SHO", "SV", "IPouts", "H", "ER", "HR", "BB", "SO"):
            pl["pit"][k] += to_int(r[k])

    # 2026 desde la API
    cur_ids = set(cur_hit) | set(cur_pit)
    for mid in cur_ids:
        bb = mlbam_to_bbref.get(mid)
        pid = bbref_to_lahman.get(bb) if bb else None
        if not pid:
            pid = f"mlb{mid}"
        pl = players.setdefault(pid, new_player(pid))
        pl["mlbam"] = mid
        pl["yrs"].add(CURRENT_SEASON)
        h = cur_hit.get(mid)
        if h:
            s = h["stat"]
            pl["g"] += s.get("gamesPlayed", 0)
            for a, b in (("G", "gamesPlayed"), ("AB", "atBats"), ("R", "runs"), ("H", "hits"), ("2B", "doubles"),
                         ("3B", "triples"), ("HR", "homeRuns"), ("RBI", "rbi"), ("SB", "stolenBases"),
                         ("BB", "baseOnBalls"), ("SO", "strikeOuts"), ("HBP", "hitByPitch"), ("SF", "sacFlies")):
                pl["bat"][a] += s.get(b, 0)
            pos = h.get("position", {}).get("abbreviation")
            if pos in APP_COLS or pos == "OF":
                pl["appg"][pos] += s.get("gamesPlayed", 0)
        p = cur_pit.get(mid)
        if p:
            s = p["stat"]
            if not h:
                pl["g"] += s.get("gamesPitched", 0)
            for a, b in (("W", "wins"), ("L", "losses"), ("G", "gamesPitched"), ("GS", "gamesStarted"),
                         ("CG", "completeGames"), ("SHO", "shutouts"), ("SV", "saves"), ("IPouts", "outs"),
                         ("H", "hits"), ("ER", "earnedRuns"), ("HR", "homeRuns"), ("BB", "baseOnBalls"),
                         ("SO", "strikeOuts")):
                pl["pit"][a] += s.get(b, 0)
            pl["appg"]["P"] += s.get("gamesPitched", 0)

    # --- fichas
    out, stats_geo = [], defaultdict(int)
    for pid, pl in players.items():
        lah = people.get(pid)
        mid = pl.get("mlbam") or (bbref_to_mlbam.get(lah["bbrefID"] or pid) if lah else None)
        mp = mlb_people.get(mid) if mid else None
        if lah:
            first, last = lah["nameFirst"], lah["nameLast"]
            given = lah["nameGiven"]
            born = ymd(lah["birthYear"], lah["birthMonth"], lah["birthDay"])
            died = ymd(lah["deathYear"], lah["deathMonth"], lah["deathDay"])
            city, state, country = lah["birthCity"], lah["birthState"], lah["birthCountry"]
            bats, throws, debut, final = lah["bats"], lah["throws"], lah["debut"], lah["finalGame"]
            bbref = lah["bbrefID"] or pid
            src = "lahman"
        elif mp:
            first, last = mp.get("useName") or mp.get("firstName", ""), mp.get("useLastName") or mp.get("lastName", "")
            given = " ".join(x for x in (mp.get("firstName"), mp.get("middleName"), mp.get("lastName")) if x)
            bd = (mp.get("birthDate") or "").split("-")
            born = ymd(*bd) if len(bd) == 3 else None
            died = None
            city, state, country = mp.get("birthCity", ""), mp.get("birthStateProvince", ""), mp.get("birthCountry", "")
            bats = (mp.get("batSide") or {}).get("code", "")
            throws = (mp.get("pitchHand") or {}).get("code", "")
            debut = mp.get("mlbDebutDate", "")
            final = ""
            bbref = mlbam_to_bbref.get(mid, "")
            src = "mlb"
        else:
            log("sin ficha:", pid)
            continue
        if pl["yrs"] and max(pl["yrs"]) == CURRENT_SEASON:
            final = ""
        ccs = COUNTRY_ISO.get(country, [])
        cc = ccs[0] if len(ccs) == 1 else None
        loc = geo.locate(city, state, country)
        if loc:
            stats_geo[loc[2]] += 1
        else:
            stats_geo["sin"] += 1
        if country in HISTORIC_ES:
            country_es = HISTORIC_ES[country]
        else:
            country_es = COUNTRY_ES.get(cc, country) if cc else country

        # posiciones por juegos
        appg = {k: v for k, v in pl["appg"].items() if v}
        pos_sorted = sorted(appg.items(), key=lambda kv: (-kv[1], POS_ORDER.index(kv[0]) if kv[0] in POS_ORDER else 99))
        positions = [p for p, _ in pos_sorted]
        primary = positions[0] if positions else ""

        # números de uniforme (sólo con evidencia atribuible a los Yankees)
        nums = pl["nums"]
        if mid:
            for n, yrs in roster_num.get(mid, {}).items():
                nums[n]["yrs"] |= yrs
                nums[n]["src"].add("roster")
            if mp:
                for e in mp.get("rosterEntries", []):
                    if (e.get("team") or {}).get("id") == YANKEES_MLBAM and e.get("jerseyNumber"):
                        y0 = to_int((e.get("startDate") or "")[:4])
                        y1 = to_int((e.get("endDate") or f"{CURRENT_SEASON}")[:4]) or CURRENT_SEASON
                        yrs = {y for y in range(y0, y1 + 1) if y in pl["yrs"]} if y0 else set()
                        nums[e["jerseyNumber"].strip()]["yrs"] |= yrs
                        nums[e["jerseyNumber"].strip()]["src"].add("rosterEntries")
                at = all_time.get(mid)
                if at and (at.get("jerseyNumber") or "").strip():
                    nums[at["jerseyNumber"].strip()]["src"].add("allTime")
                pn = (mp.get("primaryNumber") or "").strip()
                single = career_teams.get(pid, set()) <= {LAHMAN_TEAM} and src == "lahman"
                if pn and single and max(pl["yrs"]) < CURRENT_SEASON:
                    nums[pn]["src"].add("primary")
        numbers = []
        for n in sorted(nums, key=lambda s: (len(s), s)):
            if not re.fullmatch(r"\d{1,2}", n):
                continue
            numbers.append({"n": n, "yrs": sorted(nums[n]["yrs"]), "src": sorted(nums[n]["src"])})

        b = pl["bat"]
        batting = None
        if b.get("G") or b.get("AB"):
            ab, h, bb, hbp, sf = b["AB"], b["H"], b["BB"], b["HBP"], b["SF"]
            tb = h + b["2B"] + 2 * b["3B"] + 3 * b["HR"]
            batting = {k: b[k] for k in ("G", "AB", "R", "H", "2B", "3B", "HR", "RBI", "SB", "BB", "SO")}
            batting["AVG"] = round(h / ab, 3) if ab else None
            pa = ab + bb + hbp + sf
            batting["OBP"] = round((h + bb + hbp) / pa, 3) if pa else None
            batting["SLG"] = round(tb / ab, 3) if ab else None
        p = pl["pit"]
        pitching = None
        if p.get("G"):
            pitching = {k: p[k] for k in ("W", "L", "G", "GS", "CG", "SHO", "SV", "H", "ER", "HR", "BB", "SO")}
            pitching["IP"] = f"{p['IPouts'] // 3}.{p['IPouts'] % 3}"
            pitching["ERA"] = round(p["ER"] * 27 / p["IPouts"], 2) if p["IPouts"] else None

        yrs = sorted(pl["yrs"])
        rec = {
            "id": pid, "mlbam": mid, "bbref": bbref, "src": src,
            "name": f"{first} {last}".strip(), "first": first, "last": last, "given": given,
            "born": born, "died": died,
            "city": city, "state": state, "stateName": US_STATES.get(state, state) if country == "USA" else state,
            "country": country, "countryEs": country_es, "cc": cc,
            "lat": loc[0] if loc else None, "lon": loc[1] if loc else None, "geo": loc[2] if loc else None,
            "latam": bool(cc and cc in LATAM), "mex": cc == "MX",
            "bats": bats, "throws": throws, "debut": debut, "final": final,
            "yrs": yrs, "span": span(yrs), "firstYr": yrs[0], "lastYr": yrs[-1],
            "decades": sorted({y // 10 * 10 for y in yrs}),
            "g": pl["g"], "pos": positions, "primary": primary, "posG": appg,
            "bat": batting, "pit": pitching, "numbers": numbers,
        }
        out.append(rec)

    out.sort(key=lambda r: (norm(r["last"]), norm(r["first"]), r["firstYr"]))
    log(f"Jugadores: {len(out)}  geo: {dict(stats_geo)}")

    # --- números del uniforme
    numbers = defaultdict(list)
    for r in out:
        for n in r["numbers"]:
            numbers[str(int(n["n"]))].append({"id": r["id"], "name": r["name"], "yrs": n["yrs"], "src": n["src"],
                                              "span": r["span"]})
    for n in numbers:
        numbers[n].sort(key=lambda x: (x["yrs"][0] if x["yrs"] else 9999, norm(x["name"])))

    meta = {
        "built": time.strftime("%Y-%m-%d"),
        "players": len(out),
        "seasons": [FIRST_SEASON, CURRENT_SEASON],
        "lahmanVersion": "2025 (publicada 2026-01-02, archivos CSV actualizados 2026-02-18)",
        "numbersSince": NUMBER_ROSTER_YEARS[0],
        "countries": sorted({r["cc"] for r in out if r["cc"]}),
        "geo": dict(stats_geo),
        "latam": sum(1 for r in out if r["latam"]),
        "mex": sum(1 for r in out if r["mex"]),
        "withNumbers": sum(1 for r in out if r["numbers"]),
    }

    def write_js(name, var, obj):
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            f.write(f"// Generado por scripts/build.py el {meta['built']}. No editar a mano.\n")
            f.write(f"window.{var} = ")
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
            f.write(";\n")

    write_js("players.js", "FRANELA_PLAYERS", out)
    write_js("numbers.js", "FRANELA_NUMBERS", numbers)
    write_js("world.js", "FRANELA_WORLD", {"w": 1000, "h": 500, "countries": geo.world_paths, "states": geo.state_paths,
                                           "countryEs": COUNTRY_ES, "usStates": US_STATES})
    write_js("meta.js", "FRANELA_META", meta)
    log("Listo:", OUT)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd in ("fetch", "all"):
        fetch()
    if cmd in ("build", "all"):
        build()
