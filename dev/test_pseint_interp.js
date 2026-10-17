/* Compara el motor JS contra la salida oficial de PSeInt.
 *
 * Los 195 casos de pseint/test/interp traen su .out con la salida esperada y,
 * cuando hace falta, un .arg con las opciones del perfil y los valores que se
 * teclean en los Leer (--input=...).
 *
 * Uso:
 *   node dev/test_pseint_interp.js                 -> corre todo y resume
 *   node dev/test_pseint_interp.js -v              -> muestra cada diferencia
 *   node dev/test_pseint_interp.js --real <caso>   -> salida real de pseint.exe
 *
 * Rutas configurables con PSEINT_TEST_INTERP y PSEINT_EXE.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const PSEInt = require('../pseint_engine.js');

const DIR = process.env.PSEINT_TEST_INTERP ||
  'C:\\Users\\HP\\Music\\pseint-mobile\\pseint\\test\\interp';
const EXE = process.env.PSEINT_EXE || 'C:\\Program Files (x86)\\PSeInt\\pseint.exe';

if (!fs.existsSync(DIR)) {
  console.log('OMITIDO: no encuentro los casos en ' + DIR);
  console.log('Define PSEINT_TEST_INTERP con la ruta a pseint/test/interp.');
  process.exit(0);
}

/* Nombres de las opciones de PSeInt (LangSettings) -> reglas del motor. */
const OPT = {
  force_define_vars: 'obligar_definir',
  force_init_vars: 'sin_inicializar',
  force_semicolon: 'controlar_pc',
  base_zero_arrays: 'indices_base0',
  allow_concatenation: 'concat_mas',
  use_nassi_schneiderman: 'diagramas_ns',
  allow_dinamyc_dimensions: 'vars_dimension',
  allow_resize_arrays: 'redimensionar',
  overload_equal: 'asignar_igual',
  coloquial_conditions: 'coloquial',
  lazy_syntax: 'sintaxis_flexible',
  word_operators: 'palabras_yono',
  enable_user_functions: 'funciones_subproc',
  enable_string_functions: 'funciones_cadena',
  integer_only_switch: 'segun_numerico',
  deduce_negative_for_step: 'omitir_paso_menos1',
  allow_accents: 'acentos_nombres',
  prefer_algoritmo: 'preferir_algoritmo',
  prefer_funcion: 'preferir_funcion',
  allow_repeat_while: 'variacion_mq',
  prefer_repeat_while: 'preferir_mq',
  allow_for_each: 'para_cada',
  protect_for_counter: 'proteger_contador'
};

/* Valores predeterminados de PSeInt para el perfil "<predeterminado>". */
const DEFAULTS = {
  force_define_vars: false, force_init_vars: false, force_semicolon: false,
  base_zero_arrays: false, allow_concatenation: true, use_nassi_schneiderman: false,
  use_alternative_io_shapes: false, allow_dinamyc_dimensions: true,
  allow_resize_arrays: true, overload_equal: false, coloquial_conditions: true,
  lazy_syntax: true, word_operators: true, enable_user_functions: true,
  enable_string_functions: true, integer_only_switch: false,
  deduce_negative_for_step: true, allow_accents: true, prefer_algoritmo: true,
  prefer_funcion: true, allow_repeat_while: true, prefer_repeat_while: false,
  allow_for_each: true, protect_for_counter: true
};

function readAny(file) {
  const buf = fs.readFileSync(file);
  let txt = buf.toString('utf8');
  if (txt.includes('\uFFFD')) txt = buf.toString('latin1');
  return txt.replace(/^\uFEFF/, '');
}

function leerArg(base) {
  const r = { rules: {}, inputs: [], noinput: true, desconocidas: [] };
  const f = path.join(DIR, base + '.arg');
  if (!fs.existsSync(f)) return r;
  const texto = readAny(f).replace(/\r?\n/g, ' ');
  for (const bruto of texto.split(/\s+/)) {
    if (!bruto) continue;
    if (bruto.startsWith('--input=')) { r.inputs.push(bruto.slice(8).replace(/^"|"$/g, '')); continue; }
    if (bruto === '--noinput') { continue; }
    const m = bruto.match(/^--([a-z_]+)=(.*)$/);
    if (!m) { r.desconocidas.push(bruto); continue; }
    const valor = /^(1|v|s|t)/i.test(m[2]);
    if (m[1] in DEFAULTS) {
      r.rules[OPT[m[1]]] = valor;
    } else {
      r.desconocidas.push(bruto);
    }
  }
  return r;
}

