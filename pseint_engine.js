/* ══════════════════════════════════════════════════════════════════════════════
   pseint_engine.js — Intérprete de pseudocódigo PSeInt (100% JavaScript)
   Reescritura propia, fiel a la sintaxis y semántica de PSeInt, para que Patto
   pueda EJECUTAR algoritmos en el navegador (sin servidor y sin compilar nada).

   Basado en el estudio del código fuente original de PSeInt:
     · LangSettings (perfiles)  · Keywords (sinónimos)  · FuncsPredefs (funciones)
     · DataValue (formato de salida)  · Ejecutar (semántica de instrucciones)
   ══════════════════════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

/* ───────────────────────────── Utilidades ───────────────────────────── */

var ACCENTS = { 'á':'a','é':'e','í':'i','ó':'o','ú':'u','ü':'u','ñ':'n',
                'Á':'A','É':'E','Í':'I','Ó':'O','Ú':'U','Ü':'U','Ñ':'N' };

function stripAccents(s) { return String(s).replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, function (c) { return ACCENTS[c] || c; }); }

function canon(s, allowAccents) { return (allowAccents === false ? stripAccents(s) : String(s)).toUpperCase(); }

/* Formato de números idéntico a PSeInt (sprintf "%.10f" y recorte de ceros) */
function fmtNum(x) {
  if (!isFinite(x)) return x > 0 ? 'Infinito' : (x < 0 ? '-Infinito' : 'Indefinido');
  if (Number.isInteger(x)) return String(x);
  var s = x.toFixed(10);
  s = s.replace(/0+$/, '');
  if (s.charAt(s.length - 1) === '.') s = s.slice(0, -1);
  if (s === '-0') s = '0';
  return s;
}

/* PSeInt trabaja con 10 dígitos significativos: `0.57*100` vale 57 y no
   56.99999999999999. Se aplica el mismo redondeo que usa al imprimir, para que
   trunc/redon y las comparaciones no arrastren el error de la coma flotante. */
function cleanFloat(x) {
  if (typeof x !== 'number' || !isFinite(x) || Number.isInteger(x)) return x;
  var r = Math.round(x * 1e10) / 1e10;
  return r;
}

function toStr(v) {
  if (typeof v === 'number') return fmtNum(v);
  if (typeof v === 'boolean') return v ? 'VERDADERO' : 'FALSO';
  if (typeof v === 'string') return v;
  // Una variable sin tipo y sin valor se imprime como texto vacío (PSeInt no le
  // asigna ningún valor por defecto hasta que se sabe de qué tipo es).
  if (v === undefined || v === null) return '';
  if (v && v.__ref) return toStr(v.get());
  if (v && v.__arr) return Array.isArray(v.data) ? v.data.map(toStr).join('') : '[arreglo]';
  return String(v);
}

function toReal(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  return 0;
}

function toInt(v) { return Math.trunc(toReal(v)); }

function truthy(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') return v.length > 0 && (v.charAt(0) === '1' || v.charAt(0).toUpperCase() === 'V');
  return false;
}

/* ───────────────────────────── Errores ───────────────────────────── */

function PseintError(msg, line) { this.name = 'PseintError'; this.message = msg; this.line = line; }
PseintError.prototype = Object.create(Error.prototype);

function StopSignal(msg) { this.name = 'StopSignal'; this.message = msg; this.__stop = true; }
StopSignal.prototype = Object.create(Error.prototype);

/* ───────────────────────────── Léxico ───────────────────────────── */

var OPS2 = ['<-', '<=', '>=', '<>', '==', '!='];
var OPS1 = '+-*/^%()[],;=<>:&|~!';

/* Cada token guarda `s` (inicio) y `e` (fin) dentro de la línea. PSeInt distingue
   `A(1)` (llamada) de `A (1)` (dos expresiones que se concatenan al Escribir),
   así que hace falta saber si hay un espacio entre el nombre y el paréntesis. */
function lex(line) {
  var toks = [], i = 0, n = line.length;
  while (i < n) {
    var c = line.charAt(i);
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    var start = i;
    if (c === '/' && line.charAt(i + 1) === '/') break;
    if (c === '/' && line.charAt(i + 1) === '*') { var e = line.indexOf('*/', i + 2); i = (e < 0) ? n : e + 2; continue; }
    if (c === '"' || c === "'") {
      var q = c; i++; var s = '';
      while (i < n) {
        var ch = line.charAt(i);
        if (ch === '\\' && i + 1 < n) {
          var esc = line.charAt(i + 1);
          s += (esc === 'n' ? '\n' : esc === 't' ? '\t' : esc === 'r' ? '\r' : esc);
          i += 2; continue;
        }
        if (ch === q) { if (line.charAt(i + 1) === q) { s += q; i += 2; continue; } i++; break; }
        s += ch; i++;
      }
      toks.push({ t: 'str', v: s, s: start, e: i }); continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(line.charAt(i + 1)))) {
      var j = i;
      while (j < n && /[0-9.]/.test(line.charAt(j))) j++;
      if ((line.charAt(j) === 'e' || line.charAt(j) === 'E') && /[0-9+\-]/.test(line.charAt(j + 1))) {
        j++; if (line.charAt(j) === '+' || line.charAt(j) === '-') j++;
        while (j < n && /[0-9]/.test(line.charAt(j))) j++;
      }
      var raw = line.slice(i, j); i = j;
      toks.push({ t: 'num', v: parseFloat(raw), s: start, e: i }); continue;
    }
    if (/[A-Za-z_\u00C0-\u024F]/.test(c)) {
      var k = i;
      while (k < n && /[A-Za-z0-9_\u00C0-\u024F]/.test(line.charAt(k))) k++;
      toks.push({ t: 'id', v: line.slice(i, k), s: start, e: k }); i = k; continue;
    }
    // PSeInt trata && || &| |& como UN ÚNICO operador, y el tipo lo decide el primer
    // carácter (Evaluar.cpp: `if ((c=='&'||c=='|') && (nc=='|'||nc=='&')) i++;`).
    // Sin esto, `a && b` se partía en `a & (&b)` y el AST quedaba con un operando nulo.
    if ((c === '&' || c === '|') && (line.charAt(i + 1) === '&' || line.charAt(i + 1) === '|')) {
      toks.push({ t: 'op', v: c, s: start, e: i + 2 }); i += 2; continue;
    }
    var two = line.substr(i, 2);
    if (OPS2.indexOf(two) >= 0) { toks.push({ t: 'op', v: two, s: start, e: i + 2 }); i += 2; continue; }
    if (OPS1.indexOf(c) >= 0) { toks.push({ t: 'op', v: c, s: start, e: i + 1 }); i++; continue; }
    i++; // carácter desconocido: se ignora
  }
  return toks;
}

/* Palabras compuestas → token único */
var MULTI = [
  [['FIN', 'ALGORITMO'], 'FINALGORITMO'], [['FIN', 'PROCESO'], 'FINPROCESO'],
  [['FIN', 'SI'], 'FINSI'], [['FIN', 'MIENTRAS'], 'FINMIENTRAS'],
  [['FIN', 'PARA'], 'FINPARA'], [['FIN', 'SEGUN'], 'FINSEGUN'],
  [['FIN', 'SUBALGORITMO'], 'FINSUBALGORITMO'], [['FIN', 'SUBPROCESO'], 'FINSUBPROCESO'],
  [['FIN', 'FUNCION'], 'FINFUNCION'],
  [['SIN', 'SALTAR'], 'SINSALTAR'], [['SIN', 'BAJAR'], 'SINBAJAR'],
  [['HASTA', 'QUE'], 'HASTAQUE'], [['MIENTRAS', 'QUE'], 'MIENTRASQUE'],
  [['DE', 'OTRO', 'MODO'], 'DEOTROMODO'], [['CON', 'PASO'], 'CONPASO'],
  [['PARA', 'CADA'], 'PARACADA'],
  [['POR', 'REFERENCIA'], 'PORREFERENCIA'], [['POR', 'VALOR'], 'PORVALOR'],
  [['SI', 'ES'], 'SIES'],
  [['LIMPIAR', 'PANTALLA'], 'LIMPIARPANTALLA'], [['BORRAR', 'PANTALLA'], 'LIMPIARPANTALLA'],
  [['ESPERAR', 'TECLA'], 'ESPERARTECLA'], [['ESPERAR', 'UNA', 'TECLA'], 'ESPERARTECLA']
];

function mergeMultiwords(toks, allowAccents) {
  var out = [], i = 0;
  while (i < toks.length) {
    var matched = null;
    for (var m = 0; m < MULTI.length; m++) {
      var seq = MULTI[m][0];
      if (i + seq.length > toks.length) continue;
      var ok = true;
      for (var s = 0; s < seq.length; s++) {
        var tk = toks[i + s];
        if (tk.t !== 'id' || stripAccents(tk.v).toUpperCase() !== seq[s]) { ok = false; break; }
      }
      if (ok && (!matched || seq.length > matched.seq.length)) matched = { seq: seq, name: MULTI[m][1] };
    }
    if (matched) {
      out.push({ t: 'id', v: matched.name, kw: true, s: toks[i].s, e: toks[i + matched.seq.length - 1].e });
      i += matched.seq.length;
    } else { out.push(toks[i]); i++; }
  }
  return out;
}

