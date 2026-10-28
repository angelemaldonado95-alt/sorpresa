/* El Monumento — Sala 5: Duelo de leyendas.
   Ficha de un jugador (duelo.html#id) o duelo entre dos (duelo.html#id1,id2).
   Todo sale de MONUMENTO.jugadores y MONUMENTO.temporadas; nada se escribe de memoria. */
(function () {
  'use strict';
  var M = window.MONUMENTO, U = M.util, B = U.B, P = U.P, esc = U.esc;
  var J = M.jugadores || {};

  // ---------- índice precalculado (una sola vez) ----------
  function sinAcentos(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  var INDICE = Object.keys(J).map(function (id) {
    var j = J[id];
    var tb = U.totalesBateo(j), tp = U.totalesPitcheo(j);
    if (tb && !tb.AB) tb = null;        // filas de bateo con ceros (pitchers): se ignoran
    if (tp && !tp.IPO) tp = null;
    var pit = !!U.esPitcher(j);   // esPitcher puede devolver null; aquí se quiere un booleano estricto
    var anos = U.anosConNY(j);
    return { id: id, j: j, n: j.n, busq: sinAcentos(j.n), pos: j.pos, pit: pit, tb: tb, tp: tp,
      anos: anos, rango: U.rangoAnos(j), primero: anos[0], ultimo: anos[anos.length - 1] };
  });
  var POR_ID = {};
  INDICE.forEach(function (e) { POR_ID[e.id] = e; });
  INDICE.sort(function (a, b) { return a.busq < b.busq ? -1 : a.busq > b.busq ? 1 : a.primero - b.primero; });

  // ---------- formato ----------
  function f3(x) { return x === null || x === undefined || isNaN(x) ? '—' : x.toFixed(3).replace(/^0/, ''); }
  function f2(x) { return x === null || x === undefined || isNaN(x) ? '—' : x.toFixed(2); }
  function k9(so, ipo) { return ipo ? (so * 27 / ipo) : null; }
  function rolTexto(e) {
    var pos = U.posicion(e.pos) || 'Posición no registrada';
    return pos;
  }

  // Tasas de una fila (o suma de filas) de bateo
  function tasasBateo(t) {
    var ab = t[B.AB], h = t[B.H], bb = t[B.BB], hbp = t[B.HBP] || 0, sf = t[B.SF] || 0;
    var tb = h + t[B.D2] + 2 * t[B.D3] + 3 * t[B.HR];
    var obpDen = ab + bb + hbp + sf;
    var avg = ab ? h / ab : null, obp = obpDen ? (h + bb + hbp) / obpDen : null, slg = ab ? tb / ab : null;
    return { AVG: avg, OBP: obp, SLG: slg, OPS: (obp !== null && slg !== null) ? obp + slg : null };
  }
  function tasasPitcheo(t) {
    var ipo = t[P.IPO];
    return { ERA: ipo ? t[P.ER] * 27 / ipo : null, WHIP: ipo ? (t[P.BB] + t[P.H]) / (ipo / 3) : null, K9: k9(t[P.SO], ipo) };
  }
  function sumarFilas(filas) {
    var t = []; for (var i = 0; i < 15; i++) t[i] = 0;
    filas.forEach(function (f) { for (var k = 1; k < f.length; k++) t[k] += f[k] || 0; });
    return t;
  }
  function filasBateo(j) { return (j.b || []).filter(function (f) { return f[B.AB] > 0 || f[B.BB] > 0; }); }
  function filasPitcheo(j) { return (j.p || []).filter(function (f) { return f[P.IPO] > 0 || f[P.G] > 0; }); }

  // ---------- definición de métricas ----------
  // Para la tabla de comparación: clave, etiqueta, función sobre totales, formato, si menor es mejor
  var COMP_B = [
    ['G', 'Juegos', function (t) { return t.G; }, U.miles],
    ['AB', 'Turnos (AB)', function (t) { return t.AB; }, U.miles],
    ['R', 'Carreras', function (t) { return t.R; }, U.miles],
    ['H', 'Hits', function (t) { return t.H; }, U.miles],
    ['D2', 'Dobles', function (t) { return t.D2; }, U.miles],
    ['D3', 'Triples', function (t) { return t.D3; }, U.miles],
    ['HR', 'Jonrones', function (t) { return t.HR; }, U.miles],
    ['RBI', 'Carreras impulsadas', function (t) { return t.RBI; }, U.miles],
    ['SB', 'Bases robadas', function (t) { return t.SB; }, U.miles],
    ['BB', 'Bases por bolas', function (t) { return t.BB; }, U.miles],
    ['SO', 'Ponches', function (t) { return t.SO; }, U.miles, true],
    ['AVG', 'Promedio (AVG)', function (t) { return t.AVG; }, f3],
    ['OBP', 'Porcentaje de embasarse (OBP)', function (t) { return t.OBP; }, f3],
    ['SLG', 'Slugging (SLG)', function (t) { return t.SLG; }, f3],
    ['OPS', 'OPS', function (t) { return t.OBP + t.SLG; }, f3]
  ];
  var COMP_P = [
    ['W', 'Victorias', function (t) { return t.W; }, U.miles],
    ['L', 'Derrotas', function (t) { return t.L; }, U.miles, true],
    ['G', 'Juegos', function (t) { return t.G; }, U.miles],
    ['GS', 'Aperturas', function (t) { return t.GS; }, U.miles],
    ['CG', 'Juegos completos', function (t) { return t.CG; }, U.miles],
    ['SHO', 'Blanqueadas', function (t) { return t.SHO; }, U.miles],
    ['SV', 'Salvamentos', function (t) { return t.SV; }, U.miles],
    ['IP', 'Entradas lanzadas', function (t) { return t.IPO / 3; }, function (x) { return U.ip(Math.round(x * 3)); }],
    ['H', 'Hits permitidos', function (t) { return t.H; }, U.miles, true],
    ['ER', 'Carreras limpias', function (t) { return t.ER; }, U.miles, true],
    ['BB', 'Bases por bolas', function (t) { return t.BB; }, U.miles, true],
    ['SO', 'Ponches', function (t) { return t.SO; }, U.miles],
    ['ERA', 'Efectividad (ERA)', function (t) { return t.ERA; }, f2, true],
    ['WHIP', 'WHIP', function (t) { return t.WHIP; }, f2, true],
    ['K9', 'Ponches por 9 entradas', function (t) { return k9(t.SO, t.IPO); }, f2]
  ];

  // Para la gráfica: la función recibe una fila sumada (una temporada o varias acumuladas) y su tipo ('b' | 'p')
  var MET_B = {
    HR: { et: 'Jonrones', f: function (t) { return t[B.HR]; }, fmt: U.miles },
    H: { et: 'Hits', f: function (t) { return t[B.H]; }, fmt: U.miles },
    RBI: { et: 'Carreras impulsadas', f: function (t) { return t[B.RBI]; }, fmt: U.miles },
    AVG: { et: 'Promedio (AVG)', f: function (t) { return tasasBateo(t).AVG; }, fmt: f3, tasa: true },
    OPS: { et: 'OPS', f: function (t) { return tasasBateo(t).OPS; }, fmt: f3, tasa: true }
  };
  var MET_P = {
    W: { et: 'Victorias', f: function (t) { return t[P.W]; }, fmt: U.miles },
    SO: { et: 'Ponches', f: function (t) { return t[P.SO]; }, fmt: U.miles },
    ERA: { et: 'Efectividad (ERA)', f: function (t) { return tasasPitcheo(t).ERA; }, fmt: f2, tasa: true },
    SV: { et: 'Salvamentos', f: function (t) { return t[P.SV]; }, fmt: U.miles }
  };
  var MET_MIXTO = {
    G: { et: 'Juegos', f: function (t, tipo) { return tipo === 'b' ? t[B.G] : t[P.G]; }, fmt: U.miles }
  };

  // ---------- fichas ----------
  function listaPremios(j) {
    if (!j.premios || !j.premios.length) return '';
    var porPremio = {}, orden = [];
    j.premios.forEach(function (p) {
      if (!porPremio[p[1]]) { porPremio[p[1]] = []; orden.push(p[1]); }
      porPremio[p[1]].push(p[0]);
    });
    return orden.map(function (k) {
      var anos = porPremio[k].sort(function (a, b) { return a - b; });
      return esc(k) + (anos.length > 1 ? ' ×' + anos.length : '') + ' <span class="peq">(' + anos.join(', ') + ')</span>';
    }).join('<br>');
  }
  function dato(et, val, clase) {
    return '<div class="dato"><span class="etiqueta">' + et + '</span><span class="valor' + (clase ? ' ' + clase : '') + '">' + val + '</span></div>';
  }
  function fichaBio(e, opciones) {
    var j = e.j, o = opciones || {};
    var titulo = o.nivel === 3 ? 'h3' : 'h2';
    var h = '<article class="ficha ficha-jugador' + (o.clase ? ' ' + o.clase : '') + '">';
    h += '<p class="etiqueta-sobre">' + (o.sobre || 'Ficha') + '</p>';
    h += '<' + titulo + '>' + esc(j.n) + '</' + titulo + '>';
    h += '<p class="ficha-sub">' + esc(rolTexto(e)) + ' · con los Yankees ' + esc(e.rango) +
      ' <span class="peq">(' + e.anos.length + ' ' + U.plural(e.anos.length, 'temporada') + ')</span></p>';
    h += '<div class="datos">';
    h += dato('Batea / lanza', esc(U.lado(j.bt && j.bt[0])) + ' / ' + esc(U.lado(j.bt && j.bt[1])));
    h += dato('Nacimiento', j.nac ? esc(U.fechaCorta(j.nac)) + (j.lugar ? '<small>' + esc(j.lugar) + '</small>' : '') : '—');
    if (j.mue) h += dato('Fallecimiento', esc(U.fechaCorta(j.mue)));
    h += dato('Debut en MLB', j.debut ? esc(U.fechaLarga(j.debut)) : '—');
    // Solo se muestra el último juego si es anterior a la última temporada de Lahman (si no, podría seguir activo)
    var ultimoLahman = (M.meta && M.meta.lahman && M.meta.lahman.ultimo) || 2025;
    if (j.final && parseInt(j.final.slice(0, 4), 10) < ultimoLahman) h += dato('Último juego', esc(U.fechaLarga(j.final)));
    h += dato('Salón de la Fama', j.hof ? 'Ingresó en ' + j.hof : 'No');
    if (j.premios && j.premios.length) h += dato('Premios con NY', listaPremios(j));
    h += '</div>';
    if (o.acciones) h += '<div class="ficha-acciones">' + o.acciones + '</div>';
    h += '</article>';
    return h;
  }

  // ---------- tablas por temporada ----------
  function celdaAnio(a) { return '<td class="num anio"><a href="' + U.enlaceTemporada(a) + '">' + a + '</a></td>'; }
  function tablaBateo(j, conTitulo) {
    var filas = filasBateo(j); if (!filas.length) return '';
    var h = conTitulo ? '<h3 class="tabla-titulo">Bateo con los Yankees</h3>' : '';
    h += '<div class="tabla-scroll"><table class="tabla"><thead><tr><th class="num">Año</th>' +
      ['G', 'AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'SB', 'BB', 'SO', 'AVG', 'OBP', 'SLG', 'OPS'].map(function (c) { return '<th class="num">' + c + '</th>'; }).join('') +
      '</tr></thead><tbody>';
    function fila(t, anio) {
      var r = tasasBateo(t);
      return (anio ? celdaAnio(anio) : '<td>Total</td>') +
        [t[B.G], t[B.AB], t[B.R], t[B.H], t[B.D2], t[B.D3], t[B.HR], t[B.RBI], t[B.SB], t[B.BB], t[B.SO]].map(function (v) { return '<td class="num">' + U.miles(v) + '</td>'; }).join('') +
        '<td class="num">' + f3(r.AVG) + '</td><td class="num">' + f3(r.OBP) + '</td><td class="num">' + f3(r.SLG) + '</td><td class="num">' + f3(r.OPS) + '</td>';
    }
    filas.forEach(function (f) { h += '<tr>' + fila(f, f[0]) + '</tr>'; });
    h += '<tr class="destacado">' + fila(sumarFilas(filas)) + '</tr></tbody></table></div>';
    return h;
  }
  function tablaPitcheo(j, conTitulo) {
    var filas = filasPitcheo(j); if (!filas.length) return '';
    var h = conTitulo ? '<h3 class="tabla-titulo">Pitcheo con los Yankees</h3>' : '';
    h += '<div class="tabla-scroll"><table class="tabla"><thead><tr><th class="num">Año</th>' +
      ['W', 'L', 'G', 'GS', 'CG', 'SHO', 'SV', 'IP', 'H', 'ER', 'BB', 'SO', 'ERA', 'WHIP', 'K/9'].map(function (c) { return '<th class="num">' + c + '</th>'; }).join('') +
      '</tr></thead><tbody>';
    function fila(t, anio) {
      var r = tasasPitcheo(t);
      return (anio ? celdaAnio(anio) : '<td>Total</td>') +
        [t[P.W], t[P.L], t[P.G], t[P.GS], t[P.CG], t[P.SHO], t[P.SV]].map(function (v) { return '<td class="num">' + U.miles(v) + '</td>'; }).join('') +
        '<td class="num">' + U.ip(t[P.IPO]) + '</td>' +
        [t[P.H], t[P.ER], t[P.BB], t[P.SO]].map(function (v) { return '<td class="num">' + U.miles(v) + '</td>'; }).join('') +
        '<td class="num">' + f2(r.ERA) + '</td><td class="num">' + f2(r.WHIP) + '</td><td class="num">' + f2(r.K9) + '</td>';
    }
    filas.forEach(function (f) { h += '<tr>' + fila(f, f[0]) + '</tr>'; });
    h += '<tr class="destacado">' + fila(sumarFilas(filas)) + '</tr></tbody></table></div>';
    return h;
  }
  // Tablas de un jugador: la de su rol principal primero; la otra solo si tiene cifras reales
  function tablasJugador(e) {
    var j = e.j, h = '';
    var hayB = e.tb && e.tb.AB > 0, hayP = e.tp && e.tp.IPO > 0;
    if (e.pit) { if (hayP) h += tablaPitcheo(j, true); if (hayB) h += tablaBateo(j, true); }
    else { if (hayB) h += tablaBateo(j, true); if (hayP) h += tablaPitcheo(j, true); }
    if (!h) h = '<p class="peq">Sin estadísticas registradas con los Yankees (solo apariciones).</p>';
    return h;
  }

  // ---------- comparación de totales ----------
  function tablaComparacion(defs, a, b, ta, tb, titulo, sinMejor) {
    var h = titulo ? '<h3>' + titulo + '</h3>' : '';
    h += '<div class="tabla-scroll"><table class="comparacion"><thead><tr><th scope="col">Métrica</th><th scope="col">' + esc(a.n) + '</th><th scope="col">' + esc(b.n) + '</th></tr></thead><tbody>';
    defs.forEach(function (d) {
      var va = ta ? d[2](ta) : null, vb = tb ? d[2](tb) : null, menor = d[4];
      var ma = '', mb = '';
      if (!sinMejor && va !== null && vb !== null && va !== vb && !isNaN(va) && !isNaN(vb)) {
        if ((va > vb) !== !!menor) ma = ' class="mejor"'; else mb = ' class="mejor"';
      }
      h += '<tr><th scope="row">' + d[1] + '</th><td' + ma + '><span class="num">' + (va === null ? '—' : d[3](va)) + '</span></td><td' + mb + '><span class="num">' + (vb === null ? '—' : d[3](vb)) + '</span></td></tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }
  function montarComparacion(a, b) {
    var nota = document.getElementById('comparacion-nota'), cont = document.getElementById('comparacion-tablas');
    var h = '';
    if (a.pit === b.pit) {
      nota.textContent = a.pit
        ? 'Totales de pitcheo con los Yankees. En negrita, el mejor valor de cada fila; en efectividad, WHIP, hits, carreras limpias, bases por bolas y derrotas gana el menor.'
        : 'Totales de bateo con los Yankees. En negrita, el mejor valor de cada fila; en ponches gana el menor.';
      h = a.pit ? tablaComparacion(COMP_P, a, b, a.tp, b.tp) : tablaComparacion(COMP_B, a, b, a.tb, b.tb);
    } else {
      var pit = a.pit ? a : b, bat = a.pit ? b : a;
      nota.textContent = pit.n + ' es lanzador y ' + bat.n + ' bateador, así que sus números no se miden con la misma vara: van en tablas separadas, cada uno con sus totales con los Yankees.';
      // En un duelo mixto no se marca «mejor valor»: no tendría sentido comparar el bateo de un lanzador
      h = tablaComparacion(COMP_B, a, b, a.tb, b.tb, 'Bateo', true) + tablaComparacion(COMP_P, a, b, a.tp, b.tp, 'Pitcheo', true);
    }
    cont.innerHTML = h;
  }

  // ---------- gráfica de trayectoria (SVG inline) ----------
  var grafica = { a: null, b: null, metrica: null, eje: 'calendario', acum: false };

  function seriesDe(e, met, tipoForzado) {
    // Devuelve [{x: año, k: índice de carrera (1..n), v: valor}] para la métrica dada
    var tipo = tipoForzado || (e.pit ? 'p' : 'b');
    var filas = tipo === 'b' ? filasBateo(e.j) : filasPitcheo(e.j);
    filas = filas.slice().sort(function (x, y) { return x[0] - y[0]; });
    var pts = [], acum = [];
    filas.forEach(function (f, i) {
      acum.push(f);
      var t = grafica.acum ? sumarFilas(acum) : f;
      var v = met.f(t, tipo);
      pts.push({ x: f[0], k: i + 1, v: (v === null || v === undefined || isNaN(v)) ? null : v });
    });
    return pts;
  }
  function metricasDisponibles(a, b) {
    if (a.pit && b.pit) return MET_P;
    if (!a.pit && !b.pit) return MET_B;
    return MET_MIXTO;
  }
  function ticksBonitos(max, n) {
    if (!max) return [0, 1];
    var bruto = max / n, pot = Math.pow(10, Math.floor(Math.log10(bruto)));
    var paso = [1, 2, 2.5, 5, 10].map(function (m) { return m * pot; }).filter(function (p) { return p >= bruto; })[0];
    var ticks = [];
    for (var v = 0; v <= max + paso * 0.001; v += paso) ticks.push(+v.toFixed(6));
    if (ticks[ticks.length - 1] < max) ticks.push(+(ticks[ticks.length - 1] + paso).toFixed(6));
    return ticks;
  }
  function dibujarGrafica() {
    var cont = document.getElementById('grafica');
    var a = grafica.a, b = grafica.b;
    if (!a || !b) { cont.innerHTML = ''; return; }
    var mets = metricasDisponibles(a, b), met = mets[grafica.metrica] || mets[Object.keys(mets)[0]];
    var sa = seriesDe(a, met), sb = seriesDe(b, met);
    var carrera = grafica.eje === 'carrera';
    var ejeX = function (p) { return carrera ? p.k : p.x; };
    var xs = sa.concat(sb).map(ejeX);
    if (!xs.length) { cont.innerHTML = '<p class="grafica-vacia">No hay temporadas con cifras para esta métrica.</p>'; return; }
    var xmin = carrera ? 1 : Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
    if (xmax === xmin) { xmin -= 1; xmax += 1; }
    var vmax = 0;
    sa.concat(sb).forEach(function (p) { if (p.v !== null && p.v > vmax) vmax = p.v; });
    var ticksY = ticksBonitos(vmax, 4), ymax = ticksY[ticksY.length - 1] || 1;

    var W = 760, H = 340, mL = 56, mR = 20, mT = 16, mB = 46;
    var ancho = W - mL - mR, alto = H - mT - mB;
    var X = function (x) { return mL + (x - xmin) / (xmax - xmin) * ancho; };
    var Y = function (v) { return mT + alto - v / ymax * alto; };

    // Ticks del eje X: enteros, a lo sumo ~12 etiquetas
    var span = xmax - xmin, pasoX = Math.max(1, Math.ceil(span / 12));
    if (!carrera && pasoX > 1) pasoX = Math.ceil(pasoX / 5) * 5;
    var ticksX = [];
    var inicioX = carrera ? 1 : Math.ceil(xmin / pasoX) * pasoX;
    for (var x = inicioX; x <= xmax; x += pasoX) ticksX.push(x);

    var fmtTick = met.tasa ? met.fmt : function (v) { return U.miles(Math.round(v)); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(met.et + (grafica.acum ? ' acumulados' : ' por temporada') + ': ' + a.n + ' y ' + b.n) + '">';
    // rejilla y ejes
    s += '<g class="rejilla">';
    ticksY.forEach(function (t) { if (t) s += '<line x1="' + mL + '" x2="' + (W - mR) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '"/>'; });
    s += '</g><g class="eje">';
    s += '<line x1="' + mL + '" x2="' + (W - mR) + '" y1="' + (mT + alto) + '" y2="' + (mT + alto) + '"/>';
    ticksY.forEach(function (t) { s += '<text x="' + (mL - 8) + '" y="' + (Y(t) + 4).toFixed(1) + '" text-anchor="end">' + fmtTick(t) + '</text>'; });
    ticksX.forEach(function (t) { s += '<text x="' + X(t).toFixed(1) + '" y="' + (mT + alto + 18) + '" text-anchor="middle">' + t + '</text>'; });
    s += '<text class="eje-titulo" x="' + (mL + ancho / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + (carrera ? 'Año de carrera con los Yankees' : 'Temporada') + '</text>';
    s += '</g>';
    // líneas: se corta el trazo cuando hay huecos (temporadas sin cifras o años sin jugar)
    function trazo(pts, clase, claseP) {
      var d = '', prev = null, circ = '';
      pts.forEach(function (p) {
        if (p.v === null) { prev = null; return; }
        var px = X(ejeX(p)), py = Y(p.v);
        d += (prev !== null && ejeX(p) - prev === 1 ? ' L' : ' M') + px.toFixed(1) + ' ' + py.toFixed(1);
        prev = ejeX(p);
        circ += '<circle class="punto ' + claseP + '" cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="3.5"/>';
      });
      return '<path class="' + clase + '" d="' + d.trim() + '"/>' + circ;
    }
    s += trazo(sa, 'serie-1', 'punto-1') + trazo(sb, 'serie-2', 'punto-2');
    s += '<line class="crosshair" id="grafica-cruz" x1="0" x2="0" y1="' + mT + '" y2="' + (mT + alto) + '" visibility="hidden"/>';
    s += '<rect class="zona-hover" id="grafica-zona" x="' + mL + '" y="' + mT + '" width="' + ancho + '" height="' + alto + '"/>';
    s += '</svg>';
    s += '<div class="grafica-leyenda" aria-hidden="true">' +
      '<span><svg viewBox="0 0 28 10"><line class="serie-1" x1="1" x2="27" y1="5" y2="5"/></svg>' + esc(a.n) + '</span>' +
      '<span><svg viewBox="0 0 28 10"><line class="serie-2" x1="1" x2="27" y1="5" y2="5"/></svg>' + esc(b.n) + '</span></div>';
    s += '<div class="grafica-tip" id="grafica-tip" hidden></div>';
    cont.innerHTML = s;

    // tooltips: columna más cercana al cursor
    var porX = {};
    sa.forEach(function (p) { var k = ejeX(p); (porX[k] = porX[k] || {}).a = p; });
    sb.forEach(function (p) { var k = ejeX(p); (porX[k] = porX[k] || {}).b = p; });
    var columnas = Object.keys(porX).map(Number).sort(function (p, q) { return p - q; });
    var svg = cont.querySelector('svg'), zona = document.getElementById('grafica-zona'), cruz = document.getElementById('grafica-cruz'), tip = document.getElementById('grafica-tip');
    function mover(ev) {
      var r = svg.getBoundingClientRect();
      var xv = (ev.clientX - r.left) / r.width * W;
      var xd = xmin + (xv - mL) / ancho * (xmax - xmin), mejor = columnas[0];
      columnas.forEach(function (c) { if (Math.abs(c - xd) < Math.abs(mejor - xd)) mejor = c; });
      var col = porX[mejor], px = X(mejor);
      cruz.setAttribute('x1', px); cruz.setAttribute('x2', px); cruz.setAttribute('visibility', 'visible');
      var t = '<div class="tip-titulo">' + (carrera ? mejor + '.ª temporada con NY' : 'Temporada ' + mejor) + '</div>';
      [['a', a], ['b', b]].forEach(function (par) {
        var p = col[par[0]];
        var extra = p ? (carrera ? ' <span class="peq">(' + p.x + ')</span>' : ' <span class="peq">(' + p.k + '.ª)</span>') : '';
        t += '<div class="tip-fila"><span>' + esc(par[1].n) + extra + '</span><span class="num">' + (p && p.v !== null ? met.fmt(p.v) : '—') + '</span></div>';
      });
      tip.innerHTML = t; tip.hidden = false;
      var left = px / W * r.width, top = (ev.clientY - r.top);
      var ancTip = tip.offsetWidth;
      tip.style.left = (left + 12 + ancTip > r.width ? left - ancTip - 12 : left + 12) + 'px';
      tip.style.top = Math.max(0, top - 10) + 'px';
    }
    function salir() { tip.hidden = true; cruz.setAttribute('visibility', 'hidden'); }
    zona.addEventListener('mousemove', mover);
    zona.addEventListener('mouseleave', salir);
    zona.addEventListener('touchstart', function (ev) { mover(ev.touches[0]); }, { passive: true });
    zona.addEventListener('touchmove', function (ev) { mover(ev.touches[0]); }, { passive: true });
  }
  function montarControlesGrafica(a, b) {
    var mets = metricasDisponibles(a, b), sel = document.getElementById('grafica-metrica');
    var h = '';
    Object.keys(mets).forEach(function (k) { h += '<option value="' + k + '">' + esc(mets[k].et) + '</option>'; });
    sel.innerHTML = h;
    if (!mets[grafica.metrica]) grafica.metrica = Object.keys(mets)[0];
    sel.value = grafica.metrica;
    var nota = document.getElementById('trayectoria-nota');
    nota.textContent = (a.pit === b.pit)
      ? 'Una métrica por temporada, comparada por año calendario o por el orden de sus temporadas con el equipo. La vista acumulada suma (o promedia, en las tasas) hasta cada año.'
      : 'Como uno es lanzador y el otro bateador, la única métrica que comparten es la de juegos jugados por temporada.';
  }
  document.getElementById('grafica-metrica').addEventListener('change', function () { grafica.metrica = this.value; dibujarGrafica(); });
  Array.prototype.forEach.call(document.querySelectorAll('input[name="grafica-eje"]'), function (r) {
    r.addEventListener('change', function () { if (this.checked) { grafica.eje = this.value; dibujarGrafica(); } });
  });
  document.getElementById('grafica-acumulado').addEventListener('change', function () { grafica.acum = this.checked; dibujarGrafica(); });

  // ---------- sugerencias calculadas ----------
  function topDos(lista, clave, filtro) {
    var c = lista.filter(filtro || function () { return true; }).sort(function (x, y) { return clave(y) - clave(x); });
    return c.length >= 2 ? [c[0], c[1]] : null;
  }
  function montarSugerencias() {
    var bats = INDICE.filter(function (e) { return !e.pit && e.tb; }), pits = INDICE.filter(function (e) { return e.pit && e.tp; });
    var defs = [
      ['Los dos con más jonrones', bats, function (e) { return e.tb.HR; }, null, function (e) { return U.miles(e.tb.HR) + ' HR'; }],
      ['Los dos con más hits', bats, function (e) { return e.tb.H; }, null, function (e) { return U.miles(e.tb.H) + ' H'; }],
      ['Los dos con más carreras impulsadas', bats, function (e) { return e.tb.RBI; }, null, function (e) { return U.miles(e.tb.RBI) + ' RBI'; }],
      ['Mejor promedio (mínimo 2 000 turnos)', bats, function (e) { return e.tb.AVG; }, function (e) { return e.tb.AB >= 2000; }, function (e) { return f3(e.tb.AVG) + ' AVG'; }],
      ['Mejor OPS (mínimo 2 000 turnos)', bats, function (e) { return e.tb.OBP + e.tb.SLG; }, function (e) { return e.tb.AB >= 2000; }, function (e) { return f3(e.tb.OBP + e.tb.SLG) + ' OPS'; }],
      ['Los dos con más bases robadas', bats, function (e) { return e.tb.SB; }, null, function (e) { return U.miles(e.tb.SB) + ' SB'; }],
      ['Los dos con más victorias', pits, function (e) { return e.tp.W; }, null, function (e) { return U.miles(e.tp.W) + ' W'; }],
      ['Los dos con más ponches', pits, function (e) { return e.tp.SO; }, null, function (e) { return U.miles(e.tp.SO) + ' SO'; }],
      ['Los dos con más salvamentos', pits, function (e) { return e.tp.SV; }, null, function (e) { return U.miles(e.tp.SV) + ' SV'; }],
      ['Mejor efectividad (mínimo 1 000 entradas)', pits, function (e) { return -e.tp.ERA; }, function (e) { return e.tp.IPO >= 3000; }, function (e) { return f2(e.tp.ERA) + ' ERA'; }],
      ['Los dos con más blanqueadas', pits, function (e) { return e.tp.SHO; }, null, function (e) { return U.miles(e.tp.SHO) + ' SHO'; }],
      ['Los dos con más temporadas con NY', INDICE, function (e) { return e.anos.length; }, null, function (e) { return e.anos.length + ' temporadas'; }]
    ];
    var h = '';
    defs.forEach(function (d) {
      var par = topDos(d[1], d[2], d[3]); if (!par) return;
      h += '<li><a href="#' + esc(par[0].id) + ',' + esc(par[1].id) + '"><span class="sug-motivo">' + d[0] + '</span>' +
        '<span class="sug-nombres">' + esc(par[0].n) + ' <span class="peq">contra</span> ' + esc(par[1].n) + '</span>' +
        '<span class="sug-cifras">' + d[4](par[0]) + ' · ' + d[4](par[1]) + '</span></a></li>';
    });
    document.getElementById('sugerencias-lista').innerHTML = h;
  }

  // ---------- buscadores con autocompletado ----------
  var seleccion = [null, null];   // ids elegidos en cada buscador
  var inputs = [document.getElementById('buscar-0'), document.getElementById('buscar-1')];
  var listas = [document.getElementById('lista-0'), document.getElementById('lista-1')];
  var activo = [-1, -1], resultados = [[], []];

  function buscar(q) {
    q = sinAcentos(q.trim());
    if (!q) return [];
    var palabras = q.split(/\s+/), r = [];
    for (var i = 0; i < INDICE.length; i++) {
      var e = INDICE[i], ok = true;
      for (var k = 0; k < palabras.length; k++) if (e.busq.indexOf(palabras[k]) < 0) { ok = false; break; }
      if (ok) r.push(e);
    }
    // los que empiezan con lo tecleado van primero; entre iguales, el de más juegos con NY
    function juegos(e) { return (e.tb ? e.tb.G : 0) + (e.tp ? e.tp.G : 0); }
    r.sort(function (x, y) {
      var px = x.busq.indexOf(q) === 0 ? 0 : 1, py = y.busq.indexOf(q) === 0 ? 0 : 1;
      return px - py || juegos(y) - juegos(x);
    });
    return r.slice(0, 12);
  }
  function pintarLista(i) {
    var ul = listas[i], r = resultados[i];
    if (!r.length) {
      ul.innerHTML = '<li class="ac-vacio" role="option" aria-disabled="true">Sin resultados</li>';
    } else {
      ul.innerHTML = r.map(function (e, k) {
        return '<li role="option" id="opcion-' + i + '-' + k + '" data-id="' + esc(e.id) + '" aria-selected="' + (k === activo[i] ? 'true' : 'false') + '">' +
          '<span>' + esc(e.n) + '</span><span class="ac-detalle">' + esc(e.pos || '—') + ' · ' + esc(e.rango) + '</span></li>';
      }).join('');
    }
    ul.hidden = false;
    inputs[i].setAttribute('aria-expanded', 'true');
    inputs[i].setAttribute('aria-activedescendant', activo[i] >= 0 && r.length ? 'opcion-' + i + '-' + activo[i] : '');
  }
  function cerrarLista(i) {
    listas[i].hidden = true; listas[i].innerHTML = '';
    inputs[i].setAttribute('aria-expanded', 'false'); inputs[i].removeAttribute('aria-activedescendant');
    activo[i] = -1;
  }
  function elegir(i, id) {
    seleccion[i] = id;
    inputs[i].value = POR_ID[id].n;
    cerrarLista(i);
    irAlHash();
  }
  function irAlHash() {
    var ids = seleccion.filter(Boolean);
    var nuevo = ids.join(',');
    if (location.hash.slice(1) === nuevo) { montar(); return; }
    location.hash = nuevo;
  }
  inputs.forEach(function (inp, i) {
    inp.addEventListener('input', function () {
      seleccion[i] = null;
      resultados[i] = buscar(inp.value); activo[i] = -1;
      if (inp.value.trim()) pintarLista(i); else cerrarLista(i);
    });
    inp.addEventListener('keydown', function (ev) {
      var r = resultados[i];
      if (listas[i].hidden && (ev.key === 'ArrowDown') && inp.value.trim()) { resultados[i] = buscar(inp.value); pintarLista(i); return; }
      if (ev.key === 'ArrowDown') { ev.preventDefault(); if (r.length) { activo[i] = (activo[i] + 1) % r.length; pintarLista(i); } }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (r.length) { activo[i] = (activo[i] - 1 + r.length) % r.length; pintarLista(i); } }
      else if (ev.key === 'Enter') { if (!listas[i].hidden && r.length) { ev.preventDefault(); elegir(i, r[activo[i] >= 0 ? activo[i] : 0].id); } }
      else if (ev.key === 'Escape') { cerrarLista(i); }
    });
    inp.addEventListener('focus', function () { if (inp.value.trim() && !seleccion[i]) { resultados[i] = buscar(inp.value); pintarLista(i); } });
    inp.addEventListener('blur', function () {
      // retraso para que el clic en una opción alcance a registrarse
      setTimeout(function () { if (document.activeElement !== inp) { cerrarLista(i); if (seleccion[i]) inp.value = POR_ID[seleccion[i]].n; } }, 150);
    });
    listas[i].addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    listas[i].addEventListener('click', function (ev) {
      var li = ev.target.closest('li[data-id]'); if (li) elegir(i, li.getAttribute('data-id'));
    });
  });

  // ---------- montaje según el hash ----------
  function idsDelHash() {
    var h = location.hash.slice(1);
    try { h = decodeURIComponent(h); } catch (e) {}
    return h.split(',').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 2);
  }
  function mostrar(id, visible) { document.getElementById(id).classList.toggle('oculto', !visible); }

  function montar() {
    var ids = idsDelHash(), desconocidos = ids.filter(function (id) { return !POR_ID[id]; });
    var validos = ids.filter(function (id) { return POR_ID[id]; });
    var nota = document.getElementById('buscadores-nota');
    seleccion = [validos[0] || null, validos[1] || null];
    inputs[0].value = seleccion[0] ? POR_ID[seleccion[0]].n : '';
    inputs[1].value = seleccion[1] ? POR_ID[seleccion[1]].n : '';

    mostrar('aviso', desconocidos.length > 0);
    if (desconocidos.length) document.getElementById('aviso-texto').textContent = 'No hay ningún jugador con el identificador «' + desconocidos.join('», «') + '» en este museo.';

    var esDuelo = validos.length === 2, esFicha = validos.length === 1;
    mostrar('ficha', esFicha); mostrar('duelo', esDuelo); mostrar('comparacion', esDuelo); mostrar('trayectoria', esDuelo); mostrar('por-temporada', esDuelo);

    if (esFicha) {
      var e = POR_ID[validos[0]];
      document.title = e.n + ' — Duelo de leyendas — El Monumento';
      nota.textContent = 'Escribe un segundo nombre para enfrentar a ' + e.n + ' con otro jugador.';
      document.getElementById('ficha-contenido').innerHTML =
        fichaBio(e, { acciones: '<button class="boton primario" type="button" id="btn-rival">Elegir rival para el duelo</button> <a class="boton" href="' + U.enlaceFranela(validos[0]) + '">Ver su ficha en La Franela</a>' }) +
        '<div class="mt-2">' + tablasJugador(e) + '</div>';
      document.getElementById('btn-rival').addEventListener('click', function () {
        inputs[1].focus();
        inputs[1].scrollIntoView({ block: 'center' });
      });
    } else if (esDuelo) {
      var a = POR_ID[validos[0]], b = POR_ID[validos[1]];
      document.title = a.n + ' contra ' + b.n + ' — El Monumento';
      nota.textContent = 'Cambia cualquiera de los dos nombres para armar otro duelo.';
      document.getElementById('duelo-fichas').innerHTML =
        fichaBio(a, { sobre: 'Jugador 1', nivel: 3, clase: 'primero' }) + fichaBio(b, { sobre: 'Jugador 2', nivel: 3, clase: 'segundo' });
      montarComparacion(a, b);
      grafica.a = a; grafica.b = b;
      montarControlesGrafica(a, b);
      dibujarGrafica();
      document.getElementById('por-temporada-contenido').innerHTML = '<div class="por-temporada">' +
        [a, b].map(function (e, i) {
          return '<details' + (i === 0 ? ' open' : '') + '><summary>' + esc(e.n) + ' <span class="peq">' + esc(e.rango) + '</span></summary>' + tablasJugador(e) + '</details>';
        }).join('') + '</div>';
    } else {
      document.title = 'Duelo de leyendas — El Monumento';
      nota.textContent = 'Busca por nombre; con un solo jugador se abre su ficha.';
      grafica.a = grafica.b = null;
    }
    if (ids.length) window.scrollTo({ top: document.getElementById('buscadores').offsetTop - 8, behavior: 'auto' });
  }

  montarSugerencias();
  montar();
  window.addEventListener('hashchange', montar);

  M.montarPie([
    'Estadísticas por temporada con los Yankees, fichas biográficas, premios y Salón de la Fama: Lahman Baseball Database (Batting, Pitching, People, Appearances, AwardsPlayers, HallOfFame), 1903–2025.',
    'Temporada 2026: MLB Stats API; los ids se cruzan con el Chadwick Bureau Register.'
  ]);
})();