const SIN_DATOS = 'No hay datos de entrada disponibles.';

/* Ejecuta el caso con el motor JS y devuelve {salida, error, linea, pasos}.
   Se imita el modo --fortest de PSeInt: los Esperar y el limpiar pantalla dejan
   un marcador en la salida y un Leer sin datos falla solo si la variable tiene
   un tipo declarado (igual que PSeInt, que en ese caso da ExeError 120). */
async function correrMotor(code, rules, inputs) {
  let salida = '';
  const pendientes = inputs.slice();
  let error = null, linea = 0;
  const io = {
    print: (t) => { salida += t; },
    clear: () => { salida += '***LimpiarPantalla***\n'; },
    read: (tipo, line) => {
      if (!pendientes.length) {
        if (tipo === 'entero' || tipo === 'real' || tipo === 'logico') {
          const e = new Error(SIN_DATOS); e.line = line || 0; throw e;
        }
        return '';
      }
      const v = pendientes.shift();
      salida += v + '\n';   // PSeInt refleja lo tecleado
      return v;
    },
    waitKey: () => { salida += '***EsperarTecla***\n'; },
    waitMs: (ms) => { salida += '***Esperar' + Math.round(ms) + '***\n'; },
    onError: (msg, ln) => { error = msg; linea = ln || 0; }
  };
  const runner = new PSEInt.Runner(code, { rules, io });
  await runner.run();
  return { salida, error, linea, pasos: runner.interp ? runner.interp.steps : 0 };
}

/* Casos donde el motor se aparta a propósito de la salida de referencia:
   el PSeInt de escritorio ignora las opciones del perfil al dimensionar (su
   comportamiento es indefinido y así está documentado); el motor sí las respeta,
   igual que la corrección que aplica el port nativo. */
const CONOCIDAS = {
  'redimension-01': 'el motor respeta allow_resize_arrays=0',
  'redimension-03': 'el motor respeta allow_resize_arrays=0',
  'redimension-05': 'el motor informa el error al redimensionar, no al dimensionar'
};

/* Normaliza la salida esperada de PSeInt: separa texto de diagnosticos. */
function partirEsperado(txt) {
  const lineas = txt.replace(/\r\n/g, '\n').split('\n');
  const salida = [], errores = [];
  for (const l of lineas) {
    const m = l.match(/^=== Line (\d+): (.*)$/);
    if (m) errores.push({ linea: parseInt(m[1], 10), texto: m[2].trim() });
    else salida.push(l);
  }
  while (salida.length && salida[salida.length - 1] === '') salida.pop();
  return { salida: salida.join('\n'), errores };
}

function normalizar(s) {
  return s.replace(/\r\n/g, '\n').split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n').trim();
}

function diffLinea(a, b) {
  const x = a.split('\n'), y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || '') !== (y[i] || '')) {
      return 'linea ' + (i + 1) + ': motor=' + JSON.stringify(x[i] || '') +
             ' esperado=' + JSON.stringify(y[i] || '');
    }
  }
  return '';
}

// ── modo "salida real" ───────────────────────────────────────────────────
if (process.argv.includes('--real')) {
  const caso = process.argv[process.argv.indexOf('--real') + 1];
  const arg = leerArg(caso);
  const args = ['--fortest', '--rawerrors', '--nouser', '--noinput'];
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (k in arg.rules) continue;
    if (k in OPT || k === 'use_alternative_io_shapes') {
      const nombre = k;
      const val = arg.rules[OPT[k]];
      if (val === undefined) continue;
      args.push('--' + nombre + '=' + (val ? 1 : 0));
    }
  }
  for (const i of arg.inputs) args.push('--input=' + i);
  args.push(path.join(DIR, caso + '.psc'));
  const r = spawnSync(EXE, args, { encoding: 'latin1' });
  console.log('caso: ' + caso);
  console.log('args: ' + args.join(' '));
  console.log('--- salida real de PSeInt ---');
  console.log(r.stdout);
  if (r.closed) console.log('(proceso cerrado por timeout)');
  process.exit(0);
}

// ── corrida completa ────────────────────────────────────────────────────
const detallado = process.argv.includes('-v');
const casos = fs.readdirSync(DIR).filter(f => /\.psc$/i.test(f)).map(f => f.replace(/\.psc$/i, '')).sort();