/* Preprocesa el código en "líneas lógicas" (una instrucción por segmento) */
function preprocess(code) {
  var clean = String(code).replace(/\/\*[\s\S]*?\*\//g, '');
  var raw = clean.split(/\r?\n/);
  var lines = [];
  for (var li = 0; li < raw.length; li++) {
    var text = raw[li];
    // quitar comentario de línea // (respetando cadenas)
    var inStr = null, cut = -1;
    for (var p = 0; p < text.length; p++) {
      var ch = text.charAt(p);
      if (inStr) { if (ch === '\\') { p++; continue; } if (ch === inStr) inStr = null; continue; }
      if (ch === '"' || ch === "'") { inStr = ch; continue; }
      if (ch === '/' && text.charAt(p + 1) === '/') { cut = p; break; }
    }
    if (cut >= 0) text = text.slice(0, cut);
    // separar por ';' de nivel superior
    var segs = [], depth = 0, cur = '', inS = null;
    for (var q = 0; q < text.length; q++) {
      var c2 = text.charAt(q);
      if (inS) { cur += c2; if (c2 === '\\') { cur += text.charAt(++q); continue; } if (c2 === inS) inS = null; continue; }
      if (c2 === '"' || c2 === "'") { inS = c2; cur += c2; continue; }
      if (c2 === '(' || c2 === '[') depth++;
      if (c2 === ')' || c2 === ']') depth--;
      if (c2 === ';' && depth <= 0) { segs.push(cur); cur = ''; continue; }
      cur += c2;
    }
    segs.push(cur);
    for (var si = 0; si < segs.length; si++) {
      if (segs[si].trim() === '') continue;
      lines.push({ text: segs[si], line: li + 1 });
    }
  }
  return lines;
}

/* ───────────────────────────── Tipos ───────────────────────────── */

var TIPO_MAP = {
  ENTERO: 'entero', ENTERA: 'entero', ENTEROS: 'entero', ENTERAS: 'entero',
  REAL: 'real', REALES: 'real', NUMERO: 'real', NUMEROS: 'real', NUMERICO: 'real', NUMERICA: 'real',
  NUMERICOS: 'real', NUMERICAS: 'real', DECIMAL: 'real',
  LOGICO: 'logico', LOGICA: 'logico', LOGICOS: 'logico', LOGICAS: 'logico', BOOLEANO: 'logico',
  CADENA: 'caracter', CADENAS: 'caracter', TEXTO: 'caracter', TEXTOS: 'caracter',
  CARACTER: 'caracter', CARACTERES: 'caracter', ALFANUMERICO: 'caracter'
};

function defaultFor(tipo) {
  if (tipo === 'logico') return false;
  if (tipo === 'caracter') return '';
  return 0;
}

/* ═════════════════════════════ PARSER ═════════════════════════════ */

/* Funciones predefinidas de PSeInt (sin acentos, en mayúsculas). */
var BUILTIN_NAMES = ['PI', 'EULER', 'RC', 'RAIZ', 'ABS', 'LN', 'EXP', 'SEN', 'COS', 'TAN',
  'ASEN', 'ACOS', 'ATAN', 'AZAR', 'ALEATORIO', 'TRUNC', 'REDON', 'FECHAACTUAL', 'HORAACTUAL',
  'LONGITUD', 'CONCATENAR', 'MAYUSCULAS', 'MINUSCULAS', 'SUBCADENA',
  'CONVERTIRANUMERO', 'CONVERTIRATEXTO'];

function Parser(code, rules) {
  this.rules = rules || {};
  this.allowAccents = this.rules.acentos_nombres !== false;
  // ¿El perfil permite las palabras Y, O, NO y MOD? Si no, PSeInt las trata como
  // identificadores normales y `a > 0 Y b < 5` es un error de sintaxis.
  this.wordOps = this.rules.palabras_yono !== false;
  this.lines = preprocess(code);
  for (var i = 0; i < this.lines.length; i++) {
    this.lines[i].toks = mergeMultiwords(lex(this.lines[i].text), this.allowAccents);
  }
  // Nombres de funciones y subprocesos: PSeInt admite separar el nombre del
  // paréntesis (`c <- trunc (a/b)`), así que hay que saber cuáles son funciones.
  this.funcNames = Object.create(null);
  for (var f = 0; f < BUILTIN_NAMES.length; f++) this.funcNames[BUILTIN_NAMES[f]] = true;
  for (var L = 0; L < this.lines.length; L++) {
    var tk = this.lines[L].toks;
    for (var p = 0; p < tk.length; p++) {
      if (tk[p].t !== 'id') continue;
      var kk = keyWord(tk[p].v);
      if (kk !== 'SUBPROCESO' && kk !== 'FUNCION' && kk !== 'SUBALGORITMO') continue;
      // Registra todos los nombres del encabezado: `ret <- nombre(...)` o `ret = nombre`.
      for (var q = p + 1; q < tk.length; q++) {
        if (tk[q].t === 'op' && tk[q].v === '(') break;
        if (tk[q].t === 'id') this.funcNames[keyWord(tk[q].v)] = true;
      }
      break;
    }
  }
  this.i = 0;
}

/* Los nombres de las palabras clave se comparan sin acentos: PSeInt acepta
   `función`, `según`, `dimensión`, `finsegún`, etc. como palabras reservadas.
   Los identificadores sí conservan sus acentos (regla `acentos_nombres`). */
function keyWord(s) { return stripAccents(String(s)).toUpperCase(); }

Parser.prototype.kw = function (tk) {
  if (!tk || tk.t !== 'id') return null;
  return keyWord(tk.v);
};
Parser.prototype.tokensAt = function (i) { return this.lines[i] ? this.lines[i].toks : []; };
Parser.prototype.curLine = function () { return this.lines[this.i] ? this.lines[this.i].line : 0; };
Parser.prototype.pushBack = function (toks, line) {
  this.lines.splice(this.i, 0, { text: tokensToText(toks), line: line, toks: toks });
};

function tokensToText(toks) {
  return toks.map(function (t) { return t.t === 'str' ? ('"' + t.v + '"') : (t.t === 'num' ? String(t.v) : String(t.v)); }).join(' ');
}

Parser.prototype.parseProgram = function () {
  var subs = [], mainBody = [], mainName = 'sin_titulo', headerFound = false;
  while (this.i < this.lines.length) {
    var toks = this.tokensAt(this.i);
    if (!toks.length) { this.i++; continue; }
    var k = this.kw(toks[0]);
    if (k === 'ALGORITMO' || k === 'PROCESO') {
      headerFound = true;
      if (toks[1] && (toks[1].t === 'id' || toks[1].t === 'num')) mainName = String(toks[1].v);
      this.i++;
      mainBody = mainBody.concat(this.parseBlock(['FINALGORITMO', 'FINPROCESO']));
      var stop = this.tokensAt(this.i);
      if (stop.length && ['FINALGORITMO', 'FINPROCESO'].indexOf(this.kw(stop[0])) >= 0) this.i++;
      continue;
    }
    if (k === 'SUBPROCESO' || k === 'FUNCION' || k === 'SUBALGORITMO') { subs.push(this.parseSub(toks)); continue; }
    mainBody.push(this.parseStatement());
  }
  return { name: mainName, body: mainBody, subs: subs, headerFound: headerFound };
};

Parser.prototype.parseSub = function (headerToks) {
  var line = this.curLine();
  var toks = headerToks.slice(1);
  var retvar = null, name = null, params = [];
  // posible forma:  ret <- nombre(params)   o   ret = nombre(params)
  var arrow = -1;
  for (var a = 0; a < toks.length; a++) {
    if (toks[a].t === 'op' && (toks[a].v === '<-' || toks[a].v === '=')) { arrow = a; break; }
  }
  var nameArea = toks;
  if (arrow >= 0) { if (toks[0] && toks[0].t === 'id') retvar = toks[0].v; nameArea = toks.slice(arrow + 1); }
  var parIdx = -1;
  for (var b = 0; b < nameArea.length; b++) if (nameArea[b].t === 'op' && nameArea[b].v === '(') { parIdx = b; break; }
  if (parIdx >= 0) {
    name = nameArea[parIdx - 1] && nameArea[parIdx - 1].t === 'id' ? nameArea[parIdx - 1].v : null;
    var clos = -1;
    for (var c = parIdx + 1; c < nameArea.length; c++) if (nameArea[c].t === 'op' && nameArea[c].v === ')') { clos = c; break; }
    var inner = nameArea.slice(parIdx + 1, clos < 0 ? nameArea.length : clos);
    params = this.parseParams(inner);
  } else {
    for (var d = 0; d < nameArea.length; d++) if (nameArea[d].t === 'id') { name = nameArea[d].v; break; }
  }
  if (!name) throw new PseintError('Subproceso sin nombre.', line);
  this.i++;
  var body = this.parseBlock(['FINSUBALGORITMO', 'FINSUBPROCESO', 'FINFUNCION']);
  var stop = this.tokensAt(this.i);
  if (stop.length && ['FINSUBALGORITMO', 'FINSUBPROCESO', 'FINFUNCION'].indexOf(this.kw(stop[0])) >= 0) this.i++;
  return { name: name, canon: canon(name, this.allowAccents), params: params, body: body, retvar: retvar, line: line };
};

Parser.prototype.parseParams = function (toks) {
  var groups = splitTop(toks, ',');
  var out = [];
  for (var g = 0; g < groups.length; g++) {
    var t = groups[g];
    if (!t.length) continue;
    var byRef = false, name = null;
    for (var i = 0; i < t.length; i++) {
      var k = this.kw(t[i]);
      if (k === 'PORREFERENCIA') { byRef = true; continue; }
      if (k === 'PORVALOR') { byRef = false; continue; }
      if (t[i].t === 'id' && !name) name = t[i].v;
    }
    if (name) out.push({ name: name, canon: canon(name, this.allowAccents), byRef: byRef });
  }
  return out;
};

Parser.prototype.parseBlock = function (stopSet) {
  var stmts = [];
  while (this.i < this.lines.length) {
    var toks = this.tokensAt(this.i);
    if (!toks.length) { this.i++; continue; }
    var k = this.kw(toks[0]);
    if (k && stopSet.indexOf(k) >= 0) break;
    // Sintaxis flexible de PSeInt: "Entonces" o "Hacer" pueden quedar al comienzo de
    // una línea distinta a la de la condición (p. ej. "Si x > 0" / "Entonces Escribir ...").
    // Se descartan y, si queda instrucción en la línea, se procesa el resto.
    if (k === 'ENTONCES' || k === 'HACER') {
      var rest = toks.slice(1);
      if (!rest.length) { this.i++; continue; }
      this.lines[this.i].toks = rest;
      continue;
    }
    stmts.push(this.parseStatement());
  }
  return stmts;
};

Parser.prototype.parseStatement = function () {
  var toks = this.tokensAt(this.i);
  var line = this.curLine();
  var k = this.kw(toks[0]);
  switch (k) {
    case 'DEFINIR': return this.parseDefinir(toks, line);
    case 'DIMENSIONAR': case 'DIMENSION': case 'REDIMENSIONAR': case 'REDIMENSION':
      return this.parseDimension(toks, line);
    case 'ESCRIBIR': case 'MOSTRAR': case 'IMPRIMIR': case 'INFORMAR':
      return this.parseEscribir(toks, line);
    case 'LEER': return this.parseLeer(toks, line);
    case 'LIMPIARPANTALLA': case 'BORRARPANTALLA': this.i++; return { t: 'limpiar', line: line };
    case 'ESPERARTECLA': this.i++; return { t: 'esperartecla', line: line };
    case 'ESPERAR': return this.parseEsperar(toks, line);
    case 'SI': return this.parseSi(toks, line);
    case 'SEGUN': return this.parseSegun(toks, line);
    case 'MIENTRAS': return this.parseMientras(toks, line);
    case 'REPETIR': return this.parseRepetir(toks, line);
    case 'PARA': return this.parsePara(toks, line);
    case 'PARACADA': return this.parseParaCada(toks, line);
    default: { var st = this.parseSimple(toks, line); this.i++; return st; }
  }
};

Parser.prototype.parseDefinir = function (toks, line) {
  var comoIdx = -1;
  for (var i = 1; i < toks.length; i++) if (this.kw(toks[i]) === 'COMO' || this.kw(toks[i]) === 'ES') { comoIdx = i; break; }
  var nameToks = toks.slice(1, comoIdx < 0 ? toks.length : comoIdx);
  var typeToks = comoIdx < 0 ? [] : toks.slice(comoIdx + 1);
  var tipo = null;
  if (typeToks.length && typeToks[0].t === 'id') {
    var tk = canon(typeToks[0].v, this.allowAccents);
    tipo = TIPO_MAP[tk] || null;
  }
  var groups = splitTop(nameToks, ',');
  var names = [];
  for (var g = 0; g < groups.length; g++) {
    var item = this.parseDeclItem(groups[g], line);
    if (item) { item.tipo = tipo; names.push(item); }
  }
  if (!names.length) throw new PseintError('Definir sin variables.', line);
  this.i++;
  return { t: 'def', names: names, line: line };
};

Parser.prototype.parseDeclItem = function (toks, line) {
  if (!toks.length) return null;
  var name = toks[0].t === 'id' ? toks[0].v : null;
  if (!name) return null;
  var dims = null;
  var open = findTok(toks, '[');
  if (open >= 0) {
    var close = matchBracket(toks, open);
    dims = this.parseExprList(toks.slice(open + 1, close), line);
  }
  return { name: name, canon: canon(name, this.allowAccents), dims: dims };
};

Parser.prototype.parseDimension = function (toks, line) {
  var redim = this.kw(toks[0]) === 'REDIMENSIONAR' || this.kw(toks[0]) === 'REDIMENSION';
  var groups = splitTop(toks.slice(1), ',');
  // Un item puede ser  A[3,4]  -> se reagrupa por comas dentro de corchetes ya contemplado por splitTop
  var items = [];
  for (var g = 0; g < groups.length; g++) {
    var t = groups[g];
    if (!t.length) continue;
    var name = t[0].t === 'id' ? t[0].v : null;
    if (!name) continue;
    var open = findTok(t, '[');
    var dims = [];
    if (open >= 0) {
      var close = matchBracket(t, open);
      dims = this.parseExprList(t.slice(open + 1, close), line);
    } else if (t.length > 2 && t[1].t === 'op' && t[1].v === '(') {
      var cl = matchBracket(t, 1);
      dims = this.parseExprList(t.slice(2, cl), line);
    }
    if (!dims.length) throw new PseintError('Dimensionamiento sin tamaño para ' + name + '.', line);
    items.push({ name: name, canon: canon(name, this.allowAccents), dims: dims });
  }
  this.i++;
  return { t: 'dim', redim: redim, items: items, line: line };
};

Parser.prototype.parseEscribir = function (toks, line) {
  var t = toks.slice(1), saltar = true, clean = [];
  for (var i = 0; i < t.length; i++) {
    var k = this.kw(t[i]);
    if (k === 'SINSALTAR' || k === 'SINBAJAR') { saltar = false; continue; }
    if (k === 'SIN' && i + 1 < t.length && (this.kw(t[i + 1]) === 'SALTAR' || this.kw(t[i + 1]) === 'BAJAR')) { saltar = false; i++; continue; }
    clean.push(t[i]);
  }
  var exprs = this.parseExprList(clean, line);
  this.i++;
  return { t: 'escribir', exprs: exprs, saltar: saltar, line: line };
};

Parser.prototype.parseLeer = function (toks, line) {
  var t = toks.slice(1), targets = [];
  var p = 0;
  while (p < t.length) {
    if (t[p].t === 'op' && t[p].v === ',') { p++; continue; }
    if (t[p].t !== 'id') { p++; continue; }
    var lv = this.parseLValueFrom(t, p, line);
    if (!lv) { p++; continue; }
    targets.push(lv.node);
    p = lv.next;
  }
  if (!targets.length) throw new PseintError('Leer sin variables.', line);
  this.i++;
  return { t: 'leer', targets: targets, line: line };
};

Parser.prototype.parseEsperar = function (toks, line) {
  // Esperar Tecla  |  Esperar <expr> Segundos/Milisegundos
  var rest = toks.slice(1);
  if (!rest.length) { this.i++; return { t: 'esperartecla', line: line }; }
  var unit = 'seg', cut = rest.length;
  for (var i = 0; i < rest.length; i++) {
    var k = this.kw(rest[i]);
    if (k === 'SEGUNDOS' || k === 'SEGUNDO') { unit = 'seg'; cut = i; break; }
    if (k === 'MILISEGUNDOS' || k === 'MILISEGUNDO') { unit = 'ms'; cut = i; break; }
  }
  var expr = this.parseExpr(rest.slice(0, cut), line);
  this.i++;
  return { t: 'esperar', expr: expr, unit: unit, line: line };
};

/* Separa la condición del resto de la línea. PSeInt admite que la primera
   instrucción del cuerpo vaya en la misma línea sin `Entonces`/`Hacer`
   (`si falso escribir "x"`). Se prueban prefijos de mayor a menor para quedarse
   con la condición más larga que el analizador acepte. */
Parser.prototype.splitCondition = function (rest, line, terminators) {
  var toks = rest.slice();
  if (toks.length && terminators.indexOf(this.kw(toks[toks.length - 1])) >= 0) toks = toks.slice(0, -1);
  for (var n = toks.length; n >= 1; n--) {
    var st = { toks: toks.slice(0, n), pos: 0 };
    try {
      var node = this.parseExprState(st, 0);
      if (node && st.pos === n) return { cond: node, tail: toks.slice(n) };
    } catch (e) { /* se prueba un prefijo más corto */ }
  }
  throw new PseintError('No se reconoce la condición.', line);
};

Parser.prototype.parseSi = function (toks, line) {
  var split = this.splitCondition(toks.slice(1), line, ['ENTONCES']);
  var cond = split.cond;
  this.i++;
  if (split.tail.length) this.pushBack(split.tail, line);
  var thenB = this.parseBlock(['SINO', 'FINSI']);
  var elseB = [];
  var nx = this.tokensAt(this.i);
  if (nx.length && this.kw(nx[0]) === 'SINO') {
    var extra = nx.slice(1);
    this.i++;
    if (extra.length) {
      // SiNo Si ... (cadena)
      this.pushBack(extra, line);
      elseB = this.parseBlock(['FINSI']);
    } else {
      elseB = this.parseBlock(['FINSI']);
    }
  }
  var st = this.tokensAt(this.i);
  if (st.length && this.kw(st[0]) === 'FINSI') this.i++;
  return { t: 'si', cond: cond, then: thenB, else: elseB, line: line };
};

Parser.prototype.parseMientras = function (toks, line) {
  var split = this.splitCondition(toks.slice(1), line, ['HACER']);
  var cond = split.cond;
  this.i++;
  if (split.tail.length) this.pushBack(split.tail, line);
  var body = this.parseBlock(['FINMIENTRAS']);
  var st = this.tokensAt(this.i);
  if (st.length && this.kw(st[0]) === 'FINMIENTRAS') this.i++;
  return { t: 'mientras', cond: cond, body: body, line: line };
};

Parser.prototype.parseRepetir = function (toks, line) {
  this.i++;
  var body = this.parseBlock(['HASTAQUE', 'MIENTRASQUE']);
  var st = this.tokensAt(this.i);
  var cond = { t: 'bool', v: true }, mode = 'hasta';
  if (st.length && (this.kw(st[0]) === 'HASTAQUE' || this.kw(st[0]) === 'MIENTRASQUE')) {
    mode = (this.kw(st[0]) === 'MIENTRASQUE') ? 'mientras' : 'hasta';
    cond = this.parseExpr(st.slice(1), line);
    this.i++;
  }
  return { t: 'repetir', body: body, cond: cond, mode: mode, line: line };
};

Parser.prototype.parsePara = function (toks, line) {
  var rest = toks.slice(1);
  if (rest.length && this.kw(rest[rest.length - 1]) === 'HACER') rest = rest.slice(0, -1);
  if (rest.length && (this.kw(rest[0]) === 'CADA')) return this.parseParaCada(toks, line, true);
  var hasta = -1;
  for (var i = 0; i < rest.length; i++) if (this.kw(rest[i]) === 'HASTA') { hasta = i; break; }
  if (hasta < 0) throw new PseintError('Falta "Hasta" en la instrucción Para.', line);
  var head = rest.slice(0, hasta);
  var tail = rest.slice(hasta + 1);
  if (!head.length || head[0].t !== 'id') throw new PseintError('Variable de control inválida en Para.', line);
  var varName = head[0].v;
  // Separador del valor inicial: `<-`, `=` (habitual en PSeInt) o las palabras Desde/En.
  var sep = -1;
  for (var a = 1; a < head.length; a++) {
    var kk = this.kw(head[a]);
    if ((head[a].t === 'op' && (head[a].v === '<-' || head[a].v === '=')) || kk === 'DESDE' || kk === 'EN') { sep = a; break; }
  }
  if (sep < 0) throw new PseintError('Variable de control inválida en Para.', line);
  // "Con Paso" puede ir antes o después del Hasta: `Para i<-1 con paso 2 hasta 4`.
  var headPaso = -1, tailPaso = -1;
  for (var p = 1; p < head.length; p++) { var kp = this.kw(head[p]); if (kp === 'CONPASO' || kp === 'PASO') { headPaso = p; break; } }
  if (headPaso < 0) { for (var q = 0; q < tail.length; q++) { var kq = this.kw(tail[q]); if (kq === 'CONPASO' || kq === 'PASO') { tailPaso = q; break; } } }
  var initToks = headPaso >= 0 ? head.slice(sep + 1, headPaso) : head.slice(sep + 1);
  var finToks = tailPaso >= 0 ? tail.slice(0, tailPaso) : tail;
  var pasoToks = headPaso >= 0 ? head.slice(headPaso + 1) : (tailPaso >= 0 ? tail.slice(tailPaso + 1) : null);
  if (!initToks.length) throw new PseintError('Falta el valor inicial del Para.', line);
  if (!finToks.length) throw new PseintError('Falta el valor final del Para.', line);
  var init = this.parseExpr(initToks, line);
  var fin = this.parseExpr(finToks, line);
  var paso = (pasoToks && pasoToks.length) ? this.parseExpr(pasoToks, line) : null;
  this.i++;
  var body = this.parseBlock(['FINPARA']);
  var st = this.tokensAt(this.i);
  if (st.length && this.kw(st[0]) === 'FINPARA') this.i++;
  return { t: 'para', varName: varName, varCanon: canon(varName, this.allowAccents), init: init, fin: fin, paso: paso, body: body, line: line };
};

Parser.prototype.parseParaCada = function (toks, line, alreadySplit) {
  var rest = toks.slice(1);
  if (rest.length && this.kw(rest[rest.length - 1]) === 'HACER') rest = rest.slice(0, -1);
  if (rest.length && this.kw(rest[0]) === 'CADA') rest = rest.slice(1);
  var deIdx = -1;
  for (var i = 0; i < rest.length; i++) { var k = this.kw(rest[i]); if (k === 'DE' || k === 'EN') { deIdx = i; break; } }
  if (deIdx < 0) throw new PseintError('Falta "De" en Para Cada.', line);
  var el = this.parseLValueFrom(rest, 0, line);
  if (!el) throw new PseintError('Variable inválida en Para Cada.', line);
  var arr = this.parseLValueFrom(rest, deIdx + 1, line);
  if (!arr) throw new PseintError('Arreglo inválido en Para Cada.', line);
  this.i++;
  var body = this.parseBlock(['FINPARA']);
  var st = this.tokensAt(this.i);
  if (st.length && this.kw(st[0]) === 'FINPARA') this.i++;
  return { t: 'paracada', elem: el.node, arr: arr.node, body: body, line: line };
};

Parser.prototype.parseSegun = function (toks, line) {
  var rest = toks.slice(1);
  if (rest.length && this.kw(rest[rest.length - 1]) === 'HACER') rest = rest.slice(0, -1);
  var expr = this.parseExpr(rest, line);
  this.i++;
  var cases = [], def = null;
  while (this.i < this.lines.length) {
    var tk = this.tokensAt(this.i);
    if (!tk.length) { this.i++; continue; }
    var k = this.kw(tk[0]);
    if (k === 'FINSEGUN') { this.i++; break; }
    if (k === 'DEOTROMODO') {
      var inline = tk.slice(1);
      var colon = indexOfOp(inline, ':');
      var pre = colon >= 0 ? inline.slice(colon + 1) : inline;
      this.i++;
      var dbody = [];
      if (pre.length) { this.pushBack(pre, line); dbody.push(this.parseStatement()); }
      dbody = dbody.concat(this.parseUntilCaseLabel());
      def = dbody;
      continue;
    }
    var ci = indexOfOp(tk, ':');
    if (ci < 0) { this.i++; continue; }
    var labels = this.parseCaseLabels(tk.slice(0, ci), line);
    var inlineStmt = tk.slice(ci + 1);
    this.i++;
    var body = [];
    if (inlineStmt.length) { this.pushBack(inlineStmt, line); body.push(this.parseStatement()); }
    body = body.concat(this.parseUntilCaseLabel());
    cases.push({ labels: labels, body: body });
  }
  return { t: 'segun', expr: expr, cases: cases, def: def, line: line };
};

/* Etiquetas de un caso: pueden ir separadas por comas o por la palabra `o`
   (`2,3,4:` o `5,6 o 7:`). */
Parser.prototype.parseCaseLabels = function (toks, line) {
  var groups = [], depth = 0, cur = [];
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i];
    if (t.t === 'op' && (t.v === '(' || t.v === '[')) depth++;
    if (t.t === 'op' && (t.v === ')' || t.v === ']')) depth--;
    var cut = depth <= 0 && ((t.t === 'op' && t.v === ',') || (t.t === 'id' && this.kw(t) === 'O'));
    if (cut) { if (cur.length) groups.push(cur); cur = []; continue; }
    cur.push(t);
  }
  if (cur.length) groups.push(cur);
  var out = [];
  for (var g = 0; g < groups.length; g++) {
    var st = { toks: groups[g], pos: 0 };
    try { var n = this.parseExprState(st, 0); if (n) out.push(n); } catch (e) { /* etiqueta inválida */ }
  }
  return out;
};

