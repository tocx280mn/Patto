<?php
/**
 * proxy.php — Puente entre Patto (navegador) y Reflection AI / Beam.
 *
 * Por qué existe:
 *   1) api.reflection.ai NO envía cabeceras CORS -> el navegador no puede llamarla directo.
 *   2) La API key debe vivir SOLO en el servidor, nunca en el HTML.
 *
 * Dos acciones:
 *   - (por defecto)  POST proxy.php            -> reenvía a Beam en streaming (SSE).
 *   - (?action=search) POST proxy.php?action=search  { "query": "..." }
 *                       -> busca en internet (Wikipedia + DuckDuckGo) y devuelve { "text": ... }
 *
 * Sube este archivo junto a index.html en Profreehost.
 *
 * La API key puede vivir FUERA de la carpeta web (recomendado): ver el bloque
 * "Configuracion de la API key" mas abajo.
 */

/* --- Configuracion de la API key -------------------------------------------
 * La key se busca en este orden (gana la primera que exista):
 *
 *   1) Variable de entorno  REFLECTION_API_KEY
 *      (cPanel: "MultiPHP INI Editor" / SetEnv en .htaccess, o export en local)
 *
 *   2) Archivo patto_secret.php FUERA de la carpeta web   <-- RECOMENDADO
 *      Crea el archivo patto_secret.php en la carpeta PADRE de la carpeta donde
 *      subiste la app (o dos niveles mas arriba). Contenido (una sola linea):
 *          <?php define('REFLECTION_API_KEY', 'eyJ...');
 *      Al estar fuera de la carpeta publica, nadie puede descargarlo por URL ni
 *      aunque el hosting sirviera los .php como texto plano.
 *
 *   3) La constante de respaldo de aqui abajo (vacia en este repositorio).
 *      Si la rellenas, la key queda escrita en un archivo que sirve el servidor
 *      web: nunca subas ese archivo a GitHub ni lo dejes asi en un hosting
 *      compartido. En el repo esta vacia a proposito.
 * --------------------------------------------------------------------------- */
$patto_key = (string) getenv('REFLECTION_API_KEY');

if ($patto_key === '') {
    foreach ([
        dirname(__DIR__) . '/patto_secret.php',      // carpeta PADRE de la app
        dirname(__DIR__, 2) . '/patto_secret.php',   // dos niveles arriba
        __DIR__ . '/patto_secret.php',               // junto a proxy.php
    ] as $patto_secret) {
        if (is_file($patto_secret)) {
            require_once $patto_secret;
            if (defined('REFLECTION_API_KEY')) { $patto_key = (string) REFLECTION_API_KEY; }
            break;
        }
    }
}

if ($patto_key === '') {
    $patto_key_fallback = '';
}

if ($patto_key === '' && isset($patto_key_fallback)) { $patto_key = $patto_key_fallback; }

if ($patto_key !== '' && !defined('REFLECTION_API_KEY')) {
    define('REFLECTION_API_KEY', $patto_key);
}

if (!defined('REFLECTION_API_KEY') || REFLECTION_API_KEY === '') {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'El proxy no tiene configurada la API key.']);
    exit;
}
const REFLECTION_URL     = 'https://api.reflection.ai/openai/v1/chat/completions';
const REFLECTION_MODEL   = 'Beam-1.0-501B-A23B';
const USER_AGENT         = 'Mozilla/5.0 (compatible; Patto/1.0)';

/* --- CORS ------------------------------------------------------------------
 * index.html y proxy.php se sirven desde el MISMO origen, asi que el navegador
 * no necesita CORS para nada. Antes habia un "*": eso permitia que CUALQUIER
 * pagina web llamara a este proxy desde el navegador de sus visitantes y
 * gastara tu key (sin verla). Ahora solo se atiende al propio dominio.
 * ------------------------------------------------------------------------- */
