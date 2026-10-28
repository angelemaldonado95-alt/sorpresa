# El Monumento

Museo digital de los New York Yankees, en español. Siete salas: las temporadas (1903–2026), los 27 anillos, Monument Park, «Este día en la historia», un duelo de leyendas, el vestidor (trivia) y la portada.

Es un sitio estático: HTML, CSS y JavaScript sin paso de construcción, sin frameworks y sin conexión a internet (salvo las fuentes tipográficas de Google Fonts, que si no cargan se sustituyen por las del sistema).

## Cómo abrirlo

- **En la computadora:** doble clic en `index.html`. Funciona directo desde el disco.
- **En GitHub Pages:** en la configuración del repositorio, *Pages → Source: Deploy from a branch → main / (root)*. El sitio queda en `https://<usuario>.github.io/<repositorio>/`.

## De dónde salen los datos

Todo lo que se muestra proviene de registros públicos; no hay cifras ni fechas escritas a mano:

- **Lahman Baseball Database** (versión 14.0, datos 1871–2025, licencia CC BY-SA 3.0), tomada del paquete `Lahman` de CRAN: temporadas, récords, mánagers, bateo y pitcheo por jugador, postemporada, premios y Salón de la Fama.
- **Retrosheet** (game logs 1903–2025, temporada regular y postemporada): resultado de cada juego, líneas de anotación, pitchers, estadios y asistencia. *The information used here was obtained free of charge from and is copyrighted by Retrosheet.*
- **MLB Stats API** (`statsapi.mlb.com`, pública, sin llave): la temporada en curso que Lahman y Retrosheet aún no cubren (2026).
- **Chadwick Bureau Register**: equivalencia entre los identificadores de la MLB Stats API y los de Lahman.
- **MLB.com / Yankees**: la lista oficial de números retirados y su año.

Los archivos procesados están en `data/` (`*.json` para consultar; `*.js` es el mismo contenido envuelto para que el sitio funcione desde `file://`). Cada sala indica al pie sus fuentes concretas. Las crónicas, efemérides y preguntas de trivia se redactan automáticamente a partir de esos datos.

## Cómo actualizar la temporada

Requiere Python 3 y el paquete `rdata` (`pip install rdata`).

```bash
python3 scripts/descargar.py --temporada 2027   # baja las fuentes a scripts/crudo/ (≈300 MB, no se versiona)
python3 scripts/procesar.py  --temporada 2027   # regenera data/
```

Cuando salga una nueva versión de Lahman o nuevos game logs de Retrosheet, basta con actualizar la URL del paquete en `scripts/descargar.py` (`LAHMAN_CRAN`) y el parámetro `--ultimo-retro`, y volver a correr ambos scripts.

## Aviso

Proyecto de aficionado, sin relación con los New York Yankees ni con Major League Baseball. No usa logos ni imágenes con derechos.
