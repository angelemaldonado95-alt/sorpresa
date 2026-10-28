# El Monumento

Museo digital de los New York Yankees, en español de México. Es un sitio estático: HTML, CSS y JavaScript sin paso de construcción, sin frameworks y sin conexión a internet (salvo las fuentes tipográficas de Google Fonts, que si no cargan se sustituyen por las del sistema). Todo dato sale de registros públicos; nada está escrito a mano.

## Cómo abrirlo

- **En la computadora:** doble clic en `index.html`. Funciona directo desde el disco.
- **En GitHub Pages:** en la configuración del repositorio, *Pages → Source: Deploy from a branch → main / (root)*. El sitio queda en `https://<usuario>.github.io/<repositorio>/`.

## Las salas (raíz del repositorio)

| Sala | Página | Qué muestra |
| --- | --- | --- |
| Portada | `index.html` | Entrada al museo, con «Este día en la historia» al frente |
| Las temporadas | `temporadas.html` | Una página por temporada 1903–2026, línea de tiempo y tabla completa |
| Los 27 anillos | `anillos.html` | Cada Serie Mundial, ganada o perdida, juego por juego, con figuras y crónica |
| Monument Park | `monument-park.html` | Los números retirados y la ficha de cada leyenda |
| Este día en la historia | `este-dia.html` | Lo que pasó en cualquier fecha del año |
| Duelo de leyendas | `duelo.html` | Dos jugadores cualesquiera, lado a lado |
| El vestidor | `vestidor.html` | Trivia generada desde los datos, con récord personal |

Sus datos están en `data/` y se regeneran con `scripts/descargar.py` y `scripts/procesar.py` (ver abajo).

## Las alas (cada una en su carpeta, con su propio README y sus propios datos)

| Ala | Carpeta | Qué muestra |
| --- | --- | --- |
| El Simulador | [`simulador/`](simulador/README.md) | Juegos y series simulados jugada por jugada entre cualquier par de Yankees de la historia |
| La Franela | [`franela/`](franela/README.md) | Archivo de todos los jugadores 1903–2026: buscador, mapa de nacimientos, sala latina y números de uniforme |
| La Rivalidad | [`rivalidad/`](rivalidad/README.md) | Yankees contra Red Sox desde 1903: marcador histórico, temporadas, momentos clave y buscador de juegos |

Las salas y las alas se enlazan entre sí: el menú «Salas» lleva a todas; cada ala tiene un enlace de regreso a la portada; las fichas de Monument Park y del Duelo enlazan a la ficha del jugador en La Franela, y las temporadas con postemporada contra Boston enlazan a La Rivalidad.

## De dónde salen los datos de las salas

- **Lahman Baseball Database** (versión 14.0, datos 1871–2025, licencia CC BY-SA 3.0), tomada del paquete `Lahman` de CRAN: temporadas, récords, mánagers, bateo y pitcheo por jugador, postemporada, premios y Salón de la Fama.
- **Retrosheet** (game logs 1903–2025, temporada regular y postemporada): resultado de cada juego, líneas de anotación, pitchers, estadios y asistencia. *The information used here was obtained free of charge from and is copyrighted by Retrosheet.*
- **MLB Stats API** (`statsapi.mlb.com`, pública, sin llave): la temporada en curso que Lahman y Retrosheet aún no cubren (2026).
- **Chadwick Bureau Register**: equivalencia entre los identificadores de la MLB Stats API y los de Lahman.
- **MLB.com / Yankees**: la lista oficial de números retirados y su año.

Los archivos procesados están en `data/` (`*.json` para consultar; `*.js` es el mismo contenido envuelto para que el sitio funcione desde `file://`). Cada sala indica al pie sus fuentes concretas. Las crónicas, efemérides y preguntas de trivia se redactan automáticamente a partir de esos datos. Las fuentes de cada ala están en su README.

## Cómo actualizar la temporada

Requiere Python 3 y el paquete `rdata` (`pip install rdata`).

```bash
python3 scripts/descargar.py --temporada 2027   # baja las fuentes a scripts/crudo/ (≈300 MB, no se versiona)
python3 scripts/procesar.py  --temporada 2027   # regenera data/
```

Cuando salga una nueva versión de Lahman o nuevos game logs de Retrosheet, basta con actualizar la URL del paquete en `scripts/descargar.py` (`LAHMAN_CRAN`) y el parámetro `--ultimo-retro`, y volver a correr ambos scripts. Cada ala tiene sus propios scripts de actualización, descritos en su README.

## Aviso

Proyecto de aficionado, sin relación con los New York Yankees ni con Major League Baseball. No usa logos ni imágenes con derechos.