Parser.prototype.isCaseLabel = function (tk) {
  if (!tk.length) return false;
  var k = this.kw(tk[0]);
  if (k === 'DEOTROMODO' || k === 'FINSEGUN') return false;
  var STOPKW = ['DEFINIR','ESCRIBIR','MOSTRAR','IMPRIMIR','LEER','SI','MIENTRAS','REPETIR','PARA','PARACADA','SEGUN','LIMPIARPANTALLA','ESPERAR','ESPERARTECLA','DIMENSIONAR','DIMENSION','REDIMENSIONAR'];
  if (k && STOPKW.indexOf(k) >= 0) return false;
  var ci = indexOfOp(tk, ':');
  if (ci < 0) return false;
  for (var i = 0; i < ci; i++) if (tk[i].t === 'op' && (tk[i].v === '<-' || tk[i].v === '=')) return false;
  return true;
};

Parser.prototype.parseUntilCaseLabel = function () {
  var out = [];
  while (this.i < this.lines.length) {
    var tk = this.tokensAt(this.i);
    if (!tk.length) { this.i++; continue; }
    var k = this.kw(tk[0]);
    if (k === 'FINSEGUN' || k === 'DEOTROMODO') break;
    if (this.isCaseLabel(tk)) break;
    out.push(this.parseStatement());
  }
  return out;
};

/* Instrucción simple: asignación, definición coloquial o llamada */
Parser.prototype.parseSimple = function (toks, line) {
  if (!toks.length) throw new PseintError('Instrucción vacía.', line);
  var assignIdx = -1;
  for (var i = 0; i < toks.length; i++) {
    if (toks[i].t !== 'op') continue;
    if (toks[i].v === '<-') { assignIdx = i; break; }
    if (toks[i].v === '=' && this.rules.asignar_igual) { assignIdx = i; break; }
  }
  if (assignIdx > 0) {
    var lv = this.parseLValueFrom(toks, 0, line);
    if (lv && lv.next === assignIdx) {
      var rhs = this.parseExpr(toks.slice(assignIdx + 1), line);
      return { t: 'asignar', target: lv.node, expr: rhs, line: line };
    }
  }
  // Definición coloquial sin la palabra Definir:  x Es Entero  /  a,b son cadenas
  var coloq = this.parseColoquialDefine(toks, line);
  if (coloq) return coloq;
  // expresión suelta: llamada a subproceso
  var expr = this.parseExpr(toks, line);
  if (expr.t === 'call') return { t: 'llamar', call: expr, line: line };
  if (expr.t === 'var') return { t: 'llamar', call: { t: 'call', name: expr.name, canon: expr.canon, args: [], line: line }, line: line };
  throw new PseintError('No se reconoce la instrucción.', line);
};

/* `x es entero`, `a,b son cadenas`, `z Es Lógico`. Solo se acepta si el tipo es
   uno de los conocidos y la parte izquierda son nombres de variable. */
Parser.prototype.parseColoquialDefine = function (toks, line) {
  var sep = -1;
  for (var i = 1; i < toks.length; i++) {
    var k = this.kw(toks[i]);
    if (k === 'ES' || k === 'SON') { sep = i; break; }
  }
  if (sep < 1) return null;
  var typeToks = toks.slice(sep + 1);
  if (typeToks.length !== 1 || typeToks[0].t !== 'id') return null;
  var tipo = TIPO_MAP[keyWord(typeToks[0].v)] || null;
  if (!tipo) return null;
  var names = [];
  for (var g = 0; g < sep; g++) {
    if (toks[g].t === 'op' && toks[g].v === ',') continue;
    if (toks[g].t !== 'id') return null;
    names.push({ name: toks[g].v, canon: canon(toks[g].v, this.allowAccents), dims: null, tipo: tipo });
  }
  if (!names.length) return null;
  return { t: 'def', names: names, line: line };
};

/* lvalue: identificador + subíndices opcionales */
Parser.prototype.parseLValueFrom = function (toks, pos, line) {
  if (pos >= toks.length || toks[pos].t !== 'id') return null;
  var name = toks[pos].v;
  var next = pos + 1, subs = null;
  var open = -1;
  if (next < toks.length && toks[next].t === 'op' && (toks[next].v === '[' || toks[next].v === '(')) open = next;
  if (open >= 0) {
    var close = matchBracket(toks, open);
    if (close < 0) close = toks.length;
    subs = this.parseExprList(toks.slice(open + 1, close), line);
    next = close + 1;
  }
  return { node: { t: 'var', name: name, canon: canon(name, this.allowAccents), subs: subs, line: line }, next: next };
};

/* ───────────────────── Expresiones (Pratt) ───────────────────── */

Parser.prototype.parseExprList = function (toks, line) {
  var out = [], p = 0, guard = 0;
  while (p < toks.length && guard++ < 1000) {
    if (toks[p].t === 'op' && toks[p].v === ',') { p++; continue; }
    var st = { toks: toks, pos: p, line: line };
    var node = this.parseExprState(st, 0);
    if (!node) { p++; continue; }
    out.push(node);
    p = st.pos;
    if (p < toks.length && toks[p].t === 'op' && toks[p].v === ',') p++;
  }
  return out;
};

Parser.prototype.parseExpr = function (toks, line) {
  if (!toks || !toks.length) throw new PseintError('Expresión vacía.', line);
  var st = { toks: toks, pos: 0, line: line };
  var node = this.parseExprState(st, 0);
  if (!node) throw new PseintError('Expresión no válida.', line);
  // La expresión debe consumir TODOS los tokens. Si sobran, es un error de sintaxis
  // (p. ej. `Si a > 0 Y b < 5 Entonces` en un perfil que NO permite las palabras
  // Y/O/NO: `Y` queda suelto y PSeInt también lo rechaza).
  if (st.pos < toks.length) {
    var tk = toks[st.pos];
    throw new PseintError('Se esperaba el final de la expresión; token inesperado: "' +
      String(tk.v) + '".', line);
  }
  return node;
};

var COLOQ = [
  // Se probarán en orden: primero las formas más largas.
  { seq: ['ES','MAYOR','O','IGUAL','QUE'], op: '>=' },
  { seq: ['ES','MAYOR','O','IGUAL','A'], op: '>=' },
  { seq: ['ES','MENOR','O','IGUAL','QUE'], op: '<=' },
  { seq: ['ES','MENOR','O','IGUAL','A'], op: '<=' },
  { seq: ['ES','IGUAL','O','MAYOR','QUE'], op: '>=' },
  { seq: ['ES','IGUAL','O','MAYOR','A'], op: '>=' },
  { seq: ['ES','IGUAL','O','MENOR','QUE'], op: '<=' },
  { seq: ['ES','IGUAL','O','MENOR','A'], op: '<=' },
  { seq: ['ES','DIVISIBLE','POR'], op: 'multiplo' },
  { seq: ['ES','MULTIPLO','DE'], op: 'multiplo' },
  { seq: ['ES','MULTIPLO','QUE'], op: 'multiplo' },
  { seq: ['ES','DISTINTO','DE'], op: '<>' },
  { seq: ['ES','DISTINTO','A'], op: '<>' },
  { seq: ['ES','DIFERENTE','DE'], op: '<>' },
  { seq: ['ES','DIFERENTE','A'], op: '<>' },
  { seq: ['ES','DISTINTA','DE'], op: '<>' },
  { seq: ['ES','DISTINTA','A'], op: '<>' },
  { seq: ['ES','MAYOR','QUE'], op: '>' },
  { seq: ['ES','MAYOR','A'], op: '>' },
  { seq: ['ES','MENOR','QUE'], op: '<' },
  { seq: ['ES','MENOR','A'], op: '<' },
  { seq: ['ES','IGUAL','QUE'], op: '=' },
  { seq: ['ES','IGUAL','A'], op: '=' },
  { seq: ['ES','DIFERENTE'], op: '<>' },
  { seq: ['ES','POSITIVO'], op: 'positivo', postfix: true },
  { seq: ['ES','POSITIVA'], op: 'positivo', postfix: true },
  { seq: ['ES','NEGATIVO'], op: 'negativo', postfix: true },
  { seq: ['ES','NEGATIVA'], op: 'negativo', postfix: true },
  { seq: ['ES','CERO'], op: 'cero', postfix: true },
  { seq: ['ES','PAR'], op: 'par', postfix: true },
  { seq: ['ES','IMPAR'], op: 'impar', postfix: true },
  { seq: ['ES','ENTEROS'], op: 'esentero', postfix: true },
  { seq: ['ES','ENTERAS'], op: 'esentero', postfix: true },
  { seq: ['ES','ENTERO'], op: 'esentero', postfix: true },
  { seq: ['ES','ENTERA'], op: 'esentero', postfix: true },
  { seq: ['ES','REALES'], op: 'esreal', postfix: true },
  { seq: ['ES','REAL'], op: 'esreal', postfix: true },
  { seq: ['ES','LOGICOS'], op: 'eslogico', postfix: true },
  { seq: ['ES','LOGICAS'], op: 'eslogico', postfix: true },
  { seq: ['ES','LOGICO'], op: 'eslogico', postfix: true },
  { seq: ['ES','LOGICA'], op: 'eslogico', postfix: true },
  { seq: ['ES','CARACTERES'], op: 'escaracter', postfix: true },
  { seq: ['ES','CARACTER'], op: 'escaracter', postfix: true },
  { seq: ['ES','TEXTO'], op: 'escaracter', postfix: true },
  { seq: ['ES','CADENA'], op: 'escaracter', postfix: true },
  { seq: ['ES','NUMEROS'], op: 'esnumero', postfix: true },
  { seq: ['ES','NUMERAS'], op: 'esnumero', postfix: true },
  { seq: ['ES','NUMERO'], op: 'esnumero', postfix: true },
  { seq: ['ES','NUMERA'], op: 'esnumero', postfix: true },
  { seq: ['ES','NUMERICOS'], op: 'esnumero', postfix: true },
  { seq: ['ES','NUMERICAS'], op: 'esnumero', postfix: true },
  { seq: ['ES','NUMERICO'], op: 'esnumero', postfix: true },
  { seq: ['ES','NUMERICA'], op: 'esnumero', postfix: true },
  // `5 ES 10` es una igualdad
  { seq: ['ES'], op: '=' }
];

