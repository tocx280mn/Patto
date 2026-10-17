const PSEInt = require('../pseint_engine.js');

const COBAE = {
  acentos_nombres: false, asignar_igual: true, coloquial: false, concat_mas: true,
  controlar_pc: true, funciones_cadena: true, funciones_subproc: true,
  indices_base0: false, obligar_definir: true, omitir_paso_menos1: false,
  palabras_yono: false, para_cada: false, preferir_algoritmo: true,
  preferir_funcion: false, preferir_mq: false, proteger_contador: true,
  redimensionar: true, segun_numerico: false, sin_inicializar: false,
  sintaxis_flexible: false, variacion_mq: false, vars_dimension: true, diagramas_ns: false
};

const FLEXIBLE = Object.assign({}, COBAE, { palabras_yono: true, sintaxis_flexible: true, coloquial: true, controlar_pc: false, obligar_definir: false });

const CON_Y = [
  'Algoritmo T',
  '    Definir a, b Como Logico;',
  '    a <- Verdadero;',
  '    b <- Falso;',
  '    Si a Y b Entonces',
  '        Escribir "x";',
  '    FinSi',
  'FinAlgoritmo'
].join('\n');

const CON_SIMBOLOS = [
  'Algoritmo T',
  '    Definir a, b Como Logico;',
  '    a <- Verdadero;',
  '    b <- Falso;',
  '    Si a && b Entonces',
  '        Escribir "x";',
  '    FinSi',
  'FinAlgoritmo'
].join('\n');

function chk(name, code, rules) {
  const r = PSEInt.analyze(code, rules);
  console.log(name + ' -> ' + (r.ok ? 'OK (acepta)' : 'ERROR linea ' + r.errors[0].line + ': ' + r.errors[0].message));
}

console.log('perfil cobae-plantel1 (palabras Y/O/NO DESACTIVADAS)');
chk('  usa Y       ', CON_Y, COBAE);
chk('  usa &&      ', CON_SIMBOLOS, COBAE);
console.log('perfil Flexible (palabras Y/O/NO ACTIVADAS)');
chk('  usa Y       ', CON_Y, FLEXIBLE);
chk('  usa &&      ', CON_SIMBOLOS, FLEXIBLE);
