/* El Monumento — sala «Los 27 anillos»
   Galería de títulos, lista de series perdidas, detalle juego por juego
   (navegación por #año) y resumen por rival. Todo sale de MONUMENTO.series
   y MONUMENTO.temporadas; no hay cifras escritas a mano. */
(function () {
  'use strict';
  var M = window.MONUMENTO || {};
  var U = M.util;
  var esc = U.esc;
  var SERIES = (M.series || []).slice().sort(function (a, b) { return a.a - b.a; });
  var GANADAS = SERIES.filter(function (s) { return s.gano; });
  var PERDIDAS = SERIES.filter(function (s) { return !s.gano; });
  var TEMPORADAS = {};
  (M.temporadas || []).forEach(function (t) { TEMPORADAS[t.a] = t; });

  // ---------- ayudas ----------
  function ordinal(n) { return n + '.º'; }
  function numeroDeTitulo(serie) { return GANADAS.indexOf(serie) + 1; }
  function marcador(s) { return s.g + '-' + s.p + (s.e ? '-' + s.e : ''); }
  // «los Bravos de Atlanta» → «Bravos»; «los Dodgers de Los Ángeles» → «Dodgers»
  function apodo(s) {
    var t = (s.rivalEs || s.rivalN || s.rival).replace(/^(los|las|el|la)\s+/i, '');
    var i = t.indexOf(' de ');
    return i > 0 ? t.slice(0, i) : t;
  }
  function suma(arr) { return arr.reduce(function (a, v) { return a + (v === 'x' ? 0 : (parseInt(v, 10) || 0)); }, 0); }
  function lista(nombres) {
    if (nombres.length <= 1) return nombres.join('');
    return nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
  }
  function enlace(id, nombre) {
    return id ? '<a href="' + U.enlaceJugador(id) + '">' + esc(nombre) + '</a>' : esc(nombre);
  }

  // ---------- resumen general (sin hash) ----------
  function cuentaPorRival() {
    var m = {};
    SERIES.forEach(function (s) {
      var r = m[s.rival] || (m[s.rival] = { rival: s.rival, nombre: s.rivalEs, apodo: apodo(s), n: 0, g: 0, p: 0, anos: [] });
      r.n++; if (s.gano) r.g++; else r.p++;
      r.anos.push(s);
    });
    return Object.keys(m).map(function (k) { return m[k]; });
  }
  function montarResumen() {
    var rivales = cuentaPorRival().sort(function (a, b) { return b.n - a.n || a.anos[0].a - b.anos[0].a; });
    var maxN = rivales[0].n;
    var frecuentes = rivales.filter(function (r) { return r.n === maxN; });
    var primera = SERIES[0], ultima = SERIES[SERIES.length - 1];
    var ultimoTitulo = GANADAS[GANADAS.length - 1];
    var html = '';
    html += dato('Títulos', GANADAS.length, 'num');
    html += dato('Series Mundiales jugadas', SERIES.length, 'num');
    html += dato('Series perdidas', PERDIDAS.length, 'num');
    html += dato('Primera y última', primera.a + ' – ' + ultima.a, 'num');
    html += dato('Último título', ultimoTitulo.a, 'num');
    html += dato('Rival más frecuente', frecuentes.map(function (r) { return r.apodo + ' (' + r.n + ')'; }).join(', '));
    document.getElementById('resumen-datos').innerHTML = html;
  }
  function dato(etiqueta, valor, clase) {
    return '<div class="dato"><span class="etiqueta">' + esc(etiqueta) + '</span><span class="valor' + (clase ? ' ' + clase : '') + '">' + esc(valor) + '</span></div>';
  }

  // ---------- galería y lista de perdidas ----------
  function montarGaleria() {
    document.getElementById('placas').innerHTML = GANADAS.map(function (s, i) {
      return '<li class="placa" data-a="' + s.a + '"><a href="#' + s.a + '">' +
        '<span class="ordinal">' + esc(ordinal(i + 1)) + ' título</span>' +
        '<span class="ano">' + s.a + '</span>' +
        '<span class="rival">' + esc(s.rivalEs.replace(/^(los|las)\s+/i, function (m) { return m.charAt(0).toUpperCase() + m.slice(1); })) + '</span>' +
        '<span class="marcador">' + esc(marcador(s)) + '</span>' +
      '</a></li>';
    }).join('');
    document.getElementById('perdidas-lista').innerHTML = PERDIDAS.map(function (s) {
      return '<li data-a="' + s.a + '"><a href="#' + s.a + '">' +
        '<span class="ano">' + s.a + '</span>' +
        '<span>ante ' + esc(s.rivalEs) + '</span>' +
        '<span class="marcador">' + esc(marcador(s)) + '</span>' +
      '</a></li>';
    }).join('');
  }
  function marcarActiva(a) {
    var lis = document.querySelectorAll('#placas li, #perdidas-lista li');
    for (var i = 0; i < lis.length; i++) lis[i].classList.toggle('activa', String(a) === lis[i].getAttribute('data-a'));
  }

  // ---------- resumen por rival ----------
  function montarRivales() {
    var rivales = cuentaPorRival().sort(function (a, b) { return b.n - a.n || b.g - a.g || a.anos[0].a - b.anos[0].a; });
    var masG = rivales.slice().sort(function (a, b) { return b.g - a.g; })[0];
    var masP = rivales.slice().sort(function (a, b) { return b.p - a.p; })[0];
    document.getElementById('rivales-nota').textContent =
      'Contra ' + masG.nombre + ' se ganaron más Series (' + masG.g + '); contra ' + masP.nombre + ' se perdieron más (' + masP.p + '). ' +
      'Las franquicias que cambiaron de ciudad aparecen por separado, tal como las registra la base de datos.';
    var filas = rivales.map(function (r) {
      return '<tr><td>' + esc(r.nombre.replace(/^(los|las)\s+/i, function (m) { return m.charAt(0).toUpperCase() + m.slice(1); })) + '</td>' +
        '<td class="num">' + r.n + '</td><td class="num">' + r.g + '</td><td class="num">' + r.p + '</td>' +
        '<td class="rivales-anos">' + r.anos.map(function (s) {
          return '<a href="#' + s.a + '" class="' + (s.gano ? 'g' : 'p') + '" title="' + (s.gano ? 'Ganada' : 'Perdida') + ' ' + esc(marcador(s)) + '">' + s.a + (s.gano ? '' : '*') + '</a>';
        }).join(' ') + '</td></tr>';
    }).join('');
    document.getElementById('rivales-tabla').innerHTML =
      '<thead><tr><th>Rival</th><th class="num">Series</th><th class="num">Ganadas</th><th class="num">Perdidas</th><th>Años (* perdida)</th></tr></thead><tbody>' + filas + '</tbody>';
  }

  // ---------- detalle de una serie ----------
  function encabezado(s) {
    var t = TEMPORADAS[s.a];
    var titulo = s.gano ? ordinal(numeroDeTitulo(s)) + ' título' : 'Serie perdida';
    var resultado = (s.gano ? 'Los Yankees vencieron ' : 'Los Yankees cayeron ante ') + esc(s.rivalEs) + ' ' + marcador(s) +
      (s.e ? ' (' + s.e + ' ' + U.plural(s.e, 'empate') + ')' : '') + '.';
    var h = '<div class="serie-encabezado">' +
      '<p class="etiqueta-sobre">Serie Mundial de ' + s.a + ' · ' + esc(titulo) + '</p>' +
      '<h2>' + s.a + ' · ' + esc(s.rivalEs.replace(/^los\s+/i, 'Yankees contra los ')) + '</h2>' +
      '<p class="resultado">' + resultado + '</p>' +
      '<div class="datos">' +
        dato('Resultado', (s.gano ? 'Ganada ' : 'Perdida ') + marcador(s)) +
        dato('Mánager', s.mgr || '—') +
        dato('Temporada regular', s.record ? s.record[0] + '-' + s.record[1] : '—', 'num') +
        (t ? dato('Lugar en ' + (t.div ? 'la división' : 'la liga'), ordinal(t.lugar)) : '') +
        dato('Juegos', s.juegos.length, 'num') +
      '</div>';
    if (t) h += '<p class="peq"><a href="' + U.enlaceTemporada(s.a) + '">Ver la temporada ' + s.a + ' completa →</a></p>';
    h += '</div>';
    return h;
  }
  function mvpNota(s) {
    if (!s.mvp || !s.mvp.length) {
      return s.a < 1955 ? '' : '<p class="mvp-nota peq">Sin dato de MVP de la Serie.</p>';
    }
    var delRival = s.mvp.every(function (m) { return !m.ny; });
    var nombres = s.mvp.map(function (m) { return enlace(m.ny ? m.id : null, m.n); });
    return '<p class="mvp-nota"><span class="chip' + (delRival ? '' : ' titulo') + '">MVP de la Serie</span> ' +
      lista(nombres) + (delRival ? ', de ' + esc(s.rivalEs) : '') + '.</p>';
  }
  function tablaJuegos(s) {
    var hayExtras = s.juegos.some(function (j) { return j.inn > 9; });
    var filas = s.juegos.map(function (j) {
      var res = j.res === 'G' ? 'Ganado' : j.res === 'P' ? 'Perdido' : 'Empate';
      return '<tr class="' + (j.res === 'P' ? 'perdido' : '') + '">' +
        '<td class="num">' + j.n + '</td>' +
        '<td class="fecha">' + esc(U.fechaLarga(j.fecha)) + '</td>' +
        '<td>' + esc(j.parque) + '</td>' +
        '<td>' + (j.local ? 'Local' : 'Visita') + '</td>' +
        '<td class="res">' + res + '</td>' +
        '<td class="num">' + j.ny + '-' + j.op + '</td>' +
        (hayExtras ? '<td class="num">' + (j.inn > 9 ? j.inn : '') + '</td>' : '') +
        '<td>' + (j.gp ? enlace(j.gpId, j.gp) : '—') + '</td>' +
        '<td>' + (j.pp ? enlace(j.ppId, j.pp) : '—') + '</td>' +
        '<td>' + (j.sv ? esc(j.sv) : '—') + '</td>' +
        '<td class="num">' + U.miles(j.asist) + '</td>' +
      '</tr>';
    }).join('');
    return '<h3>Juego por juego</h3><div class="tabla-scroll"><table class="tabla tabla-juegos">' +
      '<thead><tr><th class="num">N.º</th><th>Fecha</th><th>Sede</th><th>NY</th><th>Resultado</th><th class="num">NY-' + esc(s.rival) + '</th>' +
      (hayExtras ? '<th class="num">Entradas</th>' : '') +
      '<th>Pitcher ganador</th><th>Pitcher perdedor</th><th>Salvamento</th><th class="num">Asistencia</th></tr></thead>' +
      '<tbody>' + filas + '</tbody></table></div>';
  }
  function pizarron(s, j) {
    var vis = j.local ? { n: apodo(s), ny: false, lin: j.lv, h: j.h_op, e: j.e_op, r: j.op } : { n: 'Yankees', ny: true, lin: j.lv, h: j.h_ny, e: j.e_ny, r: j.ny };
    var loc = j.local ? { n: 'Yankees', ny: true, lin: j.ll, h: j.h_ny, e: j.e_ny, r: j.ny } : { n: apodo(s), ny: false, lin: j.ll, h: j.h_op, e: j.e_op, r: j.op };
    var inn = Math.max(j.inn || 9, vis.lin.length, loc.lin.length);
    var cab = '';
    for (var i = 1; i <= inn; i++) cab += '<th>' + i + '</th>';
    function fila(eq, papel) {
      var celdas = '';
      for (var i = 0; i < inn; i++) {
        var v = eq.lin[i];
        celdas += v === undefined ? '<td class="x">·</td>' : v === 'x' ? '<td class="x" title="No bateó">×</td>' : '<td>' + esc(v) + '</td>';
      }
      var r = eq.r !== undefined && eq.r !== null ? eq.r : suma(eq.lin);
      var gano = j.res !== 'E' && ((eq.ny && j.res === 'G') || (!eq.ny && j.res === 'P'));
      return '<tr class="' + (gano ? 'gano' : '') + '"><td class="equipo">' + esc(eq.n) + '<span class="peq">' + papel + '</span></td>' + celdas +
        '<td class="total">' + r + '</td><td class="total">' + eq.h + '</td><td class="total">' + eq.e + '</td></tr>';
    }
    var titulo = 'Juego ' + j.n + ' · ' + (j.res === 'G' ? 'Yankees ' + j.ny + ', ' + apodo(s) + ' ' + j.op : j.res === 'P' ? apodo(s) + ' ' + j.op + ', Yankees ' + j.ny : 'Empate ' + j.ny + '-' + j.op);
    var pie = [];
    if (j.gp) pie.push('G: ' + esc(j.gp)); if (j.pp) pie.push('P: ' + esc(j.pp)); if (j.sv) pie.push('S: ' + esc(j.sv));
    if (j.inn > 9) pie.push(j.inn + ' entradas');
    if (j.res === 'E') pie.push('Juego empatado');
    return '<div class="pizarron">' +
      '<div class="pizarron-titulo"><strong>' + esc(titulo) + '</strong><span class="peq">' + esc(U.fechaLarga(j.fecha)) + ' · ' + esc(j.parque) + '</span></div>' +
      '<div class="tabla-scroll"><table class="linea"><thead><tr><th class="equipo"></th>' + cab + '<th class="total">C</th><th class="total">H</th><th class="total">E</th></tr></thead>' +
      '<tbody>' + fila(vis, 'visitante') + fila(loc, 'local') + '</tbody></table></div>' +
      (pie.length ? '<p class="pie-juego">' + pie.join(' · ') + '</p>' : '') +
    '</div>';
  }
  function pizarrones(s) {
    return '<h3>Líneas de anotación</h3><p class="peq">Carreras por entrada; C, H y E son carreras, hits y errores. La × marca la media entrada que no se jugó.</p>' +
      '<div class="pizarrones">' + s.juegos.map(function (j) { return pizarron(s, j); }).join('') + '</div>';
  }
  function esMvp(s, id) { return (s.mvp || []).some(function (m) { return m.ny && m.id === id; }); }
  function tablaBateo(s) {
    var filas = s.bateo.filter(function (b) { return b.ab > 0 || b.bb > 0; }).map(function (b) {
      return '<tr class="' + (esMvp(s, b.id) ? 'mvp' : '') + '"><td>' + enlace(b.id, b.n) + '</td>' +
        ['g', 'ab', 'r', 'h', 'd2', 'd3', 'hr', 'rbi', 'bb', 'so'].map(function (k) { return '<td class="num">' + b[k] + '</td>'; }).join('') +
        '<td class="num">' + U.prom(b.h, b.ab) + '</td></tr>';
    }).join('');
    return '<h4>Bateo</h4><div class="tabla-scroll"><table class="tabla"><thead><tr><th>Jugador</th>' +
      ['J', 'VB', 'C', 'H', '2B', '3B', 'HR', 'CI', 'BB', 'K', 'Prom.'].map(function (k) { return '<th class="num">' + k + '</th>'; }).join('') +
      '</tr></thead><tbody>' + filas + '</tbody></table></div>';
  }
  function tablaPitcheo(s) {
    var filas = s.pitcheo.map(function (p) {
      return '<tr class="' + (esMvp(s, p.id) ? 'mvp' : '') + '"><td>' + enlace(p.id, p.n) + '</td>' +
        '<td class="num">' + p.g + '</td><td class="num">' + p.gs + '</td><td class="num">' + p.w + '-' + p.l + '</td><td class="num">' + p.sv + '</td>' +
        '<td class="num">' + U.ip(p.ipo) + '</td><td class="num">' + p.h + '</td><td class="num">' + p.er + '</td><td class="num">' + p.bb + '</td><td class="num">' + p.so + '</td>' +
        '<td class="num">' + U.era(p.er, p.ipo) + '</td></tr>';
    }).join('');
    return '<h4>Pitcheo</h4><div class="tabla-scroll"><table class="tabla"><thead><tr><th>Lanzador</th>' +
      ['J', 'JI', 'G-P', 'SV', 'EL', 'H', 'CL', 'BB', 'K', 'Efect.'].map(function (k) { return '<th class="num">' + k + '</th>'; }).join('') +
      '</tr></thead><tbody>' + filas + '</tbody></table></div>';
  }
  function navegacion(s) {
    var i = SERIES.indexOf(s);
    var ant = SERIES[i - 1], sig = SERIES[i + 1];
    return '<nav class="serie-nav" aria-label="Otras series">' +
      (ant ? '<a class="boton" href="#' + ant.a + '">← Serie de ' + ant.a + '</a>' : '<span></span>') +
      '<a class="boton" href="#" data-cerrar>Todas las series</a>' +
      (sig ? '<a class="boton" href="#' + sig.a + '">Serie de ' + sig.a + ' →</a>' : '<span></span>') +
    '</nav>';
  }
  function montarDetalle(s) {
    var c = document.getElementById('detalle-contenido');
    c.innerHTML = '<div class="detalle">' +
      navegacion(s) +
      encabezado(s) +
      (s.cronica ? '<p class="cronica">' + esc(s.cronica) + '</p>' : '') +
      mvpNota(s) +
      tablaJuegos(s) +
      pizarrones(s) +
      '<div class="figuras"><h3>Figuras de la serie</h3><p class="peq">Jugadores de los Yankees en esta Serie Mundial. Los nombres llevan a la sala «Duelo de leyendas».</p>' +
      tablaBateo(s) + tablaPitcheo(s) + '</div>' +
    '</div>';
    document.title = 'Serie Mundial de ' + s.a + ' — Los 27 anillos — El Monumento';
  }

  // ---------- enrutador por hash ----------
  function serieDelHash() {
    var a = parseInt((location.hash || '').replace('#', ''), 10);
    if (!a) return null;
    for (var i = 0; i < SERIES.length; i++) if (SERIES[i].a === a) return SERIES[i];
    return null;
  }
  function enrutar() {
    var s = serieDelHash();
    var detalle = document.getElementById('detalle');
    var resumen = document.getElementById('resumen');
    if (s) {
      montarDetalle(s);
      detalle.classList.remove('oculto');
      resumen.classList.add('oculto');
      marcarActiva(s.a);
      // Al cambiar de serie con el hash, llevamos la vista al detalle
      var y = detalle.getBoundingClientRect().top + window.pageYOffset - 8;
      window.scrollTo(0, Math.max(0, y));
    } else {
      detalle.classList.add('oculto');
      resumen.classList.remove('oculto');
      marcarActiva(null);
      document.title = 'Los 27 anillos — El Monumento';
      if (location.hash && location.hash !== '#') {
        // Hash que no corresponde a una serie: avisamos sin romper nada
        document.getElementById('detalle-contenido').innerHTML = '';
      }
    }
  }

  // ---------- arranque ----------
  function iniciar() {
    if (!SERIES.length) {
      document.getElementById('resumen-datos').innerHTML = '<p class="peq">No se cargaron los datos de las Series Mundiales.</p>';
      return;
    }
    montarResumen();
    montarGaleria();
    montarRivales();
    enrutar();
    window.addEventListener('hashchange', enrutar);
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[data-cerrar]');
      if (a) {
        e.preventDefault();
        // Quitamos el hash sin dejar «#» colgado (en file:// pushState puede fallar: usamos el hash como respaldo)
        try { history.pushState('', document.title, location.pathname + location.search); enrutar(); }
        catch (err) { location.hash = ''; }
        window.scrollTo(0, 0);
      }
    });
    M.montarPie([
      'Resultados de serie y figuras: Lahman Baseball Database (SeriesPost, BattingPost, PitchingPost, AwardsPlayers).',
      'Marcadores, líneas de anotación, pitchers y asistencia juego por juego: game logs de postemporada de Retrosheet.',
      'Las crónicas se redactan automáticamente a partir de esos datos; no contienen información ajena a ellos.'
    ]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