/* Precedencia real de PSeInt (comprobada con el intérprete oficial):
     O  |  <  Y  &  <  NO  ~  !  <  = <> == !=  <  < > <= >=  <  + -  <  * / %  <  ^
   Por eso `5 > 3 = 4 > 2` es `(5>3) = (4>2)` y `no 5 es 0` es `NO (5 es 0)`. */
var PREC = { '|': 1, 'O': 1, '&': 2, 'Y': 2, '=': 4, '==': 4, '<>': 4, '!=': 4,
             '<': 5, '>': 5, '<=': 5, '>=': 5, '+': 6, '-': 6, '*': 7, '/': 7, '%': 7, 'MOD': 7, '^': 9 };
var PREC_NO = 3;   // la negación va por encima de Y/O y por debajo de las comparaciones

/* Las comparaciones coloquiales conservan la precedencia de su símbolo. */
function precDeOp(op) {
  if (op === '=' || op === '==' || op === '<>' || op === '!=') return 4;
  return 5;
}

/* Compara una secuencia de tokens con una lista de palabras clave. */
Parser.prototype.matchWordSeq = function (toks, pos, seq) {
  for (var s = 0; s < seq.length; s++) {
    var t = toks[pos + s];
    if (!t || t.t !== 'id' || keyWord(t.v) !== seq[s]) return false;
  }
  return true;
};

Parser.prototype.peekBinOp = function (st) {
  var tk = st.toks[st.pos];
  if (!tk) return null;
  if (tk.t === 'op') {
    if (PREC[tk.v] !== undefined) return { op: tk.v, prec: PREC[tk.v], len: 1, kind: 'bin' };
    return null;
  }
  if (tk.t === 'id') {
    var k = this.kw(tk);
    // Y, O y MOD solo son operadores si el perfil habilita las palabras Y/O/NO/MOD.
    if (!this.wordOps && (k === 'Y' || k === 'O' || k === 'MOD')) return null;
    if (PREC[k] !== undefined) return { op: k, prec: PREC[k], len: 1, kind: 'bin' };
    // Negación coloquial: `5 NO ES 0`, `x NO ES PAR` (equivale a NO (...)).
    if (k === 'NO' || k === 'NOT') {
      for (var j = 0; j < COLOQ.length; j++) {
        var sq = COLOQ[j].seq;
        if (this.matchWordSeq(st.toks, st.pos + 1, sq)) {
          return { op: COLOQ[j].op, prec: precDeOp(COLOQ[j].op), len: 1 + sq.length, kind: 'bin', postfix: !!COLOQ[j].postfix, negate: true };
        }
      }
    }
    if (k === 'ES') {
      for (var i = 0; i < COLOQ.length; i++) {
        var seq = COLOQ[i].seq, ok = true;
        for (var s = 0; s < seq.length; s++) {
          var t = st.toks[st.pos + s];
          if (!t || t.t !== 'id' || keyWord(t.v) !== seq[s]) { ok = false; break; }
        }
        if (ok) return { op: COLOQ[i].op, prec: precDeOp(COLOQ[i].op), len: seq.length, kind: 'bin', postfix: !!COLOQ[i].postfix };
      }
    }
  }
  return null;
};

Parser.prototype.parseExprState = function (st, minPrec) {
  var left = this.parseUnary(st);
  if (!left) return null;
  for (;;) {
    var op = this.peekBinOp(st);
    if (!op || op.prec < minPrec) break;
    st.pos += op.len;
    if (op.postfix) { left = this.makeBin(op, left, null); continue; }
    var nextMin = (op.op === '^') ? op.prec : op.prec + 1;
    var right = this.parseExprState(st, nextMin);
    left = this.makeBin(op, left, right);
  }
  return left;
};

Parser.prototype.makeBin = function (op, a, b) {
  var node = { t: 'bin', op: op.op, a: a, b: b };
  return op.negate ? { t: 'un', op: '~', a: node } : node;
};

Parser.prototype.parseUnary = function (st) {
  var tk = st.toks[st.pos];
  if (!tk) return null;
  if (tk.t === 'op' && (tk.v === '-' || tk.v === '+' || tk.v === '~' || tk.v === '!')) {
    st.pos++;
    // La negación tiene menor precedencia que las comparaciones: `no 5 es 0`
    // es `NO (5 es 0)`, pero mayor que Y/O: `no a y b` es `(NO a) Y b`.
    var isNot = (tk.v === '~' || tk.v === '!');
    var sub = isNot ? this.parseExprState(st, PREC_NO + 1) : this.parseUnary(st);
    // '!' es el NOT simbólico de PSeInt (misma tabla de operadores que '~').
    return { t: 'un', op: isNot ? '~' : tk.v, a: sub };
  }
  if (tk.t === 'id') {
    var k = this.kw(tk);
    // `NO` es el NOT por palabra: solo existe si el perfil permite las palabras Y/O/NO.
    if (this.wordOps && (k === 'NO' || k === 'NOT')) { st.pos++; return { t: 'un', op: '~', a: this.parseExprState(st, PREC_NO + 1) }; }
  }
  return this.parsePrimary(st);
};

Parser.prototype.parsePrimary = function (st) {
  var tk = st.toks[st.pos];
  if (!tk) return null;
  if (tk.t === 'num') { st.pos++; return { t: 'num', v: tk.v }; }
  if (tk.t === 'str') { st.pos++; return { t: 'str', v: tk.v }; }
  if (tk.t === 'op' && tk.v === '(') {
    st.pos++;
    var e = this.parseExprState(st, 0);
    if (st.toks[st.pos] && st.toks[st.pos].t === 'op' && st.toks[st.pos].v === ')') st.pos++;
    return e;
  }
  if (tk.t === 'id') {
    var k = this.kw(tk);
    // OJO: PSeInt NO tiene "V"/"F" como atajos de Verdadero/Falso (su lista de palabras
    // reservadas solo incluye VERDADERO y FALSO). Tratarlos como booleanos rompía
    // cualquier variable llamada `v` o `f`, p.ej. el patrón oficial de arreglo como
    // parámetro:  SubProceso Promedio(arreglo...) / v[i]
    if (k === 'VERDADERO') { st.pos++; return { t: 'bool', v: true }; }
    if (k === 'FALSO') { st.pos++; return { t: 'bool', v: false }; }
    var name = tk.v; st.pos++;
    var ln = st.line || 0;
    // Llamada a función o subíndice. PSeInt acepta el paréntesis separado del nombre
    // cuando el nombre es una función (`trunc (a/b)`), y lo trata como dos
    // expresiones que se concatenan cuando es una variable (`Escribir A (1)`).
    var next = st.toks[st.pos];
    var pegado = next && (next.s === undefined || tk.e === undefined || next.s === tk.e);
    var esFuncion = !!this.funcNames[keyWord(name)];
    if (next && next.t === 'op' && next.v === '(' && (pegado || esFuncion)) {
      var close = matchBracket(st.toks, st.pos);
      if (close < 0) close = st.toks.length;
      var args = this.parseExprList(st.toks.slice(st.pos + 1, close), ln);
      st.pos = close + 1;
      return { t: 'call', name: name, canon: canon(name, this.allowAccents), args: args, line: ln };
    }
    if (next && next.t === 'op' && next.v === '[') {
      var cl = matchBracket(st.toks, st.pos);
      if (cl < 0) cl = st.toks.length;
      var subs = this.parseExprList(st.toks.slice(st.pos + 1, cl), ln);
      st.pos = cl + 1;
      return { t: 'var', name: name, canon: canon(name, this.allowAccents), subs: subs, line: ln };
    }
    return { t: 'var', name: name, canon: canon(name, this.allowAccents), subs: null, line: ln };
  }
  return null;
};

/* ───────────────────── utilidades de tokens ───────────────────── */

function splitTop(toks, sep) {
  var out = [], cur = [], depth = 0;
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i];
    if (t.t === 'op' && (t.v === '(' || t.v === '[')) depth++;
    if (t.t === 'op' && (t.v === ')' || t.v === ']')) depth--;
    if (t.t === 'op' && t.v === sep && depth <= 0) { out.push(cur); cur = []; continue; }
    cur.push(t);
  }
  out.push(cur);
  return out;
}

function findTok(toks, v) {
  for (var i = 0; i < toks.length; i++) if (toks[i].t === 'op' && toks[i].v === v) return i;
  return -1;
}

function indexOfOp(toks, op) {
  var depth = 0;
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i];
    if (t.t !== 'op') continue;
    if (t.v === '(' || t.v === '[') { depth++; continue; }
    if (t.v === ')' || t.v === ']') { depth--; continue; }
    if (t.v === op && depth <= 0) return i;
  }
  return -1;
}

function matchBracket(toks, openIdx) {
  var open = toks[openIdx].v, close = open === '(' ? ')' : ']';
  var depth = 0;
  for (var i = openIdx; i < toks.length; i++) {
    var t = toks[i];
    if (t.t !== 'op') continue;
    if (t.v === open) depth++;
    else if (t.v === close) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/* ═════════════════════════════ RUNTIME ═════════════════════════════ */

/* PSeInt deduce el tipo de las variables que no se declararon mirando TODO el
   programa, no solo lo que se ejecuta: si `b` recibe un número en una rama que no
   se toma, al imprimir `b` sale 0 (y no vacío). Comprobado con el PSeInt real. */
function tipoDeValor(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? 'entero' : 'real';
  if (typeof v === 'string') return 'caracter';
  if (typeof v === 'boolean') return 'logico';
  return null;
}

function tipoDeExpr(n) {
  if (!n) return null;
  if (n.t === 'num') return Number.isInteger(n.v) ? 'entero' : 'real';
  if (n.t === 'str') return 'caracter';
  if (n.t === 'bool') return 'logico';
  if (n.t === 'un') return n.op === '~' ? 'logico' : 'real';
  if (n.t === 'call') {
    var c = n.canon;
    if (c === 'MAYUSCULAS' || c === 'MINUSCULAS' || c === 'SUBCADENA' || c === 'CONCATENAR' || c === 'CONVERTIRATEXTO') return 'caracter';
    if (c === 'CONVERTIRANUMERO' || c === 'LONGITUD' || c === 'AZAR' || c === 'ALEATORIO') return 'real';
    if (c === 'RC' || c === 'RAIZ' || c === 'ABS' || c === 'LN' || c === 'EXP' || c === 'SEN' || c === 'COS' || c === 'TAN' ||
        c === 'ASEN' || c === 'ACOS' || c === 'ATAN' || c === 'TRUNC' || c === 'REDON' || c === 'PI' || c === 'EULER') return 'real';
    return null;
  }
  if (n.t === 'bin') {
    var k = n.op;
    if (k === '=' || k === '==' || k === '<>' || k === '!=' || k === '<' || k === '>' || k === '<=' || k === '>=' ||
        k === 'Y' || k === 'O' || k === '&' || k === '|' || k === 'par' || k === 'impar' || k === 'esentero' ||
        k === 'esreal' || k === 'eslogico' || k === 'escaracter' || k === 'esnumero' || k === 'multiplo' ||
        k === 'positivo' || k === 'negativo' || k === 'cero') return 'logico';
    if (k === '+') {
      if (tipoDeExpr(n.a) === 'caracter' || tipoDeExpr(n.b) === 'caracter') return 'caracter';
    }
    return 'real';
  }
  return null;
}

function inferTypes(ast) {
  var map = Object.create(null);
  function marca(c, tipo) { if (tipo && !map[c]) map[c] = tipo; }
  function walk(list) {
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!s) continue;
      if (s.t === 'def') {
        for (var d = 0; d < s.names.length; d++) {
          var it = s.names[d];
          if (!it.dims || !it.dims.length) marca(it.canon, it.tipo);
        }
      } else if (s.t === 'asignar') {
        if (s.target.t === 'var' && (!s.target.subs || !s.target.subs.length)) marca(s.target.canon, tipoDeExpr(s.expr));
      } else if (s.t === 'para') {
        walk(s.body);
      } else if (s.t === 'paracada') {
        walk(s.body);
      } else if (s.t === 'si') {
        walk(s.then); walk(s.else);
      } else if (s.t === 'mientras' || s.t === 'repetir') {
        walk(s.body);
      } else if (s.t === 'segun') {
        for (var c = 0; c < s.cases.length; c++) walk(s.cases[c].body);
        if (s.def) walk(s.def);
      }
    }
  }
  walk(ast.body);
  for (var k = 0; k < ast.subs.length; k++) walk(ast.subs[k].body);
  return map;
}


var MAX_STEPS = 4000000;

function Scope(parent) { this.vars = Object.create(null); this.parent = parent; }

function Interpreter(ast, rules, io) {
  this.ast = ast;
  this.rules = rules || {};
  this.io = io || {};
  this.allowAccents = this.rules.acentos_nombres !== false;
  this.base = this.rules.indices_base0 ? 0 : 1;
  this.inferred = ast.inferred || {};
  this.global = new Scope(null);
  this.frame = this.global;
  this.funcs = Object.create(null);
  this.steps = 0;
  this._lastYield = Date.now();
  this.stopped = false;
  this.outputOpen = false;
  for (var i = 0; i < ast.subs.length; i++) this.funcs[ast.subs[i].canon] = ast.subs[i];
}

Interpreter.prototype.canon = function (s) { return canon(s, this.allowAccents); };

Interpreter.prototype.lookup = function (c) {
  // En PSeInt cada subproceso tiene su PROPIO ámbito: no ve las variables del proceso
  // principal (solo sus parámetros y sus locales). Antes se caía al marco global, y eso
  // hacía que un subproceso escribiera en una variable global homónima en vez de en la
  // suya, perdiendo el valor de retorno (p.ej. Promedio2.psc devolvía 0).
  return this.frame.vars[c] || null;
};

Interpreter.prototype.declare = function (name, c, tipo) {
  if (this.frame.vars[c]) return this.frame.vars[c];
  if (!tipo && Object.prototype.hasOwnProperty.call(this.inferred, c)) tipo = this.inferred[c];
  var e = { name: name, tipo: tipo || null, tipoDeclarado: false, value: undefined, assigned: false,
            isArray: false, dims: null, data: null, readOnly: false, used: false };
  this.frame.vars[c] = e;
  return e;
};

Interpreter.prototype.tick = function () {
  this.steps++;
  if (this.stopped) throw new StopSignal('Ejecución detenida por el usuario.');
  if (this.steps > MAX_STEPS) throw new StopSignal('Demasiadas instrucciones ejecutadas (posible bucle infinito).');
};

Interpreter.prototype.maybeYield = function () {
  // Cede el control al navegador como máximo cada ~12 ms para que la interfaz
  // siga respondiendo (botón Detener, repintado) incluso en bucles largos.
  var now = Date.now();
  if (now - this._lastYield < 12) return Promise.resolve();
  this._lastYield = now;
  return new Promise(function (r) { setTimeout(r, 0); });
};

Interpreter.prototype.emit = function (text) { if (this.io.print) this.io.print(text); };

Interpreter.prototype.run = async function () {
  if (this.io.onStart) this.io.onStart(this.ast.name);
  await this.execBlock(this.ast.body);
};