$patto_origen = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($patto_origen !== '') {
    $patto_host_origin = (string) parse_url($patto_origen, PHP_URL_HOST);
    $patto_puerto_origin = parse_url($patto_origen, PHP_URL_PORT);
    if ($patto_host_origin !== '' && $patto_puerto_origin) { $patto_host_origin .= ':' . $patto_puerto_origin; }
    if ($patto_host_origin === '' || strcasecmp($patto_host_origin, (string) ($_SERVER['HTTP_HOST'] ?? '')) !== 0) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Origen no autorizado.']);
        exit;
    }
    header('Access-Control-Allow-Origin: ' . $patto_origen);
    header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: POST, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Method Not Allowed']);
    exit;
}

/* --- Limite de peticiones por IP (protege tus creditos de un uso abusivo) ---
 * Ventana de 10 minutos. Si el hosting no deja escribir en la carpeta temporal,
 * el limite simplemente no se aplica: nunca rompe el funcionamiento normal.
 * Para cambiarlo: patto_rate_limited($max, $segundos)  ->  60 peticiones / 10 min.
 * ------------------------------------------------------------------------- */
function patto_rate_limited($max = 60, $ventana = 600)
{
    $dir = sys_get_temp_dir();
    if ($dir === '' || !is_dir($dir) || !is_writable($dir)) { return false; }

    $ip  = $_SERVER['REMOTE_ADDR'] ?? 'desconocida';
    $f   = $dir . DIRECTORY_SEPARATOR . 'patto_rl_' . md5($ip) . '.json';
    $now = time();

    $marcas = [];
    $previo = @file_get_contents($f);
    if ($previo !== false) {
        $decod = json_decode($previo, true);
        if (is_array($decod)) { $marcas = $decod; }
    }

    $vigentes = [];
    foreach ($marcas as $t) {
        if (is_int($t) && $t > $now - $ventana) { $vigentes[] = $t; }
    }

    if (count($vigentes) >= $max) { return true; }

    $vigentes[] = $now;
    @file_put_contents($f, json_encode($vigentes), LOCK_EX);
    return false;
}

if (patto_rate_limited()) {
    http_response_code(429);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Demasiadas peticiones seguidas. Espera unos minutos e intentalo de nuevo.']);
    exit;
}

$raw = file_get_contents('php://input');
$payload = json_decode($raw !== false ? $raw : '', true);
if (!is_array($payload)) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Invalid JSON']);
    exit;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ACCIÓN: BÚSQUEDA WEB
 * ═══════════════════════════════════════════════════════════════════════════ */
if (($_GET['action'] ?? '') === 'search') {
    $text = patto_web_search((string)($payload['query'] ?? ''));
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['text' => $text], JSON_UNESCAPED_UNICODE);
    exit;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ACCIÓN POR DEFECTO: REENVIAR A BEAM EN STREAMING (SSE)
 * ═══════════════════════════════════════════════════════════════════════════ */
$payload['model']  = REFLECTION_MODEL;
$payload['stream'] = true;
$body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

// El proxy solo espera a la red (no consume CPU), así que el límite de ejecución de
// PHP no debería matarlo; lo desactivamos por seguridad en respuestas largas.
@set_time_limit(0);

// Desactivar buffering de PHP/webserver para que el stream fluya.
while (ob_get_level() > 0) { ob_end_flush(); }
@ini_set('zlib.output_compression', '0');
@ini_set('output_buffering', '0');
@ini_set('implicit_flush', '1');
@apache_setenv('no-gzip', '1');

header('Content-Type: text/event-stream; charset=utf-8');
header('Cache-Control: no-cache');
header('X-Accel-Buffering: no');

$ch = curl_init(REFLECTION_URL);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $body,
    CURLOPT_HTTPHEADER     => [
        'Authorization: Bearer ' . REFLECTION_API_KEY,
        'Content-Type: application/json',
        'Accept: text/event-stream',
    ],
    CURLOPT_RETURNTRANSFER => false,
    // OJO: nada de CURLOPT_TIMEOUT aquí. Es un límite de la transferencia COMPLETA y
    // cortaba a mitad las respuestas largas (razonamiento MAX). En su lugar abortamos
    // solo si la conexión se queda muda: menos de 1 byte/s durante 120 s.
    CURLOPT_CONNECTTIMEOUT  => 15,
    CURLOPT_LOW_SPEED_LIMIT => 1,
    CURLOPT_LOW_SPEED_TIME  => 120,
    CURLOPT_WRITEFUNCTION  => function ($ch, $chunk) {
        echo $chunk;
        @ob_flush();
        @flush();
        // Si el navegador ya se desconectó, cortamos la transferencia.
        return connection_aborted() ? 0 : strlen($chunk);
    },
]);

