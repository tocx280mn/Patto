const fs = require('fs');
const path = require('path');
const PSEInt = require('../pseint_engine.js');
const R = { sin_inicializar:false, obligar_definir:false, controlar_pc:false, concat_mas:true,
  funciones_cadena:true, palabras_yono:true, indices_base0:false, vars_dimension:true,
  redimensionar:true, asignar_igual:true, funciones_subproc:true, sintaxis_flexible:true,
  coloquial:true, segun_numerico:false, omitir_paso_menos1:true, diagramas_ns:false,
  formas_alt_le:false, acentos_nombres:true, preferir_algoritmo:true, preferir_funcion:true,
  variacion_mq:true, para_cada:true, preferir_mq:false, proteger_contador:true };

const progs = [
  ['Condicional simple', `Proceso MayorDeDos
    Definir a, b Como Entero
    Escribir "Ingrese dos numeros"
    Leer a, b
    Si a > b Entonces
        Escribir "El mayor es ", a
    SiNo
        Escribir "El mayor es ", b
    FinSi
FinProceso`],
  ['Bucle Para + Si', `Proceso Tabla
    Definir i, n Como Entero
    n <- 5
    Para i <- 1 Hasta 10 Hacer
        Si i % 2 = 0 Entonces
            Escribir n, " x ", i, " = ", n*i
        SiNo
            Escribir i, " es impar"
        FinSi
    FinPara
FinProceso`],
  ['Mientras', `Proceso CuentaAtras
    Definir x Como Entero
    x <- 10
    Mientras x > 0 Hacer
        Escribir x
        x <- x - 1
    FinMientras
    Escribir "Despegue!"
FinProceso`],
  ['Repetir + Segun', `Proceso Menu
    Definir op, suma Como Entero
    suma <- 0
    Repetir
        Escribir "1) Sumar  2) Salir"
        Leer op
        Segun op Hacer
            1: suma <- suma + 10
            2: Escribir "Adios"
            De Otro Modo: Escribir "Opcion invalida"
        FinSegun
    Hasta Que op = 2
    Escribir "Suma total: ", suma
FinProceso`],
  ['Anidado (if dentro de while dentro de if)', `Proceso Anidado
    Definir i, j Como Entero
    i <- 1
    Mientras i <= 3 Hacer
        Si i = 2 Entonces
            Para j <- 1 Hasta 2 Hacer
                Escribir "i=", i, " j=", j
            FinPara
        SiNo
            Escribir "i=", i
        FinSi
        i <- i + 1
    FinMientras
FinProceso`]
];

let html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Diagramas PSeInt - prueba</title>
<style>
 body{font-family:Inter,Segoe UI,Arial,sans-serif;margin:0;padding:20px;background:#f1f5f9;color:#0f172a}
 h1{font-size:20px} h2{font-size:16px;margin:26px 0 8px}
 .grid{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap}
 .card{background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);max-width:100%}
 .card h3{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin:0 0 8px}
 .box{overflow:auto;max-width:900px;border:1px dashed #cbd5e1;border-radius:6px}
 pre{font-size:11.5px;background:#f8fafc;padding:8px;border-radius:6px;overflow:auto;max-width:900px}
</style></head><body><h1>Diagramas generados por pseint_engine.js</h1>`;

for (const [name, code] of progs) {
  const flow = PSEInt.buildFlowDiagram(code, { rules: R });
  const ns = PSEInt.buildNSDiagram(code, { rules: R });
  html += `<h2>${name}</h2><pre>${code.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</pre>
  <div class="grid">
    <div class="card"><h3>Diagrama de flujo (clásico)</h3><div class="box">${flow.ok ? flow.svg : '<b style="color:#b91c1c">Error: ' + flow.error + '</b>'}</div></div>
    <div class="card"><h3>Nassi-Shneiderman</h3><div class="box">${ns.ok ? ns.svg : '<b style="color:#b91c1c">Error: ' + ns.error + '</b>'}</div></div>
  </div>`;
}
html += '</body></html>';
fs.writeFileSync(path.join(__dirname, 'diagram_test.html'), html, 'utf8');
console.log('OK -> diagram_test.html');
for (const [name, code] of progs) {
  const f = PSEInt.buildFlowDiagram(code, { rules: R });
  console.log((f.ok ? 'flow OK ' : 'flow ERR ') + name + (f.ok ? ('  ' + f.width + 'x' + f.height) : ' :: ' + f.error));
}
