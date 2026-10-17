/* Fidelidad del analizador: pasa TODOS los ejemplos oficiales de PSeInt por
   PSEInt.analyze con un perfil permisivo. Sirve para saber cuántos "falsos
   positivos" sacaría el aviso de perfil en las tarjetas de código. */
const fs = require('fs');
const path = require('path');
const PSEInt = require('../pseint_engine.js');

// Carpeta bin/ejemplos de la distribucion de PSeInt. Se indica con la variable
// de entorno PSEINT_EJEMPLOS; si no existe, esta prueba se omite.
const DIR = process.env.PSEINT_EJEMPLOS || path.join(__dirname, '..', 'ejemplos');

if (!fs.existsSync(DIR)) {
  console.log('OMITIDO: no encuentro los ejemplos de PSeInt en ' + DIR);
  console.log('Define PSEINT_EJEMPLOS con la ruta a la carpeta bin/ejemplos de PSeInt.');
  process.exit(0);
}

const PERMISIVO = {
  acentos_nombres: true, asignar_igual: false, coloquial: true, concat_mas: true,
  controlar_pc: false, funciones_cadena: true, funciones_subproc: true,
  indices_base0: false, obligar_definir: false, omitir_paso_menos1: true,
  palabras_yono: true, para_cada: true, preferir_algoritmo: true,
  preferir_funcion: false, preferir_mq: false, proteger_contador: false,
  redimensionar: true, segun_numerico: false, sin_inicializar: false,
  sintaxis_flexible: true, variacion_mq: true, vars_dimension: true, diagramas_ns: false
};

function readAny(file) {
  const buf = fs.readFileSync(file);
  let txt = buf.toString('utf8');
  if (txt.includes('\uFFFD')) txt = buf.toString('latin1');
  return txt.replace(/^\uFEFF/, '');
}

// Los .psc de la carpeta de ejemplos usan un markup especial de la ayuda de
// PSeInt: {X} = X (opcional), {;} = ';' solo si el perfil obliga el punto y coma,
// {1#0} = base de índices, {#-1} / {#+1} = variante que se ignora normalmente.
function resolveMarkup(s, rules) {
  return s.replace(/\{([^{}]*)\}/g, (_, inner) => {
    if (inner === ';') return rules.controlar_pc ? ';' : '';
    if (inner.includes('#')) {
      const a = inner.split('#')[0];
      if (a === '1' || a === '0') return rules.indices_base0 ? '0' : '1';
      return a;
    }
    return inner;
  });
}

// La primera línea de los ejemplos es una nota entre comillas: no es código.
function dropNoteLines(s) {
  return s.split(/\r?\n/).filter(l => !/^\s*"[^"]*"\s*$/.test(l)).join('\n');
}

const files = fs.readdirSync(DIR).filter(f => /\.psc$/i.test(f)).sort();
let ok = 0, bad = 0;
const fails = [];
for (const f of files) {
  const code = dropNoteLines(resolveMarkup(readAny(path.join(DIR, f)), PERMISIVO));
  let r;
  try { r = PSEInt.analyze(code, PERMISIVO); }
  catch (e) { r = { ok: false, errors: [{ line: 0, message: 'EXCEPCIÓN: ' + e.message }] }; }
  if (r.ok) { ok++; }
  else { bad++; fails.push(f + ' -> ' + r.errors.slice(0, 2).map(e => 'L' + e.line + ': ' + e.message).join(' | ')); }
}
console.log('Ejemplos oficiales: ' + files.length + '  OK: ' + ok + '  FALLAN: ' + bad);
fails.forEach(x => console.log('  ' + x));
