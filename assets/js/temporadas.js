/* El Monumento — Sala 1: Las temporadas.
   Línea de tiempo (SVG inline), ficha de cada temporada por hash (#1927)
   y tabla completa ordenable. Datos: MONUMENTO.temporadas y MONUMENTO.jugadores. */
(function () {
  'use strict';
  var M = window.MONUMENTO;
  var U = M.util;
  var T = (M.temporadas || []).slice().sort(function (a, b) { return a.a - b.a; });
  if (!T.length) return;

  var PRIMERO = T[0].a, ULTIMO = T[T.length - 1].a;
  var porAno = {};
  T.forEach(function (t) { porAno[t.a] = t; });

  // ---------- utilidades de la sala ----------
  function pctNum(t) { return (t.w + t.l) ? t.w / (t.w + t.l) : 0; }
  function ordinal(n) { return n + '.º'; }
  function nombreLugar(t) {
    // Antes de 1969 el lugar es en la liga; desde 1969, en la División Este.
    return t.div ? ordinal(t.lugar) + ' en la División Este' : ordinal(t.lugar) + ' en la Liga Americana';
  }
  function nombreLugarCorto(t) { return ordinal(t.lugar) + (t.div ? ' Este' : ' AL'); }
  function marcador(p) { return p.g + '-' + p.p + (p.e ? '-' + p.e : ''); }
  function nombreRondaCorto(p) {
    return { WS: 'Serie Mundial', CS: 'Serie de Campeonato', DS: 'Serie Divisional', WC: 'Comodín' }[p.tipo] || p.nombre;
  }
  // Resumen de postemporada en una frase (para tooltip y tabla).
  function resumenPost(t) {
    if (t.ws) return 'Campeón de la Serie Mundial';
    if (!t.post.length) return 'Sin postemporada';
    var ult = t.post[t.post.length - 1];
    if (ult.tipo === 'WS') return 'Perdió la Serie Mundial';
    return 'Eliminado en ' + nombreRondaCorto(ult);
  }
  function enlaceLider(l) {
    // l = {id:[...], v:'…'}; los ids pueden ser varios por empate.
    if (!l) return '—';
    return l.id.map(function (id) {
      return '<a href="' + U.enlaceJugador(id) + '">' + U.esc(U.nombreJugador(id)) + '</a>';
    }).join(', ');
  }
  function anoDesdeHash() {
    var h = parseInt((location.hash || '').replace('#', ''), 10);
    return porAno[h] ? h : ULTIMO;
  }

  // ---------- 1. línea de tiempo ----------
  var lienzo = document.getElementById('linea-lienzo');
  var svg = document.getElementById('linea-svg');
  var tooltip = document.getElementById('linea-tooltip');
  var NS = 'http://www.w3.org/2000/svg';
  var escala = null; // {x(a), y(p), W, H, m}
  var capaCursor = null, lineaActual = null, etqActual = null;

  function el(nombre, attrs, texto) {
    var e = document.createElementNS(NS, nombre);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  function dibujarLinea() {
    var W = Math.max(300, Math.floor(lienzo.getBoundingClientRect().width));
    var angosto = W < 560;
    var H = angosto ? 220 : 300;
    var m = { arriba: 14, derecha: angosto ? 10 : 16, abajo: 26, izquierda: angosto ? 34 : 40 };
    var yMin = 0.30, yMax = 0.75;
    function x(a) { return m.izquierda + (a - PRIMERO) / (ULTIMO - PRIMERO) * (W - m.izquierda - m.derecha); }
    function y(p) { return m.arriba + (yMax - p) / (yMax - yMin) * (H - m.arriba - m.abajo); }
    escala = { x: x, y: y, W: W, H: H, m: m };

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.appendChild(el('title', { id: 'linea-titulo' }, 'Porcentaje de victorias de los Yankees por temporada, ' + PRIMERO + ' a ' + ULTIMO));

    // Rejilla horizontal y etiquetas del eje y.
    var g = el('g');
    [0.3, 0.4, 0.5, 0.6, 0.7].forEach(function (p) {
      g.appendChild(el('line', { class: p === 0.5 ? 'lt-500' : 'lt-rejilla', x1: m.izquierda, x2: W - m.derecha, y1: y(p), y2: y(p) }));
      g.appendChild(el('text', { class: 'lt-etiqueta', x: m.izquierda - 6, y: y(p) + 4, 'text-anchor': 'end' }, p.toFixed(3).replace(/^0/, '')));
    });
    // Eje x: cada 10 años (cada 20 en pantalla angosta).
    var paso = angosto ? 20 : 10;
    for (var a = Math.ceil(PRIMERO / 10) * 10; a <= ULTIMO; a += paso) {
      g.appendChild(el('line', { class: 'lt-eje', x1: x(a), x2: x(a), y1: H - m.abajo, y2: H - m.abajo + 4 }));
      g.appendChild(el('text', { class: 'lt-etiqueta', x: x(a), y: H - m.abajo + 16, 'text-anchor': 'middle' }, a));
    }
    g.appendChild(el('line', { class: 'lt-eje', x1: m.izquierda, x2: W - m.derecha, y1: H - m.abajo, y2: H - m.abajo }));
    svg.appendChild(g);

    // Serie: porcentaje de victorias.
    var d = T.map(function (t, i) { return (i ? 'L' : 'M') + x(t.a).toFixed(1) + ' ' + y(pctNum(t)).toFixed(1); }).join('');
    svg.appendChild(el('path', { class: 'lt-serie', d: d }));

    // Marcas: banderines perdidos (tenues) y Series Mundiales ganadas (oro).
    var marcas = el('g');
    T.forEach(function (t) {
      if (t.banderin && !t.ws) marcas.appendChild(el('circle', { class: 'lt-band', cx: x(t.a), cy: y(pctNum(t)), r: 3 }));
    });
    T.forEach(function (t) {
      if (t.ws) marcas.appendChild(el('circle', { class: 'lt-ws', cx: x(t.a), cy: y(pctNum(t)), r: angosto ? 3.5 : 4 }));
    });
    svg.appendChild(marcas);

    // Temporada seleccionada (hash).
    lineaActual = el('line', { class: 'lt-actual', x1: 0, x2: 0, y1: m.arriba, y2: H - m.abajo });
    etqActual = el('text', { class: 'lt-actual-etq', x: 0, y: m.arriba - 3, 'text-anchor': 'middle' });
    svg.appendChild(lineaActual);
    svg.appendChild(etqActual);

    // Cursor de lectura (se mueve con el puntero).
    capaCursor = el('g', { class: 'oculto' });
    capaCursor.appendChild(el('line', { class: 'lt-cursor', x1: 0, x2: 0, y1: m.arriba, y2: H - m.abajo }));
    capaCursor.appendChild(el('circle', { class: 'lt-punto', cx: 0, cy: 0, r: 4.5 }));
    svg.appendChild(capaCursor);

    // Capa de captura: toda el área de trazado responde al puntero.
    var captura = el('rect', { class: 'lt-captura', x: m.izquierda, y: 0, width: W - m.izquierda - m.derecha, height: H });
    svg.appendChild(captura);

    marcarActual(anoDesdeHash());
  }

  function anoEnPunto(clientX) {
    var r = svg.getBoundingClientRect();
    var px = (clientX - r.left) * (escala.W / r.width);
    var a = Math.round(PRIMERO + (px - escala.m.izquierda) / (escala.W - escala.m.izquierda - escala.m.derecha) * (ULTIMO - PRIMERO));
    return Math.min(ULTIMO, Math.max(PRIMERO, a));
  }

  function mostrarCursor(a) {
    var t = porAno[a]; if (!t) return;
    var cx = escala.x(a), cy = escala.y(pctNum(t));
    capaCursor.classList.remove('oculto');
    capaCursor.children[0].setAttribute('x1', cx); capaCursor.children[0].setAttribute('x2', cx);
    capaCursor.children[1].setAttribute('cx', cx); capaCursor.children[1].setAttribute('cy', cy);
    var res = resumenPost(t);
    tooltip.innerHTML =
      '<div class="tt-ano">' + t.a + '</div>' +
      '<div class="tt-rec">' + t.w + '-' + t.l + ' · ' + U.pct(t.w, t.l) + '</div>' +
      '<div class="tt-res' + (t.ws ? ' titulo' : '') + '">' + U.esc(res) + '</div>';
    tooltip.classList.remove('oculto');
    // Posición en píxeles del lienzo (el SVG puede estar escalado).
    var r = svg.getBoundingClientRect();
    var k = r.width / escala.W;
    var left = cx * k, top = cy * k;
    var ancho = tooltip.offsetWidth;
    left = Math.max(ancho / 2, Math.min(r.width - ancho / 2, left));
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    if (top < tooltip.offsetHeight + 16) tooltip.style.transform = 'translate(-50%, 14px)';
    else tooltip.style.transform = '';
  }
  function ocultarCursor() {
    if (capaCursor) capaCursor.classList.add('oculto');
    tooltip.classList.add('oculto');
  }
  function marcarActual(a) {
    if (!escala || !lineaActual) return;
    var cx = escala.x(a);
    lineaActual.setAttribute('x1', cx); lineaActual.setAttribute('x2', cx);
    etqActual.setAttribute('x', cx); etqActual.textContent = a;
  }

  var anoCursor = null;
  svg.addEventListener('pointermove', function (e) {
    if (!escala) return;
    anoCursor = anoEnPunto(e.clientX);
    mostrarCursor(anoCursor);
  });
  svg.addEventListener('pointerdown', function (e) {
    // En pantalla táctil, un toque también muestra la lectura.
    if (!escala) return;
    anoCursor = anoEnPunto(e.clientX);
    mostrarCursor(anoCursor);
  });
  svg.addEventListener('pointerleave', function () { anoCursor = null; ocultarCursor(); });
  svg.addEventListener('click', function (e) {
    if (!escala) return;
    var a = anoEnPunto(e.clientX);
    irA(a);
  });

  // Redibujar al cambiar el ancho (p. ej. al girar el teléfono).
  var anchoPrevio = 0;
  function redibujarSiCambia() {
    var w = Math.floor(lienzo.getBoundingClientRect().width);
    if (w !== anchoPrevio) { anchoPrevio = w; ocultarCursor(); dibujarLinea(); }
  }
  window.addEventListener('resize', redibujarSiCambia);

  // ---------- navegador: décadas, años, selector ----------
  var decadasEl = document.getElementById('decadas');
  var anosEl = document.getElementById('anos-decada');
  var selector = document.getElementById('selector-ano');
  var decadaActiva = null;

  function montarNavegador() {
    var decadas = [];
    T.forEach(function (t) { var d = Math.floor(t.a / 10) * 10; if (decadas.indexOf(d) < 0) decadas.push(d); });
    decadasEl.innerHTML = decadas.map(function (d) {
      return '<button type="button" data-decada="' + d + '" aria-pressed="false">' + d + '</button>';
    }).join('');
    decadasEl.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-decada]'); if (!b) return;
      mostrarDecada(parseInt(b.getAttribute('data-decada'), 10), anoDesdeHash());
    });
    selector.innerHTML = T.slice().reverse().map(function (t) {
      return '<option value="' + t.a + '">' + t.a + (t.ws ? ' · Serie Mundial' : (t.banderin ? ' · Banderín' : '')) + '</option>';
    }).join('');
    selector.addEventListener('change', function () { irA(parseInt(selector.value, 10)); });
  }
  function mostrarDecada(d, anoActual) {
    decadaActiva = d;
    Array.prototype.forEach.call(decadasEl.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', parseInt(b.getAttribute('data-decada'), 10) === d ? 'true' : 'false');
    });
    anosEl.innerHTML = T.filter(function (t) { return Math.floor(t.a / 10) * 10 === d; }).map(function (t) {
      var clase = t.ws ? ' class="ws"' : '';
      var actual = t.a === anoActual ? ' aria-current="true"' : '';
      var titulo = t.w + '-' + t.l + ' · ' + resumenPost(t);
      return '<a href="#' + t.a + '"' + clase + actual + ' title="' + U.esc(titulo) + '">' + t.a + '</a>';
    }).join('');
  }
  function actualizarNavegador(a) {
    var d = Math.floor(a / 10) * 10;
    if (d !== decadaActiva) mostrarDecada(d, a);
    else Array.prototype.forEach.call(anosEl.querySelectorAll('a'), function (x) {
      if (parseInt(x.textContent, 10) === a) x.setAttribute('aria-current', 'true'); else x.removeAttribute('aria-current');
    });
    selector.value = String(a);
  }

  // ---------- 2. ficha de temporada ----------
  var detalle = document.getElementById('detalle-contenido');

  function filaDato(etiqueta, valor, esNum) {
    return '<tr><td>' + etiqueta + '</td><td' + (esNum ? ' class="mono"' : '') + '>' + valor + '</td></tr>';
  }

  function dibujarFicha(a) {
    var t = porAno[a]; if (!t) return;
    var i = T.indexOf(t);
    var ant = i > 0 ? T[i - 1] : null, sig = i < T.length - 1 ? T[i + 1] : null;
    var chips = [];
    if (t.ws) chips.push('<span class="chip titulo">Campeón de la Serie Mundial</span>');
    else if (t.banderin) chips.push('<span class="chip">Campeón de la Liga Americana</span>');
    if (t.div_gano) chips.push('<span class="chip">Campeón de la División Este</span>');
    if (t.fuente === 'statsapi') chips.push('<span class="chip">Datos de la MLB Stats API</span>');

    var html =
      '<div class="ficha-cabeza">' +
        '<div>' +
          '<p class="sobre">Temporada ' + t.a + '</p>' +
          '<h2>' + U.esc(t.nombre) + ', ' + t.a + '</h2>' +
          (chips.length ? '<div class="chips">' + chips.join('') + '</div>' : '') +
        '</div>' +
        '<div class="ficha-nav">' +
          (ant ? '<a class="boton" href="#' + ant.a + '" rel="prev">← ' + ant.a + '</a>' : '<button class="boton" type="button" disabled>←</button>') +
          (sig ? '<a class="boton" href="#' + sig.a + '" rel="next">' + sig.a + ' →</a>' : '<button class="boton" type="button" disabled>→</button>') +
        '</div>' +
      '</div>';

    // Cifras principales.
    var datos = [
      ['Récord', '<span class="num">' + t.w + '-' + t.l + '</span>'],
      ['Porcentaje', '<span class="num">' + U.pct(t.w, t.l) + '</span>'],
      ['Lugar', U.esc(nombreLugar(t))],
      ['Carreras', '<span class="num">' + U.miles(t.r) + '</span> anotadas · <span class="num">' + U.miles(t.ra) + '</span> recibidas'],
      ['Jonrones', '<span class="num">' + U.miles(t.hr) + '</span>'],
      ['Efectividad', '<span class="num">' + Number(t.era).toFixed(2) + '</span>']
    ];
    html += '<div class="datos">' + datos.map(function (d) {
      return '<div class="dato"><span class="etiqueta">' + d[0] + '</span><span class="valor' + (d[0] === 'Lugar' || d[0] === 'Carreras' ? ' texto' : ' num') + '">' + d[1] + '</span></div>';
    }).join('') + '</div>';

    // Dos columnas: equipo y mánagers / líderes.
    html += '<div class="ficha-cuerpo">';
    html += '<div>';
    html += '<h3>El equipo</h3><table class="tabla"><tbody>' +
      filaDato('Juegos', U.miles(t.g), true) +
      filaDato('Parque', U.esc(t.parque)) +
      (t.asist !== null && t.asist !== undefined ? filaDato('Asistencia', U.miles(t.asist), true) : '') +
      '</tbody></table>';

    html += '<h3 class="mt-2">' + (t.mgr.length === 1 ? 'Mánager' : 'Mánagers') + '</h3><ul class="lista-limpia lista-mgr">' +
      t.mgr.map(function (m) {
        var nombre = m.id ? '<a href="' + U.enlaceJugador(m.id) + '">' + U.esc(m.n) + '</a>' : U.esc(m.n);
        return '<li><span>' + nombre + '</span><span class="num">' + m.w + '-' + m.l + '</span></li>';
      }).join('') + '</ul>';

    // Postemporada ronda por ronda.
    html += '<h3 class="mt-2">Postemporada</h3>';
    if (t.post.length) {
      html += '<ul class="lista-limpia lista-post">' + t.post.map(function (p) {
        var frase = p.gano ? 'Venció a ' + U.esc(p.rivalEs) : 'Cayó ante ' + U.esc(p.rivalEs);
        return '<li class="' + (p.gano ? 'gano' : 'perdio') + '"><span><span class="ronda">' + U.esc(p.nombre) + '</span>' + frase + '</span><span class="marcador">' + marcador(p) + '</span></li>';
      }).join('') + '</ul>';
      if (t.ws) html += '<p class="enlace-anillo"><a class="boton" href="anillos.html#' + t.a + '">Ver la Serie Mundial de ' + t.a + ' en «Los 27 anillos»</a></p>';
    } else if (t.a === 1904 || t.a === 1994) {
      html += '<p class="nota-vacia">No se disputó la Serie Mundial ese año.</p>';
    } else {
      html += '<p class="nota-vacia">Sin postemporada.</p>';
    }
    html += '</div>';

    // Líderes individuales.
    var L = t.lideres || {};
    html += '<div>';
    html += '<h3>Líderes de bateo</h3><table class="tabla"><tbody>' +
      filaDato('Promedio', enlaceLider(L.avg) + (L.avg ? ' <span class="num">' + U.esc(L.avg.v) + '</span>' : '')) +
      filaDato('Jonrones', enlaceLider(L.hr) + (L.hr ? ' <span class="num">' + U.esc(L.hr.v) + '</span>' : '')) +
      filaDato('Impulsadas', enlaceLider(L.rbi) + (L.rbi ? ' <span class="num">' + U.esc(L.rbi.v) + '</span>' : '')) +
      filaDato('Hits', enlaceLider(L.h) + (L.h ? ' <span class="num">' + U.esc(L.h.v) + '</span>' : '')) +
      filaDato('Bases robadas', enlaceLider(L.sb) + (L.sb ? ' <span class="num">' + U.esc(L.sb.v) + '</span>' : '')) +
      '</tbody></table>';
    html += '<h3 class="mt-2">Líderes de pitcheo</h3><table class="tabla"><tbody>' +
      filaDato('Victorias', enlaceLider(L.w) + (L.w ? ' <span class="num">' + U.esc(L.w.v) + '</span>' : '')) +
      filaDato('Efectividad', enlaceLider(L.era) + (L.era ? ' <span class="num">' + U.esc(L.era.v) + '</span>' : '')) +
      filaDato('Ponches', enlaceLider(L.so) + (L.so ? ' <span class="num">' + U.esc(L.so.v) + '</span>' : '')) +
      filaDato('Salvamentos', enlaceLider(L.sv) + (L.sv ? ' <span class="num">' + U.esc(L.sv.v) + '</span>' : '')) +
      '</tbody></table>';
    html += '<p class="fuente">Promedio y efectividad solo entre jugadores calificados. Cada nombre lleva a su ficha en «Duelo de leyendas».</p>';
    html += '</div>';
    html += '</div>';

    detalle.innerHTML = html;
  }

  // ---------- 3. tabla completa ----------
  var tabla = document.getElementById('tabla-temporadas');
  var COLS = [
    { k: 'a', t: 'Año', num: true, v: function (t) { return t.a; } },
    { k: 'nombre', t: 'Equipo', v: function (t) { return t.nombre; } },
    { k: 'w', t: 'G', num: true, v: function (t) { return t.w; } },
    { k: 'l', t: 'P', num: true, v: function (t) { return t.l; } },
    { k: 'pct', t: '%', num: true, v: pctNum },
    { k: 'lugar', t: 'Lugar', v: function (t) { return t.lugar; }, num: false, ordNum: true },
    { k: 'mgr', t: 'Mánager', v: function (t) { return t.mgr.map(function (m) { return m.n; }).join(', '); } },
    { k: 'post', t: 'Postemporada', v: function (t) { return t.ws ? 4 : (t.post.length ? ({ WS: 3, CS: 2, DS: 1, WC: 0.5 }[t.post[t.post.length - 1].tipo] || 0) : 0); }, ordNum: true }
  ];
  var orden = { k: 'a', desc: true };

  function dibujarTabla() {
    var col = COLS.filter(function (c) { return c.k === orden.k; })[0];
    var filas = T.slice().sort(function (p, q) {
      var a = col.v(p), b = col.v(q), r;
      if (typeof a === 'number' || col.ordNum) r = a - b; else r = String(a).localeCompare(String(b), 'es');
      if (r === 0) r = p.a - q.a;
      return orden.desc ? -r : r;
    });
    var cab = '<thead><tr>' + COLS.map(function (c) {
      var activo = c.k === orden.k;
      var flecha = activo ? (orden.desc ? '▾' : '▴') : '';
      return '<th class="ordenable' + (c.num ? ' num' : '') + '" data-col="' + c.k + '" scope="col"' +
        (activo ? ' aria-sort="' + (orden.desc ? 'descending' : 'ascending') + '"' : '') + '>' +
        c.t + ' <span class="flecha" aria-hidden="true">' + flecha + '</span></th>';
    }).join('') + '</tr></thead>';
    var cuerpo = '<tbody>' + filas.map(function (t) {
      var post;
      if (t.ws) post = '<span class="chip titulo">Serie Mundial</span>';
      else post = U.esc(resumenPost(t) === 'Sin postemporada' ? '—' : resumenPost(t));
      return '<tr' + (t.ws ? ' class="titulo"' : '') + '>' +
        '<td class="ano"><a href="#' + t.a + '">' + t.a + '</a></td>' +
        '<td class="equipo">' + U.esc(t.nombre) + '</td>' +
        '<td class="num">' + t.w + '</td><td class="num">' + t.l + '</td>' +
        '<td class="num">' + U.pct(t.w, t.l) + '</td>' +
        '<td>' + U.esc(nombreLugarCorto(t)) + '</td>' +
        '<td>' + U.esc(t.mgr.map(function (m) { return m.n; }).join(', ')) + '</td>' +
        '<td class="post">' + post + '</td></tr>';
    }).join('') + '</tbody>';
    tabla.innerHTML = cab + cuerpo;
  }
  tabla.addEventListener('click', function (e) {
    var th = e.target.closest('th[data-col]'); if (!th) return;
    var k = th.getAttribute('data-col');
    if (orden.k === k) orden.desc = !orden.desc;
    else orden = { k: k, desc: k === 'a' || k === 'w' || k === 'pct' || k === 'post' };
    dibujarTabla();
  });

  // ---------- navegación por hash ----------
  function irA(a) {
    if (String(a) === (location.hash || '').replace('#', '')) { mostrar(a); return; }
    location.hash = String(a);
  }
  function mostrar(a) {
    dibujarFicha(a);
    marcarActual(a);
    actualizarNavegador(a);
  }
  function alCambiarHash(desplazar) {
    var a = anoDesdeHash();
    mostrar(a);
    if (desplazar) {
      var sec = document.getElementById('detalle');
      if (sec) sec.scrollIntoView({ block: 'start' });
    }
  }
  window.addEventListener('hashchange', function () { alCambiarHash(true); });

  // ---------- arranque ----------
  var intro = document.getElementById('intro-texto');
  if (intro) {
    var titulos = T.filter(function (t) { return t.ws; }).length;
    intro.textContent = T.length + ' temporadas, de los ' + T[0].nombre.replace('New York ', '') + ' de ' + PRIMERO + ' a ' + ULTIMO + ': el récord de cada año, su lugar en la liga, sus líderes y lo que pasó en octubre. Entre ellas, ' + titulos + ' títulos de Serie Mundial.';
  }
  montarNavegador();
  dibujarTabla();
  redibujarSiCambia();
  alCambiarHash(!!location.hash);

  M.montarPie([
    'Récords, lugares, mánagers y líderes individuales: Lahman Baseball Database (tabla Teams, Managers, Batting, Pitching, SeriesPost), 1903–2025.',
    'Temporada 2026: MLB Stats API (statsapi.mlb.com), standings y estadísticas por jugador.'
  ]);
})();
