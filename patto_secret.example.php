<?php
/*
 * Plantilla de configuracion de la API key de Reflection AI (Beam).
 *
 * COMO USARLA
 *   1. Copia este archivo con el nombre patto_secret.php.
 *   2. Colocalo FUERA de la carpeta web, en la carpeta PADRE de la app.
 *      En Profreehost: si la app esta dentro de public_html, el archivo va en
 *      la carpeta que contiene a public_html.
 *   3. Pega tu key entre las comillas.
 *
 * Orden de busqueda que usa proxy.php:
 *   1) variable de entorno REFLECTION_API_KEY
 *   2) patto_secret.php (carpeta padre de la app, o dos niveles arriba)
 *   3) la constante de respaldo dentro de proxy.php (vacia en el repositorio)
 *
 * Este archivo de ejemplo SI puede subirse a GitHub. El archivo real
 * (patto_secret.php) esta en .gitignore y nunca debe publicarse.
 */
define('REFLECTION_API_KEY', 'pega_aqui_tu_api_key_de_reflection_ai');
