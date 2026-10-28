// Utilidades compartidas por las salas de La Franela.
window.Franela = (function () {
  'use strict';

  var POS_ES = {
    P: 'Pitcher', C: 'Receptor', '1B': 'Primera base', '2B': 'Segunda base', '3B': 'Tercera base',
    SS: 'Shortstop', LF: 'Jardinero izquierdo', CF: 'Jardinero central', RF: 'Jardinero derecho',
    OF: 'Jardinero', DH: 'Bateador designado', PH: 'Bateador emergente', PR: 'Corredor emergente'
  };
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
    'octubre', 'noviembre', 'diciembre'];

  var porId = {};
  (window.FRANELA_PLAYERS || []).forEach(function (p) { porId[p.id] = p; });

  function escapar(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fecha(f) {
    if (!f || !f.y) return '';
    if (f.m && f.d) return f.d + ' de ' + MESES[f.m - 1] + ' de ' + f.y;
    if (f.m) return MESES[f.m - 1] + ' de ' + f.y;
    return String(f.y);
  }

  function fechaISO(s) {
    if (!s) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return s;
    return fecha({ y: +m[1], m: +m[2], d: +m[3] });
  }

  // "Linden, California, Estados Unidos" / "Tijuana, Baja California, México"
  function lugar(p) {
    var partes = [];
    if (p.city) partes.push(p.city);
    if (p.stateName && p.stateName !== p.city && p.stateName !== p.countryEs && p.stateName !== p.country) partes.push(p.stateName);
    if (p.countryEs) partes.push(p.countryEs);
    return partes.join(', ');
  }

  function posEs(pos) { return POS_ES[pos] || pos || ''; }

  // Quita acentos y minúsculas para buscar.
  function normalizar(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function decadaEtiqueta(d) { return d + 's'; }

  function num3(v) {
    if (v == null) return '—';
    var s = v.toFixed(3);
    return s.replace(/^0\./, '.');
  }

  function fmt(n) { return n == null ? '—' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  // Fila de lista reutilizable (archivo, mapa, sala latina, números).
  function filaJugador(p, extra) {
    var detalle = [];
    if (p.primary) detalle.push(posEs(p.primary));
    var l = lugar(p);
    if (l) detalle.push(l);
    if (extra) detalle.push(extra);
    return '<li class="lista__fila" data-id="' + escapar(p.id) + '">' +
      '<div class="lista__nombre"><button type="button" data-abrir="' + escapar(p.id) + '">' + escapar(p.name) + '</button></div>' +
      '<div class="lista__anios">' + escapar(p.span) + '</div>' +
      '<div class="lista__detalle">' + escapar(detalle.join(' · ')) + '</div>' +
      '</li>';
  }

  // Cualquier contenedor con filas .lista__fila abre la ficha al hacer clic.
  function delegarApertura(contenedor) {
    contenedor.addEventListener('click', function (ev) {
      var fila = ev.target.closest('.lista__fila');
      if (!fila) return;
      var id = fila.getAttribute('data-id');
      if (id && window.Franela.abrirFicha) window.Franela.abrirFicha(id);
    });
  }

  return {
    POS_ES: POS_ES, porId: porId, escapar: escapar, fecha: fecha, fechaISO: fechaISO, lugar: lugar,
    posEs: posEs, normalizar: normalizar, decadaEtiqueta: decadaEtiqueta, num3: num3, fmt: fmt,
    filaJugador: filaJugador, delegarApertura: delegarApertura,
    abrirFicha: null // lo define app.js
  };
})();
