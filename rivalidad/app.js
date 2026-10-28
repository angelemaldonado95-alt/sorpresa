/* La Rivalidad — lógica de la sala. Vanilla JS, sin dependencias.
   Los datos llegan por etiquetas <script> en window.RIVALIDAD (ver data/ESQUEMA.md). */
(function () {
  'use strict';

  var D = window.RIVALIDAD || {};
  var juegos = Array.isArray(D.juegos) ? D.juegos : [];
  var temporadas = Array.isArray(D.temporadas) ? D.temporadas : [];
  var resumen = D.resumen || null;
  var parques = D.parques || {};
  var momentos = Array.isArray(D.momentos) ? D.momentos : [];

  var ANIO_INICIO = 1903;
  var ANIO_FIN = 2026;

  /* ---------- Utilidades ---------- */

  function $(sel, raiz) { return (raiz || document).querySelector(sel); }
  function el(tag, attrs, hijos) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') e.className = attrs[k];
        else if (k === 'text') e.textContent = attrs[k];
        else if (k === 'html') e.innerHTML = attrs[k];
        else if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
      });
    }
    if (hijos) {
      (Array.isArray(hijos) ? hijos : [hijos]).forEach(function (h) {
        if (h === null || h === undefined) return;
        e.appendChild(typeof h === 'string' ? document.createTextNode(h) : h);
      });
    }
    return e;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(n) {
    if (n === null || n === undefined || isNaN(n)) return null;
    var s = String(Math.abs(Math.trunc(n)));
    var r = '';
    while (s.length > 3) { r = ',' + s.slice(-3) + r; s = s.slice(0, -3); }
    return (n < 0 ? '−' : '') + s + r;
  }
  function nd(v, fmt) {
    if (v === null || v === undefined || v === '') return el('span', { class: 'pizarra__nd', text: 'no disponible' });
    return document.createTextNode(fmt ? fmt(v) : String(v));
  }

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var DIAS_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  function partesFecha(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return null;
    return { a: +m[1], m: +m[2], d: +m[3] };
  }
  function diaSemana(iso, dia) {
    if (dia && DIAS_EN[dia] !== undefined) return DIAS[DIAS_EN[dia]];
    var p = partesFecha(iso);
    if (!p) return '';
    return DIAS[new Date(Date.UTC(p.a, p.m - 1, p.d)).getUTCDay()];
  }
  function fechaLarga(iso, dia) {
    var p = partesFecha(iso);
    if (!p) return iso || '';
    var ds = diaSemana(iso, dia);
    return (ds ? ds + ' ' : '') + p.d + ' de ' + MESES[p.m - 1] + ' de ' + p.a;
  }
  function fechaCorta(iso) {
    var p = partesFecha(iso);
    if (!p) return iso || '';
    return p.d + ' de ' + MESES[p.m - 1].slice(0, 3) + '. de ' + p.a;
  }
  function fechaMedia(iso) {
    var p = partesFecha(iso);
    if (!p) return iso || '';
    return p.d + ' de ' + MESES[p.m - 1];
  }
  function duracion(min) {
    if (min === null || min === undefined) return null;
    var h = Math.floor(min / 60), m = min % 60;
    return h + ' h ' + (m < 10 ? '0' : '') + m + ' min';
  }
  function ordinal(n) { return n + '.º'; }

  /* Nombres de la época */
  function nombreEquipo(cod, anio) {
    if (cod === 'NYY') return anio && anio <= 1912 ? 'Highlanders' : 'Yankees';
    if (cod === 'BOS') return anio && anio <= 1907 ? 'Americans' : 'Red Sox';
    return cod;
  }
  function nombreLargo(cod, anio) {
    return cod === 'NYY' ? nombreEquipo(cod, anio) + ' de Nueva York' : nombreEquipo(cod, anio) + ' de Boston';
  }
  function rival(cod) { return cod === 'NYY' ? 'BOS' : 'NYY'; }

  var TIPOS = { R: 'Temporada regular', T: 'Juego de desempate', F: 'Comodín de la Liga Americana', D: 'Serie Divisional de la Liga Americana', L: 'Serie de Campeonato de la Liga Americana', W: 'Serie Mundial' };
  var SERIES = { ALWC: 'Comodín de la Liga Americana', ALDS: 'Serie Divisional de la Liga Americana', ALCS: 'Serie de Campeonato de la Liga Americana', WS: 'Serie Mundial' };
  function esPost(j) { return j.tipo !== 'R' && j.tipo !== 'T'; }
  function etiquetaTipo(j) {
    if (j.serie && SERIES[j.serie]) return SERIES[j.serie];
    return TIPOS[j.tipo] || 'Temporada regular';
  }
  function etiquetaTipoCorta(j) {
    if (j.tipo === 'T') return 'Desempate';
    if (j.serie) return abreviaSerieCorta(j.serie);
    return esPost(j) ? 'Postemporada' : 'Regular';
  }

  /* Índices */
  var porId = {};
  var porFecha = {};
  var porTemporada = {};
  juegos.forEach(function (j) {
    porId[j.id] = j;
    (porFecha[j.fecha] = porFecha[j.fecha] || []).push(j);
    (porTemporada[j.temporada] = porTemporada[j.temporada] || []).push(j);
  });
  var tempPorAnio = {};
  temporadas.forEach(function (t) { tempPorAnio[t.temporada] = t; });

  /* Marcador corto "NYY 5, BOS 4" con ganador en negrita */
  function marcadorCorto(j) {
    var g = j.ganador;
    var span = el('span', { class: 'resultado__marcador' });
    var orden = g === 'BOS' ? ['BOS', 'NYY'] : ['NYY', 'BOS'];
    orden.forEach(function (eq, i) {
      var s = el('span', { class: g === eq ? 'ganador' : '', text: nombreEquipo(eq, j.temporada) + ' ' + j.carreras[eq] });
      span.appendChild(s);
      if (i === 0) span.appendChild(document.createTextNode(', '));
    });
    if (!g) span.appendChild(document.createTextNode(' (empate)'));
    if (j.numEntradas && j.numEntradas !== 9) span.appendChild(document.createTextNode(' · ' + j.numEntradas + ' entradas'));
    return span;
  }

  /* ---------- Pizarra ---------- */

  function parseLinea(s) {
    if (!s) return [];
    var out = [], m, re = /\((\d+)\)|./g;
    while ((m = re.exec(s)) !== null) out.push(m[1] !== undefined ? m[1] : m[0]);
    return out;
  }

  function pizarra(j, opciones) {
    opciones = opciones || {};
    var anio = j.temporada;
    var cont = el('article', { class: 'pizarra', 'aria-label': 'Pizarra del ' + fechaLarga(j.fecha, j.dia) });

    var cab = el('header', { class: 'pizarra__cabecera' });
    var tituloFecha = fechaLarga(j.fecha, j.dia);
    if (j.numJuego) tituloFecha += ' · ' + (j.numJuego === 1 ? 'primer' : 'segundo') + ' juego de la doble cartelera';
    cab.appendChild(el('p', { class: 'pizarra__fecha', text: tituloFecha }));
    var tipo = etiquetaTipo(j);
    if (j.diaNoche === 'N') tipo += ' · nocturno';
    cab.appendChild(el('p', { class: 'pizarra__tipo', text: tipo }));
    cont.appendChild(cab);

    var visita = j.visita, local = j.local;
    var lv = parseLinea(j.entradas && j.entradas[visita]);
    var ll = parseLinea(j.entradas && j.entradas[local]);
    var n = Math.max(j.numEntradas || 0, lv.length, ll.length, 9);

    var tabla = el('table', { class: 'pizarra__tabla' });
    var thead = el('thead'), trh = el('tr');
    trh.appendChild(el('th', { class: 'equipo', scope: 'col', text: 'Equipo' }));
    for (var i = 1; i <= n; i++) trh.appendChild(el('th', { scope: 'col', text: String(i) }));
    trh.appendChild(el('th', { scope: 'col', class: 'total', text: 'C', abbr: 'Carreras', title: 'Carreras' }));
    trh.appendChild(el('th', { scope: 'col', text: 'H', title: 'Hits' }));
    trh.appendChild(el('th', { scope: 'col', text: 'E', title: 'Errores' }));
    thead.appendChild(trh);
    tabla.appendChild(thead);

    var tbody = el('tbody');
    [[visita, lv], [local, ll]].forEach(function (par) {
      var eq = par[0], linea = par[1];
      var tr = el('tr', { class: j.ganador === eq ? 'ganador' : '' });
      var nombre = nombreEquipo(eq, anio) + (eq === local ? '' : '');
      tr.appendChild(el('th', { class: 'equipo', scope: 'row', text: nombre, title: nombreLargo(eq, anio) + (eq === local ? ' (local)' : ' (visitante)') }));
      for (var k = 0; k < n; k++) {
        var v = linea[k];
        if (v === undefined) tr.appendChild(el('td', { text: '' }));
        else if (v === 'x' || v === 'X') tr.appendChild(el('td', { class: 'x', text: 'x', title: 'No bateó' }));
        else tr.appendChild(el('td', { text: v }));
      }
      tr.appendChild(el('td', { class: 'total c', text: j.carreras ? String(j.carreras[eq]) : '' }));
      tr.appendChild(el('td', { class: 'total', text: j.hits && j.hits[eq] !== null && j.hits[eq] !== undefined ? String(j.hits[eq]) : '—' }));
      tr.appendChild(el('td', { class: 'total', text: j.errores && j.errores[eq] !== null && j.errores[eq] !== undefined ? String(j.errores[eq]) : '—' }));
      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);
    var env = el('div', { class: 'pizarra__tabla-env' }, tabla);
    cont.appendChild(env);

    var dl = el('dl', { class: 'pizarra__datos' });
    function dato(et, valor) {
      var par = el('div');
      par.appendChild(el('dt', { text: et }));
      var dd = el('dd');
      dd.appendChild(typeof valor === 'string' ? document.createTextNode(valor) : valor);
      par.appendChild(dd);
      dl.appendChild(par);
    }
    var p = parques[j.parque];
    dato('Parque', p ? p.nombre + (p.ciudad ? ', ' + p.ciudad : '') : (j.parque ? String(j.parque) : el('span', { class: 'pizarra__nd', text: 'no disponible' })));
    dato('Resultado', j.ganador ? 'Ganan ' + nombreEquipo(j.ganador, anio) + ' por ' + j.margen : 'Empate');
    dato('Asistencia', nd(j.asistencia, num));
    dato('Duración', nd(j.duracionMin, duracion));
    var L = j.lanzadores || {};
    dato('Lanzador ganador', nd(L.ganador));
    dato('Lanzador perdedor', nd(L.perdedor));
    if (L.salvamento) dato('Salvamento', L.salvamento);
    if (L.abridorNYY || L.abridorBOS) {
      dato('Abridor ' + nombreEquipo('NYY', anio), nd(L.abridorNYY));
      dato('Abridor ' + nombreEquipo('BOS', anio), nd(L.abridorBOS));
    }
    var M = j.managers || {};
    dato('Manager ' + nombreEquipo('NYY', anio), nd(M.NYY));
    dato('Manager ' + nombreEquipo('BOS', anio), nd(M.BOS));
    if (j.jonrones && j.jonrones.NYY !== null && j.jonrones.NYY !== undefined && j.jonrones.BOS !== null && j.jonrones.BOS !== undefined) {
      dato('Jonrones', nombreEquipo('NYY', anio) + ' ' + j.jonrones.NYY + ', ' + nombreEquipo('BOS', anio) + ' ' + j.jonrones.BOS);
    } else {
      dato('Jonrones', nd(null));
    }
    if (j.fuente) dato('Fuente', j.fuente === 'retrosheet' ? 'Retrosheet' : j.fuente === 'mlb' ? 'MLB Stats API' : String(j.fuente));
    cont.appendChild(dl);
    return cont;
  }

  /* Diálogo con pizarra */
  var dialogo = $('#dialogo-pizarra');
  var dialogoCont = $('#dialogo-contenido');
  function abrirPizarra(id) {
    var j = porId[id];
    if (!j) return;
    dialogoCont.innerHTML = '';
    dialogoCont.appendChild(pizarra(j));
    $('#dialogo-titulo').textContent = 'Pizarra · ' + nombreEquipo('NYY', j.temporada) + ' y ' + nombreEquipo('BOS', j.temporada);
    if (dialogo && typeof dialogo.showModal === 'function') {
      if (!dialogo.open) dialogo.showModal();
    } else if (dialogo) {
      dialogo.setAttribute('open', '');
    }
  }
  if (dialogo) {
    $('#dialogo-cerrar').addEventListener('click', function () { dialogo.close ? dialogo.close() : dialogo.removeAttribute('open'); });
    dialogo.addEventListener('click', function (e) {
      if (e.target === dialogo) dialogo.close();
    });
  }
  function enlacePizarra(j, texto) {
    var b = el('button', { type: 'button', class: 'enlace-pizarra', 'data-juego': j.id });
    b.appendChild(typeof texto === 'string' ? document.createTextNode(texto) : texto);
    return b;
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-juego]');
    if (b) { e.preventDefault(); abrirPizarra(b.getAttribute('data-juego')); }
  });

  /* ---------- Tema ---------- */

  var btnTema = $('#btn-tema');
  function temaActual() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t === 'oscuro' || t === 'claro') return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
  }
  function pintarBotonTema() {
    var t = temaActual();
    btnTema.textContent = t === 'oscuro' ? 'Modo claro' : 'Modo oscuro';
    btnTema.setAttribute('aria-pressed', t === 'oscuro' ? 'true' : 'false');
  }
  btnTema.addEventListener('click', function () {
    var nuevo = temaActual() === 'oscuro' ? 'claro' : 'oscuro';
    document.documentElement.setAttribute('data-theme', nuevo);
    try { localStorage.setItem('monumento-tema', nuevo); } catch (e) { /* sin almacenamiento */ }
    pintarBotonTema();
  });
  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', pintarBotonTema);
    } catch (e) { /* navegadores viejos */ }
  }
  pintarBotonTema();

  /* ---------- Sin datos ---------- */
  if (!juegos.length || !temporadas.length || !resumen) {
    $('#aviso-carga').hidden = false;
  }

  /* ---------- Marcador histórico ---------- */

  function renderMarcador() {
    var cont = $('#marcador-contenido');
    if (!resumen) return;
    var r = resumen.regular || {}, p = resumen.postemporada || {}, t = resumen.total || {};
    var grid = el('div', { class: 'marcador' });

    function bloque(etiqueta, nyy, bos, extra) {
      var b = el('div', { class: 'marcador__bloque' });
      b.appendChild(el('p', { class: 'marcador__etiqueta', text: etiqueta }));
      var cifras = el('div', { class: 'marcador__cifras' });
      cifras.appendChild(el('span', { class: 'marcador__cifra' + (nyy < bos ? ' marcador__cifra--menor' : ''), text: num(nyy) || '0' }));
      cifras.appendChild(el('span', { class: 'marcador__sep', text: '–' }));
      cifras.appendChild(el('span', { class: 'marcador__cifra' + (bos < nyy ? ' marcador__cifra--menor' : ''), text: num(bos) || '0' }));
      b.appendChild(cifras);
      b.appendChild(el('ul', { class: 'marcador__equipos' }, [el('li', { text: 'Yankees' }), el('li', { text: '·' }), el('li', { text: 'Red Sox' })]));
      if (extra) b.appendChild(extra);
      return b;
    }

    var detReg = el('p', { class: 'marcador__detalle' });
    detReg.textContent = num(r.juegos) + ' juegos' + (r.empates ? ', ' + r.empates + (r.empates === 1 ? ' empate' : ' empates') : '') + '.';
    grid.appendChild(bloque('Temporada regular', r.NYY, r.BOS, detReg));

    var series = p.series || [];
    var extraPost = el('div');
    extraPost.appendChild(el('p', { class: 'marcador__detalle', text: num(p.juegos) + ' juegos en ' + series.length + (series.length === 1 ? ' serie.' : ' series.') }));
    if (series.length) {
      var ul = el('ul', { class: 'marcador__series' });
      series.forEach(function (s) {
        var li = el('li');
        li.appendChild(el('span', { text: s.temporada + ' · ' + (SERIES[s.nombre] ? abreviaSerie(s.nombre) : s.nombre) }));
        var gan = s.ganador;
        var res = gan === 'BOS' ? 'Red Sox ' + s.BOS + '–' + s.NYY : 'Yankees ' + s.NYY + '–' + s.BOS;
        li.appendChild(el('span', { class: 'ganador', text: res }));
        ul.appendChild(li);
      });
      extraPost.appendChild(ul);
    }
    grid.appendChild(bloque('Postemporada', p.NYY, p.BOS, extraPost));

    var detTot = el('p', { class: 'marcador__detalle', text: num((r.juegos || 0) + (p.juegos || 0)) + ' juegos desde ' + ANIO_INICIO + '.' });
    grid.appendChild(bloque('Total', t.NYY, t.BOS, detTot));

    var ext = el('div', { class: 'marcador__extremos' });
    [['Primer juego', resumen.primerJuego], ['Último juego', resumen.ultimoJuego]].forEach(function (par) {
      var j = porId[par[1]];
      var b = el('div', { class: 'marcador__extremo' });
      b.appendChild(el('p', { class: 'marcador__etiqueta', text: par[0] }));
      if (j) {
        var pq = parques[j.parque];
        b.appendChild(el('p', {}, enlacePizarra(j, fechaLarga(j.fecha, j.dia))));
        b.appendChild(el('p', {}, marcadorCorto(j)));
        b.appendChild(el('p', { text: (pq ? pq.nombre + ', ' + pq.ciudad : '') }));
      } else {
        b.appendChild(el('p', { class: 'pizarra__nd', text: 'no disponible' }));
      }
      ext.appendChild(b);
    });
    grid.appendChild(ext);
    cont.appendChild(grid);
  }
  function abreviaSerie(n) {
    return { ALWC: 'Comodín', ALDS: 'Serie Divisional', ALCS: 'Serie de Campeonato', WS: 'Serie Mundial' }[n] || n;
  }
  function abreviaSerieCorta(n) {
    return { ALWC: 'Comodín', ALDS: 'Divisional', ALCS: 'Campeonato', WS: 'Serie Mundial' }[n] || n;
  }

  /* ---------- Gráfica de la ventaja ---------- */

  function renderGrafica() {
    var cont = $('#grafica-contenedor');
    if (!temporadas.length) return;
    var datos = temporadas.map(function (t) {
      var a = t.acumulado || { NYY: 0, BOS: 0 };
      return { anio: t.temporada, dif: (a.NYY || 0) - (a.BOS || 0), reg: t.regular || { NYY: 0, BOS: 0, empates: 0 }, t: t };
    }).sort(function (a, b) { return a.anio - b.anio; });

    var W = 800, H = 340, mI = 44, mD = 16, mA = 16, mB = 32;
    var aw = W - mI - mD, ah = H - mA - mB;
    var x0 = ANIO_INICIO, x1 = Math.max(ANIO_FIN, datos[datos.length - 1].anio);
    var maxAbs = Math.max(10, Math.max.apply(null, datos.map(function (d) { return Math.abs(d.dif); })));
    var yMax = Math.ceil(maxAbs / 25) * 25;
    var yMin = -yMax;
    // Si la línea nunca baja mucho del cero, no desperdiciar la mitad del alto.
    var minDif = Math.min.apply(null, datos.map(function (d) { return d.dif; }));
    var maxDif = Math.max.apply(null, datos.map(function (d) { return d.dif; }));
    yMin = Math.min(0, Math.floor(minDif / 25) * 25 - (minDif % 25 === 0 ? 0 : 0));
    yMax = Math.max(0, Math.ceil(maxDif / 25) * 25);
    if (yMax - yMin < 50) { yMax = yMin + 50; }
    var X = function (a) { return mI + (a - x0) / (x1 - x0) * aw; };
    var Y = function (v) { return mA + (yMax - v) / (yMax - yMin) * ah; };

    var ns = 'http://www.w3.org/2000/svg';
    function sv(tag, attrs) {
      var e = document.createElementNS(ns, tag);
      Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      return e;
    }
    var ultimo = datos[datos.length - 1];
    var svg = sv('svg', {
      viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      'aria-label': 'Diferencia acumulada de victorias en temporada regular, Yankees menos Red Sox, de ' + datos[0].anio + ' a ' + ultimo.anio + '. Al final ' + (ultimo.dif >= 0 ? 'los Yankees aventajan por ' + ultimo.dif : 'los Red Sox aventajan por ' + (-ultimo.dif)) + ' victorias.'
    });
    svg.appendChild(sv('title')).textContent = 'Ventaja acumulada año con año';

    // Rejilla y ejes
    var paso = (yMax - yMin) > 300 ? 100 : 50;
    for (var v = yMin; v <= yMax; v += paso) {
      svg.appendChild(sv('line', { x1: mI, x2: W - mD, y1: Y(v), y2: Y(v), class: v === 0 ? 'grafica__cero' : 'grafica__eje' }));
      var tx = sv('text', { x: mI - 8, y: Y(v) + 4, 'text-anchor': 'end', class: 'grafica__texto' });
      tx.textContent = v > 0 ? '+' + v : String(v).replace('-', '−');
      svg.appendChild(tx);
    }
    for (var a = 1910; a <= x1; a += 10) {
      if (a < x0) continue;
      svg.appendChild(sv('line', { x1: X(a), x2: X(a), y1: H - mB, y2: H - mB + 4, class: 'grafica__eje' }));
      var ta = sv('text', { x: X(a), y: H - mB + 16, 'text-anchor': 'middle', class: 'grafica__texto' });
      ta.textContent = String(a);
      svg.appendChild(ta);
    }

    // Área y línea
    var puntos = datos.map(function (d) { return X(d.anio).toFixed(1) + ',' + Y(d.dif).toFixed(1); });
    var area = 'M' + X(datos[0].anio).toFixed(1) + ',' + Y(0).toFixed(1) + ' L' + puntos.join(' L') + ' L' + X(ultimo.anio).toFixed(1) + ',' + Y(0).toFixed(1) + ' Z';
    svg.appendChild(sv('path', { d: area, class: 'grafica__area' }));
    svg.appendChild(sv('polyline', { points: puntos.join(' '), class: 'grafica__linea' }));

    var guia = sv('line', { x1: 0, x2: 0, y1: mA, y2: H - mB, class: 'grafica__guia' });
    var punto = sv('circle', { cx: 0, cy: 0, r: 3.5, class: 'grafica__punto' });
    svg.appendChild(guia); svg.appendChild(punto);
    var captura = sv('rect', { x: mI, y: mA, width: aw, height: ah, class: 'grafica__captura' });
    svg.appendChild(captura);

    cont.appendChild(svg);
    var tooltip = el('div', { class: 'grafica__tooltip', role: 'status', 'aria-live': 'off' });
    cont.appendChild(tooltip);
    cont.setAttribute('tabindex', '0');
    cont.setAttribute('aria-describedby', 'grafica-ayuda');
    var ayuda = el('p', { id: 'grafica-ayuda', class: 'visualmente-oculto', text: 'Usa las flechas izquierda y derecha para recorrer las temporadas.' });
    cont.appendChild(ayuda);

    var leyenda = el('p', { class: 'grafica__leyenda' });
    var primero = datos[0];
    var pico = datos.reduce(function (m, d) { return d.dif > m.dif ? d : m; }, datos[0]);
    var valle = datos.reduce(function (m, d) { return d.dif < m.dif ? d : m; }, datos[0]);
    leyenda.appendChild(el('span', { html: 'Al cierre de ' + ultimo.anio + ': <b>' + (ultimo.dif > 0 ? 'Yankees +' + ultimo.dif : ultimo.dif < 0 ? 'Red Sox +' + (-ultimo.dif) : 'empatados') + '</b>' }));
    leyenda.appendChild(el('span', { html: 'Mayor ventaja de Nueva York: <b>+' + pico.dif + '</b> (' + pico.anio + ')' }));
    if (valle.dif < 0) leyenda.appendChild(el('span', { html: 'Mayor ventaja de Boston: <b>+' + (-valle.dif) + '</b> (' + valle.anio + ')' }));
    leyenda.appendChild(el('span', { html: 'Último año con ventaja de Boston: <b>' + (function () { var u = null; datos.forEach(function (d) { if (d.dif < 0) u = d.anio; }); return u === null ? 'ninguno' : u; })() + '</b>' }));
    cont.appendChild(leyenda);

    var idx = -1;
    function mostrar(i) {
      if (i < 0 || i >= datos.length) return;
      idx = i;
      var d = datos[i];
      var px = X(d.anio), py = Y(d.dif);
      guia.setAttribute('x1', px); guia.setAttribute('x2', px);
      punto.setAttribute('cx', px); punto.setAttribute('cy', py);
      cont.classList.add('activa');
      var reg = d.reg;
      var ventaja = d.dif > 0 ? 'Yankees +' + d.dif : d.dif < 0 ? 'Red Sox +' + (-d.dif) : 'Empatados';
      tooltip.innerHTML = '<strong>' + d.anio + '</strong><dl>' +
        '<dt>Ese año</dt><dd>' + nombreEquipo('NYY', d.anio) + ' ' + reg.NYY + ', ' + nombreEquipo('BOS', d.anio) + ' ' + reg.BOS + (reg.empates ? ', ' + reg.empates + ' emp.' : '') + '</dd>' +
        '<dt>Acumulado</dt><dd>' + d.t.acumulado.NYY + '–' + d.t.acumulado.BOS + '</dd>' +
        '<dt>Ventaja</dt><dd>' + ventaja + '</dd></dl>';
      var rect = svg.getBoundingClientRect();
      var escala = rect.width / W;
      var left = px * escala;
      var tw = tooltip.offsetWidth || 180;
      if (left + 12 + tw > rect.width) left = left - 12 - tw; else left = left + 12;
      tooltip.style.left = Math.max(0, left) + 'px';
      tooltip.style.top = Math.max(0, Math.min(py * escala - 20, rect.height - tooltip.offsetHeight - 8)) + 'px';
    }
    function ocultar() { cont.classList.remove('activa'); }
    function desdeEvento(e) {
      var rect = svg.getBoundingClientRect();
      var cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      var anio = x0 + (cx / rect.width * W - mI) / aw * (x1 - x0);
      var mejor = 0, dist = Infinity;
      for (var i = 0; i < datos.length; i++) {
        var dd = Math.abs(datos[i].anio - anio);
        if (dd < dist) { dist = dd; mejor = i; }
      }
      mostrar(mejor);
    }
    captura.addEventListener('mousemove', desdeEvento);
    captura.addEventListener('mouseleave', ocultar);
    captura.addEventListener('touchstart', function (e) { desdeEvento(e); }, { passive: true });
    captura.addEventListener('touchmove', function (e) { desdeEvento(e); }, { passive: true });
    cont.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); mostrar(idx < 0 ? 0 : Math.min(datos.length - 1, idx + 1)); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); mostrar(idx < 0 ? datos.length - 1 : Math.max(0, idx - 1)); }
      else if (e.key === 'Home') { e.preventDefault(); mostrar(0); }
      else if (e.key === 'End') { e.preventDefault(); mostrar(datos.length - 1); }
      else if (e.key === 'Escape') { ocultar(); }
    });
    cont.addEventListener('focus', function () { tooltip.setAttribute('aria-live', 'polite'); });
    cont.addEventListener('blur', function () { ocultar(); tooltip.setAttribute('aria-live', 'off'); });
  }

  /* ---------- Temporada por temporada ---------- */

  function renderTemporadas() {
    var contDec = $('#decadas');
    var cont = $('#temporadas-contenido');
    if (!temporadas.length) return;
    var decadas = [];
    temporadas.forEach(function (t) {
      var d = Math.floor(t.temporada / 10) * 10;
      if (decadas.indexOf(d) < 0) decadas.push(d);
    });
    decadas.sort();
    var seleccion = decadas[decadas.length - 1];
    try {
      var g = localStorage.getItem('rivalidad-decada');
      if (g && decadas.indexOf(+g) >= 0) seleccion = +g;
    } catch (e) { /* nada */ }

    decadas.forEach(function (d) {
      var b = el('button', { type: 'button', role: 'tab', 'data-decada': d, text: d + 's', 'aria-selected': d === seleccion ? 'true' : 'false' });
      b.addEventListener('click', function () {
        seleccion = d;
        try { localStorage.setItem('rivalidad-decada', String(d)); } catch (e) { /* nada */ }
        Array.prototype.forEach.call(contDec.children, function (c) { c.setAttribute('aria-selected', +c.getAttribute('data-decada') === d ? 'true' : 'false'); });
        pintarDecada(d);
      });
      contDec.appendChild(b);
    });

    function pintarDecada(d) {
      cont.innerHTML = '';
      var lista = temporadas.filter(function (t) { return Math.floor(t.temporada / 10) * 10 === d; }).sort(function (a, b) { return a.temporada - b.temporada; });
      var tabla = el('table', { class: 'temporadas' });
      var thead = el('thead');
      thead.appendChild(el('tr', {}, [
        el('th', { scope: 'col', text: 'Año' }),
        el('th', { scope: 'col', text: 'Temporada regular' }),
        el('th', { scope: 'col', text: 'Postemporada' }),
        el('th', { scope: 'col', class: 'ocultar-chico', text: 'Posiciones' }),
        el('th', { scope: 'col', class: 'ocultar-chico', text: 'Líder del grupo' }),
        el('th', { scope: 'col', class: 'temporadas__flecha' }, el('span', { class: 'visualmente-oculto', text: 'Detalle' }))
      ]));
      tabla.appendChild(thead);
      var tbody = el('tbody');
      lista.forEach(function (t) { tbody.appendChild(filaTemporada(t)); });
      tabla.appendChild(tbody);
      cont.appendChild(el('div', { class: 'tabla-env' }, tabla));
    }

    function recordSpan(nyy, bos, anio, emp) {
      var s = el('span', { class: 'temporadas__record' });
      s.appendChild(el('span', { class: nyy > bos ? 'ganador' : '', text: nombreEquipo('NYY', anio) + ' ' + nyy }));
      s.appendChild(document.createTextNode(' – '));
      s.appendChild(el('span', { class: bos > nyy ? 'ganador' : '', text: nombreEquipo('BOS', anio) + ' ' + bos }));
      if (emp) s.appendChild(document.createTextNode(', ' + emp + ' emp.'));
      return s;
    }

    function filaTemporada(t) {
      var anio = t.temporada;
      var reg = t.regular || { NYY: 0, BOS: 0, empates: 0 };
      var post = t.postemporada || { NYY: 0, BOS: 0, serie: null };
      var pos = t.posiciones || null;
      var tr = el('tr', { class: 'temporadas__fila', 'aria-expanded': 'false' });
      var idDet = 'det-' + anio;
      var btn = el('button', { type: 'button', text: String(anio), 'aria-controls': idDet, 'aria-expanded': 'false' });
      tr.appendChild(el('td', { class: 'temporadas__anio' }, btn));
      var tdReg = el('td');
      if (t.sinJuegos || t.juegos === 0 || (!reg.NYY && !reg.BOS && !reg.empates && !post.serie)) tdReg.appendChild(el('span', { class: 'pizarra__nd', text: 'sin juegos' }));
      else tdReg.appendChild(recordSpan(reg.NYY, reg.BOS, anio, reg.empates));
      tr.appendChild(tdReg);
      var tdPost = el('td');
      if (post.serie) {
        var s = post.serie;
        tdPost.appendChild(el('span', { text: abreviaSerieCorta(s.nombre) + ': ' }));
        tdPost.appendChild(recordSpan(s.NYY, s.BOS, anio, 0));
      } else tdPost.appendChild(el('span', { class: 'pizarra__nd', text: '—' }));
      tr.appendChild(tdPost);
      var tdPos = el('td', { class: 'ocultar-chico' });
      if (pos && pos.NYY && pos.BOS) {
        tdPos.textContent = nombreEquipo('NYY', anio) + ' ' + ordinal(pos.NYY.lugar) + ' (' + pos.NYY.g + '-' + pos.NYY.p + '), ' + nombreEquipo('BOS', anio) + ' ' + ordinal(pos.BOS.lugar) + ' (' + pos.BOS.g + '-' + pos.BOS.p + ')';
      } else tdPos.appendChild(el('span', { class: 'pizarra__nd', text: 'no disponible' }));
      tr.appendChild(tdPos);
      tr.appendChild(el('td', { class: 'ocultar-chico', text: pos && pos.lider ? pos.lider : '—' }));
      var flecha = el('td', { class: 'temporadas__flecha', text: '+', 'aria-hidden': 'true' });
      tr.appendChild(flecha);

      var trDet = null;
      function alternar() {
        var abierto = tr.getAttribute('aria-expanded') === 'true';
        if (abierto) {
          if (trDet) { trDet.remove(); trDet = null; }
          tr.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-expanded', 'false'); flecha.textContent = '+';
        } else {
          trDet = el('tr', { class: 'temporadas__detalle', id: idDet });
          var td = el('td', { colspan: '6' });
          td.appendChild(detalleTemporada(t));
          trDet.appendChild(td);
          tr.insertAdjacentElement('afterend', trDet);
          tr.setAttribute('aria-expanded', 'true'); btn.setAttribute('aria-expanded', 'true'); flecha.textContent = '−';
        }
      }
      tr.addEventListener('click', function (e) {
        if (e.target.closest('[data-juego]')) return;
        alternar();
      });
      btn.addEventListener('click', function (e) { e.stopPropagation(); alternar(); });
      return tr;
    }

    function detalleTemporada(t) {
      var anio = t.temporada;
      var wrap = el('div', { class: 'temporadas__detalle-int' });
      var izq = el('div'), der = el('div');

      // Nota de la temporada (huelga, pandemia, etc.)
      if (t.nota) wrap.appendChild(el('p', { class: 'temporadas__nota', text: t.nota }));

      // Récord del duelo
      izq.appendChild(el('h4', { text: 'El duelo en ' + anio }));
      var reg = t.regular || {}, post = t.postemporada || {};
      var tr1 = el('table', { class: 'tabla' });
      tr1.appendChild(el('thead', {}, el('tr', {}, [el('th', { scope: 'col', text: '' }), el('th', { scope: 'col', class: 'num', text: nombreEquipo('NYY', anio) }), el('th', { scope: 'col', class: 'num', text: nombreEquipo('BOS', anio) }), el('th', { scope: 'col', class: 'num', text: 'Empates' })])));
      var tb1 = el('tbody');
      tb1.appendChild(el('tr', {}, [el('td', { text: 'Temporada regular' }), el('td', { class: 'num' + (reg.NYY > reg.BOS ? ' ganador' : ''), text: String(reg.NYY || 0) }), el('td', { class: 'num' + (reg.BOS > reg.NYY ? ' ganador' : ''), text: String(reg.BOS || 0) }), el('td', { class: 'num', text: String(reg.empates || 0) })]));
      if (post.serie) {
        tb1.appendChild(el('tr', {}, [el('td', { text: SERIES[post.serie.nombre] || post.serie.nombre }), el('td', { class: 'num' + (post.serie.ganador === 'NYY' ? ' ganador' : ''), text: String(post.serie.NYY) }), el('td', { class: 'num' + (post.serie.ganador === 'BOS' ? ' ganador' : ''), text: String(post.serie.BOS) }), el('td', { class: 'num', text: '0' })]));
      }
      var acc = t.acumulado || {};
      tb1.appendChild(el('tr', {}, [el('td', { text: 'Acumulado histórico (regular)' }), el('td', { class: 'num', text: String(acc.NYY || 0) }), el('td', { class: 'num', text: String(acc.BOS || 0) }), el('td', { class: 'num', text: String(acc.empates || 0) })]));
      tr1.appendChild(tb1);
      izq.appendChild(tr1);

      // Tabla de posiciones
      var pos = t.posiciones;
      izq.appendChild(el('h4', { text: 'Tabla de posiciones final' + (pos && pos.grupo ? ' · ' + pos.grupo : '') }));
      if (pos && pos.NYY && pos.BOS) {
        var tp = el('table', { class: 'tabla' });
        tp.appendChild(el('thead', {}, el('tr', {}, [el('th', { scope: 'col', text: 'Equipo' }), el('th', { scope: 'col', class: 'num', text: 'Lugar' }), el('th', { scope: 'col', class: 'num', text: 'G-P' }), el('th', { scope: 'col', class: 'num', text: 'JD', title: 'Juegos detrás' })])));
        var tbp = el('tbody');
        var orden = (pos.NYY.lugar <= pos.BOS.lugar) ? ['NYY', 'BOS'] : ['BOS', 'NYY'];
        orden.forEach(function (eq) {
          var e = pos[eq];
          tbp.appendChild(el('tr', {}, [el('td', { class: e.lugar === 1 ? 'ganador' : '', text: nombreLargo(eq, anio) }), el('td', { class: 'num', text: ordinal(e.lugar) }), el('td', { class: 'num', text: e.g + '-' + e.p }), el('td', { class: 'num', text: e.jd === '-' || e.jd === '' || e.jd === null ? '—' : String(e.jd) })]));
        });
        tp.appendChild(tbp);
        izq.appendChild(tp);
        if (pos.lider) izq.appendChild(el('p', { class: 'temporadas__lider', text: 'Líder del grupo: ' + pos.lider + '.' }));
      } else {
        izq.appendChild(el('p', { class: 'pizarra__nd', text: 'Tabla de posiciones no disponible para este año.' }));
      }

      // Juegos destacados
      function listaJuegos(titulo, ids, descr) {
        der.appendChild(el('h4', { text: titulo }));
        var ul = el('ul', { class: 'juegos-destacados' });
        var hay = false;
        (ids || []).forEach(function (id) {
          var j = porId[id];
          if (!j) return;
          hay = true;
          var li = el('li');
          li.appendChild(el('span', { class: 'fecha' }, enlacePizarra(j, fechaMedia(j.fecha) + (j.numJuego ? ' (' + j.numJuego + ')' : ''))));
          li.appendChild(marcadorCorto(j));
          ul.appendChild(li);
        });
        if (!hay) ul.appendChild(el('li', { class: 'vacio', text: descr }));
        der.appendChild(ul);
      }
      listaJuegos('Los más cerrados', t.masCerrados, 'Ningún juego se decidió por una carrera.');
      listaJuegos('Los de más carreras', t.masCarreras, 'Sin juegos registrados.');
      var total = t.juegos !== undefined ? t.juegos : (porTemporada[anio] || []).length;
      var btnTodos = el('button', { type: 'button', class: 'enlace-pizarra', text: 'Ver los ' + total + ' juegos de ' + anio + ' en el buscador' });
      btnTodos.addEventListener('click', function (e) {
        e.stopPropagation();
        $('#b-fecha').value = '';
        $('#b-anio').value = String(anio);
        $('#b-tipo').value = 'todos';
        buscar();
        $('#buscador').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      der.appendChild(el('p', {}, btnTodos));

      wrap.appendChild(izq); wrap.appendChild(der);
      return wrap;
    }

    pintarDecada(seleccion);
  }

  /* ---------- Momentos clave ---------- */

  function renderMomentos() {
    var cont = $('#momentos-contenido');
    if (!momentos.length) {
      cont.appendChild(el('p', { class: 'seccion__nota', text: 'Aún no hay momentos curados en esta sala.' }));
      return;
    }
    momentos.slice().sort(function (a, b) { return (a.fecha || '') < (b.fecha || '') ? -1 : 1; }).forEach(function (m) {
      var art = el('article', { class: 'momento', id: 'momento-' + (m.id || m.temporada) });
      art.appendChild(el('p', { class: 'momento__fecha', text: m.fecha ? fechaLarga(m.fecha) : String(m.temporada || '') }));
      art.appendChild(el('h3', { class: 'momento__titulo', text: m.titulo || '' }));
      var cuerpo = el('div', { class: 'momento__cuerpo' });
      var texto = el('div', { class: 'momento__texto' });
      (m.texto || []).forEach(function (p) { texto.appendChild(el('p', { text: p })); });
      if (m.datos && m.datos.length) {
        var dl = el('dl', { class: 'momento__datos' });
        m.datos.forEach(function (d) { dl.appendChild(el('dt', { text: d.etiqueta })); dl.appendChild(el('dd', { text: d.valor })); });
        texto.appendChild(dl);
      }
      if (m.fuentes && m.fuentes.length) {
        var f = el('div', { class: 'momento__fuentes', text: 'Fuentes' });
        var ul = el('ul');
        m.fuentes.forEach(function (s) { ul.appendChild(el('li', { text: s })); });
        f.appendChild(ul);
        texto.appendChild(f);
      }
      cuerpo.appendChild(texto);
      var piz = el('div', { class: 'momento__pizarras' });
      (m.juegos || []).forEach(function (id) {
        var j = porId[id];
        if (j) piz.appendChild(pizarra(j));
        else piz.appendChild(el('p', { class: 'momento__faltante', text: 'No se encontró la pizarra del juego ' + id + ' en los datos.' }));
      });
      cuerpo.appendChild(piz);
      art.appendChild(cuerpo);
      cont.appendChild(art);
    });
  }

  /* ---------- Buscador ---------- */

  var resCont = $('#buscador-resultados');
  var PAGINA = 40;

  function filtroTipo(lista, tipo) {
    if (tipo === 'regular') return lista.filter(function (j) { return !esPost(j); });
    if (tipo === 'post') return lista.filter(esPost);
    return lista;
  }

  function filaResultado(j) {
    var li = el('li');
    var idDet = 'res-' + j.id;
    var b = el('button', { type: 'button', class: 'resultado', 'aria-expanded': 'false', 'aria-controls': idDet });
    b.appendChild(el('span', { class: 'resultado__fecha', text: fechaCorta(j.fecha) + (j.numJuego ? ' (' + j.numJuego + ')' : '') }));
    b.appendChild(marcadorCorto(j));
    var pq = parques[j.parque];
    b.appendChild(el('span', { class: 'resultado__tipo', text: etiquetaTipoCorta(j) + (pq ? ' · ' + pq.nombre : '') }));
    li.appendChild(b);
    var det = null;
    b.addEventListener('click', function () {
      if (det) { det.remove(); det = null; b.setAttribute('aria-expanded', 'false'); return; }
      det = el('div', { class: 'resultado-detalle', id: idDet });
      det.appendChild(pizarra(j));
      li.appendChild(det);
      b.setAttribute('aria-expanded', 'true');
    });
    return li;
  }

  function renderLista(lista, destino) {
    var ul = el('ul', { class: 'resultados__lista' });
    destino.appendChild(ul);
    var pos = 0;
    function mas() {
      var fin = Math.min(lista.length, pos + PAGINA);
      for (; pos < fin; pos++) ul.appendChild(filaResultado(lista[pos]));
      if (pos < lista.length) {
        var b = el('button', { type: 'button', class: 'boton boton--secundario resultados__mas', text: 'Mostrar ' + Math.min(PAGINA, lista.length - pos) + ' más (' + (lista.length - pos) + ' restantes)' });
        b.addEventListener('click', function () { b.remove(); mas(); });
        destino.appendChild(b);
      }
    }
    mas();
  }

  function cercano(fecha, dir) {
    // dir -1: anterior; +1: siguiente. Búsqueda binaria sobre juegos ordenados por fecha.
    var lo = 0, hi = juegos.length - 1, res = null;
    if (dir < 0) {
      while (lo <= hi) { var m = (lo + hi) >> 1; if (juegos[m].fecha < fecha) { res = juegos[m]; lo = m + 1; } else hi = m - 1; }
      // de ese día, el último juego
      if (res) { var i = juegos.indexOf(res); while (i + 1 < juegos.length && juegos[i + 1].fecha === res.fecha) i++; res = juegos[i]; }
    } else {
      while (lo <= hi) { var m2 = (lo + hi) >> 1; if (juegos[m2].fecha > fecha) { res = juegos[m2]; hi = m2 - 1; } else lo = m2 + 1; }
    }
    return res;
  }

  function buscar() {
    var fecha = $('#b-fecha').value;
    var anioStr = $('#b-anio').value.trim();
    var tipo = $('#b-tipo').value;
    resCont.innerHTML = '';
    if (!juegos.length) return;

    if (fecha) {
      var delDia = filtroTipo(porFecha[fecha] || [], tipo);
      if (delDia.length) {
        resCont.appendChild(el('p', { class: 'resultados__resumen', text: delDia.length === 1 ? 'Hubo un juego el ' + fechaLarga(fecha) + '.' : 'Hubo ' + delDia.length + ' juegos el ' + fechaLarga(fecha) + ' (doble cartelera).' }));
        renderLista(delDia, resCont);
        // Abrir la pizarra de inmediato si es un solo juego
        var primerBoton = resCont.querySelector('.resultado');
        if (primerBoton && delDia.length === 1) primerBoton.click();
      } else {
        var p = partesFecha(fecha);
        var fueraRango = p && (p.a < ANIO_INICIO || fecha > juegos[juegos.length - 1].fecha);
        resCont.appendChild(el('p', { class: 'resultados__resumen', text: 'No hubo juego entre los dos equipos el ' + fechaLarga(fecha) + (fueraRango ? ' (fuera del periodo registrado).' : '.') }));
        var ant = cercano(fecha, -1), sig = cercano(fecha, +1);
        var grid = el('div', { class: 'cercanos' });
        [['Juego anterior más cercano', ant], ['Juego siguiente más cercano', sig]].forEach(function (par) {
          var col = el('div');
          col.appendChild(el('h3', { text: par[0] }));
          if (par[1]) {
            var ul = el('ul', { class: 'resultados__lista' });
            ul.appendChild(filaResultado(par[1]));
            col.appendChild(ul);
          } else col.appendChild(el('p', { class: 'pizarra__nd', text: 'ninguno' }));
          grid.appendChild(col);
        });
        resCont.appendChild(grid);
      }
      return;
    }

    if (anioStr) {
      var anio = parseInt(anioStr, 10);
      var lista = filtroTipo(porTemporada[anio] || [], tipo);
      if (!lista.length) {
        resCont.appendChild(el('p', { class: 'resultados__resumen', text: isNaN(anio) ? 'Escribe un año válido.' : 'No hay juegos registrados ' + (tipo === 'post' ? 'de postemporada ' : tipo === 'regular' ? 'de temporada regular ' : '') + 'en ' + anio + '.' }));
        return;
      }
      var t = tempPorAnio[anio];
      var resumenTxt = lista.length + ' juegos en ' + anio;
      if (t && t.regular) resumenTxt += ' · temporada regular ' + nombreEquipo('NYY', anio) + ' ' + t.regular.NYY + ', ' + nombreEquipo('BOS', anio) + ' ' + t.regular.BOS + (t.regular.empates ? ', ' + t.regular.empates + ' emp.' : '');
      if (t && t.postemporada && t.postemporada.serie) resumenTxt += ' · ' + abreviaSerie(t.postemporada.serie.nombre) + ' ' + nombreEquipo(t.postemporada.serie.ganador, anio) + ' ' + t.postemporada.serie[t.postemporada.serie.ganador] + '–' + t.postemporada.serie[rival(t.postemporada.serie.ganador)];
      resCont.appendChild(el('p', { class: 'resultados__resumen', text: resumenTxt + '.' }));
      renderLista(lista, resCont);
      return;
    }

    if (tipo !== 'todos') {
      var listaT = filtroTipo(juegos, tipo);
      resCont.appendChild(el('p', { class: 'resultados__resumen', text: listaT.length + ' juegos de ' + (tipo === 'post' ? 'postemporada' : 'temporada regular') + ', del más reciente al más antiguo.' }));
      renderLista(listaT.slice().reverse(), resCont);
      return;
    }
    resCont.appendChild(el('p', { class: 'resultados__resumen', text: 'Elige una fecha, un año o un tipo de juego.' }));
  }

  $('#form-buscador').addEventListener('submit', function (e) { e.preventDefault(); buscar(); });
  $('#b-fecha').addEventListener('change', function () { if (this.value) { $('#b-anio').value = ''; buscar(); } });
  $('#b-anio').addEventListener('input', function () { if (this.value.length === 4) { $('#b-fecha').value = ''; buscar(); } });
  $('#b-tipo').addEventListener('change', buscar);
  $('#b-limpiar').addEventListener('click', function () {
    $('#b-fecha').value = ''; $('#b-anio').value = ''; $('#b-tipo').value = 'todos'; resCont.innerHTML = '';
  });

  /* ---------- Pie ---------- */

  function renderPie() {
    if (!resumen) return;
    var cont = $('#pie-fuentes');
    var ul = el('ul', { class: 'pie__fuentes' });
    (resumen.fuentes || []).forEach(function (f) {
      var li = el('li');
      if (f.url) li.appendChild(el('a', { href: f.url, rel: 'noopener', target: '_blank', text: f.nombre || f.url }));
      else li.appendChild(el('span', { text: f.nombre || '' }));
      if (f.nota) li.appendChild(el('span', { class: 'nota', text: f.nota }));
      ul.appendChild(li);
    });
    cont.appendChild(ul);
    if (resumen.generado) cont.appendChild(el('p', { class: 'pie__nota', text: 'Datos generados el ' + fechaLarga(resumen.generado) + '.' }));
    var bq = $('#pie-retrosheet');
    if (resumen.avisoRetrosheet) bq.textContent = resumen.avisoRetrosheet;
    else bq.hidden = true;
  }

  /* ---------- Navegación: sección actual ---------- */

  function navActual() {
    var enlaces = Array.prototype.slice.call(document.querySelectorAll('.nav__lista a'));
    var secciones = enlaces.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); }).filter(Boolean);
    if (!('IntersectionObserver' in window)) return;
    var visibles = {};
    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (en) { visibles[en.target.id] = en.isIntersecting; });
      var actual = null;
      for (var i = 0; i < secciones.length; i++) { if (visibles[secciones[i].id]) { actual = secciones[i].id; break; } }
      enlaces.forEach(function (a) {
        if (a.getAttribute('href') === '#' + actual) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    secciones.forEach(function (s) { obs.observe(s); });
  }

  /* ---------- Arranque ---------- */

  renderMarcador();
  renderGrafica();
  renderTemporadas();
  renderMomentos();
  renderPie();
  navActual();

  // Permite llegar con #juego=ID y abrir la pizarra directamente.
  var hashJuego = /juego=([0-9]{8}-[0-9])/.exec(location.hash);
  if (hashJuego && porId[hashJuego[1]]) abrirPizarra(hashJuego[1]);
})();
