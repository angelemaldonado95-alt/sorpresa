/* El Simulador — interfaz.
   Programa contra la API de SimMotor y SimNarracion descrita en el contrato.
   Sin frameworks, sin build, sin fetch(): los datos se cargan con <script>. */
(function () {
  'use strict';

  // ---------- Utilidades ----------
  var $ = function (sel, raiz) { return (raiz || document).querySelector(sel); };

  function el(etiqueta, atributos, hijos) {
    var nodo = document.createElement(etiqueta);
    if (atributos) {
      Object.keys(atributos).forEach(function (k) {
        var v = atributos[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'texto') nodo.textContent = v;
        else if (k === 'clase') nodo.className = v;
        else if (k === 'html') nodo.innerHTML = v;
        else if (k.indexOf('on') === 0) nodo.addEventListener(k.slice(2), v);
        else if (v === true) nodo.setAttribute(k, '');
        else nodo.setAttribute(k, v);
      });
    }
    (hijos || []).forEach(function (h) {
      if (h === null || h === undefined) return;
      nodo.appendChild(typeof h === 'string' ? document.createTextNode(h) : h);
    });
    return nodo;
  }

  function vaciar(nodo) { while (nodo.firstChild) nodo.removeChild(nodo.firstChild); }

  var fmtEntero = new Intl.NumberFormat('es-MX');
  function entero(n) { return fmtEntero.format(n); }
  function num(x) { return x === null || x === undefined ? 0 : x; }

  // Promedio de bateo al estilo «.356» (sin el cero inicial)
  function tres(x) {
    if (!isFinite(x)) return '.000';
    var s = x.toFixed(3);
    return s.charAt(0) === '0' ? s.slice(1) : s;
  }

  function lineaBateo(b) {
    var ab = num(b.AB), h = num(b.H), bb = num(b.BB), hbp = num(b.HBP), sf = num(b.SF);
    var avg = ab ? h / ab : 0;
    var denOBP = ab + bb + hbp + sf;
    var obp = denOBP ? (h + bb + hbp) / denOBP : 0;
    var slg = ab ? (h + num(b['2B']) + 2 * num(b['3B']) + 3 * num(b.HR)) / ab : 0;
    return tres(avg) + '/' + tres(obp) + '/' + tres(slg);
  }

  function ip(outs) { return Math.floor(outs / 3) + '.' + (outs % 3); }
  function era(l) { return l.IPouts ? (l.ER * 27 / l.IPouts).toFixed(2) : '—'; }

  function ordinalEntrada(n) {
    return n + 'ª';
  }

  // ---------- Estado ----------
  var POS_BASE = ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
  var estado = {
    A: { anio: 1927, temporada: null, lineup: [], rotacion: [], cerrador: null },
    B: { anio: 1998, temporada: null, lineup: [], rotacion: [], cerrador: null }
  };
  var cargas = {}; // promesas de carga por año

  function posicionesRequeridas(temporada) {
    return POS_BASE.concat([temporada.dh ? 'DH' : 'P']);
  }

  // ---------- Carga de temporadas por <script> (compatible con file://) ----------
  function cargarTemporada(anio) {
    if (SIM_DATOS.temporadas[anio]) return Promise.resolve(SIM_DATOS.temporadas[anio]);
    if (cargas[anio]) return cargas[anio];
    cargas[anio] = new Promise(function (resolver, rechazar) {
      var s = document.createElement('script');
      s.src = 'data/temporadas/' + anio + '.js';
      s.onload = function () {
        if (SIM_DATOS.temporadas[anio]) resolver(SIM_DATOS.temporadas[anio]);
        else rechazar(new Error('El archivo de ' + anio + ' no definió la temporada.'));
      };
      s.onerror = function () {
        delete cargas[anio];
        rechazar(new Error('No se pudo cargar data/temporadas/' + anio + '.js'));
      };
      document.head.appendChild(s);
    });
    return cargas[anio];
  }

  // ---------- Tema claro/oscuro ----------
  var html = document.documentElement;
  var botonTema = $('#boton-tema');

  function temaActual() {
    if (html.classList.contains('oscuro')) return 'oscuro';
    if (html.classList.contains('claro')) return 'claro';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
  }
  function pintarBotonTema() {
    var oscuro = temaActual() === 'oscuro';
    botonTema.textContent = oscuro ? 'Modo claro' : 'Modo oscuro';
    botonTema.setAttribute('aria-pressed', oscuro ? 'true' : 'false');
  }
  botonTema.addEventListener('click', function () {
    var nuevo = temaActual() === 'oscuro' ? 'claro' : 'oscuro';
    html.classList.remove('oscuro', 'claro');
    html.classList.add(nuevo);
    try { localStorage.setItem('simulador-tema', nuevo); } catch (e) {}
    pintarBotonTema();
  });
  pintarBotonTema();

  // ---------- Columnas de equipo ----------
  function etiquetaIndice(t) {
    var partes = [t.anio, t.equipo, t.W + '-' + t.L];
    if (t.WSWin) partes.push('Serie Mundial');
    else if (t.LgWin) partes.push('Campeón de la Liga');
    return partes.join(' · ');
  }

  function mapaBateadores(temporada) {
    var m = {};
    temporada.bateadores.forEach(function (b) { m[b.id] = b; });
    return m;
  }
  function mapaLanzadores(temporada) {
    var m = {};
    temporada.lanzadores.forEach(function (l) { m[l.id] = l; });
    return m;
  }

  function restablecerLineup(lado) {
    var e = estado[lado];
    var sug = SimMotor.lineupSugerido(e.temporada);
    e.lineup = sug.lineup.map(function (x) { return { id: x.id, pos: x.pos }; });
    e.rotacion = sug.rotacion.slice(0, 4);
    while (e.rotacion.length < 4) e.rotacion.push(e.temporada.lanzadores[Math.min(e.rotacion.length, e.temporada.lanzadores.length - 1)].id);
    e.cerrador = sug.cerrador || null;
  }

  function elegirTemporada(lado, anio) {
    var e = estado[lado];
    e.anio = anio;
    e.temporada = null;
    pintarColumna(lado, 'Cargando la temporada ' + anio + '…');
    return cargarTemporada(anio).then(function (t) {
      if (e.anio !== anio) return; // el usuario cambió de nuevo mientras cargaba
      e.temporada = t;
      restablecerLineup(lado);
      pintarColumna(lado);
    }).catch(function (err) {
      pintarColumna(lado, err.message);
    });
  }

  function opcionJugador(b) {
    return el('option', { value: b.id, texto: b.nombre + ' · ' + lineaBateo(b) + ' · ' + num(b.HR) + ' HR' });
  }
  function opcionLanzador(l) {
    return el('option', { value: l.id, texto: l.nombre + ' · ' + l.GS + ' GS · ' + era(l) + ' ERA · ' + ip(l.IPouts) + ' IP' });
  }

  // Validación del lineup y la rotación. Devuelve una lista de mensajes (vacía si todo está bien).
  function validar(lado) {
    var e = estado[lado], errores = [];
    var nombre = 'Equipo ' + lado;
    if (!e.temporada) { errores.push(nombre + ': la temporada todavía no carga.'); return errores; }
    var vistos = {}, posiciones = {};
    var bat = mapaBateadores(e.temporada);
    e.lineup.forEach(function (x, i) {
      if (!x.id || !bat[x.id]) errores.push(nombre + ': falta el bateador en el turno ' + (i + 1) + '.');
      else if (vistos[x.id]) errores.push(nombre + ': ' + bat[x.id].nombre + ' aparece dos veces en el lineup.');
      vistos[x.id] = true;
      posiciones[x.pos] = (posiciones[x.pos] || 0) + 1;
    });
    posicionesRequeridas(e.temporada).forEach(function (p) {
      if (!posiciones[p]) errores.push(nombre + ': falta un ' + p + ' en el lineup.');
      else if (posiciones[p] > 1) errores.push(nombre + ': hay ' + posiciones[p] + ' jugadores en ' + p + '.');
    });
    var lan = mapaLanzadores(e.temporada), vistosL = {};
    e.rotacion.forEach(function (id, i) {
      if (!id || !lan[id]) errores.push(nombre + ': falta el abridor ' + (i + 1) + '.');
      else if (vistosL[id]) errores.push(nombre + ': ' + lan[id].nombre + ' aparece dos veces en la rotación.');
      vistosL[id] = true;
    });
    return errores;
  }

  function pintarColumna(lado, mensaje) {
    var cont = $('#equipo-' + lado);
    var e = estado[lado];
    var enfocado = document.activeElement && document.activeElement.id;
    vaciar(cont);

    var encabezado = el('div', { clase: 'equipo-encabezado' }, [
      el('div', { clase: 'rotulo', texto: lado === 'A' ? 'Equipo A · visitante en el juego sencillo' : 'Equipo B · local en el juego sencillo' }),
      el('h3', { texto: e.temporada ? e.temporada.equipo + ' ' + e.temporada.anio : 'Temporada ' + e.anio })
    ]);
    cont.appendChild(encabezado);

    // Selector de temporada
    var selTemp = el('select', { id: lado + '-temporada', 'aria-label': 'Temporada del equipo ' + lado });
    SIM_DATOS.indice.forEach(function (t) {
      var o = el('option', { value: t.anio, texto: etiquetaIndice(t) });
      if (t.anio === e.anio) o.selected = true;
      selTemp.appendChild(o);
    });
    selTemp.addEventListener('change', function () { elegirTemporada(lado, parseInt(selTemp.value, 10)); });
    cont.appendChild(el('div', { clase: 'selector-temporada' }, [
      el('label', { 'for': lado + '-temporada', texto: 'Temporada' }), selTemp
    ]));

    if (!e.temporada) {
      cont.appendChild(el('p', { clase: 'ficha', texto: mensaje || '' }));
      return;
    }

    var t = e.temporada;
    cont.appendChild(el('p', { clase: 'ficha', texto:
      t.W + '-' + t.L + ' · ' + entero(t.R) + ' carreras anotadas, ' + entero(t.RA) + ' permitidas · ' + entero(t.HR) + ' HR' +
      (t.WSWin ? ' · Campeón de la Serie Mundial' : t.LgWin ? ' · Campeón de la Liga Americana' : '')
    }));

    // Lineup editable
    cont.appendChild(el('h4', { texto: 'Lineup' }));
    var posiciones = posicionesRequeridas(t);
    var tabla = el('table', { clase: 'lineup' });
    tabla.appendChild(el('thead', null, [el('tr', null, [
      el('th', { texto: '#' }), el('th', { texto: 'Pos.' }), el('th', { texto: 'Jugador · AVG/OBP/SLG · HR' }), el('th', null, [el('span', { clase: 'visualmente-oculto', texto: 'Orden' })])
    ])]));
    var cuerpo = el('tbody');
    e.lineup.forEach(function (x, i) {
      var selPos = el('select', { clase: 'sel-pos', id: lado + '-pos-' + i, 'aria-label': 'Posición del turno ' + (i + 1) });
      posiciones.forEach(function (p) {
        var o = el('option', { value: p, texto: p });
        if (p === x.pos) o.selected = true;
        selPos.appendChild(o);
      });
      selPos.addEventListener('change', function () { x.pos = selPos.value; });

      var selJug = el('select', { clase: 'sel-jugador', id: lado + '-jug-' + i, 'aria-label': 'Bateador del turno ' + (i + 1) });
      t.bateadores.forEach(function (b) {
        var o = opcionJugador(b);
        if (b.id === x.id) o.selected = true;
        selJug.appendChild(o);
      });
      selJug.addEventListener('change', function () { x.id = selJug.value; });

      var subir = el('button', { type: 'button', clase: 'boton pequeno', id: lado + '-sube-' + i, 'aria-label': 'Subir el turno ' + (i + 1), texto: '↑', disabled: i === 0,
        onclick: function () { mover(lado, i, -1); } });
      var bajar = el('button', { type: 'button', clase: 'boton pequeno', id: lado + '-baja-' + i, 'aria-label': 'Bajar el turno ' + (i + 1), texto: '↓', disabled: i === e.lineup.length - 1,
        onclick: function () { mover(lado, i, 1); } });

      cuerpo.appendChild(el('tr', null, [
        el('td', { texto: String(i + 1) }),
        el('td', null, [selPos]),
        el('td', { clase: 'nombre' }, [selJug]),
        el('td', { clase: 'acciones' }, [subir, bajar])
      ]));
    });
    tabla.appendChild(cuerpo);
    cont.appendChild(el('div', { clase: 'tabla-envoltura' }, [tabla]));

    // Rotación y cerrador
    cont.appendChild(el('h4', { texto: 'Rotación y cerrador' }));
    var rot = el('div', { clase: 'rotacion' });
    e.rotacion.forEach(function (id, i) {
      var sel = el('select', { id: lado + '-abridor-' + i });
      t.lanzadores.forEach(function (l) {
        var o = opcionLanzador(l);
        if (l.id === id) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () { e.rotacion[i] = sel.value; });
      rot.appendChild(el('div', null, [el('label', { 'for': lado + '-abridor-' + i, texto: 'Abridor ' + (i + 1) }), sel]));
    });
    var selCerr = el('select', { id: lado + '-cerrador' });
    selCerr.appendChild(el('option', { value: '', texto: 'Sin cerrador designado' }));
    t.lanzadores.forEach(function (l) {
      var o = el('option', { value: l.id, texto: l.nombre + ' · ' + num(l.SV) + ' SV · ' + era(l) + ' ERA · ' + ip(l.IPouts) + ' IP' });
      if (l.id === e.cerrador) o.selected = true;
      selCerr.appendChild(o);
    });
    selCerr.addEventListener('change', function () { e.cerrador = selCerr.value || null; });
    rot.appendChild(el('div', null, [el('label', { 'for': lado + '-cerrador', texto: 'Cerrador' }), selCerr]));
    cont.appendChild(rot);

    cont.appendChild(el('div', { clase: 'acciones-equipo' }, [
      el('button', { type: 'button', clase: 'boton', texto: 'Restablecer lineup real', onclick: function () { restablecerLineup(lado); pintarColumna(lado); } })
    ]));

    if (t.dh) {
      cont.appendChild(el('p', { clase: 'nota', texto: 'Nota: Lahman no registra quién fue el bateador designado, así que el DH sugerido es el mejor bate que queda sin posición. El lineup real de ' + t.anio + ' pudo ser distinto.' }));
    } else {
      cont.appendChild(el('p', { clase: 'nota', texto: 'Temporada sin bateador designado: el lanzador batea (sus números reales de bateo están en Lahman).' }));
    }

    // Devuelve el foco al control que lo tenía antes de repintar
    if (enfocado) { var n = document.getElementById(enfocado); if (n) n.focus(); }
  }

  function mover(lado, i, delta) {
    var l = estado[lado].lineup, j = i + delta;
    if (j < 0 || j >= l.length) return;
    var tmp = l[i]; l[i] = l[j]; l[j] = tmp;
    pintarColumna(lado);
    var n = document.getElementById(lado + (delta < 0 ? '-sube-' : '-baja-') + j);
    if (n && !n.disabled) n.focus();
  }

  // ---------- Simulación ----------
  var mensajeError = $('#mensaje-error');
  var resultado = $('#resultado');
  var seccionResultado = $('#seccion-resultado');
  var temporizadorNarracion = null;

  function semilla() {
    var v = $('#semilla').value.trim();
    if (v !== '' && isFinite(parseInt(v, 10))) return Math.abs(parseInt(v, 10)) >>> 0;
    var s = Math.floor(Math.random() * 2147483647);
    return s;
  }

  function construir(lado) {
    var e = estado[lado];
    return SimMotor.construirEquipo(e.temporada, SIM_DATOS.liga, {
      lineup: e.lineup.map(function (x) { return { id: x.id, pos: x.pos }; }),
      rotacion: e.rotacion.slice(),
      cerrador: e.cerrador,
      usarDH: e.lineup.some(function (x) { return x.pos === 'DH'; })
    });
  }

  // Prepara ambos equipos; devuelve null (y muestra los errores) si algo no es válido.
  function prepararEquipos() {
    var errores = validar('A').concat(validar('B'));
    mensajeError.textContent = errores.join(' ');
    if (errores.length) return null;
    try {
      return { A: construir('A'), B: construir('B') };
    } catch (err) {
      mensajeError.textContent = 'El motor no pudo construir los equipos: ' + err.message;
      return null;
    }
  }

  function mostrarResultado(nodos) {
    if (temporizadorNarracion) { clearInterval(temporizadorNarracion); temporizadorNarracion = null; }
    vaciar(resultado);
    nodos.forEach(function (n) { resultado.appendChild(n); });
    seccionResultado.hidden = false;
  }

  $('#boton-juego').addEventListener('click', function () {
    var eq = prepararEquipos();
    if (!eq) return;
    var s = semilla();
    var juego;
    try {
      juego = SimMotor.simularJuego(eq.A, eq.B, { semilla: s, abridorIndex: 0, juegoNumero: 1 });
    } catch (err) { mensajeError.textContent = 'El motor falló al simular: ' + err.message; throw err; }
    mostrarResultado([
      el('p', { clase: 'sello', texto: 'Un juego · ' + juego.visita.nombre + ' en casa de ' + juego.local.nombre + (juego.conDH === true ? ' · con bateador designado (regla del local)' : juego.conDH === false ? ' · sin bateador designado (regla del local)' : '') + ' · semilla ' + s }),
      nodoJuego(juego, true)
    ]);
    seccionResultado.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('#boton-serie').addEventListener('click', function () {
    var eq = prepararEquipos();
    if (!eq) return;
    var s = semilla();
    var serie;
    try {
      serie = SimMotor.simularSerie(eq.A, eq.B, { alMejorDe: 7, semilla: s });
    } catch (err) { mensajeError.textContent = 'El motor falló al simular la serie: ' + err.message; throw err; }
    mostrarResultado([
      el('p', { clase: 'sello', texto: 'Serie al mejor de 7 · formato 2-3-2 · semilla ' + s }),
      nodoSerie(serie, eq)
    ]);
    seccionResultado.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('#boton-mil').addEventListener('click', function () {
    var eq = prepararEquipos();
    if (!eq) return;
    simularMil(eq, semilla());
    seccionResultado.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ---------- Pizarra (line score) ----------
  function nodoPizarra(juego) {
    var entradas = Math.max(juego.entradas || 9, juego.visita.lineas.length, juego.local.lineas.length, 9);
    var tabla = el('table', { clase: 'pizarra' });
    var fila = [el('th', { texto: 'Equipo' })];
    for (var i = 1; i <= entradas; i++) fila.push(el('th', { texto: String(i) }));
    fila.push(el('th', { texto: 'C', clase: 'total' }), el('th', { texto: 'H' }), el('th', { texto: 'E' }));
    tabla.appendChild(el('thead', null, [el('tr', null, fila)]));
    var cuerpo = el('tbody');
    ['visita', 'local'].forEach(function (lado) {
      var eq = juego[lado];
      var celdas = [el('td', { texto: eq.nombre, clase: 'nombre' + (juego.ganador === lado ? ' gana' : '') })];
      for (var k = 0; k < entradas; k++) {
        var c = eq.lineas[k];
        celdas.push(el('td', { texto: c === undefined || c === null ? (k < entradas ? 'X' : '') : String(c) }));
      }
      celdas.push(el('td', { texto: String(eq.carreras), clase: 'total' + (juego.ganador === lado ? ' gana' : '') }),
                  el('td', { texto: String(eq.hits) }), el('td', { texto: String(eq.errores) }));
      cuerpo.appendChild(el('tr', null, celdas));
    });
    tabla.appendChild(cuerpo);
    return el('div', { clase: 'tabla-envoltura' }, [tabla]);
  }

  // ---------- Narración ----------
  function nodoNarracion(juego) {
    var frases;
    try { frases = SimNarracion.narrar(juego); }
    catch (err) { return el('p', { clase: 'mensaje-error', texto: 'La narración falló: ' + err.message }); }

    var lista = el('ul', { clase: 'narracion' });
    var entradaActual = null;
    var items = [];
    frases.forEach(function (f) {
      var j = f.jugada || {};
      var clave = j.entrada + (j.alta ? 'A' : 'B');
      // Encabezado por mitad de entrada, cuando la narración no la marca ya con INICIO_ENTRADA
      if (j.entrada && clave !== entradaActual && j.tipo !== 'INICIO_ENTRADA' && j.tipo !== 'FIN_JUEGO') {
        entradaActual = clave;
        items.push(el('li', { clase: 'encabezado' }, [
          el('span', { texto: (j.alta ? 'Alta de la ' : 'Baja de la ') + ordinalEntrada(j.entrada) }),
          el('span', { clase: 'marcador', texto: marcadorTexto(j.marcador, juego) })
        ]));
      }
      if (j.tipo === 'INICIO_ENTRADA') {
        entradaActual = clave;
        items.push(el('li', { clase: 'encabezado' }, [
          el('span', { texto: (j.alta ? 'Alta de la ' : 'Baja de la ') + ordinalEntrada(j.entrada) + (f.texto ? ' — ' + f.texto : '') }),
          el('span', { clase: 'marcador', texto: marcadorTexto(j.marcador, juego) })
        ]));
        return;
      }
      if (j.tipo === 'FIN_ENTRADA' && !f.texto) return;
      items.push(el('li', { clase: j.tipo === 'CAMBIO_PITCHER' ? 'cambio' : '' }, [
        el('span', { texto: f.texto || '' }),
        el('span', { clase: 'marcador', texto: marcadorTexto(j.marcador, juego) })
      ]));
    });
    items.forEach(function (li) { lista.appendChild(li); });

    var botonNarrar = el('button', { type: 'button', clase: 'boton', texto: 'Narrar' });
    var botonTodo = el('button', { type: 'button', clase: 'boton', texto: 'Mostrar todo' });
    function mostrarTodo() {
      if (temporizadorNarracion) { clearInterval(temporizadorNarracion); temporizadorNarracion = null; }
      items.forEach(function (li) { li.classList.remove('oculta'); });
      botonNarrar.disabled = false;
    }
    botonNarrar.addEventListener('click', function () {
      if (temporizadorNarracion) { clearInterval(temporizadorNarracion); temporizadorNarracion = null; }
      items.forEach(function (li) { li.classList.add('oculta'); });
      var k = 0;
      botonNarrar.disabled = true;
      temporizadorNarracion = setInterval(function () {
        if (k >= items.length) { mostrarTodo(); return; }
        items[k].classList.remove('oculta');
        if (k === 0 || k % 6 === 0) items[k].scrollIntoView({ block: 'nearest' });
        k++;
      }, 700);
    });
    botonTodo.addEventListener('click', mostrarTodo);

    return el('div', null, [
      el('div', { clase: 'narracion-controles' }, [botonNarrar, botonTodo]),
      lista
    ]);
  }

  function marcadorTexto(m, juego) {
    if (!m) return '';
    return juego.visita.nombre.replace(/^New York /, '') + ' ' + m.visita + ' · ' + juego.local.nombre.replace(/^New York /, '') + ' ' + m.local;
  }

  // ---------- Box score ----------
  function nodoBox(juego) {
    var cols = el('div', { clase: 'box-equipos' });
    ['visita', 'local'].forEach(function (lado) {
      var b = juego.boxscore[lado];
      var bloque = el('div', { clase: 'box' }, [el('h4', { texto: juego[lado].nombre })]);

      var tb = el('table');
      tb.appendChild(el('thead', null, [el('tr', null, [el('th', { texto: 'Bateo' })].concat(
        ['AB', 'C', 'H', '2B', '3B', 'HR', 'BI', 'BB', 'K'].map(function (c) { return el('th', { texto: c, clase: 'num' }); })))]));
      var cb = el('tbody');
      var tot = { AB: 0, R: 0, H: 0, '2B': 0, '3B': 0, HR: 0, RBI: 0, BB: 0, SO: 0 };
      b.bateo.forEach(function (x) {
        var campos = ['AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'SO'];
        campos.forEach(function (c) { tot[c] += num(x[c]); });
        cb.appendChild(el('tr', null, [el('td', { clase: 'nombre', texto: x.nombre + (x.pos ? ' ' + x.pos : '') })].concat(
          campos.map(function (c) { return el('td', { texto: String(num(x[c])), clase: 'num' }); }))));
      });
      cb.appendChild(el('tr', null, [el('td', { texto: 'Totales' })].concat(
        ['AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'BB', 'SO'].map(function (c) { return el('td', { texto: String(tot[c]), clase: 'num' }); }))));
      tb.appendChild(cb);
      bloque.appendChild(el('div', { clase: 'tabla-envoltura' }, [tb]));

      var tp = el('table');
      tp.appendChild(el('thead', null, [el('tr', null, [el('th', { texto: 'Pitcheo' })].concat(
        ['IP', 'H', 'C', 'CL', 'BB', 'K', 'HR'].map(function (c) { return el('th', { texto: c, clase: 'num' }); })))]));
      var cp = el('tbody');
      b.pitcheo.forEach(function (x) {
        var dec = x.decision ? ' (' + x.decision + ')' : '';
        cp.appendChild(el('tr', null, [el('td', { clase: 'nombre' }, [x.nombre, el('span', { clase: 'decision', texto: dec })])].concat(
          [ip(num(x.IPouts)), num(x.H), num(x.R), num(x.ER), num(x.BB), num(x.SO), num(x.HR)].map(function (v) { return el('td', { texto: String(v), clase: 'num' }); }))));
      });
      tp.appendChild(cp);
      bloque.appendChild(el('div', { clase: 'tabla-envoltura' }, [tp]));
      cols.appendChild(bloque);
    });

    var d = juego.decisiones || {};
    var partes = [];
    if (d.ganador) partes.push('Ganó: ' + d.ganador.nombre + ' (' + d.ganador.equipo + ')');
    if (d.perdedor) partes.push('Perdió: ' + d.perdedor.nombre + ' (' + d.perdedor.equipo + ')');
    if (d.salvamento) partes.push('Salvamento: ' + d.salvamento.nombre + ' (' + d.salvamento.equipo + ')');
    return el('div', null, [cols, el('p', { clase: 'decisiones', texto: partes.join(' · ') })]);
  }

  function nodoJuego(juego, conTitulo) {
    var hijos = [];
    if (conTitulo) hijos.push(el('h3', { texto: juego.visita.nombre + ' ' + juego.visita.carreras + ', ' + juego.local.nombre + ' ' + juego.local.carreras + (juego.entradas > 9 ? ' (' + juego.entradas + ' entradas)' : '') }));
    hijos.push(nodoPizarra(juego));
    hijos.push(el('h3', { texto: 'Narración' }));
    hijos.push(nodoNarracion(juego));
    hijos.push(el('h3', { texto: 'Box score' }));
    hijos.push(nodoBox(juego));
    return el('div', { clase: 'juego' }, hijos);
  }

  // ---------- Serie ----------
  function abridorDe(juego, lado) {
    var p = juego.boxscore && juego.boxscore[lado] && juego.boxscore[lado].pitcheo;
    return p && p.length ? p[0].nombre : '—';
  }

  function nodoSerie(serie, eq) {
    var nombreA = eq.A.nombre, nombreB = eq.B.nombre;
    var ganador = serie.ganador === 'A' ? nombreA : nombreB;
    var v = serie.victorias;
    var marcador = el('p', { clase: 'marcador-serie', texto: ganador + ' ganan la serie ' + Math.max(v.A, v.B) + '-' + Math.min(v.A, v.B) });

    var lista = el('ul', { clase: 'lista-juegos' });
    serie.juegos.forEach(function (j, i) {
      var detalle = el('div', { clase: 'juego-detalle', hidden: true });
      var pintado = false;
      var boton = el('button', { type: 'button', clase: 'juego-resumen', 'aria-expanded': 'false' }, [
        el('span', { clase: 'numero', texto: 'Juego ' + (i + 1) }),
        el('span', null, [
          j.visita.nombre + ' en ' + j.local.nombre,
          el('span', { clase: 'abridores', texto: 'Abren ' + abridorDe(j, 'visita') + ' y ' + abridorDe(j, 'local') })
        ]),
        el('span', { clase: 'marcador-juego', texto: j.visita.carreras + '-' + j.local.carreras + (j.entradas > 9 ? ' (' + j.entradas + ')' : '') + ' · gana ' + (j.ganador === 'visita' ? j.visita.nombre : j.local.nombre) })
      ]);
      boton.addEventListener('click', function () {
        var abierto = !detalle.hidden;
        if (!abierto && !pintado) { detalle.appendChild(nodoJuego(j, false)); pintado = true; }
        detalle.hidden = abierto;
        boton.setAttribute('aria-expanded', abierto ? 'false' : 'true');
      });
      lista.appendChild(el('li', null, [boton, detalle]));
    });

    return el('div', null, [marcador, el('p', { clase: 'nota', texto: 'Haz clic en un juego para ver su pizarra, narración y box score.' }), lista]);
  }

  // ---------- 1,000 series en lotes para no congelar la página ----------
  function simularMil(eq, semillaBase) {
    var N = 1000, LOTE = 20;
    var hecho = 0;
    var acum = { A: 0, B: 0, carrerasA: 0, carrerasB: 0, juegos: 0, porSerie: { 4: 0, 5: 0, 6: 0, 7: 0 } };

    var progreso = el('div', { clase: 'progreso' }, [el('div')]);
    var estadoTexto = el('p', { clase: 'sello', texto: 'Simulando 1,000 series al mejor de 7 · semilla ' + semillaBase });
    var contenedor = el('div');
    mostrarResultado([estadoTexto, progreso, contenedor]);
    $('#boton-mil').disabled = true;

    function lote() {
      var fin = Math.min(hecho + LOTE, N);
      try {
        for (; hecho < fin; hecho++) {
          var s = SimMotor.simularSerie(eq.A, eq.B, { alMejorDe: 7, semilla: (semillaBase + hecho * 7919) >>> 0 });
          acum[s.ganador]++;
          acum.porSerie[s.juegos.length] = (acum.porSerie[s.juegos.length] || 0) + 1;
          s.juegos.forEach(function (j) {
            acum.juegos++;
            // El motor marca con `localEs` quién fue local; si no viene, se compara el nombre.
            var ladoA = j.localEs ? (j.localEs === 'A' ? 'local' : 'visita') : (j.visita.nombre === eq.A.nombre ? 'visita' : 'local');
            acum.carrerasA += j[ladoA].carreras;
            acum.carrerasB += j[ladoA === 'visita' ? 'local' : 'visita'].carreras;
          });
        }
      } catch (err) {
        $('#boton-mil').disabled = false;
        estadoTexto.textContent = 'El motor falló en la serie ' + (hecho + 1) + ': ' + err.message;
        throw err;
      }
      progreso.firstChild.style.width = (hecho / N * 100) + '%';
      if (hecho < N) {
        setTimeout(lote, 0);
      } else {
        $('#boton-mil').disabled = false;
        progreso.remove();
        estadoTexto.textContent = '1,000 series al mejor de 7 · semilla ' + semillaBase;
        pintarMil(contenedor, eq, acum, N);
      }
    }
    requestAnimationFrame(lote);
  }

  function pintarMil(contenedor, eq, acum, N) {
    var ganaA = acum.A >= acum.B;
    var g = ganaA ? 'A' : 'B';
    var nombre = ganaA ? eq.A.nombre : eq.B.nombre;
    var pct = acum[g] / N * 100;
    var fmtPct = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    var fmtDec = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    contenedor.appendChild(el('p', { clase: 'titular', texto: nombre + ' ganan el ' + fmtPct.format(pct) + ' % de las series (' + entero(acum[g]) + ' de ' + entero(N) + ')' }));

    contenedor.appendChild(el('div', { clase: 'cifras' }, [
      el('div', { clase: 'cifra' }, [
        el('div', { clase: 'etiqueta', texto: eq.A.nombre }),
        el('div', { clase: 'valor', texto: entero(acum.A) + ' series' }),
        el('div', { clase: 'detalle', texto: fmtDec.format(acum.carrerasA / acum.juegos) + ' carreras por juego' })
      ]),
      el('div', { clase: 'cifra' }, [
        el('div', { clase: 'etiqueta', texto: eq.B.nombre }),
        el('div', { clase: 'valor', texto: entero(acum.B) + ' series' }),
        el('div', { clase: 'detalle', texto: fmtDec.format(acum.carrerasB / acum.juegos) + ' carreras por juego' })
      ])
    ]));

    contenedor.appendChild(el('h4', { texto: 'Duración de las series' }));
    var barras = el('div', { clase: 'barras' });
    var maximo = Math.max(1, acum.porSerie[4], acum.porSerie[5], acum.porSerie[6], acum.porSerie[7]);
    [4, 5, 6, 7].forEach(function (k) {
      var n = acum.porSerie[k] || 0;
      barras.appendChild(el('div', { clase: 'barra-fila' }, [
        el('span', { texto: 'En ' + k + ' juegos' }),
        el('div', { clase: 'pista', role: 'img', 'aria-label': entero(n) + ' series en ' + k + ' juegos' }, [el('div', { clase: 'relleno', style: 'width:' + (n / maximo * 100) + '%' })]),
        el('span', { clase: 'cantidad', texto: entero(n) + ' · ' + fmtPct.format(n / N * 100) + ' %' })
      ]));
    });
    contenedor.appendChild(barras);
    contenedor.appendChild(el('p', { clase: 'nota', texto: 'Cada serie usa una semilla derivada de la semilla base, así que el resultado se reproduce con la misma semilla.' }));
  }

  // ---------- Arranque ----------
  if (typeof SimMotor === 'undefined' || typeof SimNarracion === 'undefined') {
    mensajeError.textContent = 'No se encontraron js/motor.js o js/narracion.js.';
    pintarColumna('A', 'Falta el motor de simulación.');
    pintarColumna('B', 'Falta el motor de simulación.');
    return;
  }
  elegirTemporada('A', estado.A.anio);
  elegirTemporada('B', estado.B.anio);
})();
