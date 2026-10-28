/* El Monumento — Sala «El vestidor» (trivia).
   Todas las preguntas se generan al momento desde MONUMENTO.temporadas, series,
   jugadores, retirados y meta. Ninguna está escrita a mano. */
(function () {
  'use strict';
  var M = window.MONUMENTO || {};
  var U = M.util;
  var esc = U.esc, B = U.B, P = U.P;

  var temporadas = M.temporadas || [];
  var series = M.series || [];
  var jugadores = M.jugadores || {};
  var retirados = M.retirados || [];
  var sinHit = (M.meta && M.meta.sin_hit) || [];

  var CLAVE_LS = 'monumento-vestidor';
  var PREGUNTAS_POR_PARTIDA = 10;

  // ---------- azar ----------
  function entero(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function uno(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function barajar(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  // Toma hasta n elementos distintos (como texto) de `candidatos`, excluyendo `excluir`.
  function distractores(candidatos, excluir, n) {
    var vistos = {}, salida = [];
    vistos[excluir] = true;
    barajar(candidatos).forEach(function (c) {
      if (salida.length >= n) return;
      if (c === null || c === undefined || c === '' || vistos[c]) return;
      vistos[c] = true; salida.push(c);
    });
    return salida.length === n ? salida : null;
  }
  function mayuscula(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function lista(nombres) { // «A», «A y B», «A, B y C»
    if (nombres.length <= 1) return nombres[0] || '';
    return nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
  }

  // ---------- índices derivados de los datos ----------
  var porAno = {};
  temporadas.forEach(function (t) { porAno[t.a] = t; });
  var seriesPorAno = {};
  series.forEach(function (s) { seriesPorAno[s.a] = s; });

  // Nombre en español del rival (con artículo), a partir de las postemporadas y Series.
  var rivalEs = {};
  temporadas.forEach(function (t) { (t.post || []).forEach(function (p) { if (p.rival && p.rivalEs) rivalEs[p.rival] = p.rivalEs; }); });
  series.forEach(function (s) { if (s.rival && s.rivalEs) rivalEs[s.rival] = s.rivalEs; });
  function nombreRival(codigo, nombreIngles) { return rivalEs[codigo] || nombreIngles || codigo; }

  // Nombre del equipo según el año (Highlanders hasta 1912).
  function equipo(t) { return t.nombre === 'New York Highlanders' ? 'los Highlanders' : 'los Yankees'; }

  // Estadio sin el paréntesis de años (Lahman etiqueta de forma inconsistente el Yankee Stadium).
  function estadio(t) { return (t.parque || '').replace(/\s*\(.*\)\s*$/, ''); }
  var estadios = [];
  temporadas.forEach(function (t) { var e = estadio(t); if (e && estadios.indexOf(e) < 0) estadios.push(e); });

  // Mánager principal del año (el que dirigió más juegos).
  function mgrPrincipal(t) {
    var mejor = null;
    (t.mgr || []).filter(function (m) { return !m.interino; }).forEach(function (m) { if (m && m.n && (!mejor || (m.w + m.l) > (mejor.w + mejor.l))) mejor = m; });
    return mejor;
  }
  var nombresMgr = [];
  temporadas.forEach(function (t) { (t.mgr || []).filter(function (m) { return !m.interino; }).forEach(function (m) { if (m && m.n && nombresMgr.indexOf(m.n) < 0) nombresMgr.push(m.n); }); });

  var CATEGORIAS = {
    hr: { q: 'jonrones', u: 'jonrones' }, rbi: { q: 'carreras impulsadas', u: 'carreras impulsadas' },
    w: { q: 'victorias como lanzador', u: 'victorias' }, so: { q: 'ponches como lanzador', u: 'ponches' },
    sv: { q: 'salvamentos', u: 'salvamentos' }, h: { q: 'hits', u: 'hits' }, sb: { q: 'bases robadas', u: 'bases robadas' }
  };
  function nombresLider(l) { return lista((l.id || []).map(function (id) { return U.nombreJugador(id); })); }

  // Jugadores agrupados por perfil (para elegir protagonistas y distractores).
  var listaJugadores = Object.keys(jugadores).map(function (id) { var j = jugadores[id]; j.id = id; return j; });
  function juegosNY(j) {
    var g = 0;
    (j.b || []).forEach(function (f) { g += f[B.G] || 0; });
    (j.p || []).forEach(function (f) { g += f[P.G] || 0; });
    return g;
  }
  var hof = listaJugadores.filter(function (j) { return j.hof && U.anosConNY(j).length; });
  var idsRetirados = {};
  retirados.forEach(function (r) { if (r.id) idsRetirados[r.id] = true; });
  // Clave de placa en Monument Park (misma regla que esa sala: id de Lahman o «num-apellido»)
  function enlacePlaca(r) {
    var ap = r.n.split(' ').pop().toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
    return 'monument-park.html#' + (r.id || (r.num + '-' + ap));
  }
  var conocidos = listaJugadores.filter(function (j) { return (j.hof || idsRetirados[j.id]) && U.anosConNY(j).length; });
  var veteranosSinHof = listaJugadores.filter(function (j) { return !j.hof && !idsRetirados[j.id] && juegosNY(j) >= 300; });
  var ampliado = conocidos.concat(veteranosSinHof);

  function temporadasHR(j, minimo) { return (j.b || []).filter(function (f) { return f[B.AB] > 0 && f[B.HR] >= minimo; }); }
  function temporadasW(j, minimo) { return (j.p || []).filter(function (f) { return f[P.W] >= minimo; }); }

  // Números cercanos a `v` como distractores (nunca negativos, nunca iguales).
  function numerosCercanos(v, n, margen) {
    var cand = [];
    for (var d = 1; d <= margen; d++) { if (v - d >= 0) cand.push(v - d); cand.push(v + d); }
    return distractores(cand, v, n);
  }

  // ---------- generadores ----------
  // Cada generador devuelve {pregunta, opciones, correcta, explicacion, fuente, clave, enlace} o null.
  // `nivel` ∈ 'novato' | 'titular' | 'leyenda' y filtra el conjunto del que se toma la pregunta.
  function armar(datos, correcta, dist) {
    if (!dist) return null;
    var opciones = barajar([correcta].concat(dist));
    datos.opciones = opciones;
    datos.correcta = opciones.indexOf(correcta);
    return datos;
  }

  var GEN = {};

  // 1. ¿Contra quién se jugó la Serie Mundial de <año>?
  GEN.rivalSerie = function (nivel) {
    var pool = nivel === 'novato' ? series.filter(function (s) { return s.gano; }) : series;
    var s = uno(pool);
    var correcta = mayuscula(s.rivalEs);
    var dist = distractores(series.map(function (x) { return mayuscula(x.rivalEs); }), correcta, 3);
    var t = porAno[s.a];
    var marcador = s.g + '-' + s.p + (s.e ? '-' + s.e : '');
    var exp = 'En ' + s.a + ' los Yankees terminaron ' + (t ? t.w + '-' + t.l : s.record[0] + '-' + s.record[1]) + ' y ' +
      (s.gano ? (s.p === 0 && !s.e ? 'barrieron a ' : 'vencieron ' + marcador + ' a ') : 'cayeron ' + marcador + ' ante ') + s.rivalEs + '.';
    return armar({
      pregunta: s.gano ? '¿A quién vencieron los Yankees en la Serie Mundial de ' + s.a + '?' : '¿Contra quién perdieron los Yankees la Serie Mundial de ' + s.a + '?',
      explicacion: exp, fuente: 'Lahman (SeriesPost) y Retrosheet', clave: 'rival-' + s.a, enlace: ['anillos.html#' + s.a, 'Ver la Serie de ' + s.a]
    }, correcta, dist);
  };

  // 2. ¿Qué récord tuvieron en <año>?
  GEN.record = function (nivel) {
    var pool = nivel === 'novato' ? temporadas.filter(function (t) { return t.ws; }) : temporadas;
    var t = uno(pool);
    var correcta = t.w + '-' + t.l;
    var cercanas = temporadas.filter(function (x) { return Math.abs(x.a - t.a) <= (nivel === 'leyenda' ? 6 : 30) && x.a !== t.a; });
    var dist = distractores(cercanas.map(function (x) { return x.w + '-' + x.l; }), correcta, 3);
    var m = mgrPrincipal(t);
    var exp = 'En ' + t.a + ' ' + equipo(t) + ' terminaron ' + correcta + (t.g ? ' en ' + t.g + ' juegos' : '') +
      (m ? ', dirigidos por ' + m.n : '') + (t.ws ? ', y ganaron la Serie Mundial.' : t.banderin ? ', y ganaron el banderín de la Liga Americana.' : '.');
    return armar({
      pregunta: '¿Qué récord tuvieron ' + equipo(t) + ' en la temporada regular de ' + t.a + '?',
      explicacion: exp, fuente: t.fuente === 'statsapi' ? 'MLB Stats API (2026)' : 'Lahman (Teams)', clave: 'record-' + t.a,
      enlace: [U.enlaceTemporada(t.a), 'Ver la temporada ' + t.a]
    }, correcta, dist);
  };

  // 3. ¿Quién fue el mánager en <año>?
  GEN.manager = function (nivel) {
    var pool = temporadas.filter(function (t) { return t.mgr && t.mgr.filter(function (m) { return !m.interino; }).length === 1 && t.mgr[0].n; });
    if (nivel === 'novato') pool = pool.filter(function (t) { return t.ws; });
    if (nivel === 'leyenda') pool = temporadas.filter(function (t) { return mgrPrincipal(t); });
    var t = uno(pool);
    var m = mgrPrincipal(t);
    var titulares = t.mgr.filter(function (m) { return !m.interino; });
    var varios = titulares.length > 1;
    var otros = nombresMgr.filter(function (n) { return !t.mgr.some(function (x) { return x.n === n; }); });
    var dist = distractores(otros, m.n, 3);
    var exp = varios
      ? 'En ' + t.a + ' ' + equipo(t) + ' tuvieron ' + t.mgr.length + ' mánagers: ' + lista(t.mgr.map(function (x) { return x.n + ' (' + x.w + '-' + x.l + ')'; })) + '.'
      : m.n + ' dirigió a ' + equipo(t) + ' en ' + t.a + ' con récord de ' + m.w + '-' + m.l + (t.ws ? ' y título de Serie Mundial.' : '.');
    return armar({
      pregunta: varios ? '¿Quién dirigió la mayor parte de la temporada de ' + t.a + ' de ' + equipo(t) + '?' : '¿Quién fue el mánager de ' + equipo(t) + ' en ' + t.a + '?',
      explicacion: exp, fuente: 'Lahman (Managers)', clave: 'mgr-' + t.a, enlace: [U.enlaceTemporada(t.a), 'Ver la temporada ' + t.a]
    }, m.n, dist);
  };

  // 4. ¿Quién lideró al equipo en <categoría> en <año>?
  GEN.lider = function (nivel) {
    var cats = nivel === 'leyenda' ? ['hr', 'rbi', 'w', 'so', 'sv', 'h', 'sb'] : ['hr', 'rbi', 'w', 'so', 'sv'];
    var cat = uno(cats);
    var pool = temporadas.filter(function (t) { return t.lideres && t.lideres[cat] && t.lideres[cat].id && t.lideres[cat].id.length; });
    if (nivel === 'novato') pool = pool.filter(function (t) { return t.ws && t.lideres[cat].id.some(function (id) { return jugadores[id] && (jugadores[id].hof || idsRetirados[id]); }); });
    if (!pool.length) return null;
    var t = uno(pool);
    var l = t.lideres[cat];
    var correcta = nombresLider(l);
    // Distractores: líderes de otras categorías del mismo año y de la misma categoría en años cercanos.
    var cand = [];
    Object.keys(t.lideres).forEach(function (k) { if (k !== cat) cand.push(nombresLider(t.lideres[k])); });
    temporadas.forEach(function (x) {
      if (x.a !== t.a && Math.abs(x.a - t.a) <= 8 && x.lideres && x.lideres[cat]) cand.push(nombresLider(x.lideres[cat]));
    });
    var dist = distractores(cand, correcta, 3);
    var c = CATEGORIAS[cat];
    return armar({
      pregunta: '¿Quién lideró a ' + equipo(t) + ' en ' + c.q + ' en ' + t.a + '?',
      explicacion: 'En ' + t.a + ' ' + correcta + ' lideró al equipo con ' + l.v + ' ' + c.u + (t.ws ? ', el año del título.' : '.'),
      fuente: t.fuente === 'statsapi' ? 'MLB Stats API (2026)' : 'Lahman (Batting y Pitching)', clave: 'lider-' + cat + '-' + t.a,
      enlace: [U.enlaceJugador(l.id[0]), 'Ver ficha de ' + U.nombreJugador(l.id[0])]
    }, correcta, dist);
  };

  // 5. ¿Cuántos jonrones conectó <jugador> en <año>?
  GEN.jonrones = function (nivel) {
    var pool, minimo;
    if (nivel === 'novato') { pool = conocidos; minimo = 25; }
    else if (nivel === 'titular') { pool = ampliado; minimo = 20; }
    else { pool = veteranosSinHof; minimo = 10; }
    var cand = pool.filter(function (j) { return temporadasHR(j, minimo).length; });
    if (!cand.length) return null;
    var j = uno(cand);
    var f = uno(temporadasHR(j, minimo));
    var v = f[B.HR];
    var dist = numerosCercanos(v, 3, nivel === 'leyenda' ? 4 : 8);
    if (!dist) return null;
    return armar({
      pregunta: '¿Cuántos jonrones conectó ' + j.n + ' con los Yankees en ' + f[B.A] + '?',
      explicacion: j.n + ' conectó ' + v + ' jonrones en ' + f[B.A] + ', con ' + f[B.RBI] + ' carreras impulsadas y promedio de ' + U.prom(f[B.H], f[B.AB]) + ' en ' + f[B.G] + ' juegos.',
      fuente: f[B.A] >= 2026 ? 'MLB Stats API (2026)' : 'Lahman (Batting)', clave: 'hr-' + j.id + '-' + f[B.A],
      enlace: [U.enlaceJugador(j.id), 'Ver ficha de ' + j.n]
    }, String(v), dist.map(String));
  };

  // 6. ¿Cuántas victorias tuvo <lanzador> en <año>?
  GEN.victorias = function (nivel) {
    var pool, minimo;
    if (nivel === 'novato') { pool = conocidos; minimo = 18; }
    else if (nivel === 'titular') { pool = ampliado; minimo = 15; }
    else { pool = veteranosSinHof; minimo = 10; }
    var cand = pool.filter(function (j) { return temporadasW(j, minimo).length; });
    if (!cand.length) return null;
    var j = uno(cand);
    var f = uno(temporadasW(j, minimo));
    var v = f[P.W];
    var dist = numerosCercanos(v, 3, nivel === 'leyenda' ? 3 : 6);
    if (!dist) return null;
    return armar({
      pregunta: '¿Cuántas victorias consiguió ' + j.n + ' como lanzador de los Yankees en ' + f[P.A] + '?',
      explicacion: j.n + ' terminó ' + f[P.A] + ' con ' + v + '-' + f[P.L] + ', efectividad de ' + U.era(f[P.ER], f[P.IPO]) + ' y ' + f[P.SO] + ' ponches en ' + U.ip(f[P.IPO]) + ' entradas.',
      fuente: f[P.A] >= 2026 ? 'MLB Stats API (2026)' : 'Lahman (Pitching)', clave: 'w-' + j.id + '-' + f[P.A],
      enlace: [U.enlaceJugador(j.id), 'Ver ficha de ' + j.n]
    }, String(v), dist.map(String));
  };

  // 7. ¿Qué número lleva retirado <leyenda>?
  GEN.numeroDe = function () {
    var r = uno(retirados.filter(function (x) { return !x.toda_mlb; }));
    var correcta = String(r.num);
    var dist = distractores(retirados.map(function (x) { return String(x.num); }), correcta, 3);
    return armar({
      pregunta: '¿Qué número retiraron los Yankees en honor a ' + r.n + '?',
      explicacion: 'El número ' + r.num + ' de ' + r.n + ' se retiró en ' + r.retirado + (r.mgr && r.mgr.anos.length ? ' (también dirigió al equipo: ' + r.mgr.w + '-' + r.mgr.l + ' como mánager).' : '.'),
      fuente: 'MLB.com (números retirados)', clave: 'num-' + r.num + '-' + r.n, enlace: [enlacePlaca(r), 'Ver placa en Monument Park']
    }, correcta, dist);
  };

  // 8. ¿De quién es el número <n> retirado?
  GEN.quienNumero = function () {
    var r = uno(retirados.filter(function (x) { return !x.toda_mlb; }));
    var mismos = retirados.filter(function (x) { return x.num === r.num; }).map(function (x) { return x.n; });
    var otros = retirados.filter(function (x) { return mismos.indexOf(x.n) < 0; }).map(function (x) { return x.n; });
    var dist = distractores(otros, r.n, 3);
    return armar({
      pregunta: mismos.length > 1 ? '¿Cuál de estos jugadores lleva el número ' + r.num + ' retirado por los Yankees?' : '¿A quién honra el número ' + r.num + ' retirado por los Yankees?',
      explicacion: 'El ' + r.num + ' se retiró en ' + r.retirado + ' en honor a ' + r.n + (mismos.length > 1 ? '; el mismo número también está retirado por ' + lista(mismos.filter(function (n) { return n !== r.n; })) + '.' : '.'),
      fuente: 'MLB.com (números retirados)', clave: 'quien-' + r.num + '-' + r.n, enlace: [enlacePlaca(r), 'Ver placa en Monument Park']
    }, r.n, dist);
  };

  // 9. ¿En qué año se retiró el número de <leyenda>?
  GEN.anoRetiro = function () {
    var r = uno(retirados);
    var correcta = String(r.retirado);
    var cand = retirados.map(function (x) { return String(x.retirado); });
    var dist = distractores(cand, correcta, 3);
    return armar({
      pregunta: '¿En qué año se retiró el número ' + r.num + ' de ' + r.n + (r.toda_mlb ? ' en toda MLB' : '') + '?',
      explicacion: 'El número ' + r.num + ' de ' + r.n + ' se retiró en ' + r.retirado + (r.toda_mlb ? ', para todos los equipos de MLB.' : '.'),
      fuente: 'MLB.com (números retirados)', clave: 'retiro-' + r.num + '-' + r.n, enlace: [enlacePlaca(r), 'Ver placa en Monument Park']
    }, correcta, dist);
  };

  // 10. ¿Quién lanzó el juego sin hit / perfecto del <fecha>?
  GEN.sinHit = function () {
    var s = uno(sinHit);
    var tipo = s.perfecto ? 'juego perfecto' : 'juego sin hit';
    var dist = distractores(sinHit.map(function (x) { return x.pitcher; }), s.pitcher, 3);
    var rival = nombreRival(s.rival, s.rivalN);
    return armar({
      pregunta: '¿Quién lanzó el ' + tipo + ' de los Yankees del ' + U.fechaLarga(s.fecha) + (s.tipo === 'WS' ? ', en plena Serie Mundial' : '') + '?',
      explicacion: 'El ' + U.fechaLarga(s.fecha) + ' ' + s.pitcher + ' lanzó un ' + tipo + (s.combinado ? ' (combinado)' : '') + ' contra ' + rival + ': los Yankees ganaron ' + s.ny + '-' + s.op + (s.k ? ' y ' + s.pitcher.split(' ').pop() + ' ponchó a ' + s.k : ', sin un solo ponche') + '.',
      fuente: 'Retrosheet (game logs)', clave: 'nh-' + s.fecha, enlace: [s.id ? U.enlaceJugador(s.id) : 'este-dia.html#' + s.fecha.slice(5), s.id ? 'Ver ficha de ' + s.pitcher : 'Ver ese día']
    }, s.pitcher, dist);
  };

  // 11. ¿En qué estadio jugaron en <año>?
  GEN.estadio = function (nivel) {
    if (estadios.length < 4) return null;
    var pool = temporadas;
    if (nivel !== 'leyenda') pool = temporadas.filter(function (t) { return estadio(t) !== 'Yankee Stadium' || t.ws; });
    var t = uno(pool);
    var correcta = estadio(t);
    var dist = distractores(estadios, correcta, 3);
    var mismos = temporadas.filter(function (x) { return estadio(x) === correcta; }).map(function (x) { return x.a; });
    return armar({
      pregunta: '¿En qué estadio jugaron ' + equipo(t) + ' como locales en ' + t.a + '?',
      explicacion: 'En ' + t.a + ' ' + equipo(t) + ' jugaron en ' + correcta + (t.asist ? ', con asistencia de ' + U.miles(t.asist) + ' aficionados en la temporada' : '') +
        '. Ese parque fue su casa en ' + mismos.length + ' temporadas, entre ' + mismos[0] + ' y ' + mismos[mismos.length - 1] + '.',
      fuente: 'Lahman (Teams)', clave: 'parque-' + t.a, enlace: [U.enlaceTemporada(t.a), 'Ver la temporada ' + t.a]
    }, correcta, dist);
  };

  // 12. ¿Cuántos juegos duró la Serie Mundial de <año>?
  GEN.juegosSerie = function (nivel) {
    var pool = nivel === 'novato' ? series.filter(function (s) { return s.gano; }) : series;
    var s = uno(pool);
    var n = (s.juegos || []).length || (s.g + s.p + s.e);
    var correcta = n + ' juegos';
    var cand = [];
    for (var k = 4; k <= 9; k++) cand.push(k + ' juegos');
    var dist = distractores(cand, correcta, 3);
    var empates = s.juegos ? s.juegos.filter(function (j) { return j.res === 'E'; }).length : s.e;
    return armar({
      pregunta: '¿Cuántos juegos duró la Serie Mundial de ' + s.a + ' contra ' + s.rivalEs + '?',
      explicacion: 'La Serie de ' + s.a + ' duró ' + n + ' juegos' + (empates ? ' (uno de ellos empatado)' : '') + ': los Yankees ' + (s.gano ? 'ganaron' : 'perdieron') + ' ' + s.g + '-' + s.p + ' ante ' + s.rivalEs + '.',
      fuente: 'Retrosheet (game logs)', clave: 'juegos-' + s.a, enlace: ['anillos.html#' + s.a, 'Ver la Serie de ' + s.a]
    }, correcta, dist);
  };

  // 13. ¿Quién fue el MVP de la Serie Mundial de <año>?
  GEN.mvpSerie = function (nivel) {
    var pool = series.filter(function (s) { return s.mvp && s.mvp.length; });
    if (nivel === 'novato') pool = pool.filter(function (s) { return s.gano; });
    if (!pool.length) return null;
    var s = uno(pool);
    var nombreMvp = function (x) { return lista(x.mvp.map(function (m) { return m.n; })); };
    var correcta = nombreMvp(s);
    var cand = series.filter(function (x) { return x.mvp && x.mvp.length; }).map(nombreMvp);
    // También figuras de bateo y pitcheo de esa misma serie
    (s.bateo || []).slice(0, 4).forEach(function (b) { cand.push(b.n); });
    (s.pitcheo || []).slice(0, 3).forEach(function (p) { cand.push(p.n); });
    var dist = distractores(cand, correcta, 3);
    var deNY = s.mvp.every(function (m) { return m.ny; });
    var varios = s.mvp.length > 1;
    return armar({
      pregunta: (varios ? '¿Quiénes compartieron el premio de MVP' : '¿Quién fue el MVP') + ' de la Serie Mundial de ' + s.a + '?',
      explicacion: (varios ? 'Los MVP de la Serie de ' + s.a + ' fueron ' : 'El MVP de la Serie de ' + s.a + ' fue ') + correcta + ', de ' + (deNY ? 'los Yankees' : s.rivalEs) + '; la serie terminó ' + s.g + '-' + s.p + ' ' + (s.gano ? 'a favor de' : 'en contra de') + ' los Yankees.',
      fuente: 'Lahman (AwardsPlayers y SeriesPost)', clave: 'mvp-' + s.a, enlace: ['anillos.html#' + s.a, 'Ver la Serie de ' + s.a]
    }, correcta, dist);
  };

  // 14. ¿En qué año debutó <jugador> con los Yankees?
  GEN.debutNY = function (nivel) {
    var pool = nivel === 'novato' ? hof : nivel === 'titular' ? ampliado : veteranosSinHof;
    pool = pool.filter(function (j) { return U.anosConNY(j).length; });
    if (!pool.length) return null;
    var j = uno(pool);
    var anos = U.anosConNY(j);
    var correcta = String(anos[0]);
    var dist = numerosCercanos(anos[0], 3, nivel === 'leyenda' ? 3 : 6);
    if (!dist) return null;
    return armar({
      pregunta: '¿En qué año jugó ' + j.n + ' su primera temporada con los Yankees?',
      explicacion: j.n + ' jugó con los Yankees ' + (anos.length === 1 ? 'solo en ' + anos[0] : 'de ' + anos[0] + ' a ' + anos[anos.length - 1] + ' (' + anos.length + ' temporadas)') +
        (j.hof ? '; ingresó al Salón de la Fama en ' + j.hof + '.' : '.'),
      fuente: 'Lahman (Batting y Pitching)', clave: 'debut-' + j.id, enlace: [U.enlaceJugador(j.id), 'Ver ficha de ' + j.n]
    }, correcta, dist.map(String));
  };

  // ---------- niveles ----------
  var NIVELES = {
    novato: {
      nombre: 'Novato', descripcion: 'Títulos, números retirados y leyendas del Salón de la Fama.',
      generadores: ['rivalSerie', 'record', 'manager', 'lider', 'jonrones', 'numeroDe', 'quienNumero', 'anoRetiro', 'estadio', 'juegosSerie', 'mvpSerie', 'debutNY']
    },
    titular: {
      nombre: 'Titular', descripcion: 'Líderes de cada año, mánagers, Series concretas y juegos sin hit.',
      generadores: ['rivalSerie', 'record', 'manager', 'lider', 'jonrones', 'victorias', 'anoRetiro', 'quienNumero', 'sinHit', 'estadio', 'juegosSerie', 'mvpSerie', 'debutNY']
    },
    leyenda: {
      nombre: 'Leyenda', descripcion: 'Cifras exactas y jugadores poco recordados, de cualquier año.',
      generadores: ['record', 'manager', 'lider', 'jonrones', 'victorias', 'anoRetiro', 'sinHit', 'estadio', 'juegosSerie', 'mvpSerie', 'debutNY', 'rivalSerie']
    }
  };

  function preguntaValida(q) {
    if (!q || !q.opciones || q.opciones.length !== 4) return false;
    if (q.correcta < 0 || q.correcta > 3) return false;
    var vistos = {};
    for (var i = 0; i < 4; i++) {
      var o = q.opciones[i];
      if (o === null || o === undefined || o === '' || vistos[o]) return false;
      vistos[o] = true;
    }
    var textos = [q.pregunta, q.explicacion, q.fuente].concat(q.opciones).join('|');
    return !/undefined|null|NaN/.test(textos);
  }

  // Genera una pregunta de un nivel, evitando las claves ya usadas.
  function generar(nivel, usadas) {
    var gens = NIVELES[nivel].generadores;
    for (var intento = 0; intento < 60; intento++) {
      var nombre = gens[Math.floor(Math.random() * gens.length)];
      var q;
      try { q = GEN[nombre](nivel); } catch (e) { q = null; }
      if (!preguntaValida(q)) continue;
      if (usadas && usadas[q.clave]) continue;
      q.tipo = nombre;
      return q;
    }
    return null;
  }
  function generarPartida(nivel, n) {
    var usadas = {}, tipos = {}, elegidas = [];
    var limiteTipo = Math.ceil(n / 4);
    for (var intento = 0; intento < 200 && elegidas.length < n; intento++) {
      var q = generar(nivel, usadas);
      if (!q) continue;
      // Variedad: no más de n/4 preguntas del mismo tipo por partida
      if ((tipos[q.tipo] || 0) >= limiteTipo) continue;
      usadas[q.clave] = true;
      tipos[q.tipo] = (tipos[q.tipo] || 0) + 1;
      elegidas.push(q);
    }
    return elegidas;
  }

  // ---------- récords en localStorage ----------
  function leerRecords() {
    try { var r = JSON.parse(localStorage.getItem(CLAVE_LS) || '{}'); return r && typeof r === 'object' ? r : {}; }
    catch (e) { return {}; }
  }
  function guardarRecords(r) {
    try { localStorage.setItem(CLAVE_LS, JSON.stringify(r)); } catch (e) {}
  }
  function registrarPartida(nivel, aciertos, total) {
    var r = leerRecords();
    var n = r[nivel] || { partidas: 0, mejor: 0, total: total };
    n.partidas += 1;
    var nuevo = aciertos > (n.mejor || 0);
    if (nuevo) n.mejor = aciertos;
    n.total = total;
    n.ultimo = aciertos;
    r[nivel] = n;
    guardarRecords(r);
    return { nuevo: nuevo, record: n };
  }

  // ---------- interfaz ----------
  var secNiveles = document.getElementById('niveles');
  var secPartida = document.getElementById('partida');
  var secResumen = document.getElementById('resumen');
  var contNiveles = document.getElementById('niveles-lista');
  var contPregunta = document.getElementById('pregunta');
  var contResumen = document.getElementById('resumen-contenido');
  var contProgreso = document.getElementById('progreso');

  var estado = null; // {nivel, preguntas, indice, aciertos, respuestas:[{elegida, bien}]}

  function mostrarSeccion(s) {
    [secNiveles, secPartida, secResumen].forEach(function (x) { x.classList.toggle('oculto', x !== s); });
  }

  function pintarNiveles() {
    var r = leerRecords();
    contNiveles.innerHTML = Object.keys(NIVELES).map(function (k) {
      var n = NIVELES[k], rec = r[k];
      var marca = rec && rec.partidas
        ? '<span class="num">' + rec.mejor + '/' + (rec.total || PREGUNTAS_POR_PARTIDA) + '</span> en ' + rec.partidas + ' ' + U.plural(rec.partidas, 'partida')
        : 'Sin partidas todavía';
      return '<article class="nivel">' +
        '<p class="etiqueta-sobre">Nivel</p>' +
        '<h3>' + esc(n.nombre) + '</h3>' +
        '<p class="descripcion">' + esc(n.descripcion) + '</p>' +
        '<p class="record"><span class="etiqueta-sobre">Mejor marca</span><span class="marca-nivel">' + marca + '</span></p>' +
        '<button type="button" class="boton primario" data-nivel="' + k + '">Jugar</button>' +
        '</article>';
    }).join('');
  }

  function empezar(nivel) {
    if (!NIVELES[nivel]) return;
    var preguntas = generarPartida(nivel, PREGUNTAS_POR_PARTIDA);
    if (!preguntas.length) return;
    estado = { nivel: nivel, preguntas: preguntas, indice: 0, aciertos: 0, respuestas: [] };
    mostrarSeccion(secPartida);
    pintarPregunta();
    secPartida.scrollIntoView({ block: 'start' });
  }

  function pintarPregunta() {
    var q = estado.preguntas[estado.indice];
    var total = estado.preguntas.length;
    contProgreso.innerHTML =
      '<span>' + esc(NIVELES[estado.nivel].nombre) + '</span>' +
      '<span>Pregunta <span class="num">' + (estado.indice + 1) + '</span> de <span class="num">' + total + '</span></span>' +
      '<span>Aciertos <span class="num">' + estado.aciertos + '</span></span>';
    contPregunta.innerHTML =
      '<h2 class="enunciado">' + esc(q.pregunta) + '</h2>' +
      '<ol class="lista-limpia opciones" id="opciones">' + q.opciones.map(function (o, i) {
        return '<li><button type="button" class="opcion" data-i="' + i + '"><span class="tecla num">' + (i + 1) + '</span><span class="texto">' + esc(o) + '</span></button></li>';
      }).join('') + '</ol>' +
      '<div class="veredicto" id="veredicto" aria-live="polite"></div>' +
      '<p class="ayuda peq">Teclas 1–4 para responder, Enter para seguir.</p>';
    contPregunta.querySelector('h2').focus();
  }

  function responder(i) {
    if (!estado || estado.respuestas[estado.indice]) return;
    var q = estado.preguntas[estado.indice];
    var bien = i === q.correcta;
    estado.respuestas[estado.indice] = { elegida: i, bien: bien };
    if (bien) estado.aciertos += 1;
    var botones = contPregunta.querySelectorAll('.opcion');
    Array.prototype.forEach.call(botones, function (b, k) {
      b.disabled = true;
      if (k === q.correcta) b.classList.add('correcta');
      else if (k === i) b.classList.add('erronea');
    });
    var ultima = estado.indice === estado.preguntas.length - 1;
    var v = document.getElementById('veredicto');
    v.innerHTML =
      '<p class="resultado ' + (bien ? 'bien' : 'mal') + '">' + (bien ? 'Correcto.' : 'Incorrecto: la respuesta era ' + esc(q.opciones[q.correcta]) + '.') + '</p>' +
      '<p class="explicacion">' + esc(q.explicacion) + '</p>' +
      '<p class="fuente">Fuente: ' + esc(q.fuente) + (q.enlace ? ' · <a href="' + esc(q.enlace[0]) + '">' + esc(q.enlace[1]) + '</a>' : '') + '</p>' +
      '<button type="button" class="boton primario" id="siguiente">' + (ultima ? 'Ver resumen' : 'Siguiente') + '</button>';
    contProgreso.querySelectorAll('.num')[2].textContent = estado.aciertos;
    document.getElementById('siguiente').focus();
  }

  function siguiente() {
    if (!estado || !estado.respuestas[estado.indice]) return;
    if (estado.indice < estado.preguntas.length - 1) {
      estado.indice += 1;
      pintarPregunta();
    } else {
      terminar();
    }
  }

  function terminar() {
    var total = estado.preguntas.length;
    var res = registrarPartida(estado.nivel, estado.aciertos, total);
    var nivel = NIVELES[estado.nivel];
    var frase;
    if (estado.aciertos === total) frase = 'Partida perfecta.';
    else if (estado.aciertos >= total * 0.7) frase = 'Buen resultado.';
    else if (estado.aciertos >= total * 0.4) frase = 'A media tabla.';
    else frase = 'Hay que volver a pasar por las vitrinas.';
    contResumen.innerHTML =
      '<p class="etiqueta-sobre">Resumen · nivel ' + esc(nivel.nombre) + '</p>' +
      '<h2 class="marcador-final"><span class="num">' + estado.aciertos + '</span> de <span class="num">' + total + '</span></h2>' +
      '<p class="frase">' + frase + (res.nuevo && res.record.partidas > 1 ? ' Nueva mejor marca en este nivel.' : '') + '</p>' +
      '<p class="peq">Mejor marca en ' + esc(nivel.nombre) + ': <span class="num">' + res.record.mejor + '/' + total + '</span> en ' + res.record.partidas + ' ' + U.plural(res.record.partidas, 'partida') + '.</p>' +
      '<ol class="lista-limpia repaso">' + estado.preguntas.map(function (q, i) {
        var r = estado.respuestas[i];
        return '<li class="' + (r.bien ? 'bien' : 'mal') + '">' +
          '<span class="num indice">' + (i + 1) + '</span>' +
          '<div><p class="q">' + esc(q.pregunta) + '</p>' +
          '<p class="a">' + (r.bien ? esc(q.opciones[q.correcta]) : 'Respondiste «' + esc(q.opciones[r.elegida]) + '»; era «' + esc(q.opciones[q.correcta]) + '»') + '</p></div>' +
          '</li>';
      }).join('') + '</ol>' +
      '<div class="acciones-final">' +
        '<button type="button" class="boton primario" id="otra">Otra partida (' + esc(nivel.nombre) + ')</button>' +
        '<button type="button" class="boton" id="cambiar">Cambiar de nivel</button>' +
      '</div>';
    mostrarSeccion(secResumen);
    secResumen.scrollIntoView({ block: 'start' });
    document.getElementById('otra').focus();
  }

  function volverANiveles() {
    estado = null;
    pintarNiveles();
    mostrarSeccion(secNiveles);
    if (location.hash) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
    }
  }

  // ---------- eventos ----------
  contNiveles.addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-nivel]');
    if (!b) return;
    var n = b.getAttribute('data-nivel');
    if (location.hash.replace(/^#/, '') === n) empezar(n); else location.hash = n;
  });
  contPregunta.addEventListener('click', function (ev) {
    var o = ev.target.closest('.opcion');
    if (o) { responder(parseInt(o.getAttribute('data-i'), 10)); return; }
    if (ev.target.closest('#siguiente')) siguiente();
  });
  contResumen.addEventListener('click', function (ev) {
    if (ev.target.closest('#otra')) empezar(estado.nivel);
    else if (ev.target.closest('#cambiar')) volverANiveles();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (!estado) return;
    if (!secPartida.classList.contains('oculto')) {
      if (ev.key >= '1' && ev.key <= '4') {
        if (estado.respuestas[estado.indice]) return;
        ev.preventDefault(); responder(parseInt(ev.key, 10) - 1);
      } else if (ev.key === 'Enter' && estado.respuestas[estado.indice]) {
        // Enter sobre un botón ya lo activa; evitamos avanzar dos veces
        if (ev.target && ev.target.id === 'siguiente') return;
        ev.preventDefault(); siguiente();
      }
    } else if (!secResumen.classList.contains('oculto') && ev.key === 'Enter') {
      if (ev.target && (ev.target.id === 'otra' || ev.target.id === 'cambiar')) return;
      ev.preventDefault(); empezar(estado.nivel);
    }
  });
  // Navegación por hash: vestidor.html#titular arranca una partida de ese nivel.
  function enrutar() {
    var h = location.hash.replace(/^#/, '');
    if (NIVELES[h]) empezar(h); else volverANiveles();
  }
  window.addEventListener('hashchange', enrutar);

  // ---------- arranque ----------
  pintarNiveles();
  enrutar();

  // Expuesto para pruebas automáticas (no se usa en la página)
  M.vestidor = { generar: generar, generarPartida: generarPartida, NIVELES: NIVELES, preguntaValida: preguntaValida, GEN: GEN };

  M.montarPie([
    'Las preguntas se generan al momento a partir de los mismos datos del museo: Lahman Baseball Database, game logs de Retrosheet, MLB Stats API (2026) y la lista oficial de números retirados en MLB.com.',
    'Tu récord se guarda solo en este navegador (localStorage).'
  ]);
})();
