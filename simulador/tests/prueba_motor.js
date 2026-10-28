/*
 * prueba_motor.js — Pruebas del motor. Correr con: node tests/prueba_motor.js
 * Termina con código 0 si todo pasa; imprime una tabla legible.
 *
 * (a) Determinismo con semilla.
 * (b) Calibración: temporada de 162 juegos de los Yankees de 1927, 1961,
 *     1998, 2009 y 2022 contra el equipo neutro de su año; carreras y HR por
 *     juego con tolerancia ±15 % (y carreras permitidas vs RA real).
 * (c) Invariantes de cada juego simulado.
 * (d) 200 series 1927 vs 1998 sin excepción, 4–7 juegos por serie.
 */
'use strict';
var path = require('path');
global.window = global;
global.SIM_DATOS = { temporadas: {} };
var raiz = path.join(__dirname, '..');
require(path.join(raiz, 'data', 'indice.js'));
require(path.join(raiz, 'data', 'liga.js'));
var ANIOS = [1927, 1961, 1998, 2009, 2022];
ANIOS.forEach(function (a) { require(path.join(raiz, 'data', 'temporadas', a + '.js')); });
var SimMotor = require(path.join(raiz, 'js', 'motor.js'));
var SimNarracion = require(path.join(raiz, 'js', 'narracion.js'));

var fallos = [];
var filas = [];
function ok(cond, msg) { if (!cond) fallos.push(msg); return cond; }
function pct(a, b) { return b ? ((a - b) / b * 100) : 0; }
function f2(x) { return (Math.round(x * 100) / 100).toFixed(2); }
function pad(s, n, der) { s = String(s); while (s.length < n) s = der ? s + ' ' : ' ' + s; return s; }

