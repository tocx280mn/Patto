const fs = require('fs');
const path = require('path');
const PSEInt = require('../pseint_engine.js');

// Reglas exactas del perfil activo de Patto: cobae-plantel1
const RULES = {
  acentos_nombres: false, asignar_igual: true, coloquial: false, concat_mas: true,
  controlar_pc: true, diagramas_ns: false, formas_alt_le: false, funciones_cadena: true,
  funciones_subproc: true, indices_base0: false, obligar_definir: true,
  omitir_paso_menos1: false, palabras_yono: false, para_cada: false,
  preferir_algoritmo: true, preferir_funcion: false, preferir_mq: false,
  proteger_contador: true, redimensionar: true, segun_numerico: false,
  sin_inicializar: false, sintaxis_flexible: false, variacion_mq: false,
  vars_dimension: true
};

const code = fs.readFileSync(path.join(__dirname, 'tresenraya.psc'), 'utf8');

// Jugadas: primero una invalida (0,0) y luego una victoria por la diagonal.
const INPUTS = ['0', '0', '1', '1', '1', '2', '2', '2', '1', '3', '3', '3'];

async function main() {
  let out = '';
  let idx = 0;
  let errs = [];
  const io = {
    print: (t) => { out += t; },
    clear: () => {},
    read: async () => (idx < INPUTS.length ? INPUTS[idx++] : ''),
    waitKey: async () => {},
    waitMs: async () => {},
    onError: (msg, line) => { errs.push('linea ' + line + ': ' + msg); }
  };
  const r = new PSEInt.Runner(code, { rules: RULES, io });
  await r.run();
  console.log(out);
  console.log('─────── RESULTADO ───────');
  console.log('errores:', errs.length ? errs : 'ninguno');
  console.log('lineas leidas de entrada:', idx);
  console.log('gana jugador 1:', /Gana el Jugador 1/.test(out));
  console.log('aviso de movimiento invalido:', /Movimiento invalido/.test(out));
}

main().catch(e => { console.error('EXCEPCION:', e.message); process.exit(1); });
