# La Franela

Ala de **El Monumento**: el archivo de todos los jugadores que han vestido el uniforme de los Highlanders y los Yankees de Nueva York (1903–2026), en español de México.

Abre `index.html` con doble clic. No necesita servidor ni conexión: los datos van incrustados en `data/*.js`.

## Salas

- **Archivo** — buscador instantáneo por nombre, posición, década y número de uniforme. Cada ficha trae temporadas con el equipo, números de carrera con los Yankees (bateo y pitcheo), números que usó y lugar de nacimiento, con enlaces a MLB.com y Baseball-Reference.
- **Mapa** — dónde nació cada jugador, con filtro por década y alcance (fuera de EE. UU., América Latina, México). Mapa SVG propio, sin librerías ni llaves.
- **Sala latina** — los nacidos en América Latina, con sección aparte para los mexicanos.
- **Números** — del 0 al 99, quién ha llevado cada número con los Yankees.
- **Fuentes** — de dónde sale cada dato y con qué criterio.

## Datos

Todo lo genera `scripts/build.py` a partir de fuentes públicas; nada se escribió a mano y lo que no está en las fuentes queda vacío.

| Fuente | Uso |
| --- | --- |
| [SABR Lahman Baseball Database](https://sabr.org/lahman-database/), versión 2025 (CC BY-SA 3.0) | Fichas, apariciones, bateo y pitcheo 1903–2025 |
| [Chadwick Register](https://github.com/chadwickbureau/register) | Cruce de identificadores Lahman ↔ MLB |
| [MLB Stats API](https://statsapi.mlb.com/) (pública, sin llave) | Temporada 2026, números de uniforme, fichas sin registro en Lahman |
| [GeoNames](https://www.geonames.org/) cities500 (CC BY 4.0) | Coordenadas de las ciudades de nacimiento |
| Natural Earth vía world-atlas / us-atlas | Contornos del mapa |

Para regenerar:

```sh
python3 scripts/build.py          # descarga a scripts/raw/ y escribe data/
python3 scripts/verificar.py      # coteja una muestra de fichas contra la MLB Stats API
```

Sólo usa la biblioteca estándar de Python 3.

## Límites conocidos

- Los números de uniforme anteriores a los años noventa sólo se atribuyen cuando la MLB Stats API los liga sin duda al jugador con los Yankees; por eso faltan números famosos de jugadores que pasaron por otros equipos (por ejemplo, el 3 de Ruth).
- Lahman y MLB difieren en unos pocos totales antiguos (Ruth tiene 1,975 carreras impulsadas en Lahman y 1,971 en MLB). Se muestra Lahman, que es la fuente de 1903–2025.
- Ciudades que no están en GeoNames se ubican en el centro del estado o del país y se dibujan como punto hueco.