$ok = curl_exec($ch);

if ($ok === false) {
    $err = curl_error($ch);
    echo 'data: ' . json_encode(['error' => ['message' => 'Proxy error: ' . $err]]) . "\n\n";
}
curl_close($ch);

echo "data: [DONE]\n\n";


/* ═══════════════════════════════════════════════════════════════════════════
 * BÚSQUEDA WEB SIN API KEY (Wikipedia es + DuckDuckGo Instant Answer)
 * ═══════════════════════════════════════════════════════════════════════════ */
function patto_http_get($url, $timeout = 15, $accept = 'application/json')
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_USERAGENT      => USER_AGENT,
        CURLOPT_HTTPHEADER     => ['Accept: ' . $accept, 'Accept-Language: es-ES,es;q=0.9'],
    ]);
    $body = curl_exec($ch);
    curl_close($ch);
    return $body === false ? null : $body;
}

function patto_ddg_url($href)
{
    if (strpos($href, '//') === 0) $href = 'https:' . $href;
    if (preg_match('/[?&]uddg=([^&]+)/', $href, $m)) return urldecode($m[1]);
    return $href;
}

function patto_plain($s)
{
    $s = html_entity_decode(strip_tags((string)$s), ENT_QUOTES, 'UTF-8');
    return trim(preg_replace('/\s+/', ' ', $s));
}

function patto_web_search($query)
{
    $q = trim((string)$query);
    if ($q === '') return 'No se proporcionó ninguna consulta de búsqueda.';

    $parts = [];

    // 1) DuckDuckGo HTML: fragmentos web reales (sin API key).
    $page = patto_http_get('https://html.duckduckgo.com/html/?q=' . rawurlencode($q), 15, 'text/html');
    if ($page) {
        preg_match_all('/class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/s', $page, $m1, PREG_SET_ORDER);
        preg_match_all('/class="result__snippet"[^>]*>(.*?)<\/a>/s', $page, $m2, PREG_SET_ORDER);
        $lines = [];
        for ($i = 0; $i < min(5, count($m1)); $i++) {
            $href  = patto_ddg_url(patto_plain($m1[$i][1]));
            $title = patto_plain($m1[$i][2]);
            $snip  = isset($m2[$i]) ? patto_plain($m2[$i][1]) : '';
            $lines[] = ($i + 1) . ". {$title}: {$snip} ({$href})";
        }
        if ($lines) $parts[] = "Resultados web:\n" . implode("\n", $lines);
    }

    // 2) Wikipedia en español como respaldo.
    if (!$parts) {
        $api  = 'https://es.wikipedia.org/w/api.php?action=query&format=json&utf8=1'
              . '&list=search&srlimit=3&srsearch=' . rawurlencode($q);
        $data = json_decode(patto_http_get($api), true);
        $lines = [];
        foreach (array_slice($data['query']['search'] ?? [], 0, 3) as $hit) {
            $title = $hit['title'] ?? '';
            $snip  = patto_plain($hit['snippet'] ?? '');
            $url   = 'https://es.wikipedia.org/wiki/' . rawurlencode(str_replace(' ', '_', $title));
            $lines[] = "- {$title}: {$snip} ({$url})";
        }
        if ($lines) $parts[] = "Wikipedia:\n" . implode("\n", $lines);
    }

    $text = trim(implode("\n\n", $parts));
    if ($text === '') $text = 'No se encontraron resultados en internet para: ' . $q;
    return function_exists('mb_substr') ? mb_substr($text, 0, 4000) : substr($text, 0, 4000);
}