// ---------------------------------------------------------------------------
// (c) Invariantes de un juego
// ---------------------------------------------------------------------------
function verificarJuego(j, etiqueta) {
  var e = etiqueta + ': ';
  ['visita', 'local'].forEach(function (k) {
    var lado = j[k];
    var suma = lado.lineas.reduce(function (a, b) { return a + b; }, 0);
    ok(suma === lado.carreras, e + 'suma de líneas (' + suma + ') != carreras (' + lado.carreras + ') de ' + k);
    var hitsBox = j.boxscore[k].bateo.reduce(function (a, b) { return a + b.H; }, 0);
    ok(hitsBox === lado.hits, e + 'hits del box (' + hitsBox + ') != hits del juego (' + lado.hits + ') de ' + k);
    var hitsJugadas = j.jugadas.filter(function (x) { return x.tipo === 'PA' && x.ofensiva === k && ['1B', '2B', '3B', 'HR'].indexOf(x.evento) >= 0; }).length;
    ok(hitsJugadas === lado.hits, e + 'hits en jugadas (' + hitsJugadas + ') != hits del juego de ' + k);
    var carrerasBox = j.boxscore[k].bateo.reduce(function (a, b) { return a + b.R; }, 0);
    ok(carrerasBox === lado.carreras, e + 'carreras del box != carreras de ' + k);
    var otro = k === 'visita' ? 'local' : 'visita';
    var carrerasPit = j.boxscore[otro].pitcheo.reduce(function (a, b) { return a + b.R; }, 0);
    ok(carrerasPit === lado.carreras, e + 'carreras cargadas al pitcheo de ' + otro + ' != carreras de ' + k);
    var outsPit = j.boxscore[otro].pitcheo.reduce(function (a, b) { return a + b.IPouts; }, 0);
    var entradasDe = j.jugadas.filter(function (x) { return x.tipo === 'FIN_ENTRADA' && x.ofensiva === k; });
    entradasDe.forEach(function (fe) { ok(fe.outs === 3, e + 'entrada ' + fe.entrada + ' (' + k + ') terminó con ' + fe.outs + ' outs'); });
    var cerradas = entradasDe.length * 3;
    ok(outsPit >= cerradas && outsPit <= cerradas + 2, e + 'outs del pitcheo de ' + otro + ' (' + outsPit + ') no cuadran con entradas cerradas (' + cerradas + ')');
    // Sin NaN
    j.boxscore[k].bateo.concat(j.boxscore[k].pitcheo).forEach(function (r) {
      Object.keys(r).forEach(function (c) { if (typeof r[c] === 'number') ok(!isNaN(r[c]), e + 'NaN en box ' + k + ' ' + r.nombre + ' ' + c); });
    });
    ok(!isNaN(lado.carreras) && !isNaN(lado.hits) && !isNaN(lado.errores), e + 'NaN en marcador de ' + k);
  });
  var g = j.visita.carreras > j.local.carreras ? 'visita' : 'local';
  ok(j.visita.carreras !== j.local.carreras, e + 'juego terminó empatado');
  ok(j.ganador === g, e + 'ganador inconsistente');
  ok(j.entradas >= 9, e + 'menos de 9 entradas');
  // Línea del local sin la baja de la 9ª cuando iba ganando.
  ok(j.visita.lineas.length === j.entradas, e + 'líneas de la visita != entradas');
  ok(j.local.lineas.length === j.entradas || j.local.lineas.length === j.entradas - 1, e + 'líneas del local inconsistentes');
  // Decisiones
  ok(j.decisiones.ganador && j.decisiones.perdedor, e + 'faltan decisiones');
  ok(j.decisiones.ganador.equipo === j[g].nombre, e + 'el ganador no pertenece al equipo que ganó');
  // Marcador de la última jugada = final.
  var ult = j.jugadas[j.jugadas.length - 1];
  ok(ult.tipo === 'FIN_JUEGO' && ult.marcador.visita === j.visita.carreras && ult.marcador.local === j.local.carreras, e + 'marcador final inconsistente');
  // Outs de cada PA ≤ 3 y consistentes.
  j.jugadas.forEach(function (x) {
    if (x.tipo === 'PA' || x.tipo === 'ROBO') ok(x.outsDespues >= x.outsAntes && x.outsDespues <= 3, e + 'outs inválidos en jugada');
  });
}

// ---------------------------------------------------------------------------
// Preparación
// ---------------------------------------------------------------------------
var liga = SIM_DATOS.liga;
var equipos = {}, neutros = {};
ANIOS.forEach(function (a) {
  equipos[a] = SimMotor.construirEquipo(SIM_DATOS.temporadas[a], liga, {});
  neutros[a] = SimMotor.equipoNeutro(liga, a);
});

// ---------------------------------------------------------------------------
// (a) Determinismo
// ---------------------------------------------------------------------------
(function () {
  var j1 = SimMotor.simularJuego(equipos[1927], equipos[1998], { semilla: 12345 });
  var j2 = SimMotor.simularJuego(equipos[1927], equipos[1998], { semilla: 12345 });
  var j3 = SimMotor.simularJuego(equipos[1927], equipos[1998], { semilla: 12346 });
  var s1 = JSON.stringify(j1), s2 = JSON.stringify(j2), s3 = JSON.stringify(j3);
  ok(s1 === s2, 'determinismo: dos juegos con la misma semilla difieren');
  ok(s1 !== s3, 'determinismo: semillas distintas dieron el mismo juego');
  verificarJuego(j1, 'juego determinismo');
  // Narración: una frase por jugada, sin vacíos.
  var n = SimNarracion.narrar(j1);
  ok(n.length === j1.jugadas.length, 'narración: frases (' + n.length + ') != jugadas (' + j1.jugadas.length + ')');
  n.forEach(function (x, i) { ok(typeof x.texto === 'string' && x.texto.length > 0, 'narración: frase vacía en jugada ' + i); });
  var n2 = SimNarracion.narrar(j2);
  ok(JSON.stringify(n) === JSON.stringify(n2), 'narración: no es determinista');
  filas.push(['Determinismo', 'misma semilla = mismo juego', s1 === s2 && s1 !== s3 ? 'OK' : 'FALLA']);
  var sr1 = SimMotor.simularSerie(equipos[1927], equipos[1998], { semilla: 7 });
  var sr2 = SimMotor.simularSerie(equipos[1927], equipos[1998], { semilla: 7 });
  ok(JSON.stringify(sr1) === JSON.stringify(sr2), 'determinismo: series con la misma semilla difieren');
})();

