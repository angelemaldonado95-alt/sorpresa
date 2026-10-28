# El Simulador

Simulador jugada por jugada de juegos y series entre cualesquiera dos Yankees de la historia (1903–2025): los de 1927 contra los de 1998, Ruth contra Judge, 1961 contra 2009. Ala de «El Monumento».

Abre `simulador/index.html` con doble clic. No necesita servidor ni instalación.

## Cómo funciona

- Cada turno al bate se resuelve con las tasas reales del bateador y del lanzador en su temporada (sencillo, doble, triple, jonrón, base por bolas, golpe, ponche, out en juego), combinadas con el método log5 / razón de momios.
- Para que sea justo entre épocas, cada tasa se normaliza al entorno de la Liga Americana 1903–2025: se divide entre el promedio de la liga de ese año y se multiplica por el de referencia.
- Hay fatiga del abridor (presupuesto de bateadores según su carga real), cambios al bullpen y cerrador, bases robadas con las tasas de cada corredor, dobles matanzas y errores con la tasa de la defensa real de cada equipo.
- Lo que **no** se modela, porque Lahman no lo trae o no lo tenemos: ventaja de mano (zurdo contra derecho), factores de parque, bateadores emergentes. Las constantes del modelo que no salen de datos (avance de corredores, reparto rola/elevado/línea) están documentadas al inicio de `js/motor.js`.

## Datos

Todo sale de la [SABR Lahman Baseball Database](https://sabr.org/lahman-database/), versión 2025 (temporadas 1871–2025). No hay un solo número inventado; los campos que Lahman no registra en un año (p. ej. CS antes de 1920, SF antes de 1954) quedan en `null` y el motor usa el promedio de liga de ese año.

Para regenerar los datos:

```
python3 scripts/descargar.py lahman_csv      # baja los CSV oficiales (~25 MB)
python3 scripts/procesar.py lahman_csv       # escribe data/indice.js, data/liga.js, data/temporadas/AAAA.js
```

## Pruebas

```
node tests/prueba_motor.js
```

Comprueba determinismo con semilla, invariantes de cada juego (líneas, box score, outs) y que una temporada simulada de 1927, 1961, 1998, 2009 y 2022 contra un equipo promedio de su misma liga cuadre razonablemente con las carreras y jonrones reales.

## Estructura

```
index.html          interfaz
css/estilo.css      estilo (modo claro y oscuro)
js/motor.js         motor de probabilidades (sin DOM; corre también en Node)
js/narracion.js     narración de radio en español
js/app.js           interfaz
data/               datos procesados (JS plano para abrir por file://)
scripts/            descarga y procesamiento de Lahman
tests/              pruebas del motor
```
