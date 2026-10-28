/* El Monumento — sala Monument Park
   Muro de números retirados (MONUMENTO.retirados) y ficha de cada leyenda
   construida a partir de MONUMENTO.jugadores y MONUMENTO.temporadas. */
(function () {
  'use strict';
  var M = window.MONUMENTO;
  var U = M.util, esc = U.esc, B = U.B, P = U.P;
  var retirados = (M.retirados || []).slice();
  var jugadores = M.jugadores || {};

  // ---------- claves de hash ----------
  // Cada placa tiene una clave: el id de Lahman si existe, o «num-apellido» si no (Jackie Robinson).
  function slugApellido(n) {
    return n.split(' ').pop().toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
  }
  function claveDe(r) { return r.id || (r.num + '-' + slugApellido(r.n)); }
  function buscarPorHash(h) {
    h = decodeURIComponent((h || '').replace(/^#/, ''));
    if (!h) return null;
    for (var i = 0; i < retirados.length; i++) {
      var r = retirados[i];
      if (claveDe(r) === h || (r.num + '-' + slugApellido(r.n)) === h) return r;
    }
    return null;
  }

  // ---------- muro de placas ----------
  function montarMuro() {
    var cont = document.getElementById('placas');
    cont.innerHTML = retirados.map(function (r) {
      var k = claveDe(r);
      return '<button type="button" class="placa' + (r.toda_mlb ? ' toda-mlb' : '') + '" role="listitem" data-clave="' + esc(k) + '" aria-pressed="false"' +
        ' aria-label="Número ' + r.num + ', ' + esc(r.n) + ', retirado en ' + r.retirado + '">' +
        '<span class="num-grande">' + r.num + '</span>' +
        '<span class="nombre">' + esc(r.n) + '</span>' +
        '<span class="retiro">' + (r.toda_mlb ? 'Toda MLB · ' : 'Retirado · ') + r.retirado + '</span>' +
        '</button>';
    }).join('');
    cont.addEventListener('click', function (ev) {
      var b = ev.target.closest('.placa');
      if (!b) return;
      var k = b.getAttribute('data-clave');
      if (location.hash.replace(/^#/, '') === k) mostrar(k, true); else location.hash = k;
    });
  }
  function marcarActiva(clave) {
    var placas = document.querySelectorAll('.placa');
    for (var i = 0; i < placas.length; i++) {
      placas[i].setAttribute('aria-pressed', placas[i].getAttribute('data-clave') === clave ? 'true' : 'false');
    }
  }

  // ---------- piezas de la ficha ----------
  function dato(etq, val, esNum) {
    if (val === null || val === undefined || val === '') return '';
    return '<div class="dato"><span class="etiqueta">' + etq + '</span><span class="valor' + (esNum ? ' num' : '') + '">' + val + '</span></div>';
  }
  function lugarYFecha(fecha, lugar) {
    var f = U.fechaCorta(fecha);
    if (!f) return '';
    return esc(f) + (lugar ? '<br><small>' + esc(lugar) + '</small>' : '');
  }
  function prom3(x) { return x.toFixed(3).replace(/^0/, ''); }

  // Tabla de bateo, temporada por temporada, con totales. Solo filas con turnos.
  function tablaBateo(j) {
    var filas = (j.b || []).filter(function (f) { return f[B.AB] > 0; });
    if (!filas.length) return '';
    var t = U.totalesBateo({ b: filas });
    function fila(f) {
      var tb = f[B.H] + f[B.D2] + 2 * f[B.D3] + 3 * f[B.HR];
      var obpDen = f[B.AB] + f[B.BB] + f[B.HBP] + f[B.SF];
      var celdas = [f[B.G], f[B.AB], f[B.R], f[B.H], f[B.D2], f[B.D3], f[B.HR], f[B.RBI], f[B.SB], f[B.BB], f[B.SO],
        U.prom(f[B.H], f[B.AB]), obpDen ? prom3((f[B.H] + f[B.BB] + f[B.HBP]) / obpDen) : '—', U.prom(tb, f[B.AB])];
      return '<tr><td><a href="' + U.enlaceTemporada(f[B.A]) + '">' + f[B.A] + '</a></td>' +
        celdas.map(function (c) { return '<td class="num">' + c + '</td>'; }).join('') + '</tr>';
    }
    var tot = [t.G, t.AB, t.R, t.H, t.D2, t.D3, t.HR, t.RBI, t.SB, t.BB, t.SO, prom3(t.AVG), prom3(t.OBP), prom3(t.SLG)];
    return '<h3>Bateo con los Yankees <span class="peq">' + filas.length + ' ' + U.plural(filas.length, 'temporada') + '</span></h3>' +
      '<div class="tabla-scroll"><table class="tabla"><thead><tr><th>Año</th>' +
      ['G', 'AB', 'R', 'H', '2B', '3B', 'HR', 'RBI', 'SB', 'BB', 'SO', 'AVG', 'OBP', 'SLG'].map(function (h) { return '<th class="num">' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + filas.map(fila).join('') + '</tbody>' +
      '<tfoot><tr><td>Totales</td>' + tot.map(function (c) { return '<td class="num">' + c + '</td>'; }).join('') + '</tr></tfoot></table></div>';
  }

  // Tabla de pitcheo, temporada por temporada, con totales. Solo filas con entradas lanzadas.
  function tablaPitcheo(j) {
    var filas = (j.p || []).filter(function (f) { return f[P.IPO] > 0; });
    if (!filas.length) return '';
    var t = U.totalesPitcheo({ p: filas });
    function whip(bb, h, ipo) { return ipo ? ((bb + h) / (ipo / 3)).toFixed(2) : '—'; }
    function fila(f) {
      var celdas = [f[P.W], f[P.L], f[P.G], f[P.GS], f[P.CG], f[P.SHO], f[P.SV], U.ip(f[P.IPO]), f[P.H], f[P.ER], f[P.BB], f[P.SO],
        U.era(f[P.ER], f[P.IPO]), whip(f[P.BB], f[P.H], f[P.IPO])];
      return '<tr><td><a href="' + U.enlaceTemporada(f[P.A]) + '">' + f[P.A] + '</a></td>' +
        celdas.map(function (c) { return '<td class="num">' + c + '</td>'; }).join('') + '</tr>';
    }
    var tot = [t.W, t.L, t.G, t.GS, t.CG, t.SHO, t.SV, U.ip(t.IPO), t.H, t.ER, t.BB, t.SO, t.ERA.toFixed(2), t.WHIP.toFixed(2)];
    return '<h3>Pitcheo con los Yankees <span class="peq">' + filas.length + ' ' + U.plural(filas.length, 'temporada') + '</span></h3>' +
      '<div class="tabla-scroll"><table class="tabla"><thead><tr><th>Año</th>' +
      ['W', 'L', 'G', 'GS', 'CG', 'SHO', 'SV', 'IP', 'H', 'ER', 'BB', 'SO', 'ERA', 'WHIP'].map(function (h) { return '<th class="num">' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + filas.map(fila).join('') + '</tbody>' +
      '<tfoot><tr><td>Totales</td>' + tot.map(function (c) { return '<td class="num">' + c + '</td>'; }).join('') + '</tr></tfoot></table></div>';
  }

  // Premios ganados en años con NY, uno por línea.
  function listaPremios(premios) {
    if (!premios || !premios.length) return '';
    return '<h3>Premios con los Yankees <span class="peq">' + premios.length + '</span></h3>' +
      '<ul class="lista-limpia premios-lista">' + premios.map(function (p) {
        return '<li><span class="ano">' + p[0] + '</span>' + esc(p[1]) + '</li>';
      }).join('') + '</ul>';
  }

  // Rango de años de mánager en texto: 1949–1960, o lista de tramos si hubo huecos.
  function tramosAnos(anos) {
    var tramos = [], ini = null, prev = null;
    anos.slice().sort(function (a, b) { return a - b; }).forEach(function (a) {
      if (ini === null) { ini = prev = a; return; }
      if (a === prev + 1) { prev = a; return; }
      tramos.push(ini === prev ? String(ini) : ini + '–' + prev);
      ini = prev = a;
    });
    if (ini !== null) tramos.push(ini === prev ? String(ini) : ini + '–' + prev);
    return tramos.join(', ');
  }
  function bloqueManager(mgr) {
    if (!mgr) return '';
    var ws = mgr.ws || [];
    var html = '<h3>Como mánager de los Yankees</h3><div class="datos">' +
      dato('Años', esc(tramosAnos(mgr.anos || []))) +
      dato('Temporadas', (mgr.anos || []).length, true) +
      dato('Récord', U.miles(mgr.w) + '–' + U.miles(mgr.l), true) +
      dato('Porcentaje', U.pct(mgr.w, mgr.l), true) +
      dato('Series Mundiales ganadas', ws.length, true) +
      '</div>';
    if (ws.length) {
      html += '<p class="nota">Series Mundiales ganadas dirigiendo al equipo: ' + ws.map(function (a) {
        return '<a href="' + U.enlaceTemporada(a) + '">' + a + '</a>';
      }).join(', ') + '.</p>';
    }
    return html;
  }

  // ---------- ficha completa ----------
  function fichaHTML(r) {
    var j = r.id ? jugadores[r.id] : null;
    var f = j || r.ficha || {};
    var chips = '<span class="chip">Número retirado en ' + r.retirado + '</span>';
    if (r.toda_mlb) chips += '<span class="chip titulo">Retirado en toda MLB</span>';
    if (f.hof) chips += '<span class="chip titulo">Salón de la Fama ' + f.hof + '</span>';
    var html = '<article class="leyenda">' +
      '<div class="leyenda-cabeza"><div class="num-ficha">' + r.num + '</div><div class="titular">' +
      '<p class="etiqueta-sobre">Monument Park</p><h2>' + esc(r.n) + '</h2><div class="chips">' + chips + '</div></div></div>';

    // Jackie Robinson: el 42 está retirado en toda MLB y no hay ficha en los datos de los Yankees.
    if (!j && !r.ficha) {
      html += '<p class="leyenda-vacia">El número 42 está retirado en toda la MLB en honor a ' + esc(r.n) +
        ' desde ' + r.retirado + ', y por eso figura entre los números retirados de los Yankees. ' +
        'Este museo solo guarda fichas de quienes jugaron o dirigieron al equipo, así que no hay más datos que mostrar aquí.</p></article>';
      return html;
    }

    var datos = '';
    if (j) {
      datos += dato('Posición principal', esc(U.posicion(j.pos)));
      datos += dato('Con los Yankees', esc(U.rangoAnos(j)), true);
      if (j.bt) datos += dato('Batea / lanza', esc(U.lado(j.bt[0]) + ' / ' + U.lado(j.bt[1])));
    }
    datos += dato('Nacimiento', lugarYFecha(f.nac, f.lugar));
    if (f.mue) datos += dato('Fallecimiento', esc(U.fechaCorta(f.mue)));
    if (f.hof) datos += dato('Salón de la Fama', f.hof, true);
    if (j && j.debut) datos += dato('Debut en MLB', esc(U.fechaLarga(j.debut)));
    html += '<div class="datos">' + datos + '</div>';

    if (j) {
      // Pitchers: solo su pitcheo. Bateadores: bateo y, si lanzaron (Ruth), también pitcheo.
      if (U.esPitcher(j)) {
        html += tablaPitcheo(j);
      } else {
        html += tablaBateo(j) + tablaPitcheo(j);
      }
      html += listaPremios(j.premios);
    }
    html += bloqueManager(r.mgr);

    html += '<div class="acciones-ficha">';
    if (j) html += '<a class="boton" href="' + U.enlaceJugador(r.id) + '">Comparar en el Duelo</a> <a class="boton" href="' + U.enlaceFranela(r.id) + '">Ver su ficha en La Franela</a>';
    html += '</div></article>';
    return html;
  }

  var contFicha = document.getElementById('ficha');
  function mostrar(clave, desplazar) {
    var r = buscarPorHash(clave);
    marcarActiva(r ? claveDe(r) : '');
    if (!r) {
      contFicha.innerHTML = '<p class="leyenda-vacia">Elige una placa del muro para abrir la ficha de esa leyenda.</p>';
      return;
    }
    contFicha.innerHTML = fichaHTML(r);
    document.title = r.n + ' · Monument Park — El Monumento';
    if (desplazar) document.getElementById('ficha-seccion').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  montarMuro();
  mostrar(location.hash, false);
  window.addEventListener('hashchange', function () { mostrar(location.hash, true); });

  M.montarPie([
    'Lista de números retirados y año de retiro: sitio oficial de los New York Yankees en MLB.com (Retired Numbers).',
    'Fichas y estadísticas de carrera con los Yankees: Lahman Baseball Database (People, Batting, Pitching, Managers, HallOfFame, AwardsPlayers).'
  ]);
})();
