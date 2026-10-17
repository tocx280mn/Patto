<?php
/*
 * Plantilla de configuracion de la API key de Reflection AI (Beam).
 *
 * COMO USARLA
 *   1. Copia este archivo con el nombre patto_secret.php.
 *   2. Pega tu key entre las comillas de la ultima linea.
 *   3. Dejalo en la misma carpeta que proxy.php, o fuera de la carpeta web (ver
 *      abajo). El proxy lo encuentra solo.
 *
 * DONDE PONERLO
 *   a) JUNTO a proxy.php. Es lo mas comodo y funciona en cualquier hosting.
 *      Como es un archivo PHP, el servidor lo ejecuta en lugar de mostrarlo, asi
 *      que pedirlo por URL no revela la key (este archivo ademas responde 404 si
 *      alguien lo pide directamente).
 *
 *   b) FUERA de la carpeta web, en la carpeta PADRE de la app. Es la opcion mas
 *      segura, pero hay que poder subir archivos ahi. En paneles como VistaPanel
 *      (el de Profreehost) no se puede: todo vive en "htdocs".
 *
 * Orden de busqueda que usa proxy.php:
 *   1) variable de entorno REFLECTION_API_KEY
 *   2) patto_secret.php junto a proxy.php
 *   3) patto_secret.php en la carpeta padre de la app, o dos niveles arriba
 *   4) la constante de respaldo dentro de proxy.php (vacia en el repositorio)
 *
 * Este archivo de ejemplo SI puede subirse a GitHub. El archivo real
 * (patto_secret.php) esta en .gitignore y nunca debe publicarse.
 */

// Si alguien pide este archivo directamente por URL, responder 404.
if (isset($_SERVER['SCRIPT_FILENAME']) && realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    http_response_code(404);
    exit;
}

define('REFLECTION_API_KEY', 'pega_aqui_tu_api_key_de_reflection_ai');
