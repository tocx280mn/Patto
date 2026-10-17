const PSEInt = require('../pseint_engine.js');

const RULES = {
  sin_inicializar: false, obligar_definir: false, controlar_pc: false,
  concat_mas: true, funciones_cadena: true, palabras_yono: true,
  indices_base0: false, vars_dimension: true, redimensionar: true,
  asignar_igual: true, funciones_subproc: true, sintaxis_flexible: true,
  coloquial: true, segun_numerico: false, omitir_paso_menos1: true,
  diagramas_ns: false, formas_alt_le: false, acentos_nombres: true,
  preferir_algoritmo: true, preferir_funcion: true, variacion_mq: true,
  para_cada: true, preferir_mq: false, proteger_contador: true
};

async function run(name, code, inputs, rules) {
  let out = '';
  let idx = 0;
  const io = {
    print: (t) => { out += t; },
    clear: () => {},
    read: async () => (idx < (inputs || []).length ? inputs[idx++] : ''),
    waitKey: async () => {},
    waitMs: async () => {},
    onError: (msg, line) => { out += '** ERROR (línea ' + line + '): ' + msg + '\n'; }
  };
  const r = new PSEInt.Runner(code, { rules: rules || RULES, io });
  await r.run();
  console.log('══════ ' + name + ' ══════');
  console.log(out.replace(/^/gm, '  │ '));
}

(async () => {
  // 1) Patrón EXACTO del ejemplo oficial Promedio2.psc (parámetro sin tipo = arreglo)
  await run('Oficial Promedio2 (arreglo como parámetro)', [
    'SubProceso prom <- Promedio(arreglo, cantidad)',
    '    Definir i Como Entero',
    '    Definir suma Como Real',
    '    suma <- 0',
    '    Para i <- 1 Hasta cantidad Hacer',
    '        suma <- suma + arreglo[i]',
    '    FinPara',
    '    prom <- suma / cantidad',
    'FinSubProceso',
    'Proceso Principal',
    '    Definir i Como Entero',
    '    Definir prom Como Real',
    '    Dimension datos[5]',
    '    Para i <- 1 Hasta 5 Hacer',
    '        datos[i] <- i * 2',
    '    FinPara',
    '    prom <- Promedio(datos, 5)',
    '    Escribir "El promedio es: ", prom',
    'FinProceso'
  ].join('\n'));

  // 2) El subproceso MODIFICA el arreglo -> debe verse fuera (por referencia)
  await run('Arreglo modificado dentro del subproceso', [
    'SubProceso Rellenar(v)',
    '    Definir i Como Entero',
    '    Para i <- 1 Hasta 3 Hacer',
    '        v[i] <- i * 10',
    '    FinPara',
    'FinSubProceso',
    'Proceso P',
    '    Definir i Como Entero',
    '    Dimension a[3]',
    '    Rellenar(a)',
    '    Para i <- 1 Hasta 3 Hacer',
    '        Escribir a[i]',
    '    FinPara',
    'FinProceso'
  ].join('\n'));

  // 3) Por Referencia con escalar (debe seguir funcionando)
  await run('Escalar Por Referencia', [
    'SubProceso Incrementar(x Por Referencia)',
    '    x <- x + 1',
    'FinSubProceso',
    'Proceso P',
    '    Definir a Como Entero',
    '    a <- 5',
    '    Incrementar(a)',
    '    Escribir a',
    'FinProceso'
  ].join('\n'));

  // 4) Arreglo 2D como parámetro
  await run('Matriz 2D como parámetro', [
    'SubProceso Llenar(m, filas, columnas)',
    '    Definir i, j Como Entero',
    '    Para i <- 1 Hasta filas Hacer',
    '        Para j <- 1 Hasta columnas Hacer',
    '            m[i, j] <- i * 10 + j',
    '        FinPara',
    '    FinPara',
    'FinSubProceso',
    'Proceso P',
    '    Definir i, j Como Entero',
    '    Dimension t[2, 3]',
    '    Llenar(t, 2, 3)',
    '    Para i <- 1 Hasta 2 Hacer',
    '        Para j <- 1 Hasta 3 Hacer',
    '            Escribir Sin Saltar t[i, j], " "',
    '        FinPara',
    '        Escribir ""',
    '    FinPara',
    'FinProceso'
  ].join('\n'));

  // 5) Arreglo como parámetro + Por Referencia explícito
  await run('Arreglo declarado Por Referencia', [
    'SubProceso Doblar(v Por Referencia)',
    '    Definir i Como Entero',
    '    Para i <- 1 Hasta 3 Hacer',
    '        v[i] <- v[i] * 2',
    '    FinPara',
    'FinSubProceso',
    'Proceso P',
    '    Definir i Como Entero',
    '    Dimension a[3]',
    '    a[1] <- 1',
    '    a[2] <- 2',
    '    a[3] <- 3',
    '    Doblar(a)',
    '    Escribir a[1], " ", a[2], " ", a[3]',
    'FinProceso'
  ].join('\n'));
})();
