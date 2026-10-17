<?php
/*
 * Plantilla de configuracion de la API key de Reflection AI (Beam).
 *
 * COMO USARLA
 *   1. Copia este archivo con el nombre patto_secret.php.
 *   2. Colocalo, por orden de preferencia:
 *
 *      a) FUERA de la carpeta web, en la carpeta PADRE de la app. Es la opcion
 *         mas segura: el servidor no puede servir ese archivo por URL.
 *
 *      b) Si tu panel no permite subir nada fuera de la carpeta web (en
 *         VistaPanel, el panel de Profreehost, todo vive en "htdocs"), dejalo
 *         JUNTO a proxy.php. El proxy lo busca ahi tambien, y como es un archivo
 *         PHP el servidor lo ejecuta en vez de mostrarlo, asi que pedirlo por
 *         URL no revela la key.
 *
 *   3. Pega tu key entre las comillas.
 *
 * Orden de busqueda que usa proxy.php:
 *   1) variable de entorno REFLECTION_API_KEY
 *   2) patto_secret.php en la carpeta padre de la app, o dos niveles arriba
 *   3) patto_secret.php junto a proxy.php
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
