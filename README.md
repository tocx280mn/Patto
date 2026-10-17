# Patto

Patto es un chat web que escribe y ejecuta pseudocodigo PSeInt. Le pides un
algoritmo, te lo devuelve en pseudocodigo y puedes ejecutarlo en el momento en
una consola interactiva, sin salir de la pagina.

El interprete de PSeInt esta reescrito en JavaScript dentro de este proyecto: no
usa WebAssembly ni servicios externos, todo corre en el navegador.

## Funciones

- Escribe pseudocodigo PSeInt respetando el perfil de lenguaje activo.
- Ejecuta el algoritmo: la consola atiende los `Leer` y muestra la salida de
  `Escribir`.
- Antes de responder, ejecuta el pseudocodigo con el motor y, si da error, se lo
  devuelve al modelo para que lo corrija. Se apaga en Configuracion.
- Diagramas de flujo y de Nassi-Shneiderman generados como SVG (se activan en
  Configuracion).
- 469 perfiles de lenguaje (los de PSeInt mas tres extra), cada uno con su icono.
- Panel de razonamiento con el nivel de esfuerzo activo (Low, Medium, High, Max).
  Apagado por defecto; se enciende con el boton del cerebro.
- Contador real de velocidad: tokens por segundo, tokens y segundos.
- Busqueda en internet opcional, apagada por defecto. Apagada, Patto solo
  responde sobre PSeInt; encendida, consulta la web cuando hace falta.
- Adjunta archivos `.psc` para que los revise o los ejecute.
- Interfaz adaptable a movil, con animaciones cortas al aparecer cada mensaje,
  al abrir los dialogos y al pasar el raton por los botones.

## Requisitos

- Un hosting con PHP 8 y `curl` con salida a internet. Probado en Profreehost con
  PHP 8.3. No hace falta base de datos.
- Una API key de Reflection AI para el modelo Beam.

## Instalacion en el hosting

1. Sube a la carpeta publica:

       index.html
       pseint_engine.js
       perfiles.js
       perfiles/          (carpeta con los iconos)
       proxy.php

2. Coloca la API key. Deja el archivo `patto_secret.php` (toma como base
   `patto_secret.example.php`), que tiene una sola linea util:

        <?php define('REFLECTION_API_KEY', 'tu_key');

   El proxy lo busca en este orden, y gana el primero que exista:

   a) Junto a `proxy.php`. Es lo mas comodo y funciona en cualquier panel. Como
      es un archivo PHP, el servidor lo ejecuta en lugar de mostrarlo: pedirlo
      por URL no revela la key, y la plantilla ademas responde 404.

   b) Fuera de la carpeta web, en la carpeta PADRE de la app. Es lo mas seguro,
      pero requiere que el panel deje subir archivos fuera de la carpeta publica.
      Varios no lo permiten: en VistaPanel (el panel de Profreehost) todo vive en
      `htdocs` y las subidas de ahi hacia arriba se rechazan.

   c) Como ultimo recurso, la constante de respaldo dentro de `proxy.php`.
      Funciona igual, pero deja la key escrita en un archivo de la carpeta
      publica: usa (a) o (b) siempre que puedas.

3. Abre la pagina. Si falta la key, `proxy.php` responde 500 con un aviso claro.

## Desarrollo local

No hace falta PHP: `dev/server.js` sirve los archivos y hace de proxy.

    node dev/server.js
    # abre http://127.0.0.1:8000

La key se lee, en este orden, de la variable de entorno `REFLECTION_API_KEY`,
de `patto_secret.php` (junto a `proxy.php` o en la carpeta padre) o del respaldo
en `proxy.php`.

`dev/server.py` es una alternativa en Python con la misma funcion.

## Pruebas

    node dev/check_syntax.js        # valida el JavaScript incrustado en index.html
    node dev/test_engine.js         # interprete: expresiones, control, arreglos
    node dev/test_engine2.js        # mas casos del interprete
    node dev/test_arrays_params.js  # arreglos y parametros por referencia
    node dev/test_perfil_ops.js     # operadores segun el perfil (Y, O, NO, MOD)
    node dev/test_tresenraya.js     # partida completa de tres en raya
    node dev/test_diagram.js        # genera diagramas de prueba en dev/
    node dev/test_examples.js       # pasa los ejemplos oficiales de PSeInt
    node dev/test_pseint_interp.js  # compara el motor con la suite oficial de PSeInt

`test_examples.js` necesita la carpeta `bin/ejemplos` de la distribucion de
PSeInt. Indica su ruta con la variable de entorno `PSEINT_EJEMPLOS`. Si la carpeta
no existe, la prueba se omite con un aviso.

