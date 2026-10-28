// Sala de números: rejilla del 0 al 99 y detalle de quién llevó cada número.
window.FranelaNumeros = (function () {
  'use strict';

  var F = window.Franela;
  var DATOS = window.FRANELA_NUMBERS || {};

  var contenedor = null;
  var rejilla = null;
  var detalle = null;
  var entrada = null;
  var activo = null;

  function escapar(s) { return F ? F.escapar(s) : String(s == null ? '' : s); }

  // [1995, 1996, 1998] -> "1995–1996, 1998"
  function rango(anios) {
    if (!anios || !anios.length) return '';
    var lista = anios.slice().map(Number).sort(function (a, b) { return a - b; });
    var partes = [];
    var inicio = lista[0];
    var fin = lista[0];
    for (var i = 1; i <= lista.length; i++) {
      var a = lista[i];
      if (a === fin) continue;
      if (a === fin + 1) { fin = a; continue; }
      partes.push(inicio === fin ? String(inicio) : inicio + '–' + fin);
      inicio = fin = a;
    }
    return partes.join(', ');
  }

  function normalizarNumero(n) {
    var s = String(n == null ? '' : n).replace(/\D/g, '');
    if (!s) return null;
    var v = parseInt(s, 10);
    if (isNaN(v) || v < 0 || v > 99) return null;
    return String(v);
  }

  function registros(n) { return DATOS[n] || []; }

  function etiquetaCuenta(c) {
    if (c === 0) return 'sin registro';
    return c === 1 ? '1 jugador' : c + ' jugadores';
  }

  function cobertura() {
    var numeros = 0;
    var ids = {};
    var jugadores = 0;
    for (var n = 0; n < 100; n++) {
      var r = registros(String(n));
      if (!r.length) continue;
      numeros++;
      r.forEach(function (e) { if (!ids[e.id]) { ids[e.id] = true; jugadores++; } });
    }
    return { numeros: numeros, jugadores: jugadores };
  }

  function pintarControles() {
    var cob = cobertura();
    var html = '';
    html += '<div class="controles">' +
      '<label class="control"><span>Ir al número</span>' +
      '<input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" placeholder="42" aria-label="Ir al número" style="width:5em"></label>' +
      '</div>';
    html += '<p class="ficha__nota">Con registro: ' + cob.numeros + ' números, ' + cob.jugadores +
      ' jugadores con número atribuido. Fuente de cada número: el roster de la temporada o las entradas de roster del jugador en la MLB Stats API (con año), ' +
      'el roster histórico del equipo (sin año) o el número principal del jugador según la API, atribuido sólo cuando jugó únicamente con los Yankees en Grandes Ligas (sin año). ' +
      'Cuando no hay año, la fila lo indica.</p>';
    var envoltura = document.createElement('div');
    envoltura.innerHTML = html;
    entrada = envoltura.querySelector('input');
    entrada.addEventListener('input', function () {
      var n = normalizarNumero(entrada.value);
      if (n !== null) mostrar(n, true);
    });
    entrada.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        var n = normalizarNumero(entrada.value);
        if (n !== null) mostrar(n);
      }
    });
    while (envoltura.firstChild) contenedor.appendChild(envoltura.firstChild);
  }

  function pintarRejilla() {
    rejilla = document.createElement('ul');
    rejilla.className = 'numeros__rejilla';
    var html = '';
    for (var n = 0; n < 100; n++) {
      var c = registros(String(n)).length;
      html += '<li><button type="button" class="numeros__celda' + (c ? '' : ' vacio') + '"' +
        (c ? '' : ' disabled') + ' data-numero="' + n + '" aria-label="Número ' + n + ', ' + etiquetaCuenta(c) + '">' +
        n + '<small>' + etiquetaCuenta(c) + '</small></button></li>';
    }
    rejilla.innerHTML = html;
    rejilla.addEventListener('click', function (ev) {
      var celda = ev.target.closest('.numeros__celda');
      if (!celda || celda.disabled) return;
      mostrar(celda.getAttribute('data-numero'));
    });
    contenedor.appendChild(rejilla);
  }

  function extraDe(e) {
    if (e.yrs && e.yrs.length) return 'Con el número ' + activo + ': ' + rango(e.yrs);
    return 'Años con el número sin registro por temporada';
  }

  function pintarDetalle(n) {
    var r = registros(n);
    var html = '<h3><span class="num">' + escapar(n) + '</span> ' + etiquetaCuenta(r.length) + '</h3>';
    if (r.length) {
      html += '<ol class="lista">';
      r.forEach(function (e) {
        var p = (F && F.porId[e.id]) || { id: e.id, name: e.name, span: e.span };
        html += F ? F.filaJugador(p, extraDe(e)) :
          '<li class="lista__fila" data-id="' + escapar(e.id) + '">' + escapar(e.name) + '</li>';
      });
      html += '</ol>';
    } else {
      html += '<p class="ficha__nota">Ningún jugador aparece con este número en las fuentes.</p>';
    }
    detalle.innerHTML = html;
  }

  // Muestra el número n. Con `silencioso` no se desplaza la vista ni se toca el campo de búsqueda.
  function mostrar(n, silencioso) {
    if (!contenedor) return;
    n = normalizarNumero(n);
    if (n === null) return;
    activo = n;
    var celdas = rejilla.querySelectorAll('.numeros__celda');
    for (var i = 0; i < celdas.length; i++) {
      var es = celdas[i].getAttribute('data-numero') === n;
      celdas[i].classList.toggle('activo', es);
      if (es) celdas[i].setAttribute('aria-pressed', 'true');
      else celdas[i].removeAttribute('aria-pressed');
    }
    pintarDetalle(n);
    if (!silencioso) {
      if (entrada && entrada.value !== n) entrada.value = n;
      if (detalle.scrollIntoView && typeof window.scrollTo === 'function') {
        try { detalle.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
      }
    }
  }

  function init(el) {
    if (contenedor) return;
    contenedor = el || document.getElementById('numeros-contenedor');
    if (!contenedor) return;
    contenedor.innerHTML = '';
    pintarControles();
    pintarRejilla();
    detalle = document.createElement('div');
    detalle.className = 'numeros__detalle';
    detalle.setAttribute('aria-live', 'polite');
    contenedor.appendChild(detalle);
    if (F && F.delegarApertura) F.delegarApertura(detalle);
  }

  return { init: init, mostrar: mostrar, rango: rango };
})();