// ---------------------------------------------------------------------------
// (b) Calibración contra el equipo neutro
// ---------------------------------------------------------------------------
var TOL = 0.15;
console.log('');
console.log('Calibración: Yankees vs promedio de liga del mismo año, 162 juegos');
console.log(pad('Año', 5, true) + pad('R/J real', 10) + pad('R/J sim', 9) + pad('dif', 7) + pad('HR/J real', 11) + pad('HR/J sim', 10) + pad('dif', 7) + pad('RA/J real', 11) + pad('RA/J sim', 10) + pad('dif', 7) + pad('AVG', 7) + pad('BB/J', 7) + pad('K/J', 7));
ANIOS.forEach(function (a) {
  var t = SIM_DATOS.temporadas[a];
  var res = SimMotor.simularTemporada(equipos[a], neutros[a], 162, 2024 + a);
  res.juegosLista.forEach(function (j, i) { verificarJuego(j, 'temporada ' + a + ' juego ' + (i + 1)); });
  var rReal = t.R / t.G, hrReal = t.HR / t.G, raReal = t.RA / t.G;
  var dR = pct(res.RporJuego, rReal), dHR = pct(res.HRporJuego, hrReal), dRA = pct(res.RAporJuego, raReal);
  ok(Math.abs(dR) <= TOL * 100, 'calibración ' + a + ': carreras/juego sim ' + f2(res.RporJuego) + ' vs real ' + f2(rReal) + ' (' + f2(dR) + '%)');
  ok(Math.abs(dHR) <= TOL * 100, 'calibración ' + a + ': HR/juego sim ' + f2(res.HRporJuego) + ' vs real ' + f2(hrReal) + ' (' + f2(dHR) + '%)');
  ok(Math.abs(dRA) <= TOL * 100, 'calibración ' + a + ': carreras permitidas/juego sim ' + f2(res.RAporJuego) + ' vs real ' + f2(raReal) + ' (' + f2(dRA) + '%)');
  console.log(pad(a, 5, true) + pad(f2(rReal), 10) + pad(f2(res.RporJuego), 9) + pad(f2(dR) + '%', 7) + pad(f2(hrReal), 11) + pad(f2(res.HRporJuego), 10) + pad(f2(dHR) + '%', 7) + pad(f2(raReal), 11) + pad(f2(res.RAporJuego), 10) + pad(f2(dRA) + '%', 7) + pad(res.AVG.toFixed(3), 7) + pad(f2(res.BB / res.juegos), 7) + pad(f2(res.SO / res.juegos), 7));
  filas.push(['Calibración ' + a, 'R ' + f2(dR) + '%, HR ' + f2(dHR) + '%, RA ' + f2(dRA) + '%', (Math.abs(dR) <= 15 && Math.abs(dHR) <= 15 && Math.abs(dRA) <= 15) ? 'OK' : 'FALLA']);
});
// Promedio de bateo real del equipo (sólo informativo).
ANIOS.forEach(function (a) {
  var t = SIM_DATOS.temporadas[a], H = 0, AB = 0;
  t.bateadores.forEach(function (b) { H += b.H || 0; AB += b.AB || 0; });
  var eq = equipos[a];
  console.log('  ' + a + ' AVG real del equipo: ' + (H / AB).toFixed(3) + '  (lineup: ' + eq.lineup.map(function (x) { return SimMotor.apellido(eq.bateadores[x.id] ? eq.bateadores[x.id].nombre : eq.lanzadores[x.id].nombre) + '-' + x.pos; }).join(', ') + ')');
});