Interpreter.prototype.execBlock = async function (stmts) {
  for (var i = 0; i < stmts.length; i++) {
    this.tick();
    await this.execStmt(stmts[i]);
    await this.maybeYield();
  }
};

Interpreter.prototype.execStmt = async function (s) {
  switch (s.t) {
    case 'def': return this.execDef(s);
    case 'dim': return this.execDim(s);
    case 'escribir': return await this.execEscribir(s);
    case 'leer': return await this.execLeer(s);
    case 'limpiar': if (this.io.clear) this.io.clear(); return;
    case 'esperartecla': if (this.io.waitKey) await this.io.waitKey(); return;
    case 'esperar': {
      var ms = toReal(await this.eval(s.expr)) * (s.unit === 'ms' ? 1 : 1000);
      if (this.io.waitMs) await this.io.waitMs(ms);
      return;
    }
    case 'asignar': {
      var v = await this.eval(s.expr);
      this.writeLValue(s.target, v, s.line);
      return;
    }
    case 'si': {
      if (truthy(await this.eval(s.cond))) await this.execBlock(s.then);
      else await this.execBlock(s.else);
      return;
    }
    case 'mientras': {
      while (truthy(await this.eval(s.cond))) { this.tick(); await this.execBlock(s.body); await this.maybeYield(); }
      return;
    }
    case 'repetir': {
      if (s.mode === 'mientras') {
        do { this.tick(); await this.execBlock(s.body); await this.maybeYield(); }
        while (truthy(await this.eval(s.cond)));
      } else {
        do { this.tick(); await this.execBlock(s.body); await this.maybeYield(); }
        while (!truthy(await this.eval(s.cond)));
      }
      return;
    }
    case 'para': return await this.execPara(s);
    case 'paracada': return await this.execParaCada(s);
    case 'segun': return await this.execSegun(s);
    case 'llamar': await this.evalCall(s.call, s.line); return;
    default: return;
  }
};

Interpreter.prototype.execDef = function (s) {
  for (var i = 0; i < s.names.length; i++) {
    var it = s.names[i];
    var e = this.frame.vars[it.canon] || this.declare(it.name, it.canon, it.tipo);
    if (it.tipo && e.tipoDeclarado && e.tipo && e.tipo !== it.tipo) {
      throw new PseintError('La variable ' + it.name + ' ya estaba definida con otro tipo.', s.line);
    }
    if (it.tipo && e.tipo !== it.tipo && e.isArray && e.data) {
      // Al declarar el tipo de un arreglo ya dimensionado, PSeInt inicializa las
      // posiciones que aún no tenían valor con el valor por defecto de ese tipo.
      var fill = defaultFor(it.tipo);
      for (var k = 0; k < e.data.length; k++) if (e.data[k] === undefined) e.data[k] = fill;
    }
    e.tipo = it.tipo || e.tipo;
    if (it.tipo) e.tipoDeclarado = true;
    if (it.dims && it.dims.length) this.initArray(e, it.dims, s.line);
  }
};

Interpreter.prototype.initArray = function (e, dimExprs, line) {
  var dims = [];
  for (var i = 0; i < dimExprs.length; i++) {
    var d = toInt(this.evalSync(dimExprs[i]));
    if (d < 0) throw new PseintError('Las dimensiones no pueden ser negativas.', line);
    dims.push(d);
  }
  var total = 1;
  for (var j = 0; j < dims.length; j++) total *= dims[j];
  var fill = e.tipo ? defaultFor(e.tipo) : undefined;
  var data = new Array(total);
  for (var k = 0; k < total; k++) data[k] = fill;
  e.isArray = true; e.dims = dims; e.data = data; e.assigned = true;
};

Interpreter.prototype.execDim = function (s) {
  for (var i = 0; i < s.items.length; i++) {
    var it = s.items[i];
    var e = this.lookup(it.canon);
    if (!e) {
      // `Dimensionar` ya define la variable: no hace falta un Definir previo.
      e = this.declare(it.name, it.canon, null);
    }
    if (s.redim) {
      if (!e.isArray) throw new PseintError(it.name + ' no estaba previamente dimensionado.', s.line);
      if (this.rules.redimensionar === false) throw new PseintError('El perfil no permite redimensionar arreglos.', s.line);
    }
    this.initArray(e, it.dims, s.line);
  }
};

Interpreter.prototype.execEscribir = async function (s) {
  var out = '';
  for (var i = 0; i < s.exprs.length; i++) {
    var v = await this.eval(s.exprs[i]);
    out += toStr(v);
  }
  if (s.saltar) out += '\n';
  this.emit(out);
};

Interpreter.prototype.execLeer = async function (s) {
  for (var i = 0; i < s.targets.length; i++) {
    var tgt = s.targets[i];
    var e = this.lookup(tgt.canon);
    if (!e) {
      if (this.rules.obligar_definir) throw new PseintError('Variable no definida (' + tgt.name + '). Usa Definir.', s.line);
      e = this.declare(tgt.name, tgt.canon, null);
    }
    this.emit('> ');
    var raw = this.io.read ? await this.io.read(e.tipo || null, s.line) : '';
    raw = String(raw === undefined || raw === null ? '' : raw);
    var up = raw.toUpperCase();
    var value;
    if (e.tipo === 'logico') {
      if (up === 'VERDADERO' || up === 'V' || raw === '1') value = true;
      else if (up === 'FALSO' || up === 'F' || raw === '0') value = false;
      else value = truthy(raw);
    } else if (e.tipo === 'entero') value = Math.round(parseFloat(raw) || 0);
    else if (e.tipo === 'real') value = parseFloat(raw) || 0;
    else if (e.tipo === 'caracter') value = raw;
    else value = /^\s*[-+]?[0-9]*\.?[0-9]+\s*$/.test(raw) ? parseFloat(raw) : raw;
    if (e.isArray && tgt.subs) this.writeArrayElem(e, tgt.subs, value, s.line);
    else if (e.value && e.value.__ref) { e.value.set(value); e.assigned = true; }
    else { e.value = value; e.assigned = true; }
  }
};

Interpreter.prototype.execPara = async function (s) {
  var e = this.lookup(s.varCanon);
  if (!e) e = this.declare(s.varName, s.varCanon, 'real');
  var init = toReal(await this.eval(s.init));
  var fin = toReal(await this.eval(s.fin));
  var paso;
  if (s.paso) paso = toReal(await this.eval(s.paso));
  else if (this.rules.omitir_paso_menos1 !== false) paso = (init <= fin) ? 1 : -1;
  else if (init <= fin) paso = 1;
  else throw new PseintError('Hace falta "Con Paso" para un ciclo decreciente.', s.line);
  if (paso === 0) throw new PseintError('El paso no puede ser 0.', s.line);
  var prevRead = e.readOnly;
  e.value = init; e.assigned = true;
  if (this.rules.proteger_contador !== false) e.readOnly = true;
  try {
    while (paso > 0 ? toReal(e.value) <= fin : toReal(e.value) >= fin) {
      this.tick();
      await this.execBlock(s.body);
      await this.maybeYield();
      e.readOnly = false;
      e.value = toReal(e.value) + paso;
      if (this.rules.proteger_contador !== false) e.readOnly = true;
    }
  } finally {
    // La variable de control conserva el último valor que tomó (igual que PSeInt);
    // lo único que se restaura es el permiso de escritura.
    e.readOnly = prevRead;
  }
};

Interpreter.prototype.execParaCada = async function (s) {
  var arr = this.lookup(s.arr.canon);
  if (!arr || !arr.isArray) throw new PseintError('Para Cada requiere un arreglo dimensionado.', s.line);
  var el = this.lookup(s.elem.canon);
  if (!el) el = this.declare(s.elem.name, s.elem.canon, arr.tipo);
  var dims = arr.dims;
  var base = this.base;
  var idx = new Array(dims.length).fill(0);
  for (var n = 0; n < arr.data.length; n++) {
    this.tick();
    this.offsetToIdx(n, dims, idx);
    el.assigned = true;
    // 'elem' referencia la posición: leerlo y asignarlo actúa sobre el arreglo
    el.value = { __ref: true, get: function () { return arr.data[n]; }, set: function (v) { arr.data[n] = v; } };
    await this.execBlock(s.body);
    await this.maybeYield();
  }
};

Interpreter.prototype.offsetToIdx = function (off, dims, out) {
  for (var i = dims.length - 1; i >= 0; i--) { out[i] = off % dims[i]; off = Math.floor(off / dims[i]); }
  return out;
};

Interpreter.prototype.execSegun = async function (s) {
  var val = await this.eval(s.expr);
  if (this.rules.segun_numerico && typeof val !== 'number') throw new PseintError('El perfil exige que Según use una variable numérica.', s.line);
  for (var i = 0; i < s.cases.length; i++) {
    var c = s.cases[i];
    for (var j = 0; j < c.labels.length; j++) {
      var lv = await this.eval(c.labels[j]);
      if (this.looseEq(val, lv)) { await this.execBlock(c.body); return; }
    }
  }
  if (s.def) { await this.execBlock(s.def); return; }
  if (s.cases.length === 0) { /* nada */ }
  // caso "Si Es <condición>": etiquetas coloquiales ya cubiertas por eval
  return;
};

Interpreter.prototype.looseEq = function (a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (typeof a === 'boolean' || typeof b === 'boolean') return truthy(a) === truthy(b);
  if (typeof a === 'string' || typeof b === 'string') return String(toStr(a)) === String(toStr(b));
  return a === b;
};

/* ───────────────────── Lectura / escritura de variables ───────────────────── */

Interpreter.prototype.defaultOf = function (e) {
  if (e.value !== undefined) return e.value;
  // Sin tipo declarado, PSeInt no asigna ningún valor: al imprimir sale en blanco
  // y en cualquier operación numérica cuenta como 0.
  if (e.tipo) return defaultFor(e.tipo);
  return undefined;
};

var ZERO_ARG_FUNCS = { PI: 1, EULER: 1, FECHAACTUAL: 1, HORAACTUAL: 1 };

Interpreter.prototype.zeroArg = function (name) {
  switch (name) {
    case 'PI': return Math.PI;
    case 'EULER': return Math.E;
    case 'FECHAACTUAL': { var d = new Date(); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); }
    case 'HORAACTUAL': { var h = new Date(); return h.getHours() * 10000 + h.getMinutes() * 100 + h.getSeconds(); }
  }
  return 0;
};

Interpreter.prototype.readLValue = function (lv) {
  var e = this.lookup(lv.canon);
  if (!e) {
    if (ZERO_ARG_FUNCS[lv.canon] && (!lv.subs || !lv.subs.length)) return this.zeroArg(lv.canon);
    if (this.rules.obligar_definir) throw new PseintError('Variable no definida (' + lv.name + ').', lv.line);
    e = this.declare(lv.name, lv.canon, null);
  }
  if (lv.subs && lv.subs.length) return this.readArrayElem(e, lv.subs, lv.line);
  if (e.value && e.value.__ref) return e.value.get();
  if (!e.assigned && this.rules.sin_inicializar) throw new PseintError('La variable ' + lv.name + ' se usa sin inicializar.', lv.line);
  e.used = true;
  return this.defaultOf(e);
};

Interpreter.prototype.writeLValue = function (lv, val, line) {
  var e = this.lookup(lv.canon);
  if (!e) {
    if (this.rules.obligar_definir) throw new PseintError('Variable no definida (' + lv.name + '). Usa Definir.', line);
    e = this.declare(lv.name, lv.canon, null);
  }
  if (e.readOnly) throw new PseintError('No se puede modificar la variable ' + lv.name + ' (contador del Para).', line);
  if (lv.subs && lv.subs.length) { this.writeArrayElem(e, lv.subs, val, line); return; }
  var out = this.storeValue(e, val, line);
  if (e.value && e.value.__ref) { e.value.set(out); e.assigned = true; return; }
  e.value = out;
  e.assigned = true;
  e.used = true;
};

/* PSeInt es estricto con los tipos declarados: no se puede guardar texto en una
   variable numérica (SynError 125) ni decimales en una entero (ExeError 314).
   El tipo de las variables sin declarar se deduce del primer valor guardado. */
Interpreter.prototype.storeValue = function (e, val, line) {
  var vt = tipoDeValor(val);
  if (e.tipo) {
    this.checkAssign(e, val, vt, line);
    if (e.tipo === 'entero' && vt === 'real' && !e.tipoDeclarado) e.tipo = 'real';
  } else if (vt) {
    e.tipo = vt;
  }
  return this.coerce(val, e);
};

Interpreter.prototype.checkAssign = function (e, val, vt, line) {
  if (val === undefined || val === null || !vt) return;
  if (e.tipo === 'caracter') {
    if (vt !== 'caracter') throw new PseintError('La variable de texto ' + e.name + ' solo admite texto.', line);
    return;
  }
  if (e.tipo === 'logico') {
    if (vt !== 'logico') throw new PseintError('La variable lógica ' + e.name + ' solo admite Verdadero o Falso.', line);
    return;
  }
  if (vt !== 'entero' && vt !== 'real') throw new PseintError('La variable numérica ' + e.name + ' no admite texto ni valores lógicos.', line);
  if (e.tipo === 'entero' && e.tipoDeclarado && vt === 'real' && !Number.isInteger(val)) {
    throw new PseintError('La variable entera ' + e.name + ' no admite valores con decimales.', line);
  }
};

Interpreter.prototype.coerce = function (val, e) {
  if (!e.tipo) return val;
  if (e.tipo === 'entero') return Math.round(toReal(val));
  if (e.tipo === 'real') return toReal(val);
  if (e.tipo === 'logico') return truthy(val);
  if (e.tipo === 'caracter') return toStr(val);
  return val;
};

Interpreter.prototype.arrayOffset = function (e, subs, line) {
  if (subs.length !== e.dims.length) throw new PseintError('Cantidad de subíndices incorrecta.', line);
  var off = 0, base = this.base;
  for (var i = 0; i < subs.length; i++) {
    var iv = Math.round(toReal(this.evalSync(subs[i])));
    var rel = iv - base;
    if (rel < 0 || rel >= e.dims[i]) throw new PseintError('Subíndice fuera de rango (' + iv + ').', line);
    off = off * e.dims[i] + rel;
  }
  return off;
};

Interpreter.prototype.readArrayElem = function (e, subs, line) {
  if (!e.isArray) throw new PseintError('La variable no es un arreglo.', line);
  var off = this.arrayOffset(e, subs, line);
  return e.data[off];
};

Interpreter.prototype.writeArrayElem = function (e, subs, val, line) {
  if (!e.isArray) throw new PseintError('La variable no es un arreglo.', line);
  var off = this.arrayOffset(e, subs, line);
  if (e.tipo) this.checkAssign(e, val, tipoDeValor(val), line);
  e.data[off] = e.tipo === 'entero' ? Math.round(toReal(val)) : (e.tipo === 'real' ? toReal(val) : val);
  e.assigned = true;
};

/* ───────────────────── Evaluación ───────────────────── */

/* evalSync: para subíndices/dimensiones (sin llamadas async) */
Interpreter.prototype.evalSync = function (n) {
  return this.evalNodeSync(n);
};

