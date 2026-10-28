// La Franela — buscador, fichas, sala latina, pestañas y tema.
(function () {
  'use strict';

  var F = window.Franela;
  var JUGADORES = window.FRANELA_PLAYERS || [];
  var META = window.FRANELA_META || {};
  var NUMEROS = window.FRANELA_NUMBERS || {};
  var $ = function (sel, raiz) { return (raiz || document).querySelector(sel); };

  // ------------------------------------------------------------------ tema
  (function tema() {
    var boton = $('#boton-tema');
    var raiz = document.documentElement;
    function esOscuro() {
      var t = raiz.getAttribute('data-tema');
      if (t) return t === 'oscuro';
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    function pintar() {
      var oscuro = esOscuro();
      boton.textContent = oscuro ? 'Modo claro' : 'Modo oscuro';
      boton.setAttribute('aria-pressed', oscuro ? 'true' : 'false');
    }
    boton.addEventListener('click', function () {
      var nuevo = esOscuro() ? 'claro' : 'oscuro';
      raiz.setAttribute('data-tema', nuevo);
      try { localStorage.setItem('franela-tema', nuevo); } catch (e) {}
      pintar();
    });
    pintar();
  })();

  // ------------------------------------------------------------------ cifras de cabecera
  (function cifras() {
    if (META.seasons) $('#meta-temporadas').textContent = META.seasons[0] + '–' + META.seasons[1];
    var paises = META.countries ? META.countries.length : 0;
    $('#meta-cifras').textContent = F.fmt(JUGADORES.length) + ' jugadores · ' + paises + ' países de nacimiento · ' +
      (META.latam || 0) + ' nacidos en América Latina · ' + (META.mex || 0) + ' mexicanos';
    $('#meta-lahman').textContent = META.lahmanVersion || '';
    $('#meta-pie').textContent = 'Datos generados el ' + (META.built || '') + '. ' + F.fmt(JUGADORES.length) +
      ' jugadores; ' + F.fmt(META.withNumbers || 0) + ' con al menos un número de uniforme atribuido; lugar de nacimiento ubicado por ciudad en ' +
      F.fmt((META.geo || {}).ciudad || 0) + ' casos, por estado en ' + F.fmt((META.geo || {}).estado || 0) +
      ' y por país en ' + F.fmt((META.geo || {}).pais || 0) + '.';
  })();

  // ------------------------------------------------------------------ pestañas (salas)
  var SALAS = ['archivo', 'mapa', 'latina', 'numeros', 'fuentes'];
  var iniciadas = {};
  function mostrarSala(nombre) {
    if (SALAS.indexOf(nombre) < 0) nombre = 'archivo';
    SALAS.forEach(function (s) {
      var sec = document.getElementById(s);
      if (sec) sec.hidden = (s !== nombre);
    });
    document.querySelectorAll('.pestana').forEach(function (a) {
      a.classList.toggle('activa', a.getAttribute('data-sala') === nombre);
    });
    if (!iniciadas[nombre]) {
      iniciadas[nombre] = true;
      if (nombre === 'mapa' && window.FranelaMapa) window.FranelaMapa.init($('#mapa-contenedor'));
      if (nombre === 'numeros' && window.FranelaNumeros) window.FranelaNumeros.init($('#numeros-contenedor'));
      if (nombre === 'latina') pintarSalaLatina();
    }
  }
  function leerHash() {
    // #sala, #sala/jugador=id, #numeros/n=42
    var h = (location.hash || '#archivo').slice(1);
    var partes = h.split('/');
    mostrarSala(partes[0]);
    var arg = partes[1] || '';
    if (arg.indexOf('jugador=') === 0) abrirFicha(decodeURIComponent(arg.slice(8)), true);
    if (partes[0] === 'numeros' && arg.indexOf('n=') === 0 && window.FranelaNumeros) window.FranelaNumeros.mostrar(arg.slice(2));
  }
  window.addEventListener('hashchange', leerHash);

  // ------------------------------------------------------------------ buscador
  var q = $('#q'), fPos = $('#f-pos'), fDec = $('#f-dec'), fNum = $('#f-num'), fOrden = $('#f-orden');
  var lista = $('#lista'), cuenta = $('#cuenta'), botonMas = $('#mas');
  var PAGINA = 100;
  var resultado = [], mostrados = 0;

  (function decadas() {
    var ds = {};
    JUGADORES.forEach(function (p) { p.decades.forEach(function (d) { ds[d] = true; }); });
    Object.keys(ds).sort().forEach(function (d) {
      var o = document.createElement('option');
      o.value = d; o.textContent = F.decadaEtiqueta(d);
      fDec.appendChild(o);
    });
  })();

  // índice de búsqueda: nombre normalizado + nombre completo
  JUGADORES.forEach(function (p) {
    p._clave = F.normalizar(p.name + ' ' + p.given + ' ' + p.last);
    p._nums = p.numbers.map(function (n) { return String(+n.n); });
  });

  function filtrar() {
    var texto = F.normalizar(q.value);
    var palabras = texto ? texto.split(' ') : [];
    var pos = fPos.value, dec = fDec.value ? +fDec.value : 0, num = fNum.value.replace(/\D/g, '');
    if (num) num = String(+num);
    resultado = JUGADORES.filter(function (p) {
      for (var i = 0; i < palabras.length; i++) if (p._clave.indexOf(palabras[i]) < 0) return false;
      if (pos) {
        if (pos === 'OF') { if (!p.pos.some(function (x) { return x === 'LF' || x === 'CF' || x === 'RF' || x === 'OF'; })) return false; }
        else if (p.pos.indexOf(pos) < 0) return false;
      }
      if (dec && p.decades.indexOf(dec) < 0) return false;
      if (num && p._nums.indexOf(num) < 0) return false;
      return true;
    });
    var orden = fOrden.value;
    if (orden === 'anio') resultado.sort(function (a, b) { return a.firstYr - b.firstYr || a._clave.localeCompare(b._clave); });
    else if (orden === 'juegos') resultado.sort(function (a, b) { return b.g - a.g || a._clave.localeCompare(b._clave); });
    else resultado.sort(function (a, b) { return a._clave.localeCompare(b._clave); });
    // nombre exacto primero cuando hay texto
    if (texto) {
      resultado.sort(function (a, b) {
        var ea = F.normalizar(a.name) === texto ? 0 : 1, eb = F.normalizar(b.name) === texto ? 0 : 1;
        return ea - eb;
      });
    }
    mostrados = 0;
    lista.innerHTML = '';
    pintarMas();
    var n = resultado.length;
    cuenta.textContent = n === JUGADORES.length ? F.fmt(n) + ' jugadores' :
      (n === 1 ? '1 jugador' : F.fmt(n) + ' jugadores') + ' de ' + F.fmt(JUGADORES.length);
  }

  function pintarMas() {
    var fin = Math.min(resultado.length, mostrados + PAGINA);
    var html = '';
    for (var i = mostrados; i < fin; i++) {
      var p = resultado[i];
      var extra = fNum.value ? 'Núm. ' + p.numbers.map(function (n) { return +n.n; }).join(', ') : '';
      html += F.filaJugador(p, extra);
    }
    lista.insertAdjacentHTML('beforeend', html);
    mostrados = fin;
    botonMas.hidden = mostrados >= resultado.length;
    botonMas.textContent = 'Mostrar más (' + F.fmt(resultado.length - mostrados) + ' restantes)';
  }

  var temporizador;
  q.addEventListener('input', function () { clearTimeout(temporizador); temporizador = setTimeout(filtrar, 60); });
  [fPos, fDec, fNum, fOrden].forEach(function (el) { el.addEventListener('input', filtrar); el.addEventListener('change', filtrar); });
  botonMas.addEventListener('click', pintarMas);
  F.delegarApertura(lista);

  // ------------------------------------------------------------------ ficha
  var dialogo = $('#ficha'), cuerpo = $('#ficha-cuerpo');
  var hashPrevio = null;

  function etiquetaNumero(n) {
    var txt = '';
    if (n.yrs && n.yrs.length) txt = rango(n.yrs);
    else if (n.src.indexOf('primary') >= 0) txt = 'número principal';
    else txt = 'sin años registrados';
    return txt;
  }

  function rango(yrs) {
    if (!yrs.length) return '';
    var out = [], ini = yrs[0], ant = yrs[0];
    for (var i = 1; i <= yrs.length; i++) {
      var y = yrs[i];
      if (y === ant + 1) { ant = y; continue; }
      out.push(ini === ant ? String(ini) : ini + '–' + ant);
      ini = ant = y;
    }
    return out.join(', ');
  }

  function tablaBateo(b) {
    var cols = ['G', 'AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'SB', 'BB', 'SO', 'AVG', 'OBP', 'SLG'];
    var es = { G: 'J', AB: 'VB', R: 'C', H: 'H', '2B': '2B', '3B': '3B', HR: 'HR', RBI: 'CI', SB: 'BR', BB: 'BB', SO: 'K', AVG: 'PROM', OBP: 'OBP', SLG: 'SLG' };
    var h = '<div class="tabla-envoltura"><table class="tabla"><thead><tr>';
    cols.forEach(function (c) { h += '<th title="' + c + '">' + es[c] + '</th>'; });
    h += '</tr></thead><tbody><tr>';
    cols.forEach(function (c) {
      var v = b[c];
      h += '<td>' + (c === 'AVG' || c === 'OBP' || c === 'SLG' ? F.num3(v) : F.fmt(v)) + '</td>';
    });
    return h + '</tr></tbody></table></div>';
  }

  function tablaPitcheo(p) {
    var cols = ['W', 'L', 'ERA', 'G', 'GS', 'CG', 'SHO', 'SV', 'IP', 'H', 'ER', 'HR', 'BB', 'SO'];
    var es = { W: 'G', L: 'P', ERA: 'EFE', G: 'J', GS: 'JI', CG: 'JC', SHO: 'BL', SV: 'SV', IP: 'IL', H: 'H', ER: 'CL', HR: 'HR', BB: 'BB', SO: 'K' };
    var h = '<div class="tabla-envoltura"><table class="tabla"><thead><tr>';
    cols.forEach(function (c) { h += '<th title="' + c + '">' + es[c] + '</th>'; });
    h += '</tr></thead><tbody><tr>';
    cols.forEach(function (c) {
      var v = p[c];
      if (c === 'ERA') v = v == null ? '—' : v.toFixed(2);
      else if (c === 'IP') v = v;
      else v = F.fmt(v);
      h += '<td>' + v + '</td>';
    });
    return h + '</tr></tbody></table></div>';
  }

  function abrirFicha(id, desdeHash) {
    var p = F.porId[id];
    if (!p) return;
    var e = F.escapar;
    var html = '<h2 class="ficha__nombre" id="ficha-nombre">' + e(p.name) + '</h2>';
    if (p.given && F.normalizar(p.given + ' ' + p.last) !== F.normalizar(p.name)) {
      html += '<p class="ficha__dado">' + e(p.given + ' ' + p.last) + '</p>';
    }
    var equipo = p.firstYr < 1913 ? (p.lastYr < 1913 ? 'Highlanders' : 'Highlanders y Yankees') : 'Yankees';
    html += '<p class="ficha__temporadas">' + equipo + ' · ' + e(p.span) + ' · ' + p.yrs.length + (p.yrs.length === 1 ? ' temporada' : ' temporadas') +
      ' · ' + F.fmt(p.g) + (p.g === 1 ? ' juego' : ' juegos') + '</p>';

    html += '<dl>';
    html += '<dt>Posición</dt><dd>' + e(F.posEs(p.primary)) +
      (p.pos.length > 1 ? ' <span style="color:var(--tinta-3)">(también ' + e(p.pos.slice(1).map(F.posEs).join(', ').toLowerCase()) + ')</span>' : '') + '</dd>';
    var lug = F.lugar(p);
    html += '<dt>Nacimiento</dt><dd>' + e(F.fecha(p.born) || 'sin registro') + (lug ? '<br>' + e(lug) : '') + '</dd>';
    if (p.died) html += '<dt>Fallecimiento</dt><dd>' + e(F.fecha(p.died)) + '</dd>';
    var bt = [];
    if (p.bats) bt.push('Batea: ' + ({ R: 'derecha', L: 'izquierda', B: 'ambas' }[p.bats] || p.bats));
    if (p.throws) bt.push('Lanza: ' + ({ R: 'derecha', L: 'izquierda', B: 'ambas', S: 'ambas' }[p.throws] || p.throws));
    if (bt.length) html += '<dt>Batea / lanza</dt><dd>' + e(bt.join(' · ')) + '</dd>';
    if (p.debut) html += '<dt>Debut en MLB</dt><dd>' + e(F.fechaISO(p.debut)) + '</dd>';
    if (p.final) html += '<dt>Último juego</dt><dd>' + e(F.fechaISO(p.final)) + '</dd>';
    html += '</dl>';

    html += '<h3>Números del uniforme</h3>';
    if (p.numbers.length) {
      html += '<ul class="ficha__numeros">';
      p.numbers.forEach(function (n) {
        html += '<li><a class="num" href="#numeros/n=' + (+n.n) + '">' + (+n.n) + '</a><small>' + e(etiquetaNumero(n)) + '</small></li>';
      });
      html += '</ul>';
      if (p.numbers.some(function (n) { return !n.yrs.length; })) {
        html += '<p class="ficha__nota">«Número principal»: número que la MLB Stats API asocia al jugador; se atribuye a los Yankees porque sólo jugó con el equipo en Grandes Ligas.</p>';
      }
    } else {
      html += '<p class="ficha__nota">Sin número atribuible en las fuentes' + (p.firstYr < 1929 && p.lastYr < 1929 ? ' (los Yankees no usaron números en la espalda hasta 1929)' : '') + '.</p>';
    }

    var esPitcher = p.primary === 'P';
    var bloques = [];
    if (p.pit && p.pit.G) bloques.push({ t: 'Pitcheo con los Yankees', h: tablaPitcheo(p.pit) });
    if (p.bat && (p.bat.AB > 0 || !esPitcher)) bloques.push({ t: 'Bateo con los Yankees', h: tablaBateo(p.bat) });
    if (!esPitcher) bloques.reverse();
    bloques.forEach(function (b) { html += '<h3>' + b.t + '</h3>' + b.h; });
    if (!bloques.length) html += '<h3>Números con los Yankees</h3><p class="ficha__nota">Sin estadísticas registradas (sólo apariciones).</p>';
    if (p.lastYr === (META.seasons ? META.seasons[1] : 2026)) {
      html += '<p class="ficha__nota">Incluye la temporada ' + p.lastYr + ' según la MLB Stats API; el resto proviene de la base Lahman.</p>';
    }

    html += '<p class="ficha__enlaces">Fuentes: ' + (p.src === 'lahman' ? 'SABR Lahman Database (ficha ' + e(p.id) + ')' : 'MLB Stats API') +
      (p.mlbam ? ' · <a href="https://www.mlb.com/player/' + p.mlbam + '" rel="noopener">MLB.com</a>' : '') +
      (p.bbref ? ' · <a href="https://www.baseball-reference.com/players/' + e(p.bbref.charAt(0)) + '/' + e(p.bbref) + '.shtml" rel="noopener">Baseball-Reference</a>' : '') +
      '</p>';

    cuerpo.innerHTML = html;
    if (!dialogo.open) {
      if (typeof dialogo.showModal === 'function') dialogo.showModal(); else dialogo.setAttribute('open', '');
    }
    $('.ficha__marco', dialogo).scrollTop = 0;
    if (!desdeHash) {
      hashPrevio = location.hash;
      var sala = (location.hash || '#archivo').slice(1).split('/')[0];
      history.replaceState(null, '', '#' + sala + '/jugador=' + encodeURIComponent(id));
    }
  }
  F.abrirFicha = abrirFicha;

  function cerrarFicha() {
    if (dialogo.open) dialogo.close(); else dialogo.removeAttribute('open');
    var sala = (location.hash || '#archivo').slice(1).split('/')[0];
    history.replaceState(null, '', '#' + sala);
  }
  $('#ficha-cerrar').addEventListener('click', cerrarFicha);
  dialogo.addEventListener('click', function (ev) { if (ev.target === dialogo) cerrarFicha(); });
  dialogo.addEventListener('cancel', function (ev) { ev.preventDefault(); cerrarFicha(); });
  // enlaces dentro de la ficha (a la sala de números) cierran la ficha
  cuerpo.addEventListener('click', function (ev) {
    var a = ev.target.closest('a[href^="#"]');
    if (a) { if (dialogo.open) dialogo.close(); }
  });

  // ------------------------------------------------------------------ sala latina
  function pintarSalaLatina() {
    var cont = $('#latina-contenedor');
    var latinos = JUGADORES.filter(function (p) { return p.latam; });
    var mexicanos = latinos.filter(function (p) { return p.mex; });
    var porPais = {};
    latinos.forEach(function (p) { (porPais[p.countryEs] = porPais[p.countryEs] || []).push(p); });
    var paises = Object.keys(porPais).sort(function (a, b) { return porPais[b].length - porPais[a].length || a.localeCompare(b); });
    var primero = latinos.slice().sort(function (a, b) { return a.firstYr - b.firstYr; })[0];

    $('#latina-intro').textContent = latinos.length + ' jugadores nacidos en América Latina han jugado con los Yankees, de ' + paises.length +
      ' países' + (primero ? '; el primero en las fuentes es ' + primero.name + ' (' + primero.countryEs + ', ' + primero.firstYr + ')' : '') +
      '. Se cuenta el país de nacimiento según la base Lahman y la MLB Stats API; no se registra la ascendencia.';

    var e = F.escapar;
    var html = '<h3>Los mexicanos</h3>';
    html += '<p class="sala__intro">' + mexicanos.length + ' jugadores nacidos en México, ordenados por su primera temporada con el equipo.</p>';
    var porEstado = {};
    mexicanos.forEach(function (p) { porEstado[p.stateName || 'sin estado registrado'] = (porEstado[p.stateName || 'sin estado registrado'] || 0) + 1; });
    html += '<ul class="cuadro" style="margin-bottom:16px">';
    Object.keys(porEstado).sort(function (a, b) { return porEstado[b] - porEstado[a] || a.localeCompare(b); }).forEach(function (s) {
      html += '<li>' + e(s) + '<span>' + porEstado[s] + '</span></li>';
    });
    html += '</ul>';
    html += '<ol class="lista">';
    mexicanos.sort(function (a, b) { return a.firstYr - b.firstYr || a._clave.localeCompare(b._clave); }).forEach(function (p) {
      html += F.filaJugador(p, resumenCorto(p));
    });
    html += '</ol>';

    html += '<h3>Por país</h3><ul class="cuadro">';
    paises.forEach(function (pais) {
      html += '<li><button type="button" data-pais="' + e(pais) + '">' + e(pais) + '</button><span>' + porPais[pais].length + '</span></li>';
    });
    html += '</ul>';
    html += '<div id="latina-pais"></div>';
    cont.innerHTML = html;
    F.delegarApertura(cont);

    function pintarPais(pais) {
      var js = porPais[pais].slice().sort(function (a, b) { return a.firstYr - b.firstYr || a._clave.localeCompare(b._clave); });
      var h = '<h3>' + e(pais) + ' · ' + js.length + (js.length === 1 ? ' jugador' : ' jugadores') + '</h3><ol class="lista">';
      js.forEach(function (p) { h += F.filaJugador(p, resumenCorto(p)); });
      $('#latina-pais').innerHTML = h + '</ol>';
      $('#latina-pais').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    cont.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-pais]');
      if (b) pintarPais(b.getAttribute('data-pais'));
    });
    if (paises.length) {
      var js = porPais[paises[0]].slice().sort(function (a, b) { return a.firstYr - b.firstYr; });
      var h = '<h3>' + e(paises[0]) + ' · ' + js.length + ' jugadores</h3><ol class="lista">';
      js.forEach(function (p) { h += F.filaJugador(p, resumenCorto(p)); });
      $('#latina-pais').innerHTML = h + '</ol>';
    }
  }

  // "12 J · 2-3, 4.50 EFE" o "120 J · .285, 12 HR"
  function resumenCorto(p) {
    if (p.primary === 'P' && p.pit) return p.pit.W + '-' + p.pit.L + (p.pit.ERA != null ? ', ' + p.pit.ERA.toFixed(2) + ' EFE' : '') + ' en ' + p.pit.G + ' J';
    if (p.bat && p.bat.AB) return F.num3(p.bat.AVG) + ', ' + p.bat.HR + ' HR, ' + p.bat.RBI + ' CI en ' + p.bat.G + ' J';
    return p.g + (p.g === 1 ? ' juego' : ' juegos');
  }

  // ------------------------------------------------------------------ arranque
  filtrar();
  leerHash();
})();
