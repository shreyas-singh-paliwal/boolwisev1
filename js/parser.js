/* parser.js — turns user input (expression | minterms/maxterms) into a truth table.
   Truth table representation used everywhere in this app:
     { vars: ['A','B',...], rows: [0|1|'X', ...] }   rows[i] = output for input i,
     where i's bits (MSB..LSB) correspond to vars[0..n-1].
   No DOM access here — pure functions, easy to unit test. */

const MAX_VARS = 6;

/* ---------- expression tokenizer / parser ---------- */
function tokenize(expr) {
  const toks = [];
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (/\s/.test(c)) continue;
    if (/[A-Za-z]/.test(c)) { toks.push({ t: 'VAR', v: c.toUpperCase() }); continue; }
    if (c === "'") { toks.push({ t: 'NOTPOST' }); continue; }
    if (c === '!' || c === '~') { toks.push({ t: 'NOTPRE' }); continue; }
    if (c === '.' || c === '&' || c === '*') { toks.push({ t: 'AND' }); continue; }
    if (c === '+' || c === '|') { toks.push({ t: 'OR' }); continue; }
    if (c === '^') { toks.push({ t: 'XOR' }); continue; }
    if (c === '(') { toks.push({ t: 'LP' }); continue; }
    if (c === ')') { toks.push({ t: 'RP' }); continue; }
    throw new Error(`Unexpected character "${c}" in expression.`);
  }
  // insert implicit AND, e.g. "AB" -> A AND B, "A(B+C)" -> A AND (B+C)
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    out.push(toks[i]);
    const cur = toks[i], nxt = toks[i + 1];
    if (!nxt) continue;
    const endsVal = cur.t === 'VAR' || cur.t === 'RP' || cur.t === 'NOTPOST';
    const startsVal = nxt.t === 'VAR' || nxt.t === 'NOTPRE' || nxt.t === 'LP';
    if (endsVal && startsVal) out.push({ t: 'AND' });
  }
  return out;
}

// grammar (low->high precedence): OR > XOR > AND > NOTPRE > NOTPOST > primary
function parse(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];
  function orExpr() { let n = xorExpr(); while (peek()?.t === 'OR') { next(); n = { op: 'OR', a: n, b: xorExpr() }; } return n; }
  function xorExpr() { let n = andExpr(); while (peek()?.t === 'XOR') { next(); n = { op: 'XOR', a: n, b: andExpr() }; } return n; }
  function andExpr() { let n = unary(); while (peek()?.t === 'AND') { next(); n = { op: 'AND', a: n, b: unary() }; } return n; }
  function unary() { if (peek()?.t === 'NOTPRE') { next(); return { op: 'NOT', a: unary() }; } return postfix(); }
  function postfix() { let n = primary(); while (peek()?.t === 'NOTPOST') { next(); n = { op: 'NOT', a: n }; } return n; }
  function primary() {
    const tok = next();
    if (!tok) throw new Error('Unexpected end of expression.');
    if (tok.t === 'VAR') return { op: 'VAR', name: tok.v };
    if (tok.t === 'LP') { const n = orExpr(); if (peek()?.t === 'RP') next(); else throw new Error('Missing closing ")".'); return n; }
    throw new Error('Could not parse expression.');
  }
  const ast = orExpr();
  if (p !== tokens.length) throw new Error('Unexpected trailing characters in expression.');
  return ast;
}

function evalAst(node, env) {
  switch (node.op) {
    case 'VAR': return env[node.name];
    case 'NOT': return evalAst(node.a, env) ? 0 : 1;
    case 'AND': return (evalAst(node.a, env) && evalAst(node.b, env)) ? 1 : 0;
    case 'OR': return (evalAst(node.a, env) || evalAst(node.b, env)) ? 1 : 0;
    case 'XOR': return (evalAst(node.a, env) ^ evalAst(node.b, env)) ? 1 : 0;
  }
}

function varsUsedIn(expr) {
  const s = new Set();
  for (const c of expr) if (/[A-Za-z]/.test(c)) s.add(c.toUpperCase());
  return [...s].sort();
}

/** Build a truth table from a free-form expression. */
function truthFromExpression(expr, minVarCount) {
  const trimmed = expr.trim();
  if (!trimmed) throw new Error('Enter an expression using variables A–F.');
  const used = varsUsedIn(trimmed);
  if (used.length === 0) throw new Error('Enter an expression using variables A–F.');
  if (used.length > MAX_VARS) throw new Error(`Use at most ${MAX_VARS} variables (found ${used.join(', ')}).`);

  const n = Math.max(used.length, minVarCount || 0, 1);
  const pool = 'ABCDEF'.split('').filter(v => !used.includes(v));
  const vars = used.slice();
  while (vars.length < n && pool.length) vars.push(pool.shift());
  vars.sort();

  const ast = parse(tokenize(trimmed));
  const rows = [];
  for (let i = 0; i < 2 ** n; i++) {
    const env = {};
    vars.forEach((v, idx) => { env[v] = (i >> (n - 1 - idx)) & 1; });
    rows.push(evalAst(ast, env));
  }
  return { vars, rows };
}

/** Parse a comma/space separated list of small integers. */
function parseIndexList(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return [];
  if (!/^\d+(?:[\s,]+\d+)*$/.test(trimmed)) throw new Error('Use whole numbers separated by commas or spaces.');
  return [...new Set(trimmed.split(/[\s,]+/).map(Number))];
}

/** Build a truth table from minterm/maxterm indices (+ optional don't-cares). */
function truthFromTerms(kind, termsText, dcText, minVarCount) {
  const terms = parseIndexList(termsText);
  const dc = parseIndexList(dcText);
  const overlap = terms.filter(i => dc.includes(i));
  if (overlap.length) throw new Error(`Index ${overlap.join(', ')} listed as both a term and a don't-care.`);
  const all = terms.concat(dc);
  const maxIdx = all.length ? Math.max(...all) : 0;
  const needed = maxIdx === 0 ? 1 : Math.ceil(Math.log2(maxIdx + 1));
  const n = Math.max(needed, minVarCount || 0, 1);
  if (n > MAX_VARS) throw new Error(`Index ${maxIdx} needs more than ${MAX_VARS} variables.`);
  if (all.some(i => i >= 2 ** n)) throw new Error(`Index out of range for ${n} variables.`);

  const vars = 'ABCDEF'.split('').slice(0, n);
  const termSet = new Set(terms), dcSet = new Set(dc);
  const rows = [];
  for (let i = 0; i < 2 ** n; i++) {
    if (dcSet.has(i)) rows.push('X');
    else if (kind === 'minterms') rows.push(termSet.has(i) ? 1 : 0);
    else rows.push(termSet.has(i) ? 0 : 1); // maxterms list the 0-rows
  }
  return { vars, rows, numVars: n };
}

if (typeof module !== 'undefined') module.exports = { truthFromExpression, truthFromTerms, parseIndexList, varsUsedIn };
