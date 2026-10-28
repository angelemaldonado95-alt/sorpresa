/* El Monumento — utilidades comunes a todas las salas.
   Los datos vienen de data/*.js (window.MONUMENTO.*), cargados antes que este archivo. */
(function () {
  'use strict';
  var M = window.MONUMENTO = window.MONUMENTO || {};

  // ---------- tema ----------
  var guardado = null;
  try { guardado = localStorage.getItem('monumento-tema'); } catch (e) {}
  if (guardado === 'dark' || guardado === 'light') document.documentElement.setAttribute('data-theme', guardado);

  function temaActual() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function cambiarTema() {
    var nuevo = temaActual() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nuevo);
    try { localStorage.setItem('monumento-tema', nuevo); } catch (e) {}
    document.dispatchEvent(new CustomEvent('monumento:tema', { detail: nuevo }));
  }

  // ---------- cabecera y pie ----------
  var SALAS = [
    ['index.html', 'Portada'],
    ['temporadas.html', 'Las temporadas'],
    ['anillos.html', 'Los 27 anillos'],
    ['monument-park.html', 'Monument Park'],
    ['este-dia.html', 'Este día'],
    ['duelo.html', 'Duelo de leyendas'],
    ['vestidor.html', 'El vestidor']
  ];
  function paginaActual() {
    var p = location.pathname.split('/').pop();
    return p || 'index.html';
  }
  function montarCabecera() {
    var actual = paginaActual();
    var h = document.createElement('header');
    h.className = 'cabecera';
    var links = SALAS.map(function (s) {
      return '<a href="' + s[0] + '"' + (s[0] === actual ? ' aria-current="page"' : '') + '>' + s[1] + '</a>';
    }).join('');
    h.innerHTML =
      '<div class="contenedor">' +
        '<a class="marca" href="index.html">El Monumento <small>Museo de los Yankees</small></a>' +
        '<nav class="nav" id="nav-principal" aria-label="Salas del museo">' + links + '</nav>' +
        '<div class="acciones">' +
          '<button class="tema-btn" type="button" aria-label="Cambiar entre modo claro y oscuro" title="Modo claro / oscuro">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>' +
          '</button>' +
          '<button class="nav-btn" type="button" aria-expanded="false" aria-controls="nav-principal">Salas</button>' +
        '</div>' +
      '</div>';
    document.body.insertBefore(h, document.body.firstChild);
    h.querySelector('.tema-btn').addEventListener('click', cambiarTema);
    var btn = h.querySelector('.nav-btn');
    btn.addEventListener('click', function () {
      var nav = h.querySelector('.nav');
      var abierta = nav.classList.toggle('abierta');
      btn.setAttribute('aria-expanded', abierta ? 'true' : 'false');
    });
  }
  function montarPie(fuentes) {
    var meta = M.meta || {};
    var f = document.createElement('footer');
    f.className = 'pie';
    var lista = (fuentes || []).map(function (x) { return '<p>' + x + '</p>'; }).join('');
    f.innerHTML =
      '<div class="contenedor">' +
        '<p class="etiqueta-sobre">De dónde salen los datos de esta sala</p>' + lista +
        '<p class="mt-1">Datos generados el ' + (meta.generado ? fechaLarga(meta.generado) : '—') +
        '. Lahman Baseball Database ' + (meta.lahman ? meta.lahman.version : '') +
        ', bajo licencia <a href="https://creativecommons.org/licenses/by-sa/3.0/" rel="license">CC BY-SA 3.0</a>. ' +
        'La información de Retrosheet se obtuvo gratuitamente de <a href="https://www.retrosheet.org">www.retrosheet.org</a> y se usa con su autorización. ' +
        'Temporada ' + (meta.api ? meta.api.temporada : '') + ' tomada de la MLB Stats API pública. ' +
        'Este museo es un proyecto de aficionado sin relación con los New York Yankees ni con MLB.</p>' +
      '</div>';
    document.body.appendChild(f);
  }

  // ---------- formato ----------
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  function fechaLarga(iso) {
    if (!iso) return '';
    var p = String(iso).split('-');
    if (p.length < 3) return iso;
    return parseInt(p[2], 10) + ' de ' + MESES[parseInt(p[1], 10) - 1] + ' de ' + p[0];
  }
  function fechaCorta(arr) { // [año, mes, día]
    if (!arr || arr.length < 3 || !arr[1] || !arr[2]) return arr && arr[0] ? String(arr[0]) : '';
    return arr[2] + ' de ' + MESES[arr[1] - 1] + ' de ' + arr[0];
  }
  function miles(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  function prom(h, ab) { return ab ? (h / ab).toFixed(3).replace(/^0/, '') : '—'; }
  function pct(w, l) { return (w + l) ? (w / (w + l)).toFixed(3).replace(/^0/, '') : '—'; }
  function era(er, ipo) { return ipo ? (er * 27 / ipo).toFixed(2) : '—'; }
  function ip(ipo) { return Math.floor(ipo / 3) + '.' + (ipo % 3); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function plural(n, s, p) { return n === 1 ? s : (p || s + 's'); }

  // ---------- jugadores ----------
  // Columnas de cada fila de bateo (b): [año, G, AB, R, H, 2B, 3B, HR, RBI, SB, BB, SO, HBP, SF, SH]
  // Columnas de cada fila de pitcheo (p): [año, W, L, G, GS, CG, SHO, SV, IPouts, H, ER, BB, SO]
  var B = { A: 0, G: 1, AB: 2, R: 3, H: 4, D2: 5, D3: 6, HR: 7, RBI: 8, SB: 9, BB: 10, SO: 11, HBP: 12, SF: 13, SH: 14 };
  var P = { A: 0, W: 1, L: 2, G: 3, GS: 4, CG: 5, SHO: 6, SV: 7, IPO: 8, H: 9, ER: 10, BB: 11, SO: 12 };
  function sumar(filas) {
    if (!filas || !filas.length) return null;
    var t = filas[0].map(function () { return 0; });
    filas.forEach(function (f) { for (var i = 1; i < f.length; i++) t[i] += f[i] || 0; });
    t[0] = filas.length;
    return t;
  }
  function totalesBateo(j) {
    var t = sumar(j.b); if (!t) return null;
    var pa = t[B.AB] + t[B.BB] + t[B.HBP] + t[B.SF] + t[B.SH];
    var tb = t[B.H] + t[B.D2] + 2 * t[B.D3] + 3 * t[B.HR];
    var obpDen = t[B.AB] + t[B.BB] + t[B.HBP] + t[B.SF];
    return {
      temporadas: t[0], G: t[B.G], AB: t[B.AB], R: t[B.R], H: t[B.H], D2: t[B.D2], D3: t[B.D3], HR: t[B.HR], RBI: t[B.RBI],
      SB: t[B.SB], BB: t[B.BB], SO: t[B.SO], PA: pa, TB: tb,
      AVG: t[B.AB] ? t[B.H] / t[B.AB] : 0,
      OBP: obpDen ? (t[B.H] + t[B.BB] + t[B.HBP]) / obpDen : 0,
      SLG: t[B.AB] ? tb / t[B.AB] : 0
    };
  }
  function totalesPitcheo(j) {
    var t = sumar(j.p); if (!t) return null;
    return {
      temporadas: t[0], W: t[P.W], L: t[P.L], G: t[P.G], GS: t[P.GS], CG: t[P.CG], SHO: t[P.SHO], SV: t[P.SV],
      IPO: t[P.IPO], H: t[P.H], ER: t[P.ER], BB: t[P.BB], SO: t[P.SO],
      ERA: t[P.IPO] ? t[P.ER] * 27 / t[P.IPO] : 0,
      WHIP: t[P.IPO] ? (t[P.BB] + t[P.H]) / (t[P.IPO] / 3) : 0
    };
  }
  function esPitcher(j) {
    if (j.pos === 'P') return true;
    var tp = totalesPitcheo(j), tb = totalesBateo(j);
    return tp && (!tb || tp.IPO / 3 > tb.AB / 2);
  }
  function anosConNY(j) {
    var a = {};
    (j.b || []).forEach(function (f) { a[f[0]] = 1; });
    (j.p || []).forEach(function (f) { a[f[0]] = 1; });
    var ks = Object.keys(a).map(Number).sort(function (x, y) { return x - y; });
    return ks;
  }
  function rangoAnos(j) {
    var ks = anosConNY(j);
    if (!ks.length) return '';
    return ks[0] === ks[ks.length - 1] ? String(ks[0]) : ks[0] + '–' + ks[ks.length - 1];
  }
  var POS = { P: 'Lanzador', C: 'Receptor', '1B': 'Primera base', '2B': 'Segunda base', '3B': 'Tercera base', SS: 'Campocorto',
    LF: 'Jardinero izquierdo', CF: 'Jardinero central', RF: 'Jardinero derecho', DH: 'Bateador designado', OF: 'Jardinero', IF: 'Jugador de cuadro', TWP: 'Jugador de dos vías' };
  function posicion(ab) { return POS[ab] || ab || ''; }
  var LADO = { R: 'derecha', L: 'izquierda', B: 'ambas', S: 'ambas' };
  function lado(c) { return LADO[c] || '—'; }
  function nombreJugador(id) { var j = M.jugadores && M.jugadores[id]; return j ? j.n : id; }
  function enlaceJugador(id) { return 'duelo.html#' + encodeURIComponent(id); }
  function enlaceTemporada(a) { return 'temporadas.html#' + a; }

  // ---------- varios ----------
  function hoyMD() {
    var d = new Date();
    return (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate();
  }
  function colorTexto() { return getComputedStyle(document.documentElement).getPropertyValue('--tinta').trim(); }
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  M.util = {
    fechaLarga: fechaLarga, fechaCorta: fechaCorta, miles: miles, prom: prom, pct: pct, era: era, ip: ip, esc: esc, plural: plural,
    B: B, P: P, totalesBateo: totalesBateo, totalesPitcheo: totalesPitcheo, esPitcher: esPitcher, anosConNY: anosConNY, rangoAnos: rangoAnos,
    posicion: posicion, lado: lado, nombreJugador: nombreJugador, enlaceJugador: enlaceJugador, enlaceTemporada: enlaceTemporada,
    hoyMD: hoyMD, cssVar: cssVar, colorTexto: colorTexto, MESES: MESES, temaActual: temaActual
  };
  M.montarCabecera = montarCabecera;
  M.montarPie = montarPie;

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.querySelector('header.cabecera')) montarCabecera();
  });
})();
