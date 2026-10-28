/*
 * motor.js — Motor de simulación de béisbol de «El Simulador».
 *
 * Sin DOM, sin dependencias, ES2017. Se exporta como `SimMotor` (CommonJS o
 * window). Recibe los datos de `SIM_DATOS` (temporadas y liga) a través de los
 * argumentos de sus funciones; nunca los lee de una variable global.
 *
 * ---------------------------------------------------------------------------
 * ¿QUÉ VIENE DE LOS DATOS Y QUÉ ES DEL MODELO?
 * ---------------------------------------------------------------------------
 * De los datos (Lahman, vía data/*.js):
 *   - Tasas por aparición al plato (PA) de cada bateador: 1B, 2B, 3B, HR, BB,
 *     HBP, K y out en juego. PA = AB + BB + HBP + SF + SH.
 *   - Tasas por bateador enfrentado (BF) de cada lanzador: HR, BB, HBP, K,
 *     hits que no son HR (repartidos en 1B/2B/3B con la proporción de la liga
 *     de su año, porque Lahman no trae 2B/3B permitidos) y out en juego.
 *   - Tasas de la Liga Americana por año y del entorno de referencia (`ref`),
 *     usadas para rellenar campos nulos y para normalizar por época.
 *   - Tasa de doble play del bateador: GIDP / (1B + BB + HBP).
 *   - Robo: intentos (SB+CS)/(1B+BB+HBP) y éxito SB/(SB+CS) del corredor.
 *   - Errores de la defensa: E / BIPc del equipo real.
 *   - Presupuesto de fatiga: BFP/GS del abridor y BFP/G del relevista.
 *   - Rotación (por GS), cerrador (más SV) y lineup (por juegos en posición
 *     y PA) sugeridos a partir de la temporada real.
 *
 * Del modelo (constantes documentadas en `MODELO`, abajo): regresión a la
 * media para muestras chicas, reparto rola/elevado/línea de los outs en
 * juego, avance de corredores, elevados de sacrificio, fatiga, reglas del
 * manager para cambiar lanzador, uso del cerrador, perfil de bateo de un
 * lanzador sin datos de bateo y la carga de trabajo del abridor del equipo
 * neutro. Nada de esto está en Lahman; son supuestos razonables del juego.
 *
 * ---------------------------------------------------------------------------
 * NORMALIZACIÓN POR ÉPOCA
 * ---------------------------------------------------------------------------
 * Para cada evento e, la tasa r del jugador se convierte en
 *     r × (entorno_e / ligaAño_e)
 * donde entorno_e es la tasa del entorno del juego y ligaAño_e la de la AL
 * ese año. Cuando los dos equipos son del mismo año el entorno es la propia
 * liga de ese año (el factor es 1 y el juego se ve como en su época; así se
 * calibra contra las cifras reales). Cuando son de años distintos el entorno
 * es `ref` (la AL 1903–2025 agregada), de modo que Ruth 1927 y Judge 2022 se
 * comparan en el mismo escenario. Luego, por evento, se combinan bateador (b),
 * lanzador (p) y entorno (L) con el método log5 en forma de razón de momios:
 *     momios = (b/(1-b)) · (p/(1-p)) / (L/(1-L)),  prob = momios/(1+momios)
 * y el vector de eventos se renormaliza a 1. No hay ventaja de mano (zurdo vs
 * derecho): Lahman no la trae y no la inventamos.
 *
 * Simplificaciones declaradas: no hay bateadores emergentes (sin DH, el
 * relevista ocupa el puesto del lanzador en el orden), no hay lesiones (en
 * una serie el lineup titular juega todos los días; en `simularTemporada` se
 * activa la opción `descansos`, con la que cada titular cede su puesto a un
 * suplente con la probabilidad que la banca real tuvo de las PA del equipo,
 * porque sin eso un equipo con titulares lesionados medio año, como el de
 * 2009, anota de más al compararlo con su cifra real), no hay corredor
 * fantasma en extra innings, el jardín es «OF» genérico salvo para la
 * narración, y el campo `direccion` de cada jugada es puramente cosmético.
 */
