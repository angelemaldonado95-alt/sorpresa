/* Portada: friso de títulos, «Este día», cifras y última temporada. */
(function () {
  'use strict';
  var M = window.MONUMENTO, u = M.util;
  var T = M.temporadas, S = M.series, E = M.efemerides, R = M.retirados;
  var primero = T[0].a, ultimo = T[T.length - 1].a;

  document.getElementById('ano-final').textContent = ultimo;
  document.getElementById('ano-final-2').textContent = ultimo;

  // ---- friso: una marca por título, en proporción al tiempo ----
  var g = document.getElementById('friso-marcas');
  var ancho = 1120;
  function x(a) { return ((a - primero) / (ultimo - primero)) * ancho; }
  var marcas = '';
  for (var a = primero; a <= ultimo; a += 10) {
    if (a % 10 === 0) marcas += '<line class="marca-ano" x1="' + x(a) + '" y1="16" x2="' + x(a) + '" y2="24"/>';
  }
  T.forEach(function (t) {
    if (t.ws) marcas += '<line class="marca-ws" x1="' + x(t.a) + '" y1="6" x2="' + x(t.a) + '" y2="34"><title>' + t.a + '</title></line>';
  });
  g.innerHTML = marcas;

  // ---- este día ----
  var md = u.hoyMD();
  var hoy = E[md] || { ev: [], rec: null };
  var d = new Date();
  document.getElementById('hoy-fecha').textContent = d.getDate() + ' de ' + u.MESES[d.getMonth()];
  var evs = hoy.ev.filter(function (e) { return e.w >= 10; });
  if (!evs.length) evs = hoy.ev.slice(0, 3);
  var principal = evs[0];
  var pp = document.getElementById('hoy-principal');
  if (principal) {
    pp.innerHTML = '<span class="ano">' + principal.a + '</span>' + u.esc(principal.x);
  } else {
    pp.textContent = 'No hay registros destacados para esta fecha.';
  }
  var lista = document.getElementById('hoy-lista');
  lista.innerHTML = evs.slice(1, 6).sort(function (p, q) { return p.a - q.a; }).map(function (e) {
    var texto = e.id && M.jugadores ? u.esc(e.x) : u.esc(e.x);
    return '<li><span class="ano">' + e.a + '</span><span>' + texto + '</span></li>';
  }).join('');
  var rec = document.getElementById('hoy-rec');
  if (hoy.rec) {
    var r = hoy.rec, txt = r[0] + '-' + r[1] + (r[2] ? '-' + r[2] : '');
    rec.textContent = 'En temporada regular, los Yankees tienen marca de ' + txt + ' un ' + d.getDate() + ' de ' + u.MESES[d.getMonth()] + ' (' + primero + '–' + ultimo + ').';
  } else {
    rec.textContent = 'Los Yankees no han jugado un partido de temporada regular en esta fecha.';
  }

  // ---- cifras ----
  var titulos = T.filter(function (t) { return t.ws; }).length;
  var banderines = T.filter(function (t) { return t.banderin; }).length;
  var w = 0, l = 0;
  T.forEach(function (t) { w += t.w; l += t.l; });
  var numeros = {};
  R.forEach(function (r) { numeros[r.num] = 1; });
  var cifras = [
    ['Temporadas', T.length],
    ['Series Mundiales', titulos],
    ['Banderines de la Liga Americana', banderines],
    ['Victorias en temporada regular', u.miles(w)],
    ['Porcentaje histórico', u.pct(w, l)],
    ['Números retirados', Object.keys(numeros).length]
  ];
  document.getElementById('cifras').innerHTML = cifras.map(function (c) {
    return '<div class="dato"><span class="etiqueta">' + c[0] + '</span><span class="valor num">' + c[1] + '</span></div>';
  }).join('');

  // ---- última temporada y último título ----
  var t = T[T.length - 1];
  document.getElementById('ult-titulo').textContent = t.a + ': ' + t.w + '-' + t.l;
  var lugar = t.lugar === 1 ? 'primer' : t.lugar === 2 ? 'segundo' : t.lugar === 3 ? 'tercer' : t.lugar === 4 ? 'cuarto' : t.lugar + '.º';
  var post = t.post.length ? t.post.map(function (p) {
    return p.nombre + ' ' + (p.gano ? 'ganada' : 'perdida') + ' ' + p.g + '-' + p.p + ' ante ' + p.rivalEs;
  }).join('; ') : 'sin postemporada';
  document.getElementById('ult-texto').textContent = 'Los ' + t.nombre.replace('New York ', '') + ' terminaron en ' + lugar + ' lugar de la División Este con ' +
    t.w + ' victorias y ' + t.l + ' derrotas' + (t.mgr.length ? ', dirigidos por ' + t.mgr.filter(function (m) { return !m.interino; }).map(function (m) { return m.n; }).join(' y ') : '') + '. Postemporada: ' + post + '.';
  document.getElementById('ult-enlace').href = u.enlaceTemporada(t.a);

  var ganadas = S.filter(function (s) { return s.gano; });
  var s = ganadas[ganadas.length - 1];
  var decisivo = s.juegos[s.juegos.length - 1];
  document.getElementById('tit-titulo').textContent = 'Serie Mundial de ' + s.a;
  document.getElementById('tit-texto').textContent = 'Los Yankees vencieron ' + s.g + '-' + s.p + ' a ' + s.rivalEs + '. El título se decidió el ' + u.fechaLarga(decisivo.fecha) +
    ' en el ' + decisivo.parque + ', con marcador de ' + decisivo.ny + '-' + decisivo.op + '.' +
    (s.mvp && s.mvp.length && s.mvp[0].ny ? ' ' + s.mvp.map(function (m) { return m.n; }).join(' y ') + ' fue el Jugador Más Valioso de la Serie.' : '');
  document.getElementById('tit-enlace').href = 'anillos.html#' + s.a;

  M.montarPie([
    'Temporadas, títulos y banderines: Lahman Baseball Database (Teams, SeriesPost). Juegos y fechas: Retrosheet. Temporada ' + ultimo + ': MLB Stats API. Números retirados: sitio oficial de los Yankees en MLB.com.'
  ]);
})();