// ---------------------------------------------------------------------------
// (d) 200 series 1927 vs 1998
// ---------------------------------------------------------------------------
(function () {
  var errores = 0, juegosTotales = 0;
  var res = null;
  try {
    res = SimMotor.simularMuchas(equipos[1927], equipos[1998], 200, { alMejorDe: 7, semilla: 99 });
  } catch (e) { errores++; fallos.push('series: excepción ' + (e && e.stack || e)); }
  if (res) {
    Object.keys(res.juegosPorSerie).forEach(function (k) {
      var n = res.juegosPorSerie[k];
      juegosTotales += n;
      ok(+k >= 4 && +k <= 7, 'series: serie de ' + k + ' juegos');
    });
    ok(juegosTotales === 200, 'series: ' + juegosTotales + ' series contadas en vez de 200');
    ok(res.victoriasA + res.victoriasB === 200, 'series: victorias no suman 200');
    console.log('');
    console.log('200 series 1927 vs 1998: Yankees 1927 ' + res.victoriasA + ' (' + (res.pctA * 100).toFixed(1) + '%), Yankees 1998 ' + res.victoriasB + ' (' + (res.pctB * 100).toFixed(1) + '%)');
    console.log('  carreras/juego: 1927 ' + f2(res.promedioCarrerasA) + ', 1998 ' + f2(res.promedioCarrerasB) + '; juegos por serie: ' + JSON.stringify(res.juegosPorSerie));
    // Invariantes de una muestra de series.
    for (var i = 0; i < 20; i++) {
      var s = SimMotor.simularSerie(equipos[1927], equipos[1998], { alMejorDe: 7, semilla: 500 + i });
      ok(s.juegos.length >= 4 && s.juegos.length <= 7, 'serie ' + i + ': ' + s.juegos.length + ' juegos');
      s.juegos.forEach(function (j, k) { verificarJuego(j, 'serie ' + i + ' juego ' + (k + 1)); });
    }
    filas.push(['200 series 1927 vs 1998', 'sin excepción, 4–7 juegos', errores === 0 && juegosTotales === 200 ? 'OK' : 'FALLA']);
  } else filas.push(['200 series 1927 vs 1998', 'excepción', 'FALLA']);
})();

// Juegos entre eras con y sin DH (regla de la casa) y con mezcla de años.
(function () {
  var pares = [[1927, 2022], [2022, 1927], [1961, 2009], [1998, 1961]];
  pares.forEach(function (p, k) {
    for (var i = 0; i < 25; i++) {
      var j = SimMotor.simularJuego(equipos[p[0]], equipos[p[1]], { semilla: 3000 + k * 100 + i, abridorIndex: i });
      verificarJuego(j, 'cruzado ' + p[0] + '@' + p[1] + ' #' + i);
      ok(j.conDH === equipos[p[1]].usarDH, 'cruzado: regla de la casa del DH no respetada');
    }
  });
  filas.push(['Juegos entre eras', '100 juegos, regla de la casa del DH', 'OK']);
})();

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------
console.log('');
console.log(pad('Prueba', 28, true) + pad('Detalle', 44, true) + 'Resultado');
console.log(new Array(80).join('-'));
filas.forEach(function (f) { console.log(pad(f[0], 28, true) + pad(f[1], 44, true) + f[2]); });
console.log('');
if (fallos.length) {
  console.log('FALLOS (' + fallos.length + '):');
  fallos.slice(0, 40).forEach(function (f) { console.log('  - ' + f); });
  if (fallos.length > 40) console.log('  ... y ' + (fallos.length - 40) + ' más');
  process.exit(1);
} else {
  console.log('Todas las pruebas pasaron.');
  process.exit(0);
}