var SimMotor = (function () {
  'use strict';

  // =========================================================================
  // Constantes del MODELO (no vienen de los datos)
  // =========================================================================
  var MODELO = {
    // Regresión a la media: a cada bateador se le mezclan
    // max(0, PA_PLENO - PA) apariciones de la liga de su año. Con 5 PA la
    // mezcla es casi pura liga; a partir de PA_PLENO no hay regresión, así
    // no se altera a los regulares y no hay escalón en 50 PA.
    PA_PLENO: 120,
    BF_PLENO: 150,            // lo mismo para lanzadores, en BF

    // Reparto del out en juego (bola bateada que fue out).
    FRAC_ROLA: 0.50,
    FRAC_ELEVADO: 0.38,
    FRAC_LINEA: 0.12,

    // Doble play: prob. de DP dado un rola-out con corredor en 1ª y <2 outs
    // = tasaGIDP_por_oportunidad / (tasa de rola-out de referencia). Tope:
    DP_MAX: 0.80,

    // Elevado con corredor en 3ª y <2 outs: fly de sacrificio con esta prob.
    P_SF: 0.52,
    // Elevado: corredor en 2ª (sin nadie en 3ª) avanza a 3ª con esta prob.
    P_TAG_2A3: 0.18,
    // Rola out (no DP): corredor no forzado en 3ª anota / en 2ª avanza.
    P_ANOTA_3_ROLA: 0.45,
    P_AVANZA_2_ROLA: 0.40,

    // Avance de corredores en hits (menos de 2 outs / con 2 outs).
    AV_1A3_SENCILLO: 0.28,  AV_1A3_SENCILLO_2OUTS: 0.38,
    AV_2AH_SENCILLO: 0.60,  AV_2AH_SENCILLO_2OUTS: 0.78,
    AV_1AH_DOBLE: 0.42,     AV_1AH_DOBLE_2OUTS: 0.60,

    // Robo: el intento 2ª→3ª se hace con esta fracción de la tasa del corredor.
    ROBO_2A3_FACTOR: 0.15,
    ROBO_INTENTO_MAX: 0.45,

    // Fatiga: pasado el presupuesto de BF, los eventos negativos del lanzador
    // se multiplican por 1 + FATIGA_PENDIENTE × (BF/presupuesto - 1), con tope.
    FATIGA_PENDIENTE: 0.8,
    FATIGA_MAX: 1.6,

    // Manager.
    PRESUPUESTO_MIN_ABRIDOR: 15,
    PRESUPUESTO_MIN_RELEVISTA: 3,
    TOPE_ABRIDOR: 1.25,       // cambio obligado al 125 % del presupuesto
    TOPE_RELEVISTA: 1.5,
    CARRERAS_KO: 6,           // ≥6 carreras antes de la 5ª: fuera
    ENTRADA_KO: 5,
    SV_MIN_CERRADOR: 5,
    PRESUPUESTO_MIN_CERRADOR: 4,

    // Bateo de un lanzador sin datos de bateo: tasas de liga escaladas.
    BATEO_LANZADOR_SIN_DATOS: { '1B': 0.65, '2B': 0.5, '3B': 0.5, HR: 0.25, BB: 0.6, HBP: 0.7, K: 1.8 },

    // Equipo neutro: fracción de los PA de un juego que cubre el abridor,
    // por era (año desde el que aplica, fracción).
    ABRIDOR_NEUTRO: [[1900, 0.80], [1950, 0.70], [1990, 0.65], [2010, 0.58]],
    RELEVISTA_NEUTRO_BF: 6,   // presupuesto de los relevistas neutros
    PA_BATEADOR_NEUTRO: 650,

    // Dirección del batazo (sólo narración). Rola por posición.
    DIR_ROLA: [['lanzador', 0.06], ['receptor', 0.02], ['primera', 0.13], ['segunda', 0.27], ['short', 0.32], ['tercera', 0.20]],
    DIR_POP: [['primera', 0.2], ['segunda', 0.25], ['short', 0.3], ['tercera', 0.2], ['receptor', 0.05]],
    FRAC_ELEVADO_INFIELD: 0.15,
    FRAC_LINEA_INFIELD: 0.40,
    FRAC_SENCILLO_INFIELD: 0.22
  };

  var EVENTOS = ['1B', '2B', '3B', 'HR', 'BB', 'HBP', 'K', 'OUT'];
  var MIN_TASA = 1e-5;
  var MAX_TASA = 0.98;

  // =========================================================================
  // Utilidades
  // =========================================================================
  function n0(x) { return (x === null || x === undefined || isNaN(x)) ? 0 : x; }
  function esNulo(x) { return x === null || x === undefined; }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function apellido(nombre) {
    var partes = String(nombre).trim().split(/\s+/);
    var sufijos = { 'Jr.': 1, 'Sr.': 1, 'II': 1, 'III': 1, 'IV': 1 };
    while (partes.length > 1 && sufijos[partes[partes.length - 1]]) partes.pop();
    return partes[partes.length - 1];
  }

  // RNG mulberry32 con semilla (reproducible).
  function crearRng(semilla) {
    var a = (n0(semilla) >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Elige una clave de un objeto {clave: peso} o de una lista [[clave,peso]].
  function elegirPonderado(rng, pares) {
    var total = 0, i;
    for (i = 0; i < pares.length; i++) total += pares[i][1];
    var u = rng() * total;
    for (i = 0; i < pares.length; i++) {
      u -= pares[i][1];
      if (u <= 0) return pares[i][0];
    }
    return pares[pares.length - 1][0];
  }

  function muestrearEvento(rng, probs) {
    var u = rng(), acum = 0, i;
    for (i = 0; i < EVENTOS.length; i++) {
      acum += probs[EVENTOS[i]];
      if (u < acum) return EVENTOS[i];
    }
    return 'OUT';
  }

  function normalizarVector(v) {
    var s = 0, i, out = {};
    for (i = 0; i < EVENTOS.length; i++) s += v[EVENTOS[i]];
    for (i = 0; i < EVENTOS.length; i++) out[EVENTOS[i]] = v[EVENTOS[i]] / s;
    return out;
  }

  // =========================================================================
  // Tasas de liga
  // =========================================================================

  // Tasas de referencia: ref[e] = [total, PA de los años con dato].
  function tasasRef(ref) {
    function r(k) { return ref[k][0] / ref[k][1]; }
    var t = {
      '1B': (ref.H[0] - ref['2B'][0] - ref['3B'][0] - ref.HR[0]) / ref.H[1],
      '2B': r('2B'), '3B': r('3B'), HR: r('HR'), BB: r('BB'), HBP: r('HBP'), K: r('SO'),
      SB: r('SB'), CS: r('CS'), GIDP: r('GIDP'), SF: r('SF'), SH: r('SH'), H: r('H'), AB: r('AB'),
      E: ref.E[0] / ref.BIP[0],
      R: ref.R[0] / (2 * ref.G[0])
    };
    t.OUT = 1 - (t['1B'] + t['2B'] + t['3B'] + t.HR + t.BB + t.HBP + t.K);
    completar(t);
    t.clave = 'ref';
    return t;
  }

  // Tasas de la AL de un año; los campos nulos se toman de `ref`.
  function tasasAnio(liga, anio) {
    var L = liga.AL[String(anio)];
    var ref = tasasRef(liga.ref);
    if (!L) return ref;
    var PA = L.PA;
    function v(k) { return esNulo(L[k]) ? ref[k === 'SO' ? 'K' : k] * PA : L[k]; }
    var t = {
      '1B': (L.H - L['2B'] - L['3B'] - L.HR) / PA,
      '2B': L['2B'] / PA, '3B': L['3B'] / PA, HR: L.HR / PA, BB: L.BB / PA,
      HBP: v('HBP') / PA, K: v('SO') / PA,
      SB: L.SB / PA, CS: v('CS') / PA, GIDP: v('GIDP') / PA, SF: v('SF') / PA, SH: n0(L.SH) / PA,
      H: L.H / PA, AB: L.AB / PA,
      E: L.E / L.BIP,
      R: L.R / (2 * L.G)
    };
    t.OUT = 1 - (t['1B'] + t['2B'] + t['3B'] + t.HR + t.BB + t.HBP + t.K);
    completar(t);
    t.clave = String(anio);
    t.cruda = L;
    return t;
  }

  // Derivados comunes: proporción de hits no-HR, GIDP por oportunidad, robo.
  function completar(t) {
    var noHR = t['1B'] + t['2B'] + t['3B'];
    t.propHits = { '1B': t['1B'] / noHR, '2B': t['2B'] / noHR, '3B': t['3B'] / noHR };
    var enPrimera = t['1B'] + t.BB + t.HBP;
    t.gidpOpp = t.GIDP / enPrimera;
    t.roboIntento = (t.SB + t.CS) / enPrimera;
    t.roboExito = t.SB / (t.SB + t.CS);
    t.vector = normalizarVector(t);
  }

  // =========================================================================
  // Jugadores
  // =========================================================================

  // Conteos por evento de un bateador (null → tasa de liga × PA).
  function tasasBateador(b, L) {
    var PA = n0(b.AB) + n0(b.BB) + n0(b.HBP) + n0(b.SF) + n0(b.SH);
    function c(valor, tasa) { return esNulo(valor) ? tasa * PA : valor; }
    var H = n0(b.H), d2 = n0(b['2B']), d3 = n0(b['3B']), hr = n0(b.HR);
    var cnt = {
      '1B': H - d2 - d3 - hr, '2B': d2, '3B': d3, HR: hr,
      BB: n0(b.BB), HBP: c(b.HBP, L.HBP), K: c(b.SO, L.K)
    };
    cnt.OUT = Math.max(0, PA - (H + cnt.BB + cnt.HBP + cnt.K));
    var tasas = regresar(cnt, PA, L, MODELO.PA_PLENO);
    // Doble play y robo (por oportunidad), con regresión equivalente.
    var enPrimera = cnt['1B'] + cnt.BB + cnt.HBP;
    var w = Math.max(0, MODELO.PA_PLENO - PA) * (L['1B'] + L.BB + L.HBP);
    var gidp = esNulo(b.GIDP) ? L.gidpOpp * enPrimera : b.GIDP;
    tasas.gidpOpp = (gidp + w * L.gidpOpp) / (enPrimera + w);
    var sb = n0(b.SB);
    var cs = esNulo(b.CS) ? (esNulo(b.SB) ? L.CS * PA : sb * (1 - L.roboExito) / L.roboExito) : b.CS;
    if (esNulo(b.SB)) sb = L.SB * PA;
    tasas.roboIntento = clamp((sb + cs + w * L.roboIntento) / (enPrimera + w), 0, MODELO.ROBO_INTENTO_MAX);
    tasas.roboExito = (sb + cs + w) > 0 ? (sb + w * L.roboExito) / (sb + cs + w) : L.roboExito;
    tasas.PA = PA;
    return tasas;
  }

  // Tasas de un lanzador por BF.
  function tasasLanzador(p, L) {
    var BF = esNulo(p.BFP) ? n0(p.IPouts) + n0(p.H) + n0(p.BB) + n0(p.HBP) : p.BFP;
    function c(valor, tasa) { return esNulo(valor) ? tasa * BF : valor; }
    var H = n0(p.H), hr = n0(p.HR), noHR = Math.max(0, H - hr);
    var cnt = {
      '1B': noHR * L.propHits['1B'], '2B': noHR * L.propHits['2B'], '3B': noHR * L.propHits['3B'],
      HR: hr, BB: n0(p.BB), HBP: c(p.HBP, L.HBP), K: c(p.SO, L.K)
    };
    cnt.OUT = Math.max(0, BF - (H + cnt.BB + cnt.HBP + cnt.K));
    var tasas = regresar(cnt, BF, L, MODELO.BF_PLENO);
    tasas.BF = BF;
    return tasas;
  }

  // Mezcla los conteos con w = max(0, pleno - n) apariciones de la liga.
  function regresar(cnt, n, L, pleno) {
    var w = Math.max(0, pleno - n), out = {}, i, e;
    for (i = 0; i < EVENTOS.length; i++) {
      e = EVENTOS[i];
      out[e] = (n + w) > 0 ? (cnt[e] + w * L[e]) / (n + w) : L[e];
    }
    return normalizarVector(out);
  }

  // Perfil de bateo de un lanzador que no aparece en `bateadores`.
  function bateoLanzadorSinDatos(L) {
    var v = {}, i, e, f = MODELO.BATEO_LANZADOR_SIN_DATOS, s = 0;
    for (i = 0; i < EVENTOS.length; i++) {
      e = EVENTOS[i];
      if (e !== 'OUT') { v[e] = L[e] * f[e]; s += v[e]; }
    }
    v.OUT = 1 - s;
    v.gidpOpp = L.gidpOpp; v.roboIntento = 0; v.roboExito = L.roboExito; v.PA = 0;
    return v;
  }

  // Tasas normalizadas a un entorno: r × entorno_e / ligaAño_e, renormalizado.
  function normalizadas(jugador, entorno) {
    var cache = jugador.norm || (jugador.norm = {});
    if (cache[entorno.clave]) return cache[entorno.clave];
    var v = {}, i, e;
    for (i = 0; i < EVENTOS.length; i++) {
      e = EVENTOS[i];
      v[e] = jugador.tasas[e] * entorno[e] / jugador.liga[e];
    }
    v = normalizarVector(v);
    for (i = 0; i < EVENTOS.length; i++) v[EVENTOS[i]] = clamp(v[EVENTOS[i]], MIN_TASA, MAX_TASA);
    cache[entorno.clave] = v;
    return v;
  }

  // Aplica fatiga a las tasas de un lanzador (multiplica lo negativo).
  function conFatiga(v, factor) {
    if (factor <= 1) return v;
    var out = {}, i, e, s = 0;
    for (i = 0; i < EVENTOS.length; i++) {
      e = EVENTOS[i];
      if (e !== 'OUT') { out[e] = v[e] * factor; s += out[e]; }
    }
    out.OUT = Math.max(0.05, 1 - s);
    return normalizarVector(out);
  }

  // log5 por evento (razón de momios) y renormalización.
  function probabilidadesPA(b, p, L) {
    var v = {}, i, e, ob, op, ol, m;
    for (i = 0; i < EVENTOS.length; i++) {
      e = EVENTOS[i];
      ob = b[e] / (1 - b[e]);
      op = p[e] / (1 - p[e]);
      ol = L[e] / (1 - L[e]);
      m = ob * op / ol;
      v[e] = m / (1 + m);
    }
    return normalizarVector(v);
  }

  // =========================================================================
  // Lineup, rotación y cerrador sugeridos
  // =========================================================================
  var POSICIONES_LINEUP = ['C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];

  function posPrincipal(b) {
    var mejor = null, g = -1, k;
    for (k in b.pos) if (b.pos[k] > g) { g = b.pos[k]; mejor = k; }
    return mejor;
  }
  function pa(b) { return n0(b.AB) + n0(b.BB) + n0(b.HBP) + n0(b.SF) + n0(b.SH); }
  function esLanzador(b) { return posPrincipal(b) === 'P'; }

  function lineupSugerido(temporada) {
    var bats = temporada.bateadores.slice().sort(function (a, b) { return pa(b) - pa(a); });
    var ocupadas = {}, asignados = {}, lineup = [], i, b, p, slot;
    var libresOF = ['LF', 'CF', 'RF'];
    // Primera pasada: posición principal.
    for (i = 0; i < bats.length; i++) {
      b = bats[i];
      if (esLanzador(b)) continue;
      p = posPrincipal(b);
      if (p === 'OF') {
        if (libresOF.length) { slot = libresOF.shift(); ocupadas[slot] = b.id; asignados[b.id] = slot; }
      } else if (POSICIONES_LINEUP.indexOf(p) >= 0 && !ocupadas[p]) {
        ocupadas[p] = b.id; asignados[b.id] = p;
      }
    }
    // Segunda pasada: huecos con los mejores restantes (no lanzadores).
    for (i = 0; i < POSICIONES_LINEUP.length; i++) {
      p = POSICIONES_LINEUP[i];
      if (ocupadas[p]) continue;
      for (var j = 0; j < bats.length; j++) {
        b = bats[j];
        if (esLanzador(b) || asignados[b.id]) continue;
        ocupadas[p] = b.id; asignados[b.id] = p; break;
      }
    }
    // DH: el mejor restante que no sea lanzador.
    if (temporada.dh) {
      for (i = 0; i < bats.length; i++) {
        b = bats[i];
        if (esLanzador(b) || asignados[b.id]) continue;
        asignados[b.id] = 'DH'; break;
      }
    }
    for (i = 0; i < bats.length; i++) if (asignados[bats[i].id]) lineup.push({ id: bats[i].id, pos: asignados[bats[i].id] });
    var rotacion = rotacionSugerida(temporada);
    var cerrador = cerradorSugerido(temporada);
    if (!temporada.dh) lineup.push({ id: rotacion[0], pos: 'P' });
    return { lineup: lineup.slice(0, 9), rotacion: rotacion, cerrador: cerrador };
  }

  function rotacionSugerida(temporada) {
    var ls = temporada.lanzadores.slice().sort(function (a, b) { return n0(b.GS) - n0(a.GS) || n0(b.IPouts) - n0(a.IPouts); });
    var rot = [], i;
    for (i = 0; i < ls.length && rot.length < 5; i++) {
      if (n0(ls[i].GS) > 0 && (rot.length < 4 || n0(ls[i].GS) >= 10)) rot.push(ls[i].id);
    }
    if (!rot.length) rot.push(ls[0].id);
    return rot;
  }

  function cerradorSugerido(temporada) {
    var mejor = null, sv = -1, i, l;
    for (i = 0; i < temporada.lanzadores.length; i++) {
      l = temporada.lanzadores[i];
      if (n0(l.SV) > sv) { sv = n0(l.SV); mejor = l; }
    }
    return (mejor && sv >= MODELO.SV_MIN_CERRADOR) ? mejor.id : null;
  }

  // =========================================================================
  // Equipo
  // =========================================================================
  function construirEquipo(temporada, liga, opciones) {
    opciones = opciones || {};
    var L = tasasAnio(liga, temporada.anio);
    var sug = lineupSugerido(temporada);
    var eq = {
      nombre: temporada.equipo + ' ' + temporada.anio,
      anio: temporada.anio,
      temporada: temporada,
      liga: L,
      ref: tasasRef(liga.ref),
      usarDH: esNulo(opciones.usarDH) ? !!temporada.dh : !!opciones.usarDH,
      tasaE: (temporada.BIPc > 0) ? temporada.E / temporada.BIPc : L.E,
      bateadores: {},
      lanzadores: {},
      lineup: (opciones.lineup || sug.lineup).map(function (x) { return { id: x.id, pos: x.pos }; }),
      rotacion: (opciones.rotacion || sug.rotacion).slice(),
      cerrador: esNulo(opciones.cerrador) ? sug.cerrador : opciones.cerrador,
      relevistas: []
    };
    var i, b, p, rotSet = {};
    for (i = 0; i < temporada.bateadores.length; i++) {
      b = temporada.bateadores[i];
      eq.bateadores[b.id] = { id: b.id, nombre: b.nombre, b: b.b, tasas: tasasBateador(b, L), liga: L, crudo: b };
    }
    for (i = 0; i < eq.rotacion.length; i++) rotSet[eq.rotacion[i]] = true;
    for (i = 0; i < temporada.lanzadores.length; i++) {
      p = temporada.lanzadores[i];
      var t = tasasLanzador(p, L);
      var esAbridor = !!rotSet[p.id];
      var j = {
        id: p.id, nombre: p.nombre, tasas: t, liga: L, crudo: p,
        presupuestoAbridor: Math.max(MODELO.PRESUPUESTO_MIN_ABRIDOR, n0(p.GS) > 0 ? t.BF / p.GS : 0),
        presupuestoRelevo: Math.max(MODELO.PRESUPUESTO_MIN_RELEVISTA, n0(p.G) > 0 ? t.BF / p.G : 0),
        pesoRelevo: n0(p.G) > 0 ? n0(p.IPouts) * (n0(p.G) - n0(p.GS)) / p.G : 0
      };
      if (p.id === eq.cerrador) j.presupuestoRelevo = Math.max(j.presupuestoRelevo, MODELO.PRESUPUESTO_MIN_CERRADOR);
      eq.lanzadores[p.id] = j;
      if (!esAbridor && n0(p.G) - n0(p.GS) > 0 && j.pesoRelevo > 0) eq.relevistas.push(j);
    }
    // Banca: bateadores de posición fuera del lineup, con su parte real de PA.
    // Sirve para los descansos (opción `descansos`): la fracción de PA que la
    // banca tomó en la temporada real es la probabilidad de que un titular
    // descanse en un juego dado.
    var enLineup = {}, paTitulares = 0, paBanca = 0;
    for (i = 0; i < eq.lineup.length; i++) enLineup[eq.lineup[i].id] = true;
    eq.banca = [];
    for (i = 0; i < temporada.bateadores.length; i++) {
      b = temporada.bateadores[i];
      if (esLanzador(b)) continue;
      if (enLineup[b.id]) { paTitulares += pa(b); continue; }
      if (pa(b) > 0) { paBanca += pa(b); eq.banca.push({ jugador: eq.bateadores[b.id], pa: pa(b), pos: posPrincipal(b) }); }
    }
    eq.fraccionBanca = (paTitulares + paBanca) > 0 ? paBanca / (paTitulares + paBanca) : 0;
    // Un lanzador del lineup/rotación que no exista se descarta.
    eq.rotacion = eq.rotacion.filter(function (id) { return !!eq.lanzadores[id]; });
    if (!eq.rotacion.length) eq.rotacion = [temporada.lanzadores[0].id];
    if (eq.cerrador && !eq.lanzadores[eq.cerrador]) eq.cerrador = null;
    return eq;
  }

  // Perfil de bateo de un lanzador (datos reales si existen).
  function bateadorDeLanzador(eq, idLanz) {
    if (eq.bateadores[idLanz]) return eq.bateadores[idLanz];
    var l = eq.lanzadores[idLanz];
    var j = { id: l.id, nombre: l.nombre, b: 'R', tasas: bateoLanzadorSinDatos(eq.liga), liga: eq.liga, crudo: null, sinDatosBateo: true };
    eq.bateadores[idLanz] = j;
    return j;
  }

  // Lineup de 9 para un juego concreto (con o sin DH), con el abridor. Con
  // `descansos`, cada titular cede su puesto a un suplente (de su posición si
  // lo hay, ponderado por PA) con probabilidad eq.fraccionBanca.
  function lineupParaJuego(eq, conDH, idAbridor, rng, descansos) {
    var base = eq.lineup.filter(function (x) { return eq.bateadores[x.id] && x.pos !== 'P'; });
    var tieneDH = base.some(function (x) { return x.pos === 'DH'; });
    var enLineup = {}, i;
    for (i = 0; i < base.length; i++) enLineup[base[i].id] = true;
    if (conDH && !tieneDH) {
      // Buscar el mejor bateador restante (por PA) como DH.
      var cands = eq.temporada.bateadores.filter(function (b) { return !enLineup[b.id] && !esLanzador(b); })
        .sort(function (a, b) { return pa(b) - pa(a); });
      if (cands.length) base.push({ id: cands[0].id, pos: 'DH' });
    } else if (!conDH && tieneDH) {
      base = base.filter(function (x) { return x.pos !== 'DH'; });
    }
    base = base.slice(0, conDH ? 9 : 8);
    if (descansos && rng && eq.banca.length && eq.fraccionBanca > 0) {
      var usadosBanca = {};
      base = base.map(function (x) {
        if (rng() >= eq.fraccionBanca) return x;
        var grupo = x.pos === 'DH' ? null : (x.pos === 'LF' || x.pos === 'CF' || x.pos === 'RF' ? 'OF' : x.pos);
        var cands = eq.banca.filter(function (s) { return !usadosBanca[s.jugador.id] && !enLineup[s.jugador.id] && (grupo === null || s.pos === grupo); });
        if (!cands.length) cands = eq.banca.filter(function (s) { return !usadosBanca[s.jugador.id] && !enLineup[s.jugador.id]; });
        if (!cands.length) return x;
        var sup = elegirPonderado(rng, cands.map(function (s) { return [s, s.pa]; }));
        usadosBanca[sup.jugador.id] = true;
        return { id: sup.jugador.id, pos: x.pos };
      });
    }
    if (!conDH) base.push({ id: idAbridor, pos: 'P' });
    return base.map(function (x, k) {
      var jug = x.pos === 'P' ? bateadorDeLanzador(eq, x.id) : eq.bateadores[x.id];
      return { id: x.id, nombre: jug.nombre, pos: x.pos, orden: k + 1, jugador: jug };
    });
  }

  // =========================================================================
  // Equipo neutro (promedio de liga) para pruebas y calibración
  // =========================================================================
  function equipoNeutro(liga, anio) {
    var L = liga.AL[String(anio)];
    var ref = liga.ref;
    var equipos = L ? L.equipos : 8;
    function tot(k) { return L && !esNulo(L[k]) ? L[k] : (ref[k] ? ref[k][0] / ref[k][1] * (L ? L.PA : 40000) : 0); }
    var PA = L ? L.PA : 40000;
    var paBat = MODELO.PA_BATEADOR_NEUTRO;
    function esc(k) { return tot(k) / PA * paBat; }
    var posiciones = ['C', '1B', '2B', 'SS', '3B', 'OF', 'OF', 'OF', 'DH', '1B', 'OF'];
    var bateadores = [], i;
    for (i = 0; i < posiciones.length; i++) {
      var pos = {};
      pos[posiciones[i] === 'DH' ? '1B' : posiciones[i]] = 150;
      bateadores.push({
        id: 'neutro_b' + (i + 1), nombre: 'Bateador promedio ' + (i + 1), b: 'R', t: 'R', G: 150,
        AB: esc('AB'), H: esc('H'), '2B': esc('2B'), '3B': esc('3B'), HR: esc('HR'), BB: esc('BB'),
        SO: esc('SO'), HBP: esc('HBP'), SB: esc('SB'), CS: L && esNulo(L.CS) ? null : esc('CS'),
        SH: esc('SH'), SF: L && esNulo(L.SF) ? null : esc('SF'), GIDP: L && esNulo(L.GIDP) ? null : esc('GIDP'), pos: pos
      });
    }
    // Lanzadores: la liga por equipo, repartida entre 5 abridores y 7 relevistas.
    var paEquipo = PA / equipos, G = L ? L.G * 2 / equipos : 154;
    var fracAbr = 0.7;
    for (i = 0; i < MODELO.ABRIDOR_NEUTRO.length; i++) if (anio >= MODELO.ABRIDOR_NEUTRO[i][0]) fracAbr = MODELO.ABRIDOR_NEUTRO[i][1];
    var lanzadores = [];
    var nAbr = 5, nRel = 7;
    var bfAbr = paEquipo * fracAbr / nAbr, bfRel = paEquipo * (1 - fracAbr) / nRel;
    function lanz(id, nombre, bf, gs, g, sv) {
      var H = tot('H') / PA * bf, HR = tot('HR') / PA * bf, BB = tot('BB') / PA * bf, SO = tot('SO') / PA * bf, HBP = tot('HBP') / PA * bf;
      var outs = bf - H - BB - HBP;
      return {
        id: id, nombre: nombre, t: 'R', W: 0, L: 0, G: g, GS: gs, CG: 0, SV: sv,
        IPouts: Math.round(outs), H: H, ER: 0, HR: HR, BB: BB, SO: SO, HBP: HBP, BFP: bf
      };
    }
    for (i = 0; i < nAbr; i++) lanzadores.push(lanz('neutro_a' + (i + 1), 'Abridor promedio ' + (i + 1), bfAbr, G / nAbr, G / nAbr, 0));
    for (i = 0; i < nRel; i++) lanzadores.push(lanz('neutro_r' + (i + 1), 'Relevista promedio ' + (i + 1), bfRel, 0, bfRel / MODELO.RELEVISTA_NEUTRO_BF, i === 0 ? 30 : 0));
    // Los lanzadores neutros batean como la liga (la liga incluye a sus lanzadores).
    for (i = 0; i < lanzadores.length; i++) {
      var lb = JSON.parse(JSON.stringify(bateadores[0]));
      lb.id = lanzadores[i].id; lb.nombre = lanzadores[i].nombre; lb.pos = { P: 30 };
      bateadores.push(lb);
    }
    var temporada = {
      anio: anio, equipo: 'Promedio de liga AL', lg: 'AL', dh: anio >= 1973, G: G,
      W: 0, L: 0, R: L ? L.R / equipos : 0, RA: L ? L.R / equipos : 0, HR: L ? L.HR / equipos : 0,
      WSWin: false, LgWin: false, neutro: true,
      E: L ? L.E / equipos : 0, BIPc: L ? L.BIP / equipos : 0,
      bateadores: bateadores, lanzadores: lanzadores
    };
    var eq = construirEquipo(temporada, liga, {});
    eq.nombre = 'Promedio de liga AL ' + anio;
    eq.neutro = true;
    return eq;
  }

  // =========================================================================
  // Juego
  // =========================================================================
  function entornoPara(visita, local) {
    if (visita.anio === local.anio) return visita.liga;
    return visita.ref;
  }

  function nuevoLado(eq, clave, conDH, idAbridor, rng, descansos) {
    var lado = {
      clave: clave, equipo: eq, lineup: lineupParaJuego(eq, conDH, idAbridor, rng, descansos), idx: 0,
      carreras: 0, hits: 0, errores: 0, lineas: [],
      box: { bateo: [], bateoPorId: {}, pitcheo: [], pitcheoPorId: {} },
      usados: {}, cerradorUsado: false, actual: null
    };
    var i;
    for (i = 0; i < lado.lineup.length; i++) registrarBateador(lado, lado.lineup[i]);
    ponerLanzador(lado, eq.lanzadores[idAbridor], true, 0, 0, 0);
    return lado;
  }

  function registrarBateador(lado, slot) {
    if (lado.box.bateoPorId[slot.id]) return lado.box.bateoPorId[slot.id];
    var r = { id: slot.id, nombre: slot.nombre, pos: slot.pos, orden: slot.orden, AB: 0, R: 0, H: 0, '2B': 0, '3B': 0, HR: 0, RBI: 0, BB: 0, SO: 0, SB: 0 };
    lado.box.bateo.push(r);
    lado.box.bateoPorId[slot.id] = r;
    return r;
  }

  function ponerLanzador(lado, jug, esAbridor, ventaja, corredores, entrada) {
    var r = { id: jug.id, nombre: jug.nombre, IPouts: 0, BF: 0, H: 0, R: 0, ER: 0, BB: 0, SO: 0, HR: 0, decision: null };
    lado.box.pitcheo.push(r);
    lado.box.pitcheoPorId[jug.id] = r;
    lado.usados[jug.id] = true;
    lado.actual = {
      jugador: jug, box: r, esAbridor: esAbridor,
      presupuesto: esAbridor ? jug.presupuestoAbridor : jug.presupuestoRelevo,
      ventajaAlEntrar: ventaja, corredoresAlEntrar: corredores, entradaEntra: entrada
    };
    if (jug.id === lado.equipo.cerrador) lado.cerradorUsado = true;
  }

  // Elige un relevista disponible, ponderado por IPouts de relevo.
  function elegirRelevista(lado, rng, permitirCerrador) {
    var eq = lado.equipo, pares = [], i, r;
    for (i = 0; i < eq.relevistas.length; i++) {
      r = eq.relevistas[i];
      if (lado.usados[r.id]) continue;
      if (!permitirCerrador && r.id === eq.cerrador) continue;
      pares.push([r, r.pesoRelevo]);
    }
    if (!pares.length && !permitirCerrador && eq.cerrador && !lado.usados[eq.cerrador]) return eq.lanzadores[eq.cerrador];
    if (!pares.length) {
      // Último recurso: abridores sin usar.
      for (i = 0; i < eq.rotacion.length; i++) if (!lado.usados[eq.rotacion[i]]) return eq.lanzadores[eq.rotacion[i]];
      return null;
    }
    return elegirPonderado(rng, pares);
  }

  function simularJuego(visita, local, opts) {
    opts = opts || {};
    var semilla = esNulo(opts.semilla) ? 1 : opts.semilla;
    var rng = crearRng(semilla);
    var entorno = entornoPara(visita, local);
    var conDH = local.usarDH;
    var idxV = esNulo(opts.abridorIndexVisita) ? n0(opts.abridorIndex) : opts.abridorIndexVisita;
    var idxL = esNulo(opts.abridorIndexLocal) ? n0(opts.abridorIndex) : opts.abridorIndexLocal;
    var abrV = visita.rotacion[((idxV % visita.rotacion.length) + visita.rotacion.length) % visita.rotacion.length];
    var abrL = local.rotacion[((idxL % local.rotacion.length) + local.rotacion.length) % local.rotacion.length];

    var J = {
      semilla: semilla, juegoNumero: n0(opts.juegoNumero),
      visita: { nombre: visita.nombre, carreras: 0, hits: 0, errores: 0, lineas: [] },
      local: { nombre: local.nombre, carreras: 0, hits: 0, errores: 0, lineas: [] },
      entradas: 0, ganador: null, jugadas: [], boxscore: {}, decisiones: {}, conDH: conDH
    };
    var lados = {
      visita: nuevoLado(visita, 'visita', conDH, abrV, rng, !!opts.descansos),
      local: nuevoLado(local, 'local', conDH, abrL, rng, !!opts.descansos)
    };
    var E = {
      rng: rng, entorno: entorno, lados: lados, J: J,
      entrada: 1, alta: true, outs: 0, bases: [null, null, null],
      outsPerdidos: 0,     // errores en la entrada (para carreras limpias)
      carrerasEntrada: 0,
      marcador: { visita: 0, local: 0 },
      record: { visita: null, local: null }, // lanzador de récord por equipo
      terminado: false
    };

    while (!E.terminado) {
      // Parte alta
      E.alta = true;
      jugarMediaEntrada(E);
      if (E.terminado) break;
      // Parte baja: no se juega si el local va ganando en la 9ª o después.
      if (E.entrada >= 9 && E.marcador.local > E.marcador.visita) { terminarJuego(E); break; }
      E.alta = false;
      jugarMediaEntrada(E);
      if (E.terminado) break;
      if (E.entrada >= 9 && E.marcador.visita !== E.marcador.local) { terminarJuego(E); break; }
      E.entrada++;
      if (E.entrada > 40) { terminarJuego(E); break; } // salvaguarda
    }
    return J;
  }

  function marcador(E) { return { visita: E.marcador.visita, local: E.marcador.local }; }
  function idsBases(E) { return E.bases.map(function (c) { return c ? c.jugador.id : null; }); }
  function ofensivaDe(E) { return E.alta ? 'visita' : 'local'; }
  function defensivaDe(E) { return E.alta ? 'local' : 'visita'; }

  function jugada(E, tipo, extra) {
    var j = { tipo: tipo, entrada: E.entrada, alta: E.alta, ofensiva: ofensivaDe(E), marcador: marcador(E) };
    var k;
    for (k in extra) j[k] = extra[k];
    E.J.jugadas.push(j);
    return j;
  }

  function jugarMediaEntrada(E) {
    var of = E.lados[ofensivaDe(E)], df = E.lados[defensivaDe(E)];
    E.outs = 0; E.bases = [null, null, null]; E.outsPerdidos = 0; E.carrerasEntrada = 0; E.paEnEntrada = 0;
    of.lineas.push(0);
    jugada(E, 'INICIO_ENTRADA', { lanzador: { id: df.actual.jugador.id, nombre: df.actual.jugador.nombre } });
    while (E.outs < 3 && !E.terminado) {
      revisarCambioLanzador(E, df, of);
      intentarRobo(E, of, df);
      if (E.outs >= 3) break;
      resolverPA(E, of, df);
      if (!E.alta && E.entrada >= 9 && E.marcador.local > E.marcador.visita) {
        // Walk-off: termina al instante.
        terminarJuego(E);
        return;
      }
    }
    if (!E.terminado) jugada(E, 'FIN_ENTRADA', { outs: E.outs });
  }

  // ---- Manager: cambios de lanzador -----------------------------------
  function revisarCambioLanzador(E, df, of) {
    var act = df.actual, eq = df.equipo, motivo = null;
    var ventaja = E.marcador[df.clave] - E.marcador[of.clave];
    var hayCorredor = E.bases[0] || E.bases[1] || E.bases[2];
    // Cerrador: 9ª o después, ventaja de 1 a 3, al empezar la entrada.
    if (eq.cerrador && !df.cerradorUsado && E.entrada >= 9 && ventaja >= 1 && ventaja <= 3 && E.paEnEntrada === 0) {
      motivo = 'cerrador';
    } else {
      var bf = act.box.BF, pres = act.presupuesto;
      var tope = act.esAbridor ? MODELO.TOPE_ABRIDOR : MODELO.TOPE_RELEVISTA;
      if (act.esAbridor && act.box.R >= MODELO.CARRERAS_KO && E.entrada < MODELO.ENTRADA_KO) motivo = 'carreras';
      else if (bf >= pres * tope) motivo = 'fatiga';
      else if (bf > pres && (hayCorredor || E.carrerasEntrada > 0 || E.outs === 0)) motivo = 'fatiga';
    }
    if (!motivo) return;
    var nuevo;
    if (motivo === 'cerrador') nuevo = eq.lanzadores[eq.cerrador];
    else nuevo = elegirRelevista(df, E.rng, E.entrada >= 8);
    if (!nuevo || nuevo.id === act.jugador.id) return;
    var sale = act.jugador;
    var corredores = (E.bases[0] ? 1 : 0) + (E.bases[1] ? 1 : 0) + (E.bases[2] ? 1 : 0);
    ponerLanzador(df, nuevo, false, ventaja, corredores, E.entrada);
    // Sin DH: el relevista ocupa el puesto del lanzador en el orden.
    if (!E.J.conDH) {
      for (var i = 0; i < df.lineup.length; i++) {
        if (df.lineup[i].pos === 'P') {
          var jb = bateadorDeLanzador(eq, nuevo.id);
          df.lineup[i] = { id: nuevo.id, nombre: jb.nombre, pos: 'P', orden: i + 1, jugador: jb };
          registrarBateador(df, df.lineup[i]);
        }
      }
    }
    jugada(E, 'CAMBIO_PITCHER', {
      evento: 'CAMBIO', equipoDefensivo: df.clave,
      sale: { id: sale.id, nombre: sale.nombre, IPouts: E.lados[df.clave].box.pitcheoPorId[sale.id].IPouts },
      entra: { id: nuevo.id, nombre: nuevo.nombre }, motivo: motivo,
      outsAntes: E.outs, outsDespues: E.outs, basesAntes: idsBases(E), basesDespues: idsBases(E)
    });
  }

  // ---- Robo --------------------------------------------------------------
  function intentarRobo(E, of, df) {
    var corredor = null, base = 0, p = 0;
    if (E.bases[0] && !E.bases[1]) { corredor = E.bases[0]; base = 2; p = corredor.jugador.tasas.roboIntento; }
    else if (E.bases[1] && !E.bases[2] && !E.bases[0]) { corredor = E.bases[1]; base = 3; p = corredor.jugador.tasas.roboIntento * MODELO.ROBO_2A3_FACTOR; }
    if (!corredor || p <= 0) return;
    if (E.rng() >= p) return;
    var exito = E.rng() < corredor.jugador.tasas.roboExito;
    var basesAntes = idsBases(E), outsAntes = E.outs;
    var cj = corredor.jugador;
    if (exito) {
      E.bases[base - 1] = corredor; E.bases[base - 2] = null;
      of.box.bateoPorId[cj.id].SB++;
    } else {
      E.bases[base - 2] = null; E.outs++;
      df.actual.box.IPouts++;
    }
    jugada(E, 'ROBO', {
      evento: exito ? 'ROBO_OK' : 'ROBO_OUT', corredor: { id: cj.id, nombre: cj.nombre }, base: base, exito: exito,
      lanzador: { id: df.actual.jugador.id, nombre: df.actual.jugador.nombre },
      outsAntes: outsAntes, outsDespues: E.outs, basesAntes: basesAntes, basesDespues: idsBases(E),
      carrerasAnotadas: [], carreraImpulsada: 0
    });
  }

  // ---- Aparición al plato ------------------------------------------------
  function resolverPA(E, of, df) {
    var slot = of.lineup[of.idx % of.lineup.length];
    var bat = slot.jugador, act = df.actual, lanz = act.jugador;
    var bN = normalizadas(bat, E.entorno);
    var pN = normalizadas(lanz, E.entorno);
    var exceso = act.box.BF / act.presupuesto - 1;
    var fatiga = exceso > 0 ? Math.min(MODELO.FATIGA_MAX, 1 + MODELO.FATIGA_PENDIENTE * exceso) : 1;
    var probs = probabilidadesPA(bN, conFatiga(pN, fatiga), E.entorno.vector);
    var ev = muestrearEvento(E.rng, probs);

    var outsAntes = E.outs, basesAntes = idsBases(E);
    var boxB = registrarBateador(of, slot), boxP = act.box;
    var ctx = { E: E, of: of, df: df, bat: bat, slot: slot, boxB: boxB, boxP: boxP, anotan: [], rbi: 0, evento: ev, direccion: null, subtipo: null };
    var corredorBat = { jugador: bat, lanzador: boxP, porError: false };
    var rng = E.rng;
    var dosOuts = E.outs === 2;
    E.paEnEntrada++;
    boxP.BF++;

    switch (ev) {
      case 'BB':
      case 'HBP':
        boxB.BB += ev === 'BB' ? 1 : 0;
        avanzarForzado(ctx, corredorBat, true);
        boxP.BB += ev === 'BB' ? 1 : 0;
        break;
      case 'K':
        boxB.AB++; boxB.SO++; boxP.SO++;
        registrarOut(ctx, 1);
        break;
      case 'HR':
        boxB.AB++; boxB.H++; boxB.HR++; boxP.H++; boxP.HR++; of.hits++;
        ctx.direccion = direccionHR(rng, bat);
        anotarDesde(ctx, 2, true); anotarDesde(ctx, 1, true); anotarDesde(ctx, 0, true);
        anotar(ctx, corredorBat, true);
        break;
      case '3B':
        boxB.AB++; boxB.H++; boxB['3B']++; boxP.H++; of.hits++;
        ctx.direccion = elegirPonderado(rng, [['derecho', 0.5], ['central', 0.4], ['izquierdo', 0.1]]);
        anotarDesde(ctx, 2, true); anotarDesde(ctx, 1, true); anotarDesde(ctx, 0, true);
        E.bases[2] = corredorBat;
        break;
      case '2B':
        boxB.AB++; boxB.H++; boxB['2B']++; boxP.H++; of.hits++;
        ctx.direccion = elegirPonderado(rng, [['izquierdo', 0.38], ['central', 0.24], ['derecho', 0.38]]);
        anotarDesde(ctx, 2, true); anotarDesde(ctx, 1, true);
        if (E.bases[0]) {
          if (rng() < (dosOuts ? MODELO.AV_1AH_DOBLE_2OUTS : MODELO.AV_1AH_DOBLE)) anotarDesde(ctx, 0, true);
          else { E.bases[2] = E.bases[0]; E.bases[0] = null; }
        }
        E.bases[1] = corredorBat;
        break;
      case '1B':
        boxB.AB++; boxB.H++; boxP.H++; of.hits++;
        ctx.direccion = rng() < MODELO.FRAC_SENCILLO_INFIELD ? elegirPonderado(rng, MODELO.DIR_ROLA) : elegirPonderado(rng, [['izquierdo', 0.36], ['central', 0.34], ['derecho', 0.30]]);
        anotarDesde(ctx, 2, true);
        if (E.bases[1]) {
          if (rng() < (dosOuts ? MODELO.AV_2AH_SENCILLO_2OUTS : MODELO.AV_2AH_SENCILLO)) anotarDesde(ctx, 1, true);
          else { E.bases[2] = E.bases[1]; E.bases[1] = null; }
        }
        if (E.bases[0]) {
          if (!E.bases[2] && rng() < (dosOuts ? MODELO.AV_1A3_SENCILLO_2OUTS : MODELO.AV_1A3_SENCILLO)) { E.bases[2] = E.bases[0]; }
          else { E.bases[1] = E.bases[0]; }
          E.bases[0] = null;
        }
        E.bases[0] = corredorBat;
        break;
      default: // OUT en juego
        boxB.AB++;
        resolverBolaEnJuego(ctx, corredorBat);
    }

    // Avance del orden al bate.
    of.idx = (of.idx + 1) % of.lineup.length;
    if (ctx.evento === 'SF') boxB.AB--; // el SF no cuenta como turno oficial
    boxB.RBI += ctx.rbi;

    // Lanzador de récord.
    actualizarRecord(E, of, df);

    jugada(E, 'PA', {
      bateador: { id: bat.id, nombre: bat.nombre, pos: slot.pos, orden: slot.orden },
      lanzador: { id: lanz.id, nombre: lanz.nombre },
      evento: ctx.evento, direccion: ctx.direccion, subtipo: ctx.subtipo,
      outsAntes: outsAntes, outsDespues: E.outs, basesAntes: basesAntes, basesDespues: idsBases(E),
      carrerasAnotadas: ctx.anotan, carreraImpulsada: ctx.rbi, marcador: marcador(E)
    });
  }

  function direccionHR(rng, bat) {
    if (bat.b === 'L') return elegirPonderado(rng, [['derecho', 0.52], ['central', 0.30], ['izquierdo', 0.18]]);
    if (bat.b === 'R') return elegirPonderado(rng, [['izquierdo', 0.52], ['central', 0.30], ['derecho', 0.18]]);
    return elegirPonderado(rng, [['izquierdo', 0.38], ['central', 0.30], ['derecho', 0.32]]);
  }

  // Bola en juego que (en principio) es out: error, rola/elevado/línea, DP, SF.
  function resolverBolaEnJuego(ctx, corredorBat) {
    var E = ctx.E, rng = E.rng, bases = E.bases;
    var sub = elegirPonderado(rng, [['rola', MODELO.FRAC_ROLA], ['elevado', MODELO.FRAC_ELEVADO], ['linea', MODELO.FRAC_LINEA]]);
    ctx.subtipo = sub;
    if (sub === 'rola') ctx.direccion = elegirPonderado(rng, MODELO.DIR_ROLA);
    else if (sub === 'elevado') ctx.direccion = rng() < MODELO.FRAC_ELEVADO_INFIELD ? elegirPonderado(rng, MODELO.DIR_POP) : elegirPonderado(rng, [['izquierdo', 0.32], ['central', 0.38], ['derecho', 0.30]]);
    else ctx.direccion = rng() < MODELO.FRAC_LINEA_INFIELD ? elegirPonderado(rng, MODELO.DIR_ROLA) : elegirPonderado(rng, [['izquierdo', 0.35], ['central', 0.30], ['derecho', 0.35]]);

    // Error de la defensa: el bateador llega a 1ª, los corredores avanzan una base.
    if (rng() < ctx.df.equipo.tasaE) {
      ctx.evento = 'E';
      ctx.df.errores++;
      E.outsPerdidos++;
      corredorBat.porError = true;
      avanzarForzado(ctx, corredorBat, false);
      // En un error todos los corredores avanzan una base, forzados o no.
      return;
    }

    if (sub === 'rola') {
      if (bases[0] && E.outs < 2) {
        var pDP = Math.min(MODELO.DP_MAX, ctx.bat.tasas.gidpOpp / (E.entorno.OUT * MODELO.FRAC_ROLA));
        if (rng() < pDP) {
          // Doble play: corredor de 1ª y bateador; los demás avanzan.
          ctx.evento = 'GIDP';
          bases[0] = null;
          registrarOut(ctx, 2);
          if (E.outs < 3) {
            if (bases[2]) anotarDesde(ctx, 2, false);
            if (bases[1]) { bases[2] = bases[1]; bases[1] = null; }
          }
          return;
        }
      }
      ctx.evento = 'OUT_ROLA';
      registrarOut(ctx, 1);
      if (E.outs < 3) {
        if (bases[2] && rng() < MODELO.P_ANOTA_3_ROLA) anotarDesde(ctx, 2, true);
        if (bases[1] && !bases[2] && rng() < MODELO.P_AVANZA_2_ROLA) { bases[2] = bases[1]; bases[1] = null; }
        if (bases[0] && !bases[1]) { bases[1] = bases[0]; bases[0] = null; }
      }
      return;
    }
    if (sub === 'elevado') {
      var alJardin = ['izquierdo', 'central', 'derecho'].indexOf(ctx.direccion) >= 0;
      if (alJardin && bases[2] && E.outs < 2 && rng() < MODELO.P_SF) {
        ctx.evento = 'SF';
        registrarOut(ctx, 1);
        anotarDesde(ctx, 2, true);
        if (bases[1] && rng() < MODELO.P_TAG_2A3) { bases[2] = bases[1]; bases[1] = null; }
        return;
      }
      ctx.evento = 'OUT_ELEVADO';
      registrarOut(ctx, 1);
      if (E.outs < 3 && alJardin && bases[1] && !bases[2] && rng() < MODELO.P_TAG_2A3) { bases[2] = bases[1]; bases[1] = null; }
      return;
    }
    ctx.evento = 'OUT_LINEA';
    registrarOut(ctx, 1);
  }

  function registrarOut(ctx, n) {
    ctx.E.outs += n;
    ctx.boxP.IPouts += n;
  }

  // Avance forzado (BB, HBP, E): cada corredor avanza una base si está forzado
  // (en el error, todos avanzan).
  function avanzarForzado(ctx, corredorBat, soloForzados) {
    var b = ctx.E.bases;
    var conRBI = ctx.evento !== 'E';
    if (b[2] && (!soloForzados || (b[0] && b[1]))) anotarDesde(ctx, 2, conRBI);
    if (b[1] && (!soloForzados || b[0])) { b[2] = b[1]; b[1] = null; }
    if (b[0]) { b[1] = b[0]; b[0] = null; }
    b[0] = corredorBat;
  }

  function anotarDesde(ctx, i, conRBI) {
    var c = ctx.E.bases[i];
    if (!c) return;
    ctx.E.bases[i] = null;
    anotar(ctx, c, conRBI);
  }

  function anotar(ctx, corredor, conRBI) {
    var E = ctx.E, of = ctx.of;
    E.marcador[of.clave]++;
    of.carreras++;
    of.lineas[of.lineas.length - 1]++;
    E.carrerasEntrada++;
    var bb = of.box.bateoPorId[corredor.jugador.id];
    if (bb) bb.R++;
    corredor.lanzador.R++;
    // Carrera limpia: el corredor no llegó por error y la entrada no debería
    // haber terminado ya por los errores cometidos.
    if (!corredor.porError && (E.outs + E.outsPerdidos) < 3) corredor.lanzador.ER++;
    if (conRBI) ctx.rbi++;
    ctx.anotan.push({ id: corredor.jugador.id, nombre: corredor.jugador.nombre });
  }

  // Lanzador de récord: cuando un equipo toma la ventaja, su lanzador actual
  // es candidato a ganador y el del rival a perdedor. Si se empata, se borra.
  function actualizarRecord(E, of, df) {
    var m = E.marcador;
    if (m.visita === m.local) { E.record.visita = null; E.record.local = null; return; }
    var lider = m.visita > m.local ? 'visita' : 'local';
    if (E.record[lider]) return; // ya tenía la ventaja
    E.record[lider] = E.lados[lider].actual;
    E.record[lider === 'visita' ? 'local' : 'visita'] = E.lados[lider === 'visita' ? 'local' : 'visita'].actual;
  }

  function terminarJuego(E) {
    var J = E.J, lados = E.lados;
    E.terminado = true;
    J.entradas = E.entrada;
    J.ganador = E.marcador.visita > E.marcador.local ? 'visita' : 'local';
    ['visita', 'local'].forEach(function (k) {
      var l = lados[k];
      J[k].carreras = l.carreras; J[k].hits = l.hits; J[k].errores = l.errores; J[k].lineas = l.lineas.slice();
      J.boxscore[k] = {
        bateo: l.box.bateo.map(function (r) { return Object.assign({}, r); }),
        pitcheo: l.box.pitcheo.map(function (r) { return Object.assign({}, r); })
      };
    });
    decidirPitcheo(E);
    jugada(E, 'FIN_JUEGO', { ganador: J.ganador, entradas: J.entradas });
  }

  function decidirPitcheo(E) {
    var J = E.J, g = J.ganador, p = g === 'visita' ? 'local' : 'visita';
    var lg = E.lados[g], lp = E.lados[p];
    var cand = E.record[g], perd = E.record[p];
    var boxG = J.boxscore[g].pitcheo, boxP = J.boxscore[p].pitcheo;
    var ganador = null, perdedor = null, salvamento = null, i;
    if (cand) {
      ganador = cand.box;
      if (cand.esAbridor && ganador.IPouts < 15 && boxG.length > 1) {
        // El abridor no completó 5 entradas: gana el relevista con más outs.
        var mejor = null;
        for (i = 1; i < lg.box.pitcheo.length; i++) if (!mejor || lg.box.pitcheo[i].IPouts > mejor.IPouts) mejor = lg.box.pitcheo[i];
        if (mejor) ganador = mejor;
      }
    } else ganador = lg.box.pitcheo[0];
    perdedor = perd ? perd.box : lp.box.pitcheo[0];
    // Salvamento: último lanzador del ganador, no es el ganador, termina el
    // juego y (entró con ventaja ≤3 y lanzó ≥1 entrada) o (entró con el empate
    // en base o al bate) o lanzó ≥3 entradas.
    var ult = lg.actual;
    if (ult && ult.box.id !== ganador.id && !ult.esAbridor) {
      var v = ult.ventajaAlEntrar, outs = ult.box.IPouts;
      if ((v >= 1 && v <= 3 && outs >= 3) || (v >= 1 && v <= ult.corredoresAlEntrar + 1) || outs >= 9) salvamento = ult.box;
    }
    function marcar(lista, id, d) { for (var k = 0; k < lista.length; k++) if (lista[k].id === id) { lista[k].decision = d; return lista[k]; } return null; }
    var bg = marcar(boxG, ganador.id, 'G');
    var bp = marcar(boxP, perdedor.id, 'P');
    var bs = salvamento ? marcar(boxG, salvamento.id, 'S') : null;
    J.decisiones = {
      ganador: { id: bg.id, nombre: bg.nombre, equipo: J[g].nombre },
      perdedor: { id: bp.id, nombre: bp.nombre, equipo: J[p].nombre },
      salvamento: bs ? { id: bs.id, nombre: bs.nombre, equipo: J[g].nombre } : null
    };
  }

  // =========================================================================
  // Serie, muchas series y temporada
  // =========================================================================
  function simularSerie(equipoA, equipoB, opts) {
    opts = opts || {};
    var alMejorDe = opts.alMejorDe || 7;
    var semilla = esNulo(opts.semilla) ? 1 : opts.semilla;
    var necesarias = Math.floor(alMejorDe / 2) + 1;
    var localA = alMejorDe === 7 ? [true, true, false, false, false, true, true] : null;
    var res = { juegos: [], victorias: { A: 0, B: 0 }, ganador: null, orden: 'A local en juegos 1,2,6,7 (2-3-2)' };
    var i = 0, rotA = Math.min(4, equipoA.rotacion.length), rotB = Math.min(4, equipoB.rotacion.length);
    while (res.victorias.A < necesarias && res.victorias.B < necesarias) {
      var aLocal = localA ? localA[i % 7] : (i % 2 === 0);
      var visita = aLocal ? equipoB : equipoA, local = aLocal ? equipoA : equipoB;
      var j = simularJuego(visita, local, {
        semilla: (semilla * 7919 + i * 104729) >>> 0 || 1,
        abridorIndexVisita: i % (aLocal ? rotB : rotA),
        abridorIndexLocal: i % (aLocal ? rotA : rotB),
        juegoNumero: i + 1
      });
      j.localEs = aLocal ? 'A' : 'B';
      var ganoA = (j.ganador === 'local') === aLocal;
      if (ganoA) res.victorias.A++; else res.victorias.B++;
      res.juegos.push(j);
      i++;
    }
    res.ganador = res.victorias.A > res.victorias.B ? 'A' : 'B';
    return res;
  }

  function simularMuchas(equipoA, equipoB, n, opts) {
    opts = opts || {};
    var semilla = esNulo(opts.semilla) ? 1 : opts.semilla;
    var r = { series: n, victoriasA: 0, victoriasB: 0, pctA: 0, pctB: 0, promedioCarrerasA: 0, promedioCarrerasB: 0, juegosPorSerie: { 4: 0, 5: 0, 6: 0, 7: 0 } };
    var cA = 0, cB = 0, juegos = 0, i, k;
    for (i = 0; i < n; i++) {
      var s = simularSerie(equipoA, equipoB, { alMejorDe: opts.alMejorDe || 7, semilla: (semilla + i * 1000003) >>> 0 });
      if (s.ganador === 'A') r.victoriasA++; else r.victoriasB++;
      r.juegosPorSerie[s.juegos.length] = (r.juegosPorSerie[s.juegos.length] || 0) + 1;
      for (k = 0; k < s.juegos.length; k++) {
        var j = s.juegos[k];
        var esLocalA = j.localEs === 'A';
        cA += esLocalA ? j.local.carreras : j.visita.carreras;
        cB += esLocalA ? j.visita.carreras : j.local.carreras;
        juegos++;
      }
      if (typeof opts.cada === 'function') opts.cada(i + 1, n);
    }
    r.pctA = n ? r.victoriasA / n : 0;
    r.pctB = n ? r.victoriasB / n : 0;
    r.promedioCarrerasA = juegos ? cA / juegos : 0;
    r.promedioCarrerasB = juegos ? cB / juegos : 0;
    return r;
  }

  // Temporada de `juegos` contra un oponente (normalmente el equipo neutro).
  // Usa descansos (la banca juega su parte real de PA), como en una temporada.
  function simularTemporada(equipo, oponente, juegos, semilla) {
    semilla = esNulo(semilla) ? 1 : semilla;
    var t = { juegos: 0, W: 0, L: 0, R: 0, RA: 0, H: 0, AB: 0, HR: 0, BB: 0, SO: 0, SB: 0, HRA: 0, BBA: 0, SOA: 0, HA: 0, errores: 0, entradas: 0, juegosLista: [] };
    var i, k;
    for (i = 0; i < juegos; i++) {
      var esLocal = i % 2 === 1;
      var j = simularJuego(esLocal ? oponente : equipo, esLocal ? equipo : oponente, {
        semilla: (semilla * 31 + i * 7919) >>> 0 || 1,
        abridorIndexVisita: i % (esLocal ? oponente : equipo).rotacion.length,
        abridorIndexLocal: i % (esLocal ? equipo : oponente).rotacion.length,
        juegoNumero: i + 1,
        descansos: true
      });
      var yo = esLocal ? 'local' : 'visita', el = esLocal ? 'visita' : 'local';
      t.juegos++;
      if (j.ganador === yo) t.W++; else t.L++;
      t.R += j[yo].carreras; t.RA += j[el].carreras; t.entradas += j.entradas; t.errores += j[yo].errores;
      var bb = j.boxscore[yo].bateo;
      for (k = 0; k < bb.length; k++) { t.H += bb[k].H; t.AB += bb[k].AB; t.HR += bb[k].HR; t.BB += bb[k].BB; t.SO += bb[k].SO; t.SB += bb[k].SB; }
      var pp = j.boxscore[yo].pitcheo;
      for (k = 0; k < pp.length; k++) { t.HRA += pp[k].HR; t.BBA += pp[k].BB; t.SOA += pp[k].SO; t.HA += pp[k].H; }
      t.juegosLista.push(j);
    }
    t.AVG = t.AB ? t.H / t.AB : 0;
    t.RporJuego = t.juegos ? t.R / t.juegos : 0;
    t.RAporJuego = t.juegos ? t.RA / t.juegos : 0;
    t.HRporJuego = t.juegos ? t.HR / t.juegos : 0;
    return t;
  }

  return {
    MODELO: MODELO,
    EVENTOS: EVENTOS,
    crearRng: crearRng,
    tasasRef: tasasRef,
    tasasAnio: tasasAnio,
    lineupSugerido: lineupSugerido,
    construirEquipo: construirEquipo,
    equipoNeutro: equipoNeutro,
    simularJuego: simularJuego,
    simularSerie: simularSerie,
    simularMuchas: simularMuchas,
    simularTemporada: simularTemporada,
    apellido: apellido
  };
})();

if (typeof module !== 'undefined') module.exports = SimMotor; else window.SimMotor = SimMotor;
