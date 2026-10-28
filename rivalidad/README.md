# La Rivalidad

Sala de «El Monumento» dedicada a Yankees contra Red Sox: todos los juegos entre los
dos equipos desde el 7 de mayo de 1903, con el marcador histórico, la ventaja año con
año, cada temporada del duelo, los momentos clave con su pizarra real y un buscador de
cualquier juego por fecha.

Abre `index.html` con doble clic. No necesita servidor, build ni conexión a internet.

## Datos

Nada está escrito a mano salvo los textos de `data/momentos.json`, y cada cifra de esos
textos se verificó contra `data/juegos.json`.

| Fuente | Qué aporta |
| --- | --- |
| [Retrosheet, game logs](https://www.retrosheet.org/gamelogs/index.html) | Pizarras de temporada regular 1903–2025 y de postemporada (linescore, hits, errores, lanzadores, managers, parque, asistencia, duración) |
| [Retrosheet, parkcode.txt](https://www.retrosheet.org/parkcode.txt) | Nombres de los estadios |
| [MLB Stats API](https://statsapi.mlb.com/api/v1/schedule) | Juegos de 2026 (Retrosheet aún no los publica) y tablas de posiciones finales de la Liga Americana 1903–2026 |

La Lahman Baseball Database / Chadwick Baseball Databank no se usó al final: desde este
entorno no fue posible descargarla de GitHub, y las tablas de posiciones que iba a aportar
se obtuvieron de la MLB Stats API.

> The information used here was obtained free of charge from and is copyrighted by
> Retrosheet. Interested parties may contact Retrosheet at "www.retrosheet.org".

### Regenerar

```sh
python3 scripts/descargar.py --hasta 2026   # baja los datos crudos a scripts/raw/ (ignorado por git)
python3 scripts/procesar.py                 # genera data/*.json y data/*.js
```

El esquema de los JSON está en `data/ESQUEMA.md`. Los `.js` son los mismos datos
envueltos en `window.RIVALIDAD` para que la página funcione desde `file://`.

### Convenciones

- El juego de desempate del 2 de octubre de 1978 cuenta como temporada regular (tipo `T`),
  igual que en los registros oficiales.
- Los 14 empates (el último en 1958) se cuentan aparte; no suman a ningún equipo.
- Juegos pospuestos o suspendidos sin terminar no aparecen.
