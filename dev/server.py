#!/usr/bin/env python3
"""
server.py — Servidor de desarrollo para Patto (alternativa local a Profreehost).

Sirve index.html Y hace de proxy /proxy.php hacia Reflection AI / Beam.

Por que hace falta:
  1) api.reflection.ai NO manda cabeceras CORS -> el navegador no puede llamarla directo.
  2) 'python -m http.server' NO ejecuta PHP, asi que proxy.php no correria en local.

Uso:
    1. Deten el otro servidor (el 'python -m http.server 8000').
    2. Pega tu key en REFLECTION_API_KEY (o exportala en la variable de entorno).
    3. python dev/server.py
    4. Abre http://localhost:8000

Este archivo es SOLO para local: NO lo subas al hosting.
"""
import json
import os
import re
import sys
import html as html_ent
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = int(os.environ.get("PORT", "8000"))

REFLECTION_URL = "https://api.reflection.ai/openai/v1/chat/completions"
REFLECTION_MODEL = "Beam-1.0-501B-A23B"

# La key vive en proxy.php (una sola fuente de verdad para local y produccion).
# Tambien sirve la variable de entorno REFLECTION_API_KEY, que tiene prioridad.
def _key_from_proxy_php():
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)  # la app vive un nivel arriba de dev/
    # 1) patto_secret.php (fuera de la carpeta web)
    for cand in (
        os.path.join(root, "..", "patto_secret.php"),
        os.path.join(root, "..", "..", "patto_secret.php"),
        os.path.join(root, "patto_secret.php"),
    ):
        try:
            with open(cand, "r", encoding="utf-8", errors="replace") as fh:
                m = re.search(r"REFLECTION_API_KEY'\s*,\s*'([^']+)'", fh.read())
                if m and m.group(1):
                    return m.group(1)
        except OSError:
            continue
    # 2) respaldo dentro de proxy.php
    try:
        with open(os.path.join(root, "proxy.php"), "r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                m = re.match(r"\s*const\s+REFLECTION_API_KEY\s*=\s*'([^']*)'", line) \
                    or re.match(r"\s*\$patto_key_fallback\s*=\s*'([^']*)'", line)
                if m and m.group(1) and m.group(1) != "TU_API_KEY_AQUI":
                    return m.group(1)
    except OSError:
        pass
    return ""

REFLECTION_API_KEY = os.environ.get("REFLECTION_API_KEY") or _key_from_proxy_php() or "PEGA_TU_KEY_AQUI"

USER_AGENT = "Mozilla/5.0 (compatible; Patto/1.0; +https://patto)"


def _fetch_json(url, timeout=12):
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", "replace"))


def _decode_ddg_url(href):
    if href.startswith("//"):
        href = "https:" + href
    m = re.search(r"[?&]uddg=([^&]+)", href)
    return urllib.parse.unquote(m.group(1)) if m else href


def _plain(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html_ent.unescape(s or ""))).strip()


def _ddg_html(query, limit=5):
    url = "https://html.duckduckgo.com/html/?q=" + urllib.parse.quote(query)
    req = urllib.request.Request(url, headers={
        "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                       "(KHTML, like Gecko) Chrome/120 Safari/537.36"),
        "Accept-Language": "es-ES,es;q=0.9",
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        page = resp.read().decode("utf-8", "replace")
    anchors = re.findall(r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', page, re.S)
    snippets = re.findall(r'class="result__snippet"[^>]*>(.*?)</a>', page, re.S)
    out = []
    for i, (href, title) in enumerate(anchors[:limit]):
        snip = _plain(snippets[i]) if i < len(snippets) else ""
        out.append("%d. %s: %s (%s)" % (i + 1, _plain(title), snip, _decode_ddg_url(href)))
    return out


def _wikipedia(query, limit=3):
    api = ("https://es.wikipedia.org/w/api.php?action=query&format=json&utf8=1"
           "&list=search&srlimit=%d&srsearch=%s" % (limit, urllib.parse.quote(query)))
    data = _fetch_json(api)
    out = []
    for hit in data.get("query", {}).get("search", [])[:limit]:
        title = hit.get("title", "")
        snippet = _plain(hit.get("snippet", ""))
        url = "https://es.wikipedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_"))
        out.append("- %s: %s (%s)" % (title, snippet, url))
    return out


def web_search(query):
    """Busqueda web sin API key: DuckDuckGo HTML (principal) + Wikipedia (respaldo)."""
    q = (query or "").strip()
    if not q:
        return "No se proporciono ninguna consulta de busqueda."

    parts = []
    try:
        results = _ddg_html(q)
        if results:
            parts.append("Resultados web:\n" + "\n".join(results))
    except Exception:
        pass

    if not parts:
        try:
            wiki = _wikipedia(q)
            if wiki:
                parts.append("Wikipedia:\n" + "\n".join(wiki))
        except Exception:
            pass

    text = "\n\n".join(parts).strip()
    if not text:
        text = "No se encontraron resultados en internet para: " + q
    return text[:4000]


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")

    def _send_json_error(self, code, message):
        body = json.dumps({"error": {"message": message}}).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self._cors_headers()
        self.end_headers()

    def do_POST(self):
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path not in ("/proxy.php", "/proxy"):
            self.send_error(404, "Not found")
            return

        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            self._send_json_error(400, "Invalid JSON")
            return

        # Accion de busqueda web: POST /proxy.php?action=search  { "query": "..." }
        params = urllib.parse.parse_qs(parsed.query)
        if params.get("action", [""])[0] == "search":
            text = web_search(payload.get("query", ""))
            out = json.dumps({"text": text}, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(out)))
            self._cors_headers()
            self.end_headers()
            self.wfile.write(out)
            return

        payload["model"] = REFLECTION_MODEL
        payload["stream"] = True
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

        request = urllib.request.Request(
            REFLECTION_URL,
            data=body,
            method="POST",
            headers={
                "Authorization": "Bearer " + REFLECTION_API_KEY,
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            },
        )

        try:
            upstream = urllib.request.urlopen(request, timeout=55)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")
            self._send_json_error(exc.code, detail)
            return
        except Exception as exc:  # noqa: BLE001
            self._send_json_error(502, "Proxy error: %s" % exc)
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Connection", "close")
        self._cors_headers()
        self.end_headers()
        self.close_connection = True

        try:
            while True:
                chunk = upstream.read(256)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            upstream.close()

        try:
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass


def main():
    os.chdir(root)
    if "PEGA_TU_KEY_AQUI" in REFLECTION_API_KEY:
        print("!! Aviso: no has configurado REFLECTION_API_KEY en server.py -> el proxy fallara.")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print("Patto dev server -> http://%s:%d   (Ctrl+C para salir)" % (HOST, PORT))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nCerrando...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
