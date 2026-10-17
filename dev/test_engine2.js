const PSEInt = require('../pseint_engine.js');
const R = { sin_inicializar:false, obligar_definir:false, controlar_pc:false, concat_mas:true,
  funciones_cadena:true, palabras_yono:true, indices_base0:false, vars_dimension:true,
  redimensionar:true, asignar_igual:true, funciones_subproc:true, sintaxis_flexible:true,
  coloquial:true, segun_numerico:false, omitir_paso_menos1:true, diagramas_ns:false,
  formas_alt_le:false, acentos_nombres:true, preferir_algoritmo:true, preferir_funcion:true,
  variacion_mq:true, para_cada:true, preferir_mq:false, proteger_contador:true };

async function run(name, code, inputs, rules) {
  let out = '', idx = 0;
  const io = { print:(t)=>{out+=t;}, clear:()=>{}, read:async()=>((inputs||[])[idx++]??''),
    waitKey:async()=>{}, waitMs:async()=>{},
    onError:(m,l)=>{out+='** ERROR'+(l?' (l.'+l+')':'')+': '+m+'\n';},
    onFinish:(i)=>{ if(i&&i.error) out+='** FIN: '+i.error+'\n'; } };
  await new PSEInt.Runner(code, { rules: rules||R, io }).run();
  console.log('── ' + name + ' ──\n' + out.replace(/^/gm,'  │ '));
}

(async () => {
  await run('Leer múltiple + booleanos + Y/O/NO', `
Proceso P
  Definir a, b, c Como Entero
  Leer a b c
  Escribir "a=" a " b=" b " c=" c
  Definir t Como Logico
  t <- Verdadero Y NO Falso
  Escribir "t=" t
  Si a > 0 O b > 100 Entonces
    Escribir "condicion OK"
  FinSi
  Escribir "Mayor: "
  Si a > b Y a > c Entonces
    Escribir a
  SiNo
    Si b > c Entonces
      Escribir b
    SiNo
      Escribir c
    FinSi
  FinSi
FinProceso`, ['5','9','2']);

  await run('Para con Con Paso + decreciente', `
Proceso P
  Definir i Como Entero
  Para i <- 0 Hasta 10 Con Paso 2 Hacer
    Escribir Sin Saltar i " "
  FinPara
  Escribir ""
  Para i <- 5 Hasta 1 Con Paso -1 Hacer
    Escribir Sin Saltar i " "
  FinPara
  Escribir ""
FinProceso`);

  await run('Segun con cadenas + De Otro Modo', `
Proceso P
  Definir op Como Caracter
  op <- "b"
  Segun op Hacer
    "a": Escribir "Elegiste A"
    "b": Escribir "Elegiste B"
    De Otro Modo: Escribir "Otra"
  FinSegun
FinProceso`);

  await run('Redimensionar + matriz 2D', `
Proceso P
  Definir m Como Entero
  Dimension m[2,3]
  m[1,1] <- 1
  m[1,2] <- 2
  m[1,3] <- 3
  m[2,1] <- 4
  m[2,2] <- 5
  m[2,3] <- 6
  Definir i, j Como Entero
  Para i <- 1 Hasta 2 Hacer
    Para j <- 1 Hasta 3 Hacer
      Escribir Sin Saltar m[i,j] " "
    FinPara
    Escribir ""
  FinPara
FinProceso`);

  await run('Repetir ... Mientras Que (variacion)', `
Proceso P
  Definir n, s Como Entero
  n <- 0
  s <- 0
  Repetir
    n <- n + 1
    s <- s + n
  Mientras Que n < 5
  Escribir "s=" s
FinProceso`);

  await run('Errores: division por cero y subindice', `
Proceso P
  Definir x Como Real
  x <- 10 / 0
  Escribir x
FinProceso`);

  await run('Errores: indice fuera de rango', `
Proceso P
  Definir A Como Entero
  Dimension A[3]
  Escribir A[7]
FinProceso`);

  await run('DECIMALES y formato', `
Proceso P
  Escribir 1/3
  Escribir 2/3
  Escribir 10/4
  Escribir 22/7
  Escribir 100
  Escribir 1.5 + 2.5
  Escribir "Pi es " PI
FinProceso`);

  await run('Acentos en variables + funciones cadena base0', `
Proceso P
  Definir año Como Entero
  año <- 2026
  Escribir "Año: " año
FinProceso`, [], Object.assign({}, R, { indices_base0:true }));
})().catch(e=>{ console.error('FATAL', e); process.exit(1); });
