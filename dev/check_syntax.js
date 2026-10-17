const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Extrae todos los <script> en línea (sin src) y comprueba su sintaxis.
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, n = 0, bad = 0;
while ((m = re.exec(html)) !== null) {
  const code = m[1];
  if (!code.trim()) continue;
  n++;
  try {
    new Function(code);
    console.log('script #' + n + ': sintaxis OK (' + code.length + ' chars)');
  } catch (e) {
    bad++;
    console.log('script #' + n + ': ERROR DE SINTAXIS -> ' + e.message);
    const lines = code.split('\n');
    // Intenta localizar la línea exacta
    for (let i = 1; i <= lines.length; i++) {
      try { new Function(lines.slice(0, i).join('\n') + '\n}'); } catch (e2) { /* nada */ }
    }
    const mm = /(\d+)/.exec(e.stack ? e.stack.split('\n')[1] || '' : '');
    console.log('  (línea aproximada en el fragmento: ver stack)');
    console.log('  ' + String(e.stack || '').split('\n').slice(0, 3).join('\n  '));
  }
}
console.log(bad ? '*** HAY ERRORES ***' : 'Todo OK (' + n + ' bloques)');
