/*
 * narracion.js — Convierte las jugadas del motor en frases de radio sobrias,
 * en español de México. Una frase por jugada. Sin dependencias.
 *
 * Exporta `SimNarracion` con:
 *   narrar(juego)            -> [{jugada, texto}]
 *   frase(jugada, contexto)  -> string
 *
 * El contexto guarda qué jugadores ya se presentaron (nombre completo la
 * primera vez, apellido después), los nombres de los equipos y un generador
 * reproducible para elegir variantes de redacción. La dirección del batazo
 * (`jugada.direccion`) la genera el motor con el rng del juego; aquí sólo se
 * redacta.
 */
var SimNarracion = (function () {
  'use strict';

  // Generador propio (mulberry32) para elegir variantes sin tocar al motor.
  function crearRng(semilla) {
    var a = ((semilla | 0) >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var ORDINALES = ['', 'primera', 'segunda', 'tercera', 'cuarta', 'quinta', 'sexta', 'séptima', 'octava', 'novena', 'décima', 'undécima', 'duodécima'];
  function ordinal(n) { return n < ORDINALES.length ? ORDINALES[n] : 'entrada ' + n; }
  function entradaTexto(n) { return n < ORDINALES.length ? 'la ' + ORDINALES[n] : 'la entrada ' + n; }

  var SUFIJOS = { 'Jr.': 1, 'Sr.': 1, 'II': 1, 'III': 1, 'IV': 1 };
  function apellido(nombre) {
    var partes = String(nombre).trim().split(/\s+/);
    while (partes.length > 1 && SUFIJOS[partes[partes.length - 1]]) partes.pop();
    return partes[partes.length - 1];
  }

  // Nombre corto del equipo: «New York Yankees 1927» → «Yankees 1927».
  function equipoCorto(nombre) {
    if (!nombre) return '';
    if (/promedio/i.test(nombre)) return nombre;
    var partes = nombre.trim().split(/\s+/);
    if (partes.length >= 3 && /^\d{4}$/.test(partes[partes.length - 1])) return partes.slice(-2).join(' ');
    return nombre;
  }

  function nuevoContexto(juego) {
    var ctx = {
      vistos: {},
      equipos: { visita: equipoCorto(juego && juego.visita ? juego.visita.nombre : 'la visita'), local: equipoCorto(juego && juego.local ? juego.local.nombre : 'el local') },
      rng: crearRng(((juego && juego.semilla) || 1) * 3 + 11),
      contador: 0
    };
    return ctx;
  }

  function elegir(ctx, opciones) {
    var u = ctx && ctx.rng ? ctx.rng() : ((ctx.contador = (ctx.contador || 0) + 1) * 0.618) % 1;
    return opciones[Math.floor(u * opciones.length) % opciones.length];
  }

  // Nombre completo la primera vez, apellido después.
  function nombre(ctx, jugador) {
    if (!jugador) return '';
    if (ctx.vistos[jugador.id]) return apellido(jugador.nombre);
    ctx.vistos[jugador.id] = true;
    return jugador.nombre;
  }

  function numeroTexto(n) {
    var t = ['cero', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];
    return n < t.length ? t[n] : String(n);
  }

  function outsTexto(outs) {
    if (outs === 1) return 'Un out.';
    if (outs === 2) return 'Dos outs.';
    if (outs >= 3) return 'Tres outs.';
    return '';
  }

  // Zona del batazo en palabras.
  var JARDIN = { izquierdo: 'el jardín izquierdo', central: 'el jardín central', derecho: 'el jardín derecho' };
  var JARDINERO = { izquierdo: 'el izquierdo', central: 'el central', derecho: 'el derecho' };
  var INFIELD = { lanzador: 'el lanzador', receptor: 'el receptor', primera: 'primera', segunda: 'segunda', short: 'el short', tercera: 'tercera' };
  function esJardin(d) { return !!JARDIN[d]; }
  // «a» + zona con contracción: «al short», «a primera», «al jardín central».
  function a(zona) { return /^el /.test(zona) ? 'al ' + zona.slice(3) : 'a ' + zona; }
  function de(zona) { return /^el /.test(zona) ? 'del ' + zona.slice(3) : 'de ' + zona; }

  // Marcador tras una jugada, desde el punto de vista de la ofensiva.
  function marcadorTexto(ctx, j) {
    var m = j.marcador, of = j.ofensiva, de = of === 'visita' ? 'local' : 'visita';
    var mio = m[of], suyo = m[de];
    var yo = ctx.equipos[of], el = ctx.equipos[de];
    if (mio === suyo) return elegir(ctx, ['Empatan a ' + mio + '.', 'Se empata el juego, ' + mio + ' a ' + suyo + '.']);
    if (mio > suyo) return elegir(ctx, [yo + ' arriba ' + mio + ' a ' + suyo + '.', yo + ' al frente, ' + mio + ' a ' + suyo + '.', 'Va ganando ' + yo + ' ' + mio + ' a ' + suyo + '.']);
    return elegir(ctx, [yo + ' se acerca, ' + mio + ' a ' + suyo + '.', 'Sigue abajo ' + yo + ', ' + mio + ' a ' + suyo + ' ' + el + '.']);
  }

  function carrerasTexto(ctx, j) {
    var n = j.carrerasAnotadas ? j.carrerasAnotadas.length : 0;
    if (!n) return '';
    var quienes = j.carrerasAnotadas.map(function (c) { return nombre(ctx, c); });
    var s;
    if (n === 1) s = 'Anota ' + quienes[0] + '.';
    else s = 'Anotan ' + quienes.slice(0, -1).join(', ') + ' y ' + quienes[n - 1] + '.';
    return s + ' ' + marcadorTexto(ctx, j);
  }

  function corredoresTexto(ctx, j) {
    var b = j.basesDespues || [null, null, null];
    var ocupadas = [];
    if (b[0]) ocupadas.push('primera');
    if (b[1]) ocupadas.push('segunda');
    if (b[2]) ocupadas.push('tercera');
    if (!ocupadas.length) return '';
    if (ocupadas.length === 3) return elegir(ctx, ['Casa llena.', 'Bases llenas.']);
    if (ocupadas.length === 1) return 'Corredor en ' + ocupadas[0] + '.';
    return 'Corredores en ' + ocupadas[0] + ' y ' + ocupadas[1] + '.';
  }

  function unir() {
    var partes = [], i;
    for (i = 0; i < arguments.length; i++) if (arguments[i]) partes.push(arguments[i]);
    return partes.join(' ');
  }

  // ---- Frases por tipo de jugada ------------------------------------------
  function fraseInicio(ctx, j) {
    var parte = j.alta ? 'Alta' : 'Baja';
    var eq = ctx.equipos[j.ofensiva];
    var lanz = j.lanzador ? nombre(ctx, j.lanzador) : null;
    if (j.entrada === 1 && j.alta) return parte + ' de la primera. ' + eq + ' al bate' + (lanz ? '; lanza ' + lanz + '.' : '.');
    return elegir(ctx, [
      parte + ' de ' + entradaTexto(j.entrada) + '. ' + eq + ' al bate' + (lanz ? ' contra ' + lanz + '.' : '.'),
      parte + ' de ' + entradaTexto(j.entrada) + '. Batea ' + eq + (lanz ? '; en la loma, ' + lanz + '.' : '.'),
      'Vamos a la ' + (j.alta ? 'alta' : 'baja') + ' de ' + entradaTexto(j.entrada) + '. ' + eq + ' al bate' + (lanz ? ' contra ' + lanz + '.' : '.')
    ]);
  }

  function fraseFinEntrada(ctx, j) {
    var m = j.marcador;
    var marc = ctx.equipos.visita + ' ' + m.visita + ', ' + ctx.equipos.local + ' ' + m.local + '.';
    return elegir(ctx, [
      'Se cierra la ' + (j.alta ? 'alta' : 'baja') + ' de ' + entradaTexto(j.entrada) + '. ' + marc,
      'Tres outs. Al final de la ' + (j.alta ? 'alta' : 'baja') + ' de ' + entradaTexto(j.entrada) + ', ' + marc,
      'Termina la ' + (j.alta ? 'alta' : 'baja') + ' de ' + entradaTexto(j.entrada) + ': ' + marc
    ]);
  }

  function fraseFinJuego(ctx, j) {
    var m = j.marcador;
    var g = m.visita > m.local ? 'visita' : 'local', p = g === 'visita' ? 'local' : 'visita';
    var extra = j.entradas > 9 ? ' en ' + j.entradas + ' entradas' : '';
    return 'Final del juego' + extra + ': ' + ctx.equipos[g] + ' ' + m[g] + ', ' + ctx.equipos[p] + ' ' + m[p] + '.';
  }

  function fraseCambio(ctx, j) {
    var sale = nombre(ctx, j.sale), entra = nombre(ctx, j.entra);
    var outs = j.sale && typeof j.sale.IPouts === 'number' ? j.sale.IPouts : null;
    var entradas = '';
    if (outs !== null) {
      if (outs === 0) entradas = '';
      else if (outs < 3) entradas = outs + '/3 de entrada';
      else if (outs % 3 === 0) entradas = (outs / 3) + (outs === 3 ? ' entrada' : ' entradas');
      else entradas = Math.floor(outs / 3) + ' y ' + (outs % 3) + '/3 entradas';
    }
    if (j.motivo === 'cerrador') return elegir(ctx, [
      'Cambio de lanzador: entra el cerrador ' + entra + ' por ' + sale + ' para ' + entradaTexto(j.entrada) + '.',
      'Viene el cerrador. Sale ' + sale + ', entra ' + entra + '.'
    ]);
    if (j.motivo === 'carreras') return elegir(ctx, [
      'Cambio de lanzador: sale ' + sale + ', muy castigado, y entra ' + entra + '.',
      'Se acabó la noche para ' + sale + '. Entra ' + entra + '.'
    ]);
    return elegir(ctx, [
      'Cambio de lanzador: sale ' + sale + (entradas ? ' tras ' + entradas : '') + ', entra ' + entra + '.',
      'Movimiento en la loma: se va ' + sale + (entradas ? ' después de ' + entradas : '') + ' y entra ' + entra + '.'
    ]);
  }

  function fraseRobo(ctx, j) {
    var c = nombre(ctx, j.corredor);
    var base = j.base === 3 ? 'la tercera' : 'la segunda';
    if (j.exito) return elegir(ctx, [c + ' se roba ' + base + '.', 'Se lanza ' + c + ' y se roba ' + base + '.', 'Robo de ' + base.replace('la ', '') + ' para ' + c + '.']);
    return elegir(ctx, [
      c + ' intenta robar ' + base + ' y lo ponen out. ' + outsTexto(j.outsDespues),
      'Tiro del receptor y ' + c + ' es out tratando de robar ' + base + '. ' + outsTexto(j.outsDespues)
    ]);
  }

  function frasePA(ctx, j) {
    var bat = nombre(ctx, j.bateador);
    var lanz = j.lanzador ? nombre(ctx, j.lanzador) : '';
    var d = j.direccion, outs = outsTexto(j.outsDespues);
    var car = carrerasTexto(ctx, j);
    // Tras la carrera que decide el juego (walk-off) no se mencionan corredores.
    var walkoff = !j.alta && j.entrada >= 9 && j.marcador && j.marcador.local > j.marcador.visita;
    var cor = walkoff ? '' : corredoresTexto(ctx, j);
    if (j.outEnBases) {
      var ob = j.outEnBases, nc = nombre(ctx, ob.corredor);
      cor = unir(ob.base === 4
        ? elegir(ctx, ['Tiro a home y ponen out a ' + nc + ' en el plato.', nc + ' trata de anotar y lo ponen out en home.'])
        : elegir(ctx, [nc + ' intenta llegar a tercera y lo ponen out.', 'Tiro a tercera y ' + nc + ' es out tratando de avanzar.']),
        outsTexto(j.outsDespues), j.outsDespues < 3 ? cor : '');
    }
    var ap = apellido(j.bateador.nombre);
    switch (j.evento) {
      case 'K':
        return unir(elegir(ctx, [
          bat + ' se poncha.', 'Ponche a ' + bat + ', tirándole.', 'Ponche a ' + bat + ', sin tirarle.',
          bat + ' abanica y se poncha.', 'Tercer strike a ' + bat + '.'
        ]), outs);
      case 'BB':
        return unir(elegir(ctx, [
          'Base por bolas para ' + bat + '.', 'Cuatro malas y ' + bat + ' se va a primera.',
          (lanz ? lanz + ' pierde a ' + bat + ': base por bolas.' : 'Base por bolas para ' + bat + '.')
        ]), car, cor);
      case 'HBP':
        return unir(elegir(ctx, ['Pelotazo a ' + bat + '; se va a primera.', 'Le pegan a ' + bat + ' con el lanzamiento, toma la primera.']), car, cor);
      case '1B':
        return unir(esJardin(d) ? elegir(ctx, [
          'Sencillo de ' + bat + ' ' + a(JARDIN[d]) + '.',
          bat + ' conecta de hit a' + JARDINERO[d].replace('el', 'l') + '.',
          'Línea de ' + bat + ' que cae en ' + JARDIN[d] + ': sencillo.',
          'Hit de ' + bat + ' por ' + JARDINERO[d] + '.'
        ]) : elegir(ctx, [
          'Rodado lento por ' + INFIELD[d] + ', ' + bat + ' le gana al tiro: sencillo.',
          'Batazo de ' + bat + ' que pasa junto ' + a(INFIELD[d]) + ': hit al cuadro.'
        ]), car, cor);
      case '2B':
        return unir(elegir(ctx, [
          'Doble de ' + bat + ' por ' + JARDINERO[d] + '.',
          'Batazo de ' + bat + ' ' + a(JARDIN[d]) + ', llega a segunda con doble.',
          bat + ' pega doble por la raya de' + JARDINERO[d].replace('el', 'l') + '.',
          'Línea de ' + bat + ' al hueco de' + JARDINERO[d].replace('el', 'l') + ': tubey.'
        ]), car, cor);
      case '3B':
        return unir(elegir(ctx, [
          'Triple de ' + bat + ' por ' + JARDINERO[d] + '.',
          'Batazo largo de ' + bat + ' ' + a(JARDIN[d]) + '; llega hasta tercera con triple.'
        ]), car, cor);
      case 'HR': {
        var n = j.carrerasAnotadas.length;
        var cuantas = n === 1 ? 'Una carrera.' : (n === 4 ? 'Grand slam, cuatro carreras.' : numeroTexto(n).charAt(0).toUpperCase() + numeroTexto(n).slice(1) + ' carreras.');
        return unir(elegir(ctx, [
          'Batazo largo por ' + JARDIN[d] + '… se va, se va… cuadrangular de ' + bat + '.',
          'Cuadrangular de ' + bat + ' por ' + JARDINERO[d] + '.',
          bat + ' la saca por ' + JARDIN[d] + '. Cuadrangular.',
          'Enorme batazo de ' + bat + ' por ' + JARDINERO[d] + ', se fue de jonrón.'
        ]), cuantas, marcadorTexto(ctx, j));
      }
      case 'OUT_ROLA':
        return unir(elegir(ctx, [
          'Rola ' + a(INFIELD[d]) + ', tiro a primera, out.',
          'Rodado ' + a(INFIELD[d]) + ', ' + ap + ' es out en primera.',
          bat + ' batea rola ' + a(INFIELD[d]) + '; out en primera.',
          'Rola de ' + bat + ' ' + a(INFIELD[d]) + ', lo ponen out.'
        ]), car, outs, j.outsDespues < 3 ? cor : '');
      case 'GIDP':
        return unir(elegir(ctx, [
          'Rola ' + a(INFIELD[d]) + ', doble play: ' + ap + ' batea para dos outs.',
          'Rodado ' + a(INFIELD[d]) + ', se la pasan a segunda y a primera: doble matanza para ' + bat + '.',
          bat + ' batea para doble play por ' + INFIELD[d] + '.'
        ]), car, outs, j.outsDespues < 3 ? cor : '');
      case 'OUT_ELEVADO':
        return unir(esJardin(d) ? elegir(ctx, [
          'Elevado ' + a(JARDIN[d]) + ', out.',
          'Fly de ' + bat + ' ' + a(JARDINERO[d]) + ', lo atrapan sin problemas.',
          bat + ' eleva a' + JARDIN[d].replace('el', 'l') + '; out.'
        ]) : elegir(ctx, [
          'Elevado corto ' + a(INFIELD[d]) + ', out.',
          bat + ' eleva al cuadro, lo atrapa ' + INFIELD[d] + '.'
        ]), car, outs, j.outsDespues < 3 ? cor : '');
      case 'OUT_LINEA':
        return unir(esJardin(d) ? elegir(ctx, [
          'Línea ' + a(JARDINERO[d]) + ', out.',
          bat + ' pega línea a' + JARDIN[d].replace('el', 'l') + ', pero la atrapan.'
        ]) : elegir(ctx, [
          'Línea ' + a(INFIELD[d]) + ', la atrapa de aire. Out.',
          bat + ' conecta línea dura ' + a(INFIELD[d]) + '; out.'
        ]), outs, j.outsDespues < 3 ? cor : '');
      case 'SF':
        return unir(elegir(ctx, [
          'Elevado ' + a(JARDIN[d]) + ', lo atrapan y anota el corredor desde tercera: fly de sacrificio de ' + bat + '.',
          'Fly de sacrificio de ' + bat + ' ' + a(JARDINERO[d]) + '.'
        ]), car, outs, cor);
      case 'E': {
        var zona = esJardin(d) ? JARDIN[d] : INFIELD[d];
        var intro = j.subtipo === 'elevado' ? 'Elevado ' + a(zona) + ', se le cae' : (j.subtipo === 'linea' ? 'Línea ' + a(zona) + ', no la puede retener' : 'Rola ' + a(zona) + ', se le escapa');
        return unir(elegir(ctx, [
          intro + ': error, ' + bat + ' llega a primera.',
          'Error de la defensa en ' + (esJardin(d) ? zona : 'la jugada ' + de(zona)) + '; ' + bat + ' queda en primera.'
        ]), car, cor);
      }
      default:
        return bat + ' al bate.';
    }
  }

  function frase(jugada, contexto) {
    var ctx = contexto || nuevoContexto(null);
    switch (jugada.tipo) {
      case 'INICIO_ENTRADA': return fraseInicio(ctx, jugada);
      case 'FIN_ENTRADA': return fraseFinEntrada(ctx, jugada);
      case 'FIN_JUEGO': return fraseFinJuego(ctx, jugada);
      case 'CAMBIO_PITCHER': return fraseCambio(ctx, jugada);
      case 'ROBO': return fraseRobo(ctx, jugada);
      case 'PA': return frasePA(ctx, jugada);
      default: return '';
    }
  }

  function narrar(juego) {
    var ctx = nuevoContexto(juego);
    return juego.jugadas.map(function (j) { return { jugada: j, texto: frase(j, ctx) }; });
  }

  return { narrar: narrar, frase: frase, nuevoContexto: nuevoContexto, apellido: apellido, equipoCorto: equipoCorto };
})();

if (typeof module !== 'undefined') module.exports = SimNarracion; else window.SimNarracion = SimNarracion;
