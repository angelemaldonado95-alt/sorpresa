/* El Monumento — Sala «Este día en la historia».
   Muestra las efemérides de una fecha del calendario (MONUMENTO.efemerides),
   navegación por fecha con hash #MM-DD y la tabla fija de juegos sin hit (MONUMENTO.meta.sin_hit). */
(function () {
  'use strict';
  var M = window.MONUMENTO, U = M.util, esc = U.esc;
  var E = M.efemerides || {};
  var FECHAS = Object.keys(E).sort();           // las 366 claves «MM-DD», en orden
  var UMBRAL = 15;                               // peso mínimo para la lista principal
  var DIAS_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // Etiquetas en español para el tipo de evento (campo t)
  var TIPOS = {
    titulo: 'Título', serie: 'Serie Mundial', post: 'Postemporada', perfecto: 'Juego perfecto', sinhit: 'Sin hit',
    contra: 'Sin hit en contra', parque: 'Estadio', maraton: 'Extra innings', paliza: 'Ofensiva', inaugural: 'Día inaugural',
    debut: 'Debut', nacimiento: 'Nacimiento', fallecimiento: 'Fallecimiento', juego: 'Juego'
  };
  function etiqueta(t) { return TIPOS[t] || t; }

  // ---------- utilidades de fecha ----------
  function partes(md) { var p = md.split('-'); return [parseInt(p[0], 10), parseInt(p[1], 10)]; }
  function clave(mes, dia) { return (mes < 10 ? '0' : '') + mes + '-' + (dia < 10 ? '0' : '') + dia; }
  function fechaSinAno(md) { var p = partes(md); return p[1] + ' de ' + U.MESES[p[0] - 1]; }
  function esClaveValida(md) { return /^\d\d-\d\d$/.test(md) && E.hasOwnProperty(md); }
  function fechaDesdeHash() {
    var h = decodeURIComponent(location.hash.replace(/^#/, ''));
    return esClaveValida(h) ? h : U.hoyMD();
  }
  function vecina(md, paso) {
    var i = FECHAS.indexOf(md);
    if (i < 0) i = 0;
    return FECHAS[(i + paso + FECHAS.length) % FECHAS.length];
  }

  // ---------- selectores ----------
  var selMes = document.getElementById('sel-mes'), selDia = document.getElementById('sel-dia');
  function llenarMeses() {
    selMes.innerHTML = U.MESES.map(function (m, i) { return '<option value="' + (i + 1) + '">' + esc(m) + '</option>'; }).join('');
  }
  function llenarDias(mes, diaActual) {
    var n = DIAS_MES[mes - 1], h = '';
    for (var d = 1; d <= n; d++) h += '<option value="' + d + '">' + d + '</option>';
    selDia.innerHTML = h;
    selDia.value = String(Math.min(diaActual, n));
  }
  function sincronizarSelectores(md) {
    var p = partes(md);
    selMes.value = String(p[0]);
    llenarDias(p[0], p[1]);
  }
  function irA(md) {
    if (md === fechaDesdeHash() && location.hash) { pintar(md); return; }
    location.hash = md; // dispara hashchange → pintar
  }

  // ---------- fragmentos de HTML ----------
  function chip(t) {
    var cls = (t === 'titulo' || t === 'perfecto') ? 'chip titulo' : 'chip';
    return '<span class="' + cls + '">' + esc(etiqueta(t)) + '</span>';
  }
  function enlace(ev) {
    if (!ev.id) return '';
    var j = M.jugadores && M.jugadores[ev.id];
    var nombre = j ? j.n : ev.id;
    return ' <a class="enlace-jugador" href="' + U.enlaceJugador(ev.id) + '">Ficha de ' + esc(nombre) + '</a>';
  }
  function itemLista(ev) {
    return '<li>' +
      '<span class="ano">' + ev.a + '</span>' +
      '<div class="cuerpo">' + chip(ev.t) +
        '<p class="texto">' + esc(ev.x) + enlace(ev) + '</p>' +
      '</div></li>';
  }
  function porAno(a, b) { return a.a - b.a || b.w - a.w; }

  function textoRecord(md, rec) {
    var f = fechaSinAno(md);
    if (!rec) return 'Los Yankees nunca han jugado un partido de temporada regular un ' + esc(f) + '.';
    var marca = rec[0] + '-' + rec[1] + (rec[2] ? '-' + rec[2] : '');
    return 'En temporada regular, los Yankees tienen marca de <span class="num">' + marca + '</span> un ' + esc(f) + '.';
  }

  // ---------- pintar una fecha ----------
  function pintar(md) {
    var d = E[md] || { ev: [], rec: null };
    var ev = d.ev.slice();                       // ya viene ordenado por peso desc
    var esHoy = md === U.hoyMD();

    document.title = fechaSinAno(md) + ' — Este día en la historia — El Monumento';
    document.getElementById('dia-sobre').textContent = esHoy ? 'Hoy' : 'Fecha elegida';
    document.getElementById('dia-titulo').textContent = fechaSinAno(md);
    document.getElementById('dia-record').innerHTML = textoRecord(md, d.rec);

    var principal = ev.length ? ev[0] : null;
    var resto = ev.slice(1);
    var altos = resto.filter(function (e) { return e.w >= UMBRAL; }).sort(porAno);
    var bajos = resto.filter(function (e) { return e.w < UMBRAL; }).sort(porAno);

    // Principal, destacada en grande con serifa
    var dest = document.getElementById('destacado');
    if (principal) {
      dest.innerHTML =
        '<div class="meta"><span class="ano">' + principal.a + '</span>' + chip(principal.t) + '</div>' +
        '<p class="texto">' + esc(principal.x) + '</p>' +
        (principal.id ? '<p class="peq">' + enlace(principal).trim() + '</p>' : '');
    } else {
      dest.innerHTML = '';
    }

    // Lista cronológica de los demás eventos relevantes
    var lista = document.getElementById('lista');
    if (altos.length) {
      lista.innerHTML = '<p class="etiqueta-sobre">' + (principal ? 'Y también, por año' : 'Por año') + '</p>' +
        '<ul class="cronologia">' + altos.map(itemLista).join('') + '</ul>';
    } else if (!principal) {
      lista.innerHTML = '<p class="peq">No hay efemérides registradas para esta fecha.</p>';
    } else {
      lista.innerHTML = '';
    }

    // Eventos de peso bajo, colapsados
    var tambien = document.getElementById('tambien');
    if (bajos.length) {
      tambien.setAttribute('data-n', bajos.length);
      tambien.open = false;
      tambien.innerHTML = '<summary>También en esta fecha <span class="peq">' + bajos.length + ' ' + U.plural(bajos.length, 'registro') + '</span></summary>' +
        '<ul class="cronologia">' + bajos.map(itemLista).join('') + '</ul>';
    } else {
      tambien.removeAttribute('data-n');
      tambien.innerHTML = '';
    }

    sincronizarSelectores(md);
  }

  // ---------- tabla de juegos sin hit ----------
  function pintarSinHit() {
    var lista = ((M.meta && M.meta.sin_hit) || []).slice().sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
    var perfectos = lista.filter(function (s) { return s.perfecto; }).length;
    document.getElementById('sin-hit-resumen').textContent =
      lista.length + ' ' + U.plural(lista.length, 'juego') + ' sin hit, ' + perfectos + ' de ellos ' + U.plural(perfectos, 'perfecto') +
      '. Cada fecha enlaza a sus efemérides.';
    var tbody = document.querySelector('#tabla-sin-hit tbody');
    tbody.innerHTML = lista.map(function (s) {
      var md = s.fecha.slice(5);
      return '<tr' + (s.tipo === 'WS' ? ' class="ws"' : '') + '>' +
        '<td><a href="#' + md + '">' + esc(U.fechaLarga(s.fecha)) + '</a></td>' +
        '<td>' + (s.id ? '<a href="' + U.enlaceJugador(s.id) + '">' + esc(s.pitcher) + '</a>' : esc(s.pitcher)) +
          (s.combinado ? ' <span class="peq">(combinado)</span>' : '') + '</td>' +
        '<td>' + esc(s.rivalN || s.rival) + '</td>' +
        '<td class="num">' + s.ny + '-' + s.op + '</td>' +
        '<td class="num">' + s.k + '</td>' +
        '<td>' + (s.perfecto ? 'Sí' : 'No') + '</td>' +
        '<td>' + (s.tipo === 'WS' ? 'Serie Mundial' : 'Temporada regular') + '</td>' +
      '</tr>';
    }).join('');
  }

  // ---------- eventos ----------
  llenarMeses();
  document.getElementById('dia-anterior').addEventListener('click', function () { irA(vecina(fechaDesdeHash(), -1)); });
  document.getElementById('dia-siguiente').addEventListener('click', function () { irA(vecina(fechaDesdeHash(), 1)); });
  document.getElementById('ir-hoy').addEventListener('click', function () { irA(U.hoyMD()); });
  selMes.addEventListener('change', function () {
    var mes = parseInt(selMes.value, 10), dia = parseInt(selDia.value, 10) || 1;
    irA(clave(mes, Math.min(dia, DIAS_MES[mes - 1])));
  });
  selDia.addEventListener('change', function () { irA(clave(parseInt(selMes.value, 10), parseInt(selDia.value, 10))); });
  window.addEventListener('hashchange', function () { pintar(fechaDesdeHash()); });

  pintar(fechaDesdeHash());
  pintarSinHit();

  M.montarPie([
    'Juegos, marcadores, juegos sin hit, estadios y récord por fecha: game logs de Retrosheet (1903–2025), temporada regular y postemporada.',
    'Debuts, nacimientos y fallecimientos: Lahman Baseball Database (People, Appearances).',
    'Postemporada 2026: MLB Stats API.',
    'Las efemérides se derivan automáticamente de esos registros; no incluyen hechos que no estén en ellos.'
  ]);
})();
