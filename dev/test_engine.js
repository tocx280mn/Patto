const PSEInt = require('../pseint_engine.js');

const PROFILE_FLEXIBLE = {
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
    onError: (msg, line) => { out += '** ERROR (línea ' + line + '): ' + msg + '\n'; },
    onFinish: (info) => { if (info && info.error) out += '** FIN con error: ' + info.error + '\n'; }
  };
  const r = new PSEInt.Runner(code, { rules: rules || PROFILE_FLEXIBLE, io });
  await r.run();
  console.log('══════ ' + name + ' ══════');
  console.log(out.replace(/^/gm, '  │ '));
  console.log('');
  return out;
}

(async () => {
  await run('Suma', `
Proceso Suma
    Definir A,B,C como Reales
    Escribir "Ingrese el primer numero:"
    Leer A
    Escribir "Ingrese el segundo numero:"
    Leer B
    C <- A+B
    Escribir "El resultado es: ",C
FinProceso
`, ['7', '5']);

  await run('Promedio', `
Proceso Promedio
    Definir i,N como Entero
    Definir acum,dato,prom como Reales
    Escribir "Ingrese la cantidad de datos:"
    Leer n
    acum<-0
    Para i<-1 Hasta n Hacer
        Escribir "Ingrese el dato ",i,":"
        Leer dato
        acum<-acum+dato
    FinPara
    prom<-acum/n
    Escribir "El promedio es: ",prom
FinProceso
`, ['3', '10', '20', '30']);

  await run('Factorial (funcion recursiva)', `
Funcion f <- factorial(n)
    Si n <= 1 Entonces
        f <- 1
    SiNo
        f <- n * factorial(n-1)
    FinSi
FinFuncion

Proceso Principal
    Definir k Como Entero
    Para k <- 1 Hasta 6 Hacer
        Escribir "factorial(", k, ") = ", factorial(k)
    FinPara
FinProceso
`, []);

  await run('Arreglos + Para Cada + Si/Segun', `
Proceso Arreglos
    Definir A Como Entero
    Definir i, mayor Como Entero
    Dimension A[5]
    A[1] <- 12
    A[2] <- 45
    A[3] <- 7
    A[4] <- 45
    A[5] <- 3
    mayor <- A[1]
    Para i <- 2 Hasta 5 Hacer
        Si A[i] > mayor Entonces
            mayor <- A[i]
        FinSi
    FinPara
    Escribir "Mayor = ", mayor
    Para Cada e De A Hacer
        Segun e Hacer
            45: Escribir e, " -> cuarenta y cinco"
            De Otro Modo: Escribir e
        FinSegun
    FinPara
FinProceso
`, []);

  await run('Repetir / Mientras / operadores', `
Proceso Ciclos
    Definir s, n Como Entero
    n <- 1
    Repetir
        s <- s + n
        n <- n + 1
    Hasta Que n > 100
    Escribir "Suma 1..100 = ", s
    Definir x Como Entero
    x <- 27
    Mientras x <> 0 Hacer
        Escribir x % 10
        x <- trunc(x/10)
    FinMientras
    Escribir (2^10), " | ", (17 MOD 5), " | ", (7/2)
FinProceso
`, []);

  await run('Coloquial (Es Mayor Que / Es Par / Es Multiplo De)', `
Algoritmo sin_titulo
    Definir a, b, c Como Entero
    a <- 15
    b <- 8
    c <- 30
    Si a Es Mayor Que b Y a Es Mayor Que c Entonces
        Escribir a " es el mayor"
    SiNo
        Si b Es Mayor Que c Entonces
            Escribir b " es el mayor"
        SiNo
            Escribir c " es el mayor"
        FinSi
    FinSi
    Si a Es Par
        Escribir a " es par"
    SiNo
        Escribir a " es impar"
    FinSi
    Para i Desde 1 Hasta b-1
        Si b Es Multiplo De i
            Escribir Sin Bajar i " "
        FinSi
    FinPara
    Escribir ""
FinAlgoritmo
`, []);

  await run('Funciones de cadena', `
Proceso Cadenas
    Definir t Como Caracter
    t <- "Hola Mundo"
    Escribir "Longitud: ", Longitud(t)
    Escribir "Mayus: ", Mayusculas(t)
    Escribir "Minus: ", Minusculas(t)
    Escribir "Sub(1,4): ", Subcadena(t,1,4)
    Escribir "Concat: ", Concatenar("ab","cd"), " | ", ConvertirANumero("3.5") + 1
FinProceso
`, []);

  await run('Subprocesos (valor y referencia)', `
SubProceso Saludar
    Escribir "Hola mundo!"
FinSubProceso

SubProceso res <- CalcularDoble(num)
    Definir res como real
    res <- num*2
FinSubProceso

SubProceso Triplicar(num Por Referencia)
    num <- num*3
FinSubProceso

Proceso PruebaFunciones
    Definir x Como Real
    Saludar
    x <- 5
    Escribir "El doble de ", x, " es ", CalcularDoble(x)
    Triplicar(x)
    Escribir "El nuevo valor de x es ", x
FinProceso
`, []);

  await run('Perfil Estricto (base 0, obligar definir, ; obligatorio)', `
Proceso Estricto
    Definir A Como Entero;
    Dimension A[3];
    A[0] <- 10;
    A[1] <- 20;
    A[2] <- 30;
    Escribir A[0] + A[1] + A[2];
FinProceso
`, [], {
    sin_inicializar: true, obligar_definir: true, controlar_pc: true, concat_mas: false,
    funciones_cadena: true, palabras_yono: true, indices_base0: true, vars_dimension: false,
    redimensionar: true, asignar_igual: false, funciones_subproc: true, sintaxis_flexible: false,
    coloquial: false, segun_numerico: true, omitir_paso_menos1: false, diagramas_ns: false,
    formas_alt_le: false, acentos_nombres: false, preferir_algoritmo: false, preferir_funcion: false,
    variacion_mq: false, para_cada: false, preferir_mq: false, proteger_contador: true
  });

  console.log('analyze OK:', JSON.stringify(PSEInt.analyze('Proceso X\n Escribir 1\nFinProceso', PROFILE_FLEXIBLE)));
  console.log('analyze ERR:', JSON.stringify(PSEInt.analyze('Proceso X\n  Escribir (1+2\nFinProceso', PROFILE_FLEXIBLE)));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