let iguales = 0, distinto = 0, motorFalla = 0, pseintFalla = 0, conocidas = 0;
const problemas = [], sinArg = [];

(async () => {
  for (const caso of casos) {
    const code = readAny(path.join(DIR, caso + '.psc'));
    const arg = leerArg(caso);
    if (arg.desconocidas.length) sinArg.push(caso + ': ' + arg.desconocidas.join(' '));

    const esperado = partirEsperado(readAny(path.join(DIR, caso + '.out')));
    let res;
    try {
      res = await correrMotor(code, arg.rules, arg.inputs);
    } catch (e) {
      res = { salida: '', error: 'EXCEPCION: ' + e.message, linea: 0 };
    }

    // PSeInt no imprime el "> " cuando no hay datos que leer (falla antes).
    let salidaBruta = res.salida;
    if (res.error === SIN_DATOS) salidaBruta = salidaBruta.replace(/(?:>\s*)+$/, '');
    const salidaMotor = normalizar(salidaBruta);
    const salidaOficial = normalizar(esperado.salida);
    const motorOk = !res.error;
    const oficialOk = esperado.errores.length === 0;

    if (salidaMotor === salidaOficial && motorOk === oficialOk) {
      // Misma salida y, si falla, mismo motivo de fondo (linea incluida si se sabe)
      let aviso = '';
      if (!motorOk && !oficialOk) {
        const lineaOficial = esperado.errores[0].linea;
        if (lineaOficial && res.linea && lineaOficial !== res.linea) {
          aviso = 'ERROR en linea distinta: motor=' + res.linea + ' pseint=' + lineaOficial;
        } else if (!res.linea && lineaOficial) {
          aviso = 'motor no informa la linea (pseint: ' + lineaOficial + ')';
        }
      }
      iguales++;
      if (aviso) problemas.push({ caso, tipo: 'aviso', detalle: aviso });
      continue;
    }

    let tipo, detalle;
    if (CONOCIDAS[caso]) {
      conocidas++;
      problemas.push({ caso, tipo: 'diferencia conocida', detalle: CONOCIDAS[caso] });
      continue;
    }
    if (motorOk && !oficialOk) {
      tipo = 'motor no detecta el error';
      detalle = 'PSeInt: ' + esperado.errores.map(e => 'L' + e.linea + ' ' + e.texto).join(', ');
      pseintFalla++;
    } else if (!motorOk && oficialOk) {
      tipo = 'motor falla donde PSeInt no';
      detalle = 'motor: L' + res.linea + ' ' + res.error;
      motorFalla++;
    } else {
      tipo = 'salida distinta';
      detalle = diffLinea(salidaMotor, salidaOficial);
      motorFalla++;
    }
    distinto++;
    problemas.push({ caso, tipo, detalle, salidaMotor, salidaOficial, error: res.error });
  }

  console.log('Casos de pseint/test/interp: ' + casos.length);
  console.log('  coinciden con la salida oficial: ' + iguales);
  console.log('  diferencias: ' + distinto);
  console.log('    (de ellas, conocidas y aceptadas: ' + conocidas + ')');
  if (sinArg.length) console.log('  avisos de flags no mapeados: ' + sinArg.length);
  const resumen = {};
  for (const p of problemas) resumen[p.tipo] = (resumen[p.tipo] || 0) + 1;
  for (const [t, n] of Object.entries(resumen)) console.log('    ' + t + ': ' + n);

  const aMostrar = detallado ? problemas : problemas.filter(p => p.tipo !== 'aviso' && p.tipo !== 'diferencia conocida').slice(0, 25);
  for (const p of aMostrar) {
    console.log('');
    console.log('── ' + p.caso + '  [' + p.tipo + ']');
    console.log('   ' + p.detalle);
    if (p.salidaMotor !== undefined && p.tipo === 'salida distinta') {
      console.log('   motor   : ' + JSON.stringify(p.salidaMotor.slice(0, 220)));
      console.log('   pseint  : ' + JSON.stringify(p.salidaOficial.slice(0, 220)));
    }
    if (p.error) console.log('   error   : ' + p.error);
  }
  if (!detallado && problemas.length > aMostrar.length) {
    console.log('');
    console.log('(' + (problemas.length - aMostrar.length) + ' mas; usa -v para verlas todas)');
  }
})();