Interpreter.prototype.evalNodeSync = function (n) {
  switch (n.t) {
    case 'num': return n.v;
    case 'str': return n.v;
    case 'bool': return n.v;
    case 'var': return this.readLValue(n);
    case 'un': {
      var a = this.evalNodeSync(n.a);
      if (n.op === '-') return -toReal(a);
      if (n.op === '+') return toReal(a);
      if (n.op === '~') return !truthy(a);
      return a;
    }
    case 'bin': return this.applyBinSync(n);
    default: return 0;
  }
};

Interpreter.prototype.eval = async function (n) {
  switch (n.t) {
    case 'num': return n.v;
    case 'str': return n.v;
    case 'bool': return n.v;
    case 'var': {
      // PSeInt permite escribir una función sin paréntesis si no recibe argumentos:
      // `Escribir Booga2` o `Escribir Booga2+20` llaman a la función.
      var ent = this.lookup(n.canon);
      if (!ent && this.funcs[n.canon] && (!n.subs || !n.subs.length)) {
        return await this.evalCall({ t: 'call', name: n.name, canon: n.canon, args: [], line: n.line }, n.line);
      }
      return this.readLValue(n);
    }
    case 'call': return await this.evalCall(n, n.line);
    case 'un': {
      var a = await this.eval(n.a);
      if (n.op === '-') return -toReal(a);
      if (n.op === '+') return toReal(a);
      if (n.op === '~') return !truthy(a);
      return a;
    }
    case 'bin': return await this.evalBin(n);
    default: return 0;
  }
};

Interpreter.prototype.applyBinSync = function (n) {
  var a = this.evalNodeSync(n.a);
  var b = n.b === null ? null : this.evalNodeSync(n.b);
  return this.applyOp(n.op, a, b, n.line);
};

Interpreter.prototype.evalBin = async function (n) {
  var a = await this.eval(n.a);
  if (n.op === '&' || n.op === 'Y') { if (!truthy(a)) return false; return truthy(await this.eval(n.b)); }
  if (n.op === '|' || n.op === 'O') { if (truthy(a)) return true; return truthy(await this.eval(n.b)); }
  var b = n.b === null ? null : await this.eval(n.b);
  return this.applyOp(n.op, a, b, n.line);
};

Interpreter.prototype.applyOp = function (op, a, b, line) {
  switch (op) {
    case '&': case 'Y': return truthy(a) && truthy(b);
    case '|': case 'O': return truthy(a) || truthy(b);
    case '=': case '==': return this.looseEq(a, b);
    case '<>': case '!=': return !this.looseEq(a, b);
    case '<': return this.cmp(a, b) < 0;
    case '>': return this.cmp(a, b) > 0;
    case '<=': return this.cmp(a, b) <= 0;
    case '>=': return this.cmp(a, b) >= 0;
    case '+': return this.add(a, b, line);
    case '-': return toReal(a) - toReal(b);
    case '*': return toReal(a) * toReal(b);
    case '/': {
      var d = toReal(b);
      if (d === 0) throw new PseintError('División por cero.', line);
      return toReal(a) / d;
    }
    case '%': case 'MOD': {
      var dd = toInt(b);
      if (dd === 0) throw new PseintError('División por cero (MOD).', line);
      return toInt(a) % dd;
    }
    case '^': return Math.pow(toReal(a), toReal(b));
    case 'multiplo': return toInt(b) !== 0 && toInt(a) % toInt(b) === 0;
    case 'par': return toInt(a) % 2 === 0;
    case 'impar': return Math.abs(toInt(a) % 2) === 1;
    case 'positivo': return toReal(a) > 0;
    case 'negativo': return toReal(a) < 0;
    case 'cero': return typeof a === 'number' ? a === 0 : (toStr(a) === '' || toReal(a) === 0);
    case 'esentero': return typeof a === 'number' && Number.isInteger(a);
    case 'esreal': return typeof a === 'number' && !Number.isInteger(a);
    case 'eslogico': return typeof a === 'boolean';
    case 'escaracter': return typeof a === 'string';
    case 'esnumero': return typeof a === 'number';
    default: throw new PseintError('Operador no soportado: ' + op, line);
  }
};

Interpreter.prototype.add = function (a, b, line) {
  var aStr = typeof a === 'string', bStr = typeof b === 'string';
  if (aStr || bStr) {
    if (this.rules.concat_mas === false) throw new PseintError('El perfil no permite concatenar con el operador +.', line);
    return toStr(a) + toStr(b);
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') return toReal(a) + toReal(b);
  return toReal(a) + toReal(b);
};

Interpreter.prototype.cmp = function (a, b) {
  if (typeof a === 'string' || typeof b === 'string') { var x = toStr(a), y = toStr(b); return x < y ? -1 : (x > y ? 1 : 0); }
  if (typeof a === 'boolean' || typeof b === 'boolean') { var p = truthy(a) ? 1 : 0, q = truthy(b) ? 1 : 0; return p - q; }
  var u = toReal(a), v = toReal(b);
  return u < v ? -1 : (u > v ? 1 : 0);
};

/* ───────────────────── Llamadas ───────────────────── */

Interpreter.prototype.evalCall = async function (call, line) {
  var f = this.funcs[call.canon];
  if (!f) {
    // PSeInt admite acceder a un arreglo con paréntesis: `a(3)` es `a[3]`
    // (caso oficial acentos-01: dentro de un subproceso, `según a(1) hacer`).
    var arr = this.lookup(call.canon);
    if (arr && arr.isArray && call.args && call.args.length) return this.readArrayElem(arr, call.args, line);
    return this.callBuiltin(call, line);
  }
  if (this.rules.funciones_subproc === false) throw new PseintError('El perfil no permite definir funciones/subprocesos.', line);
  // Los argumentos SIEMPRE se evalúan en el marco del llamador.
  var bound = [];
  for (var a = 0; a < f.params.length; a++) {
    var p = f.params[a];
    var argNode = call.args[a];
    if (!argNode) {
      if (p.byRef) throw new PseintError('Falta el argumento por referencia "' + p.name + '".', line);
      bound.push({ p: p, val: undefined });
      continue;
    }
    // En PSeInt los arreglos se pasan SIEMPRE por referencia y el parámetro adopta el
    // tipo y las dimensiones del argumento. Ejemplo oficial Promedio2.psc:
    //   SubProceso prom <- Promedio(arreglo, cantidad) ... suma <- suma + arreglo[i]
    //   Proceso Principal ... Dimension datos[100] ... Promedio(datos, n)
    var argVar = (argNode.t === 'var' && (!argNode.subs || !argNode.subs.length))
      ? this.lookup(argNode.canon) : null;
    if (argVar && argVar.isArray) {
      bound.push({ p: p, arr: argVar });
    } else if (p.byRef) {
      bound.push({ p: p, ref: this.makeRef(argNode, line) });
    } else {
      bound.push({ p: p, val: await this.eval(argNode) });
    }
  }
  var prevFrame = this.frame;
  var local = new Scope(null);
  this.frame = local;
  try {
    for (var i = 0; i < bound.length; i++) {
      var b = bound[i], p2 = b.p;
      if (b.arr) {
        // Se comparte el mismo `data`: los cambios dentro del subproceso se ven fuera.
        local.vars[p2.canon] = { name: p2.name, tipo: b.arr.tipo, value: undefined, assigned: true,
                                 isArray: true, dims: b.arr.dims, data: b.arr.data, readOnly: false, used: false };
      } else if (p2.byRef) {
        local.vars[p2.canon] = { name: p2.name, tipo: null, value: b.ref, assigned: true, isArray: false, dims: null, data: null, readOnly: false };
      } else {
        local.vars[p2.canon] = { name: p2.name, tipo: null, value: b.val, assigned: true, isArray: false, dims: null, data: null, readOnly: false };
      }
    }
    await this.execBlock(f.body);
    var retEntry = local.vars[f.canon] || (f.retvar ? local.vars[canon(f.retvar, this.allowAccents)] : null);
    if (retEntry && retEntry.value !== undefined && !(retEntry.value && retEntry.value.__ref)) return retEntry.value;
    return 0;
  } finally {
    this.frame = prevFrame;
  }
};

Interpreter.prototype.makeRef = function (node, line) {
  var self = this;
  if (node.t === 'var' && (!node.subs || !node.subs.length)) {
    var e = this.lookup(node.canon);
    if (!e) e = this.declare(node.name, node.canon, null);
    return { __ref: true, get: function () { return e.value; }, set: function (v) { e.value = v; e.assigned = true; } };
  }
  if (node.t === 'var' && node.subs && node.subs.length) {
    var arr = this.lookup(node.canon);
    var off = this.arrayOffset(arr, node.subs, line);
    return { __ref: true, get: function () { return arr.data[off]; }, set: function (v) { arr.data[off] = v; } };
  }
  throw new PseintError('El argumento por referencia debe ser una variable.', line);
};

/* ───────────────────── Funciones predefinidas ───────────────────── */

Interpreter.prototype.callBuiltin = async function (call, line) {
  var name = call.canon;
  var self = this;
  var args = [];
  for (var i = 0; i < call.args.length; i++) args.push(await this.eval(call.args[i]));
  var A = args;
  function num(x) { return toReal(x); }
  switch (name) {
    case 'PI': return Math.PI;
    case 'EULER': return Math.E;
    case 'RC': case 'RAIZ': { var x = num(A[0]); if (x < 0) throw new PseintError('Raíz cuadrada de número negativo.', line); return Math.sqrt(x); }
    case 'ABS': return Math.abs(num(A[0]));
    case 'LN': { var l = num(A[0]); if (l <= 0) throw new PseintError('Logaritmo de 0 o negativo.', line); return Math.log(l); }
    case 'EXP': return Math.exp(num(A[0]));
    case 'SEN': return Math.sin(num(A[0]));
    case 'COS': return Math.cos(num(A[0]));
    case 'TAN': return Math.tan(num(A[0]));
    case 'ASEN': { var sa = num(A[0]); if (sa < -1 || sa > 1) throw new PseintError('El seno debe estar entre -1 y 1.', line); return Math.asin(sa); }
    case 'ACOS': { var ca = num(A[0]); if (ca < -1 || ca > 1) throw new PseintError('El coseno debe estar entre -1 y 1.', line); return Math.acos(ca); }
    case 'ATAN': return Math.atan(num(A[0]));
    case 'AZAR': { var n = toInt(A[0]); if (n <= 0) throw new PseintError('Azar de 0 o negativo.', line); return Math.floor(Math.random() * n); }
    case 'ALEATORIO': { var a = toInt(A[0]), b = toInt(A[1]); if (b < a) { var t = a; a = b; b = t; } return a + Math.floor(Math.random() * (b - a + 1)); }
    case 'TRUNC': return Math.trunc(cleanFloat(num(A[0])));
    case 'REDON': {
      // PSeInt redondea alejándose del cero (mitad hacia arriba en valor absoluto).
      var r = cleanFloat(num(A[0]));
      return r < 0 ? -Math.round(-r) : Math.round(r);
    }
    case 'FECHAACTUAL': { var d = new Date(); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); }
    case 'HORAACTUAL': { var h = new Date(); return h.getHours() * 10000 + h.getMinutes() * 100 + h.getSeconds(); }
    case 'LONGITUD': this.needStr(); return String(toStr(A[0])).length;
    case 'CONCATENAR': this.needStr(); return toStr(A[0]) + toStr(A[1]);
    case 'MAYUSCULAS': case 'MAYÚSCULAS': this.needStr(); return toStr(A[0]).toUpperCase();
    case 'MINUSCULAS': case 'MINÚSCULAS': this.needStr(); return toStr(A[0]).toLowerCase();
    case 'SUBCADENA': {
      this.needStr();
      var s = toStr(A[0]); var l = s.length;
      var f = toInt(A[1]), tt = toInt(A[2]);
      if (!this.rules.indices_base0) { f--; tt--; }
      if (tt > l - 1) tt = l - 1;
      if (f < 0) f = 0;
      if (tt < f) return '';
      return s.substring(f, tt + 1);
    }
    case 'CONVERTIRANUMERO': case 'CONVERTIRANÚMERO': this.needStr(); return parseFloat(toStr(A[0])) || 0;
    case 'CONVERTIRATEXTO': this.needStr(); return toStr(A[0]);
    default:
      throw new PseintError('La función "' + call.name + '" no existe.', line);
  }
};

Interpreter.prototype.needStr = function () {
  if (this.rules.funciones_cadena === false) throw new PseintError('El perfil no habilita las funciones de cadena.', 0);
};

/* ═════════════════════════════ API pública ═════════════════════════════ */

function parse(code, rules) { return new Parser(code, rules).parseProgram(); }

function analyze(code, rules) {
  try { parse(code, rules); return { ok: true, errors: [] }; }
  catch (e) { return { ok: false, errors: [{ line: e.line || 0, message: e.message }] }; }
}

