// Sala «De dónde vienen»: mapa de lugares de nacimiento.
// Expone window.FranelaMapa.init(contenedor); app.js lo llama una sola vez.
window.FranelaMapa = (function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var VISTA = { x: 0, y: 8, w: 1000, h: 404 }; // recorta el extremo sur vacío (latitudes < ~-55)
  var RADIO_BASE = 2.6;
  var RADIO_TOPE = 9;

  var F = window.Franela;
  var MUNDO = window.FRANELA_WORLD || { w: 1000, h: 500, countries: [], states: [], countryEs: {}, usStates: {} };
  var JUGADORES = window.FRANELA_PLAYERS || [];

  var nodos = {};        // referencias a los elementos creados
  var filtro = { decada: '', alcance: '' };
  var gruposActuales = {}; // clave -> grupo visible
  var seleccion = null;  // { tipo: 'lugar'|'pais'|'estado', clave }

  function esc(s) { return F ? F.escapar(s) : String(s == null ? '' : s); }

  function x(lon) { return (lon + 180) / 360 * MUNDO.w; }
  function y(lat) { return (90 - lat) / 180 * MUNDO.h; }

  function nombrePais(p) {
    if (p.cc && MUNDO.countryEs[p.cc]) return MUNDO.countryEs[p.cc];
    return p.countryEs || (p.cc ? p.cc : 'País desconocido');
  }
  function clavePais(p) { return p.cc ? p.cc : ('_' + (p.countryEs || '')); }
  function nombreEstado(st) { return MUNDO.usStates[st] || st; }

  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }

  // Nombre del lugar para un grupo (ciudad + estado/país), tomando el primer jugador.
  function nombreLugar(p) {
    var partes = [];
    if (p.geo === 'pais') return nombrePais(p) + ' (centro del país)';
    if (p.geo === 'estado') {
      var e = p.stateName || nombreEstado(p.state);
      return (e ? e + ', ' : '') + nombrePais(p) + ' (centro del estado)';
    }
    if (p.city) partes.push(p.city);
    if (p.stateName && p.stateName !== p.city) partes.push(p.stateName);
    partes.push(nombrePais(p));
    return partes.join(', ');
  }

  // --- Filtro ---------------------------------------------------------------

  function pasaFiltro(p) {
    if (filtro.decada) {
      var d = +filtro.decada;
      if (!p.decades || p.decades.indexOf(d) < 0) return false;
    }
    if (filtro.alcance === 'fuera') return p.cc !== 'US';
    if (filtro.alcance === 'latam') return !!p.latam;
    if (filtro.alcance === 'mex') return !!p.mex;
    return true;
  }

  function jugadoresFiltrados() { return JUGADORES.filter(pasaFiltro); }

  function ordenarPorAnio(lista) {
    return lista.slice().sort(function (a, b) {
      var ya = a.yrs && a.yrs.length ? a.yrs[0] : 9999;
      var yb = b.yrs && b.yrs.length ? b.yrs[0] : 9999;
      if (ya !== yb) return ya - yb;
      return String(a.last || a.name).localeCompare(String(b.last || b.name));
    });
  }

  function claveLugar(p) { return p.lat.toFixed(3) + ',' + p.lon.toFixed(3); }

  function agrupar(lista) {
    var grupos = {};
    lista.forEach(function (p) {
      if (p.lat == null || p.lon == null) return;
      var k = claveLugar(p);
      var g = grupos[k];
      if (!g) {
        g = grupos[k] = { clave: k, lat: p.lat, lon: p.lon, jugadores: [], aprox: true, ejemplo: p };
      }
      g.jugadores.push(p);
      if (p.geo !== 'estado' && p.geo !== 'pais') { g.aprox = false; g.ejemplo = p; }
    });
    return grupos;
  }

  // --- Construcción del DOM --------------------------------------------------

  function el(tag, attrs, texto) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (texto != null) e.textContent = texto;
    return e;
  }
  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  // Los contornos que cruzan el antimeridiano (Rusia, Fiyi) traen saltos de un
  // borde al otro que se dibujarían como una línea horizontal; se parten ahí.
  function sanearPath(d) {
    if (d.indexOf('M') < 0) return d;
    var salida = [];
    d.split('M').forEach(function (sub) {
      var pts = sub.replace(/Z/g, '').trim();
      if (!pts) return;
      var lista = pts.split(/\s+/), trozo = [], xPrev = null;
      lista.forEach(function (pt) {
        var xv = parseFloat(pt);
        if (xPrev !== null && Math.abs(xv - xPrev) > MUNDO.w / 2) {
          if (trozo.length > 1) salida.push('M' + trozo.join(' ') + 'Z');
          trozo = [];
        }
        trozo.push(pt);
        xPrev = xv;
      });
      if (trozo.length > 1) salida.push('M' + trozo.join(' ') + 'Z');
    });
    return salida.join('');
  }

  function decadasPresentes() {
    var set = {};
    JUGADORES.forEach(function (p) { (p.decades || []).forEach(function (d) { set[d] = true; }); });
    return Object.keys(set).map(Number).filter(function (d) { return d >= 1900 && d <= 2020; })
      .sort(function (a, b) { return a - b; });
  }

  function construirControles(contenedor) {
    var controles = el('div', { 'class': 'controles' });

    var cDec = el('label', { 'class': 'control' });
    cDec.appendChild(el('span', null, 'Década'));
    var selDec = el('select', { id: 'mapa-decada', 'aria-label': 'Década' });
    selDec.appendChild(el('option', { value: '' }, 'Todas las décadas'));
    decadasPresentes().forEach(function (d) {
      selDec.appendChild(el('option', { value: String(d) }, d + 's'));
    });
    cDec.appendChild(selDec);

    var cAlc = el('label', { 'class': 'control' });
    cAlc.appendChild(el('span', null, 'Alcance'));
    var selAlc = el('select', { id: 'mapa-alcance', 'aria-label': 'Alcance' });
    [['', 'Todos'], ['fuera', 'Fuera de Estados Unidos'], ['latam', 'América Latina'], ['mex', 'México']]
      .forEach(function (o) { selAlc.appendChild(el('option', { value: o[0] }, o[1])); });
    cAlc.appendChild(selAlc);

    controles.appendChild(cDec);
    controles.appendChild(cAlc);
    contenedor.appendChild(controles);

    selDec.addEventListener('change', function () { filtro.decada = selDec.value; redibujar(); });
    selAlc.addEventListener('change', function () { filtro.alcance = selAlc.value; redibujar(); });
    nodos.selDec = selDec;
    nodos.selAlc = selAlc;
  }

  function construirSvg(contenedor) {
    var svg = svgEl('svg', {
      viewBox: VISTA.x + ' ' + VISTA.y + ' ' + VISTA.w + ' ' + VISTA.h,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': 'Mapa del mundo con los lugares de nacimiento de los jugadores'
    });
    var gTierra = svgEl('g');
    MUNDO.countries.forEach(function (c) {
      if (!c.d) return;
      var path = svgEl('path', { 'class': 'tierra', d: sanearPath(c.d) });
      var t = svgEl('title');
      t.textContent = (c.cc && MUNDO.countryEs[c.cc]) ? MUNDO.countryEs[c.cc] : c.name;
      path.appendChild(t);
      gTierra.appendChild(path);
    });
    var gEstados = svgEl('g');
    MUNDO.states.forEach(function (s) {
      if (!s.d) return;
      var path = svgEl('path', { 'class': 'estado', d: s.d });
      var t = svgEl('title');
      t.textContent = nombreEstado(s.st);
      path.appendChild(t);
      gEstados.appendChild(path);
    });
    var gPuntos = svgEl('g');
    svg.appendChild(gTierra);
    svg.appendChild(gEstados);
    svg.appendChild(gPuntos);
    contenedor.appendChild(svg);
    nodos.svg = svg;
    nodos.gPuntos = gPuntos;

    gPuntos.addEventListener('click', function (ev) {
      var c = ev.target.closest ? ev.target.closest('circle') : null;
      if (!c) return;
      seleccionarLugar(c.getAttribute('data-clave'));
    });
    gPuntos.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      var c = ev.target;
      if (!c || c.tagName !== 'circle') return;
      ev.preventDefault();
      seleccionarLugar(c.getAttribute('data-clave'));
    });
  }

  function construirPie(contenedor) {
    var leyenda = el('div', { 'class': 'leyenda' });
    var l1 = el('span');
    l1.appendChild(el('span', { 'class': 'leyenda__muestra', 'aria-hidden': 'true' }));
    l1.appendChild(document.createTextNode('Ciudad de nacimiento'));
    var l2 = el('span');
    l2.appendChild(el('span', { 'class': 'leyenda__muestra leyenda__muestra--aprox', 'aria-hidden': 'true' }));
    l2.appendChild(document.createTextNode('Ubicación aproximada (centro del estado o del país)'));
    var cuenta = el('span', { id: 'mapa-cuenta', 'aria-live': 'polite' });
    leyenda.appendChild(l1);
    leyenda.appendChild(l2);
    leyenda.appendChild(cuenta);
    contenedor.appendChild(leyenda);
    nodos.cuenta = cuenta;

    var info = el('div', { 'class': 'mapa__info', id: 'mapa-info', 'aria-live': 'polite' });
    contenedor.appendChild(info);
    nodos.info = info;
    if (F && F.delegarApertura) F.delegarApertura(info);

    var resumen = el('div', { id: 'mapa-resumen' });
    contenedor.appendChild(resumen);
    nodos.resumen = resumen;
    resumen.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('button[data-pais], button[data-estado]') : null;
      if (!b) return;
      if (b.hasAttribute('data-pais')) seleccionarPais(b.getAttribute('data-pais'));
      else seleccionarEstado(b.getAttribute('data-estado'));
    });
  }

  // --- Dibujo -------------------------------------------------------------------

  function radio(n) { return Math.min(RADIO_TOPE, RADIO_BASE + 1.1 * Math.sqrt(n - 1)); }

  function dibujarPuntos(grupos) {
    var g = nodos.gPuntos;
    while (g.firstChild) g.removeChild(g.firstChild);
    var claves = Object.keys(grupos);
    // Los grupos grandes se dibujan primero para que los pequeños queden encima y sean clicables.
    claves.sort(function (a, b) { return grupos[b].jugadores.length - grupos[a].jugadores.length; });
    claves.forEach(function (k) {
      var gr = grupos[k];
      var n = gr.jugadores.length;
      var c = svgEl('circle', {
        'class': 'punto' + (gr.aprox ? ' punto--aprox' : ''),
        cx: x(gr.lon).toFixed(2),
        cy: y(gr.lat).toFixed(2),
        r: radio(n).toFixed(2),
        tabindex: '0',
        role: 'button',
        'data-clave': k
      });
      var etiqueta = nombreLugar(gr.ejemplo) + ' — ' + plural(n, 'jugador', 'jugadores');
      c.setAttribute('aria-label', etiqueta);
      var t = svgEl('title');
      t.textContent = etiqueta;
      c.appendChild(t);
      g.appendChild(c);
    });
  }

  function marcarActivo(clave) {
    var puntos = nodos.gPuntos.querySelectorAll('circle');
    for (var i = 0; i < puntos.length; i++) {
      if (clave && puntos[i].getAttribute('data-clave') === clave) puntos[i].classList.add('activo');
      else puntos[i].classList.remove('activo');
    }
  }

  function dibujarResumen(lista) {
    var paises = {}, estados = {}, sinLugar = 0;
    lista.forEach(function (p) {
      var kp = clavePais(p);
      if (!paises[kp]) paises[kp] = { clave: kp, nombre: nombrePais(p), n: 0 };
      paises[kp].n++;
      if (p.cc === 'US' && p.state) {
        if (!estados[p.state]) estados[p.state] = { clave: p.state, nombre: nombreEstado(p.state), n: 0 };
        estados[p.state].n++;
      }
      if (p.lat == null || p.lon == null) sinLugar++;
    });
    function ordenar(obj) {
      return Object.keys(obj).map(function (k) { return obj[k]; }).sort(function (a, b) {
        return b.n - a.n || a.nombre.localeCompare(b.nombre);
      });
    }
    function cuadro(items, attr) {
      var ul = el('ul', { 'class': 'cuadro' });
      items.forEach(function (it) {
        var li = el('li');
        var b = el('button', { type: 'button' }, it.nombre);
        b.setAttribute(attr, it.clave);
        li.appendChild(b);
        li.appendChild(el('span', null, String(it.n)));
        ul.appendChild(li);
      });
      return ul;
    }
    var r = nodos.resumen;
    while (r.firstChild) r.removeChild(r.firstChild);
    var lp = ordenar(paises), le = ordenar(estados);
    if (lp.length) {
      r.appendChild(el('h3', null, 'Por país'));
      r.appendChild(cuadro(lp, 'data-pais'));
    }
    if (le.length) {
      r.appendChild(el('h3', null, 'Por estado de Estados Unidos'));
      r.appendChild(cuadro(le, 'data-estado'));
    }
    if (sinLugar) {
      r.appendChild(el('p', { 'class': 'ficha__nota' },
        plural(sinLugar, 'jugador', 'jugadores') + ' de este filtro no ' + (sinLugar === 1 ? 'tiene' : 'tienen') +
        ' un lugar de nacimiento ubicable en el mapa; ' + (sinLugar === 1 ? 'cuenta' : 'cuentan') + ' en las cifras por país.'));
    }
    if (!lista.length) {
      r.appendChild(el('p', { 'class': 'ficha__nota' }, 'Ningún jugador coincide con este filtro.'));
    }
  }

  function redibujar() {
    var lista = jugadoresFiltrados();
    gruposActuales = agrupar(lista);
    dibujarPuntos(gruposActuales);
    var enMapa = 0;
    var claves = Object.keys(gruposActuales);
    claves.forEach(function (k) { enMapa += gruposActuales[k].jugadores.length; });
    nodos.cuenta.textContent = plural(enMapa, 'jugador', 'jugadores') + ' en el mapa · ' + plural(claves.length, 'lugar', 'lugares');
    dibujarResumen(lista);
    // Conserva la selección si sigue teniendo sentido con el nuevo filtro.
    if (seleccion) {
      if (seleccion.tipo === 'lugar') {
        if (gruposActuales[seleccion.clave]) seleccionarLugar(seleccion.clave); else limpiarInfo();
      } else if (seleccion.tipo === 'pais') {
        seleccionarPais(seleccion.clave, true);
      } else if (seleccion.tipo === 'estado') {
        seleccionarEstado(seleccion.clave, true);
      }
    }
  }

  // --- Info ----------------------------------------------------------------------

  function limpiarInfo() {
    seleccion = null;
    marcarActivo(null);
    nodos.info.innerHTML = '<p class="ficha__nota">Haz clic en un punto, un país o un estado para ver quiénes nacieron ahí.</p>';
  }

  function listar(titulo, jugadores) {
    var orden = ordenarPorAnio(jugadores);
    var html = '<p><strong>' + esc(titulo) + '</strong> · ' + esc(plural(orden.length, 'jugador', 'jugadores'));
    if (filtro.decada || filtro.alcance) html += ' <span style="color:var(--tinta-3)">(con el filtro activo)</span>';
    html += '</p>';
    if (orden.length) {
      html += '<ol class="lista">' + orden.map(function (p) { return F.filaJugador(p); }).join('') + '</ol>';
    } else {
      html += '<p class="ficha__nota">Ningún jugador con el filtro activo.</p>';
    }
    nodos.info.innerHTML = html;
  }

  function seleccionarLugar(clave) {
    var g = gruposActuales[clave];
    if (!g) return;
    seleccion = { tipo: 'lugar', clave: clave };
    marcarActivo(clave);
    listar(nombreLugar(g.ejemplo), g.jugadores);
  }

  function seleccionarPais(clave, silencioso) {
    var lista = jugadoresFiltrados().filter(function (p) { return clavePais(p) === clave; });
    if (!lista.length && silencioso) { limpiarInfo(); return; }
    seleccion = { tipo: 'pais', clave: clave };
    marcarActivo(null);
    var nombre = lista.length ? nombrePais(lista[0]) : (MUNDO.countryEs[clave] || clave);
    listar(nombre, lista);
    if (!silencioso) desplazarAInfo();
  }

  function seleccionarEstado(st, silencioso) {
    var lista = jugadoresFiltrados().filter(function (p) { return p.cc === 'US' && p.state === st; });
    if (!lista.length && silencioso) { limpiarInfo(); return; }
    seleccion = { tipo: 'estado', clave: st };
    marcarActivo(null);
    listar(nombreEstado(st) + ', Estados Unidos', lista);
    if (!silencioso) desplazarAInfo();
  }

  function desplazarAInfo() {
    try { nodos.info.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
  }

  // --- API ----------------------------------------------------------------------

  var iniciado = false;
  function init(contenedor) {
    if (iniciado || !contenedor) return;
    iniciado = true;
    while (contenedor.firstChild) contenedor.removeChild(contenedor.firstChild);
    construirControles(contenedor);
    construirSvg(contenedor);
    construirPie(contenedor);
    limpiarInfo();
    redibujar();
  }

  return { init: init };
})();