`test_pseint_interp.js` recorre `pseint/test/interp` (los 195 casos del
repositorio de PSeInt) y compara la salida del motor con los `.out` oficiales.
Indica esa carpeta con `PSEINT_TEST_INTERP`; con `--real <caso>` se ejecuta el
`pseint.exe` instalado para comprobar un caso concreto.

## El motor y los perfiles

El perfil de lenguaje activo entra al motor igual que en PSeInt: la consola, la
verificacion previa, el analisis y los diagramas reciben sus 24 opciones.

Estas son las que cambian de verdad el comportamiento (comprobadas una por una
contra `pseint.exe`):

    obligar_definir      sin_inicializar      indices_base0
    palabras_yono        omitir_paso_menos1   asignar_igual
    proteger_contador    redimensionar        funciones_subproc
    funciones_cadena     concat_mas           acentos_nombres
    variacion_mq         diagramas_ns

Las que en PSeInt son validacion estatica no bloquean la ejecucion: el motor
acepta codigo sin `;` aunque `controlar_pc` este activo, `Si` sin `Entonces`
aunque `sintaxis_flexible` este apagado, condiciones coloquiales (`x ES PAR`)
aunque `coloquial` este apagado, `Segun` con etiquetas de texto aunque
`segun_numerico` este activo, y dimensiones calculadas (`Dimension v[n]`) aunque
`vars_dimension` este apagado. La idea es ejecutar antes que rechazar: el codigo
del alumno corre en la consola y la verificacion previa ya devuelve al modelo los
errores de verdad.

Dos apartes, a proposito:

- `redimensionar`: el PSeInt de escritorio ignora `allow_resize_arrays`; el motor
  si lo respeta, igual que la correccion que aplica el port nativo. Esta anotado
  como diferencia conocida en `dev/test_pseint_interp.js`.
- `acentos_nombres`: con la opcion apagada, PSeInt rechaza el nombre acentuado al
  declararlo, asignarlo, leerlo o dimensionarlo, pero lo tolera en una lectura
  suelta (`Escribir año` imprime vacio). El motor lo rechaza siempre, para que
  ningun nombre que el perfil prohibe pase en silencio.

`formas_alt_le`, `preferir_algoritmo`, `preferir_funcion` y `preferir_mq` no
cambian la ejecucion: son preferencias del editor. Las dos primeras si se usan al
redactar el pedido al modelo. `para_cada` no se comprueba porque el PSeInt de
escritorio tambien acepta `Para Cada` con la opcion apagada.

## Estructura

    index.html           Interfaz completa: HTML, CSS y JavaScript en un archivo
    pseint_engine.js     Interprete de PSeInt y generadores de diagramas (SVG)
    perfiles.js          Los 469 perfiles de lenguaje con sus reglas
    perfiles/icons/      Iconos de los perfiles
    proxy.php            Proxy hacia la API; mantiene la key en el servidor
    dev/                 Servidores de desarrollo y pruebas
    LICENSE              Texto completo de la licencia

## Por que hay un proxy

`api.reflection.ai` no envia cabeceras CORS, asi que el navegador no puede
llamarla directamente. `proxy.php` hace la llamada desde el servidor y reenvia la
respuesta en streaming. La key nunca llega al navegador.

El proxy solo atiende peticiones de su propio dominio (el `Origin` debe coincidir
con el `Host`) y limita a 60 peticiones cada 10 minutos por IP.

## Perfiles e iconos

Los perfiles de lenguaje y sus iconos provienen de PSeInt
(https://pseint.sourceforge.net), de Pablo Novara y sus colaboradores, y se
distribuyen bajo GPL-2.0. Cada icono representa a la institucion que envio el
perfil y sigue siendo propiedad de esa institucion.

## Licencia

GPL-2.0. Es una licencia con copyleft: puedes usar, estudiar, modificar y
redistribuir este programa, y toda version derivada debe publicarse bajo la misma
licencia. El texto completo esta en `LICENSE`.

Se usa GPL-2.0, y no una licencia permisiva, porque el proyecto redistribuye datos
de PSeInt (perfiles e iconos), que se publican bajo GPL v2. Se mantiene la version
2 exacta, sin la clausula "o posterior", porque PSeInt no la concede.

## Creditos

- PSeInt, de Pablo Novara: origen de los perfiles, los ejemplos y las reglas de
  lenguaje que reimplementa el motor.
- Reflection AI (Beam): el modelo que genera los algoritmos.
- PSeInt Mobile: https://pseint-mobile.unaux.com
- Autor: https://github.com/tocx280mn