function Runner(code, opts) {
  opts = opts || {};
  this.code = code;
  this.rules = opts.rules || {};
  this.io = opts.io || {};
  this.interp = null;
}
Runner.prototype.stop = function () { if (this.interp) this.interp.stopped = true; };
Runner.prototype.run = async function () {
  var self = this;
  try {
    var ast = parse(this.code, this.rules);
    ast.inferred = inferTypes(ast);
    var interp = new Interpreter(ast, this.rules, this.io);
    this.interp = interp;
    if (this.io.onStart) this.io.onStart(ast.name);
    await interp.execBlock(ast.body);
    if (this.io.onFinish) this.io.onFinish({ ok: true, name: ast.name });
  } catch (e) {
    if (e && e.__stop) {
      if (this.io.onError) this.io.onError(e.message, 0);
      if (this.io.onFinish) this.io.onFinish({ ok: false, stopped: true, message: e.message });
    } else {
      if (this.io.onError) this.io.onError(e && e.message ? e.message : String(e), e && e.line ? e.line : 0);
      if (this.io.onFinish) this.io.onFinish({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  }
};

var PSEInt = {
  version: '1.0',
  parse: parse,
  analyze: analyze,
  Runner: Runner,
  run: function (code, opts) { var r = new Runner(code, opts); return r.run().then(function () { return r; }); },
  _internals: { lex: lex, preprocess: preprocess, canon: canon, fmtNum: fmtNum }
};

/* ═════════════════════════════ DIAGRAMAS ═════════════════════════════ */

var DG = { FONT: 12.5, LH: 16, CHARW: 6.75, BOXH: 40, DIAMH: 58, VGAP: 26, HGAP: 40, PADX: 14, PADY: 11, M: 26, NSLINE: 15 };

function xesc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function twidth(s) { return String(s).length * DG.CHARW; }
function wrapText(text, maxChars) {
  var words = String(text).split(/\s+/), lines = [], cur = '';
  var max = maxChars || 26;
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    if (!w) continue;
    if (cur === '') cur = w;
    else if ((cur + ' ' + w).length <= max) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
    while (cur.length > max) { lines.push(cur.slice(0, max)); cur = cur.slice(max); }
  }
  if (cur !== '') lines.push(cur);
  return lines.length ? lines : [''];
}

var OP_TEXT = { 'Y': 'Y', 'O': 'O', 'MOD': 'MOD', 'multiplo': 'ES MÚLTIPLO DE', 'par': 'ES PAR', 'impar': 'ES IMPAR',
  'esentero': 'ES ENTERO', 'esreal': 'ES REAL', 'eslogico': 'ES LÓGICO', 'escaracter': 'ES CARACTER', 'esnumero': 'ES NUMÉRICO' };

function exprText(n, top) {
  if (!n) return '';
  switch (n.t) {
    case 'num': return typeof n.v === 'number' && Number.isInteger(n.v) ? String(n.v) : fmtNum(n.v);
    case 'str': return '"' + n.v + '"';
    case 'bool': return n.v ? 'VERDADERO' : 'FALSO';
    case 'var': return n.name + (n.subs && n.subs.length ? '[' + n.subs.map(function (x) { return exprText(x); }).join(',') + ']' : '');
    case 'call': return n.name + '(' + n.args.map(function (x) { return exprText(x); }).join(', ') + ')';
    case 'un': return (n.op === '~' ? 'NO ' : n.op) + exprText(n.a);
    case 'bin': {
      var op = OP_TEXT[n.op] || n.op;
      if (n.b === null) return exprText(n.a) + ' ' + op;
      var s = exprText(n.a) + ' ' + op + ' ' + exprText(n.b);
      return top === false ? '(' + s + ')' : s;
    }
    default: return '';
  }
}

function stmtText(s) {
  switch (s.t) {
    case 'escribir': return 'Escribir ' + s.exprs.map(function (e) { return exprText(e); }).join(', ');
    case 'leer': return 'Leer ' + s.targets.map(function (e) { return exprText(e); }).join(', ');
    case 'asignar': return exprText(s.target) + ' \u2190 ' + exprText(s.expr);
    case 'llamar': return s.call.name + '(' + s.call.args.map(function (e) { return exprText(e); }).join(', ') + ')';
    case 'def': return 'Definir ' + s.names.map(function (x) { return x.name; }).join(', ');
    case 'dim': return (s.redim ? 'Redimensionar ' : 'Dimension ') + s.items.map(function (x) { return x.name; }).join(', ');
    case 'esperar': return 'Esperar';
    case 'esperartecla': return 'Esperar Tecla';
    default: return '';
  }
}
/* ── Estructuras de layout para diagrama de flujo ── */
function emptyStruct() { return { w: 0, h: 0, shapes: [], edges: [], entry: { x: 0, y: 0 }, exit: { x: 0, y: 0 }, empty: true }; }
function tz(st, dx, dy) {
  var shapes = st.shapes.map(function (s) { var o = {}; for (var k in s) o[k] = s[k]; o.x += dx; o.y += dy; return o; });
  var edges = st.edges.map(function (e) { return e.map(function (p) { return { x: p.x + dx, y: p.y + dy }; }); });
  var labels = (st.labels || []).map(function (l) { return { x: l.x + dx, y: l.y + dy, text: l.text }; });
  return { w: st.w, h: st.h, shapes: shapes, edges: edges, labels: labels,
    entry: { x: st.entry.x + dx, y: st.entry.y + dy },
    exit: { x: st.exit.x + dx, y: st.exit.y + dy } };
}

function flSeq(list) {
  var items = (list || []).filter(function (c) { return c && !c.empty; });
  if (!items.length) return emptyStruct();
  var W = 0;
  items.forEach(function (c) { if (c.w > W) W = c.w; });
  var shapes = [], edges = [], labels = [], y = 0, prevExit = null, firstEntry = null;
  items.forEach(function (c) {
    var t = tz(c, (W - c.w) / 2, y);
    shapes = shapes.concat(t.shapes); edges = edges.concat(t.edges);
    labels = labels.concat(t.labels || []);
    if (prevExit) edges.push([prevExit, { x: W / 2, y: y }]);
    if (!firstEntry) firstEntry = { x: W / 2, y: y };
    prevExit = { x: W / 2, y: y + c.h };
    y += c.h + DG.VGAP;
  });
  return { w: W, h: y - DG.VGAP, shapes: shapes, edges: edges, labels: labels, entry: firstEntry, exit: prevExit };
}

function flSimple(label, kind) {
  var lines = wrapText(label, 26);
  var maxw = 0; lines.forEach(function (l) { if (twidth(l) > maxw) maxw = twidth(l); });
  var w = Math.max(100, maxw + 2 * DG.PADX + 14);
  var h = Math.max(DG.BOXH, lines.length * DG.LH + 2 * DG.PADY);
  return { w: w, h: h, shapes: [{ type: kind, x: 0, y: 0, w: w, h: h, lines: lines }], edges: [],
    entry: { x: w / 2, y: 0 }, exit: { x: w / 2, y: h } };
}

function flDecision(text) {
  var lines = wrapText(text, 20);
  var maxw = 0; lines.forEach(function (l) { if (twidth(l) > maxw) maxw = twidth(l); });
  var w = Math.max(140, maxw + 60);
  var h = Math.max(DG.DIAMH, lines.length * DG.LH + 42);
  return { w: w, h: h, lines: lines, shapes: [{ type: 'diamond', x: 0, y: 0, w: w, h: h, lines: lines }], edges: [],
    entry: { x: w / 2, y: 0 }, exit: { x: w / 2, y: h } };
}

function flIf(condText, thenS, elseS) {
  var dec = flDecision(condText);
  var A = (thenS && !thenS.empty) ? thenS : emptyStruct();
  var B = (elseS && !elseS.empty) ? elseS : emptyStruct();
  var w1 = Math.max(A.w, 44), w2 = Math.max(B.w, 44);
  var inner = w1 + DG.HGAP + w2;
  var dw = dec.w;
  var W = Math.max(dw, inner) + 2 * DG.M;
  var cx = W / 2;
  var shapes = [], edges = [];
  // diamante
  shapes.push({ type: 'diamond', x: cx - dw / 2, y: 0, w: dw, h: dec.h, lines: dec.lines });
  var dTop = 0, dHalf = dec.h / 2, dBot = dec.h;
  var leftX = cx - inner / 2;
  var x1 = leftX + w1 / 2;
  var x2 = cx + inner / 2 - w2 / 2;
  var branchTop = dBot + DG.VGAP;
  var hmax = Math.max(A.h, B.h) || 0;
  var branchBot = branchTop + hmax;
  var joinY = branchBot + DG.VGAP;
  // rama izquierda (Sí)
  if (!A.empty) {
    var ta = tz(A, x1 - A.w / 2, branchTop);
    shapes = shapes.concat(ta.shapes); edges = edges.concat(ta.edges);
    edges.push([{ x: cx - dw / 2, y: dHalf }, { x: x1, y: dHalf }, { x: x1, y: branchTop }]);
    edges.push([{ x: x1, y: branchTop + A.h }, { x: x1, y: joinY }, { x: cx, y: joinY }]);
  } else {
    edges.push([{ x: cx - dw / 2, y: dHalf }, { x: x1, y: dHalf }, { x: x1, y: joinY }, { x: cx, y: joinY }]);
  }
  // rama derecha (No)
  if (!B.empty) {
    var tb = tz(B, x2 - B.w / 2, branchTop);
    shapes = shapes.concat(tb.shapes); edges = edges.concat(tb.edges);
    edges.push([{ x: cx + dw / 2, y: dHalf }, { x: x2, y: dHalf }, { x: x2, y: branchTop }]);
    edges.push([{ x: x2, y: branchTop + B.h }, { x: x2, y: joinY }, { x: cx, y: joinY }]);
  } else {
    edges.push([{ x: cx + dw / 2, y: dHalf }, { x: x2, y: dHalf }, { x: x2, y: joinY }, { x: cx, y: joinY }]);
  }
  if (A.empty && B.empty) joinY = branchTop;
  return { w: W, h: joinY, shapes: shapes, edges: edges, entry: { x: cx, y: 0 }, exit: { x: cx, y: joinY },
    labels: [{ x: cx - dw / 2 + 10, y: dHalf + 14, text: 'Sí' }, { x: cx + dw / 2 - 26, y: dHalf + 14, text: 'No' }] };
}

function flLoop(condText, body, kind) {
  // kind: 'while' | 'dowhile'
  var dec = flDecision(condText);
  var B = (body && !body.empty) ? body : emptyStruct();
  var dw = dec.w;
  var W = Math.max(dw + 2 * DG.M, B.w + 2 * DG.M);
  var cx = W / 2;
  var shapes = [], edges = [];
  var backX = 8, falseX = W - 8;
  if (kind === 'while') {
    shapes.push({ type: 'diamond', x: cx - dw / 2, y: 0, w: dw, h: dec.h, lines: dec.lines });
    var bodyTop = dec.h + DG.VGAP;
    if (!B.empty) {
      var tb = tz(B, cx - B.w / 2, bodyTop);
      shapes = shapes.concat(tb.shapes); edges = edges.concat(tb.edges);
    }
    var bodyBot = bodyTop + B.h;
    var midY = bodyBot + DG.VGAP * 0.7;
    var exitY = midY + DG.VGAP * 0.7;
    // sí (cuerpo)
    edges.push([{ x: cx, y: dec.h }, { x: cx, y: bodyTop }]);
    // retorno
    edges.push([{ x: cx, y: bodyBot }, { x: cx, y: midY }, { x: backX, y: midY }, { x: backX, y: dec.h / 2 }, { x: cx - dw / 2, y: dec.h / 2 }]);
    // no (salida)
    edges.push([{ x: cx + dw / 2, y: dec.h / 2 }, { x: falseX, y: dec.h / 2 }, { x: falseX, y: exitY }, { x: cx, y: exitY }]);
    return { w: W, h: exitY, shapes: shapes, edges: edges, entry: { x: cx, y: 0 }, exit: { x: cx, y: exitY },
      labels: [{ x: cx + 8, y: dec.h - 8, text: 'Sí' }, { x: cx + dw / 2 + 8, y: dec.h / 2 - 8, text: 'No' }] };
  } else {
    // do-while: cuerpo arriba, decisión abajo
    var topY = 0, bodyH = B.h;
    if (!B.empty) {
      var tb2 = tz(B, cx - B.w / 2, 0);
      shapes = shapes.concat(tb2.shapes); edges = edges.concat(tb2.edges);
    }
    var decTop = bodyH + DG.VGAP;
    shapes.push({ type: 'diamond', x: cx - dw / 2, y: decTop, w: dw, h: dec.h, lines: dec.lines });
    edges.push([{ x: cx, y: bodyH }, { x: cx, y: decTop }]);
    var exitY2 = decTop + dec.h + DG.VGAP;
    // falso: vuelve arriba
    edges.push([{ x: cx - dw / 2, y: decTop + dec.h / 2 }, { x: backX, y: decTop + dec.h / 2 }, { x: backX, y: 0 }]);
    // verdadero: sale
    edges.push([{ x: cx, y: decTop + dec.h }, { x: cx, y: exitY2 }]);
    return { w: W, h: exitY2, shapes: shapes, edges: edges, entry: { x: cx, y: 0 }, exit: { x: cx, y: exitY2 },
      labels: [{ x: cx + 8, y: decTop + dec.h - 8, text: 'Sí' }, { x: cx - dw / 2 - 30, y: decTop + dec.h / 2 - 8, text: 'No' }] };
  }
}

function flFor(s, body) {
  var initLbl = s.varName + ' \u2190 ' + exprText(s.init);
  var condTxt = s.varName + ' \u2264 ' + exprText(s.fin);
  var incrLbl = s.varName + ' \u2190 ' + s.varName + ' + ' + (s.paso ? exprText(s.paso) : '1');
  var initBox = flSimple(initLbl, 'rect');
  var dec = flDecision(condTxt);
  var B = (body && !body.empty) ? body : emptyStruct();
  var incrBox = flSimple(incrLbl, 'rect');
  var WA = Math.max(initBox.w, dec.w, B.w, incrBox.w);
  var M = 22, W = WA + 2 * M, cx = W / 2;
  var shapes = [], edges = [], labels = [], y = 0;
  var ti = tz(initBox, cx - initBox.w / 2, y);
  shapes = shapes.concat(ti.shapes);
  y += initBox.h;
  var initBot = y;
  y += DG.VGAP;
  var decTop = y;
  shapes.push({ type: 'diamond', x: cx - dec.w / 2, y: decTop, w: dec.w, h: dec.h, lines: dec.lines });
  edges.push([{ x: cx, y: initBot }, { x: cx, y: decTop }]);
  y += dec.h;
  var dBot = y;
  y += DG.VGAP;
  var bodyTop = y;
  if (!B.empty) {
    var tb = tz(B, cx - B.w / 2, bodyTop);
    shapes = shapes.concat(tb.shapes); edges = edges.concat(tb.edges); labels = labels.concat(tb.labels || []);
  }
  var bodyBot = bodyTop + B.h;
  edges.push([{ x: cx, y: dBot }, { x: cx, y: bodyTop }]);
  y = bodyBot + DG.VGAP;
  var incrTop = y;
  var tinc = tz(incrBox, cx - incrBox.w / 2, y);
  shapes = shapes.concat(tinc.shapes);
  y += incrBox.h;
  var incrBot = y;
  edges.push([{ x: cx, y: bodyBot }, { x: cx, y: incrTop }]);
  var midY = incrBot + DG.VGAP * 0.75;
  edges.push([{ x: cx, y: incrBot }, { x: cx, y: midY }, { x: 8, y: midY },
    { x: 8, y: decTop + dec.h / 2 }, { x: cx - dec.w / 2, y: decTop + dec.h / 2 }]);
  var exitY = midY + DG.VGAP * 0.75;
  edges.push([{ x: cx + dec.w / 2, y: decTop + dec.h / 2 }, { x: W - 8, y: decTop + dec.h / 2 },
    { x: W - 8, y: exitY }, { x: cx, y: exitY }]);
  labels.push({ x: cx + 7, y: decTop + dec.h + 14, text: 'Sí' });
  labels.push({ x: cx + dec.w / 2 + 8, y: decTop + dec.h / 2 - 8, text: 'No' });
  return { w: W, h: exitY, shapes: shapes, edges: edges, labels: labels, entry: { x: cx, y: 0 }, exit: { x: cx, y: exitY } };
}

function flSegun(s) {
  function build(i) {
    if (i >= s.cases.length) {
      return (s.def && s.def.length) ? flSeq(s.def.map(nodeLayout)) : emptyStruct();
    }
    var c = s.cases[i];
    var condTxt = exprText(s.expr) + ' = ' + c.labels.map(function (l) { return exprText(l); }).join(', ');
    var thenS = flSeq(c.body.map(nodeLayout));
    var elseS = build(i + 1);
    return flIf(condTxt, thenS, elseS);
  }
  var root = build(0);
  return root.empty ? emptyStruct() : root;
}

function nodeLayout(s) {
  switch (s.t) {
    case 'escribir': return flSimple(stmtText(s), 'io');
    case 'leer': return flSimple(stmtText(s), 'io');
    case 'asignar': return flSimple(stmtText(s), 'rect');
    case 'llamar': return flSimple(stmtText(s), 'rect');
    case 'esperartecla': return flSimple('Esperar Tecla', 'io');
    case 'esperar': return flSimple('Esperar', 'io');
    case 'limpiar': return flSimple('Limpiar Pantalla', 'rect');
    case 'def': case 'dim': return emptyStruct();
    case 'si': return flIf(exprText(s.cond), flSeq(s.then.map(nodeLayout)), flSeq(s.else.map(nodeLayout)));
    case 'mientras': return flLoop(exprText(s.cond), flSeq(s.body.map(nodeLayout)), 'while');
    case 'repetir': return flLoop(exprText(s.cond), flSeq(s.body.map(nodeLayout)), 'dowhile');
    case 'para': return flFor(s, flSeq(s.body.map(nodeLayout)));
    case 'paracada': {
      var lbl = 'Para Cada ' + exprText(s.elem) + ' De ' + exprText(s.arr);
      return flLoop(lbl, flSeq(s.body.map(nodeLayout)), 'while');
    }
    case 'segun': return flSegun(s);
    default: return emptyStruct();
  }
}

/* ── Render SVG ── */
function renderTextLines(lines, cx, cy, color) {
  var out = '';
  var start = cy - (lines.length - 1) * DG.LH / 2 + 4.5;
  for (var i = 0; i < lines.length; i++) {
    out += '<text x="' + cx.toFixed(1) + '" y="' + (start + i * DG.LH).toFixed(1) + '" text-anchor="middle" ' +
      'font-family="Inter,Segoe UI,Arial,sans-serif" font-size="' + DG.FONT + '" fill="' + (color || '#0f172a') + '">' + xesc(lines[i]) + '</text>';
  }
  return out;
}

function renderShapes(shapes) {
  var out = '';
  shapes.forEach(function (s) {
    var fill = s.type === 'io' ? '#eef4ff' : (s.type === 'diamond' ? '#fffbea' : '#ffffff');
    var stroke = '#33507a';
    if (s.type === 'rect' || s.type === 'io' || s.type === 'oval') {
      if (s.type === 'oval') {
        out += '<rect x="' + s.x + '" y="' + s.y + '" width="' + s.w + '" height="' + s.h + '" rx="' + (s.h / 2) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.6"/>';
      } else if (s.type === 'io') {
        var sk = 15;
        out += '<polygon points="' + (s.x + sk) + ',' + s.y + ' ' + (s.x + s.w) + ',' + s.y + ' ' + (s.x + s.w - sk) + ',' + (s.y + s.h) + ' ' + s.x + ',' + (s.y + s.h) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.6"/>';
      } else {
        out += '<rect x="' + s.x + '" y="' + s.y + '" width="' + s.w + '" height="' + s.h + '" rx="3" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.6"/>';
      }
    } else if (s.type === 'diamond') {
      var cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      out += '<polygon points="' + cx + ',' + s.y + ' ' + (s.x + s.w) + ',' + cy + ' ' + cx + ',' + (s.y + s.h) + ' ' + s.x + ',' + cy + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.6"/>';
    }
    if (s.lines) out += renderTextLines(s.lines, s.x + s.w / 2, s.y + s.h / 2, '#0f172a');
  });
  return out;
}

function renderEdges(edges) {
  var out = '';
  edges.forEach(function (pts) {
    var d = pts.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
    out += '<polyline points="' + d + '" fill="none" stroke="#33507a" stroke-width="1.5" marker-end="url(#pse-arrow)" stroke-linejoin="round"/>';
  });
  return out;
}

function renderLabels(labels) {
  var out = '';
  (labels || []).forEach(function (l) {
    out += '<text x="' + l.x.toFixed(1) + '" y="' + l.y.toFixed(1) + '" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="10.5" font-style="italic" fill="#33507a">' + xesc(l.text) + '</text>';
  });
  return out;
}

function buildFlowDiagram(ast, opts) {
  var body = ast.body.slice();
  var ls = body.map(nodeLayout);
  var core = flSeq(ls);
  if (core.empty) core = flSimple('(vacío)', 'rect');
  var start = flSimple('Inicio', 'oval');
  var end = flSimple('Fin', 'oval');
  var full = flSeq([start, core, end]);
  var W = full.w + 48, H = full.h + 48;
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' +
    '<defs><marker id="pse-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
    '<path d="M 0 0 L 10 5 L 0 10 z" fill="#33507a"/></marker></defs>' +
    '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>' +
    '<g transform="translate(24,24)">' + renderEdges(full.edges) + renderShapes(full.shapes) + renderLabels(full.labels) + '</g></svg>';
  return { ok: true, width: W, height: H, svg: svg, style: 'flow' };
}

/* ── Nassi-Shneiderman ── */
function nsLines(node, maxChars) { return wrapText(stmtText(node), maxChars || 30); }
function nsSimple(node, color) {
  var lines = nsLines(node);
  var maxw = 0; lines.forEach(function (l) { if (twidth(l) > maxw) maxw = twidth(l); });
  var w = Math.max(120, maxw + 2 * DG.PADX + 8);
  var h = Math.max(30, lines.length * DG.NSLINE + 2 * DG.PADY);
  return { w: w, h: h, lines: lines, color: color || '#ffffff' };
}
function nsSeq(items) {
  var list = (items || []).filter(Boolean);
  if (!list.length) return { w: 0, h: 0, empty: true };
  if (list.length === 1) return list[0];
  var W = 0, H = 0;
  list.forEach(function (c) { if (c.w > W) W = c.w; H += c.h; });
  return { w: W, h: H, seq: list };
}

function nsHeadH(lines) { return (lines ? lines.length : 0) * DG.NSLINE + 2 * DG.PADY; }

function nsIfNode(headLines, thenS, elseS) {
  var w1 = Math.max((thenS && thenS.w) ? thenS.w : 0, 110);
  var w2 = Math.max((elseS && elseS.w) ? elseS.w : 0, 110);
  var wedge = (thenS && !thenS.empty) ? 18 : 0;
  var innerH = Math.max((thenS && !thenS.empty) ? thenS.h + wedge : 0, (elseS && !elseS.empty) ? elseS.h : 0);
  return { kind: 'if', headLines: headLines, then: thenS, else_: elseS,
    w1: w1, w2: w2, wedge: wedge, w: w1 + w2, h: nsHeadH(headLines) + innerH };
}

function nsLoopNode(headLines, body, footLines, minW) {
  var bh = (body && body.h) ? body.h : 0;
  var bw = (body && body.w) ? body.w : 0;
  return { kind: 'loop', headLines: headLines, body: body, footLines: footLines || null,
    w: Math.max(bw, minW || 160), h: nsHeadH(headLines) + bh + (footLines ? nsHeadH(footLines) : 0) };
}

function nsRender(st, x, y, out, forceW) {
  if (!st || st.empty) return;
  if (st.seq) {
    var yy = y;
    st.seq.forEach(function (c) { nsRender(c, x, yy, out, st.w); yy += c.h; });
    return;
  }
  if (st.kind === 'if') {
    var headH = st.headLines.length * DG.NSLINE + 2 * DG.PADY;
    var total = st.w1 + st.w2;
    var W = forceW ? Math.max(total, forceW) : total;
    var extra = W - total;
    var tw1 = st.w1 + Math.floor(extra / 2);
    var tw2 = W - tw1;
    var wedge = (st.then && !st.then.empty) ? 18 : 0;
    var h = headH + Math.max((st.then && !st.then.empty ? st.then.h + wedge : 0), (st.else_ && !st.else_.empty ? st.else_.h : 0));
    var bodyTop = y + headH;
    out.push('<rect x="' + x + '" y="' + y + '" width="' + W + '" height="' + h + '" fill="#ffffff" stroke="#33507a" stroke-width="1.7"/>');
    // separador horizontal de la cabecera
    out.push('<line x1="' + x + '" y1="' + bodyTop + '" x2="' + (x + W) + '" y2="' + bodyTop + '" stroke="#33507a" stroke-width="1.7"/>');
    // divisoria vertical de las dos ramas
    out.push('<line x1="' + (x + tw1) + '" y1="' + bodyTop + '" x2="' + (x + tw1) + '" y2="' + (y + h) + '" stroke="#33507a" stroke-width="1.7"/>');
    // diagonal de la rama "Sí" (triángulo superior izquierdo)
    if (wedge) out.push('<line x1="' + x + '" y1="' + bodyTop + '" x2="' + (x + tw1) + '" y2="' + (bodyTop + wedge) + '" stroke="#33507a" stroke-width="1.7"/>');
    var start = y + 6;
    for (var i = 0; i < st.headLines.length; i++) {
      out.push('<text x="' + (x + 8) + '" y="' + (start + i * DG.NSLINE + 3) + '" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="' + DG.FONT + '" fill="#0f172a">' + xesc(st.headLines[i]) + '</text>');
    }
    out.push('<text x="' + (x + 7) + '" y="' + (bodyTop + wedge + 12) + '" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="10" font-style="italic" fill="#33507a">Sí</text>');
    out.push('<text x="' + (x + tw1 + 7) + '" y="' + (bodyTop + 13) + '" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="10" font-style="italic" fill="#33507a">No</text>');
    nsRender(st.then, x, bodyTop + wedge, out, tw1);
    nsRender(st.else_, x + tw1, bodyTop, out, tw2);
    return;
  }
  if (st.kind === 'loop') {
    var lh = st.headLines.length * DG.NSLINE + 2 * DG.PADY;
    var footH = st.footLines ? (st.footLines.length * DG.NSLINE + 2 * DG.PADY) : 0;
    var H = lh + (st.body ? st.body.h : 0) + footH;
    var LW = forceW ? Math.max(st.w, forceW) : Math.max(st.w, st.body ? st.body.w : 0);
    out.push('<rect x="' + x + '" y="' + y + '" width="' + LW + '" height="' + H + '" fill="#ffffff" stroke="#33507a" stroke-width="1.7"/>');
    out.push('<line x1="' + x + '" y1="' + (y + lh) + '" x2="' + (x + LW) + '" y2="' + (y + lh) + '" stroke="#33507a" stroke-width="1.7"/>');
    out.push('<polygon points="' + (x + 4) + ',' + (y + lh) + ' ' + (x + 15) + ',' + (y + lh) + ' ' + (x + 4) + ',' + (y + lh + 11) + '" fill="#33507a" stroke="#33507a" stroke-width="1"/>');
    var s2 = y + 6;
    for (var j = 0; j < st.headLines.length; j++) {
      out.push('<text x="' + (x + 22) + '" y="' + (s2 + j * DG.NSLINE + 3) + '" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="' + DG.FONT + '" fill="#0f172a">' + xesc(st.headLines[j]) + '</text>');
    }
    nsRender(st.body, x, y + lh, out, LW);
    if (st.footLines) {
      var fy = y + lh + (st.body ? st.body.h : 0);
      out.push('<line x1="' + x + '" y1="' + fy + '" x2="' + (x + LW) + '" y2="' + fy + '" stroke="#33507a" stroke-width="1.7"/>');
      for (var k2 = 0; k2 < st.footLines.length; k2++) {
        out.push('<text x="' + (x + 8) + '" y="' + (fy + 6 + k2 * DG.NSLINE + 3) + '" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="' + DG.FONT + '" fill="#0f172a">' + xesc(st.footLines[k2]) + '</text>');
      }
      out.push('<polygon points="' + (x + LW - 4) + ',' + fy + ' ' + (x + LW - 15) + ',' + fy + ' ' + (x + LW - 4) + ',' + (fy + 11) + '" fill="#33507a" stroke="#33507a" stroke-width="1"/>');
    }
    return;
  }
  // simple
  var w = forceW ? Math.max(st.w, forceW) : st.w;
  out.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + st.h + '" fill="' + (st.color || '#ffffff') + '" stroke="#33507a" stroke-width="1.5"/>');
  var sy = y + DG.PADY + 3;
  for (var m = 0; m < st.lines.length; m++) {
    out.push('<text x="' + (x + w / 2) + '" y="' + (sy + m * DG.NSLINE) + '" text-anchor="middle" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="' + DG.FONT + '" fill="#0f172a">' + xesc(st.lines[m]) + '</text>');
  }
}

function nsBuild(node) {
  switch (node.t) {
    case 'def': case 'dim': case 'limpiar': return null;
    case 'si':
      return nsIfNode(wrapText('Si ' + exprText(node.cond), 30),
        nsSeq(node.then.map(nsBuild)), nsSeq(node.else.map(nsBuild)));
    case 'mientras':
      return nsLoopNode(wrapText('Mientras ' + exprText(node.cond), 30), nsSeq(node.body.map(nsBuild)), null, 160);
    case 'repetir':
      return nsLoopNode(wrapText('Repetir', 30), nsSeq(node.body.map(nsBuild)),
        [(node.mode === 'mientras' ? 'Mientras Que ' : 'Hasta Que ') + exprText(node.cond)], 160);
    case 'para':
      return nsLoopNode(
        wrapText('Para ' + node.varName + ' \u2190 ' + exprText(node.init) + ' Hasta ' + exprText(node.fin) +
          (node.paso ? ' Con Paso ' + exprText(node.paso) : ''), 30),
        nsSeq(node.body.map(nsBuild)), null, 170);
    case 'paracada':
      return nsLoopNode(wrapText('Para Cada ' + exprText(node.elem) + ' De ' + exprText(node.arr), 30),
        nsSeq(node.body.map(nsBuild)), null, 160);
    case 'segun': {
      function buildCase(i) {
        if (i >= node.cases.length) {
          return (node.def && node.def.length) ? nsSeq(node.def.map(nsBuild)) : null;
        }
        var c = node.cases[i];
        var cond = exprText(node.expr) + ' = ' + c.labels.map(function (l) { return exprText(l); }).join(', ');
        var thenS = nsSeq(c.body.map(nsBuild));
        var elseS = buildCase(i + 1);
        return nsIfNode(wrapText(cond, 30), thenS, elseS || nsSeq([]));
      }
      return buildCase(0) || nsSeq([]);
    }
    default: return nsSimple(node, node.t === 'escribir' || node.t === 'leer' ? '#eef4ff' : '#ffffff');
  }
}

function buildNSDiagram(ast, opts) {
  var root = nsSeq(ast.body.map(nsBuild));
  if (root.empty) root = nsSimple({ t: 'asignar', target: { t: 'str', v: '(vacío)' }, expr: { t: 'str', v: '' } });
  var W = root.w + 48, H = root.h + 48;
  var out = [];
  nsRender(root, 24, 24, out);
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' +
    '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>' + out.join('') + '</svg>';
  return { ok: true, width: W, height: H, svg: svg, style: 'ns' };
}

PSEInt.buildFlowDiagram = function (code, opts) {
  try {
    var ast = (typeof code === 'string') ? parse(code, opts && opts.rules) : code;
    return buildFlowDiagram(ast, opts);
  } catch (e) { return { ok: false, error: e.message, line: e.line }; }
};
PSEInt.buildNSDiagram = function (code, opts) {
  try {
    var ast = (typeof code === 'string') ? parse(code, opts && opts.rules) : code;
    return buildNSDiagram(ast, opts);
  } catch (e) { return { ok: false, error: e.message, line: e.line }; }
};
PSEInt.buildDiagram = function (code, opts) {
  opts = opts || {};
  var style = opts.style || ((opts.rules && opts.rules.diagramas_ns) ? 'ns' : 'flow');
  return style === 'ns' ? PSEInt.buildNSDiagram(code, opts) : PSEInt.buildFlowDiagram(code, opts);
};

global.PSEInt = PSEInt;
if (typeof module !== 'undefined' && module.exports) module.exports = PSEInt;

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
