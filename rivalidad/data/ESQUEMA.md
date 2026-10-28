# Esquema de los datos (`rivalidad/data/`)

Todos los archivos los genera `scripts/procesar.py` a partir de los datos crudos
descargados por `scripts/descargar.py`. No se editan a mano, salvo `momentos.json`.

Equipos: `NYY` (Yankees; Highlanders 1903–1912) y `BOS` (Red Sox; Americans 1903–1907).

## `juegos.json`

Arreglo con **todos** los juegos entre los dos equipos desde 1903, ordenado por fecha.

```json
{
  "id": "19781002-0",            // fecha + número de juego (0 sencillo, 1/2 doble cartelera)
  "fecha": "1978-10-02",
  "temporada": 1978,
  "tipo": "R",                   // R regular, T desempate (cuenta como regular), F comodín,
                                 // D divisional, L campeonato de liga, W Serie Mundial
  "serie": "ALCS",               // solo postemporada: "ALWC", "ALDS", "ALCS", "WS"
  "numJuego": 0,                 // 0 = juego único del día; 1/2 = doble cartelera
  "dia": "Mon",
  "local": "BOS",
  "visita": "NYY",
  "carreras": {"NYY": 5, "BOS": 4},
  "hits": {"NYY": 8, "BOS": 11},
  "errores": {"NYY": 0, "BOS": 0},
  "jonrones": {"NYY": 2, "BOS": 1},   // puede ser null si Retrosheet no lo tiene
  "entradas": {"NYY": "000000410", "BOS": "010001020"},  // linescore por entrada; "x" = no bateó
  "outs": 54,                    // duración en outs; 54 = 9 entradas completas
  "numEntradas": 9,
  "ganador": "NYY",              // null si empate
  "margen": 1,
  "parque": "BOS07",             // código Retrosheet; nombre en parques.json
  "asistencia": 32925,           // null si no se conoce
  "duracionMin": 172,            // null si no se conoce
  "diaNoche": "D",
  "lanzadores": {
    "ganador": "Ron Guidry", "perdedor": "Mike Torrez", "salvamento": "Goose Gossage",
    "abridorNYY": "Ron Guidry", "abridorBOS": "Mike Torrez"
  },
  "managers": {"NYY": "Bob Lemon", "BOS": "Don Zimmer"},
  "fuente": "retrosheet"         // o "mlb"
}
```

## `temporadas.json`

Arreglo, una entrada por temporada (1903–2026).

```json
{
  "temporada": 1978,
  "regular": {"NYY": 9, "BOS": 6, "empates": 0},       // incluye el desempate
  "postemporada": {"NYY": 0, "BOS": 0, "serie": null},  // serie: {"nombre":"ALCS","ganador":"BOS","NYY":3,"BOS":4}
  "acumulado": {"NYY": 760, "BOS": 650, "empates": 14}, // regular acumulado hasta esta temporada incluida
  "acumuladoPost": {"NYY": 0, "BOS": 0},
  "posiciones": {                                       // tabla de posiciones final (MLB Stats API)
    "grupo": "Este de la Liga Americana",               // o "Liga Americana" antes de 1969
    "NYY": {"g": 100, "p": 63, "lugar": 1, "jd": "-"},  // jd = juegos detrás ("-" líder)
    "BOS": {"g": 99, "p": 64, "lugar": 2, "jd": "1.0"},
    "lider": "Yankees"                                  // quién quedó en 1er lugar del grupo
  },
  "masCerrados": ["19781002-0", "..."],                // ids; margen 1, hasta 3
  "masCarreras": ["19780910-0", "..."],                // ids; suma de carreras, hasta 3
  "juegos": 15                                          // total de juegos del año (todos los tipos)
}
```

## `resumen.json`

```json
{
  "generado": "2026-10-28",
  "regular": {"NYY": 1260, "BOS": 1100, "empates": 14, "juegos": 2374},
  "postemporada": {"NYY": 13, "BOS": 14, "juegos": 27, "series": [ {"temporada":2004,"nombre":"ALCS","ganador":"BOS","NYY":3,"BOS":4} ]},
  "total": {"NYY": 1273, "BOS": 1114},
  "primerJuego": "19030507-0",
  "ultimoJuego": "20260930-0",
  "fuentes": [ {"nombre": "...", "url": "...", "nota": "..."} ],
  "avisoRetrosheet": "The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at \"www.retrosheet.org\"."
}
```

## `parques.json`

Objeto `codigo → {"nombre": "Fenway Park", "ciudad": "Boston"}`.

## `momentos.json`

Arreglo curado (editado a mano, verificado contra `juegos.json`):

```json
{
  "id": "1978-dent",
  "temporada": 1978,
  "titulo": "El jonrón de Bucky Dent",
  "fecha": "1978-10-02",
  "juegos": ["19781002-0"],      // ids en juegos.json cuya pizarra se muestra
  "texto": ["párrafo 1", "párrafo 2"],
  "datos": [ {"etiqueta": "Asistencia", "valor": "32,925"} ],  // opcional
  "fuentes": ["Retrosheet, game log 1978"]
}
```
