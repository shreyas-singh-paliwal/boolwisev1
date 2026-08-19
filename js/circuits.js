/* circuits.js — gate-level netlists.
   A netlist node is one of:
     {t:'VAR', name}
     {t:'CONST', v: 0|1}
     {t:'NOT'|'AND'|'OR'|'NAND'|'NOR', a, b}   (b omitted for NOT)
   buildBasicTree() builds an AND/OR/NOT tree straight from the minimized SOP terms.
   toNand()/toNor() rewrite ANY such tree into an equivalent NAND-only / NOR-only
   tree using the standard bubble-pushing identities, so they are equivalent to the
   basic tree "by construction" for every input — see verify.js for a runtime check too. */

function andTree(nodes) { return nodes.reduce((a, b) => ({ t: 'AND', a, b })); }
function orTree(nodes) { return nodes.reduce((a, b) => ({ t: 'OR', a, b })); }

/** literal terms (from qm.js) -> AND/OR/NOT tree. Empty terms array = constant 0. */
function buildBasicTree(sopTerms) {
  if (sopTerms.length === 0) return { t: 'CONST', v: 0 };
  const productNodes = sopTerms.map(term => {
    if (term.length === 0) return { t: 'CONST', v: 1 }; // covers everything
    const lits = term.map(l => l.neg ? { t: 'NOT', a: { t: 'VAR', name: l.name } } : { t: 'VAR', name: l.name });
    return andTree(lits);
  });
  return orTree(productNodes);
}

/** Rewrite tree so every gate is NAND (or a literal/constant). */
function toNand(node) {
  if (node.t === 'VAR' || node.t === 'CONST') return node;
  if (node.t === 'NOT') { const a = toNand(node.a); return { t: 'NAND', a, b: a }; }
  if (node.t === 'AND') {
    const a = toNand(node.a), b = toNand(node.b);
    const n = { t: 'NAND', a, b };
    return { t: 'NAND', a: n, b: n }; // invert the NAND back to AND
  }
  if (node.t === 'OR') {
    const a = toNand(node.a), b = toNand(node.b);
    return { t: 'NAND', a: { t: 'NAND', a, b: a }, b: { t: 'NAND', a: b, b } };
  }
  throw new Error('toNand: unexpected node ' + node.t);
}

/** Rewrite tree so every gate is NOR (dual of toNand). */
function toNor(node) {
  if (node.t === 'VAR' || node.t === 'CONST') return node;
  if (node.t === 'NOT') { const a = toNor(node.a); return { t: 'NOR', a, b: a }; }
  if (node.t === 'OR') {
    const a = toNor(node.a), b = toNor(node.b);
    const n = { t: 'NOR', a, b };
    return { t: 'NOR', a: n, b: n };
  }
  if (node.t === 'AND') {
    const a = toNor(node.a), b = toNor(node.b);
    return { t: 'NOR', a: { t: 'NOR', a, b: a }, b: { t: 'NOR', a: b, b } };
  }
  throw new Error('toNor: unexpected node ' + node.t);
}

/** Evaluate any netlist tree for one input assignment ({A:0/1,...}). */
function evalTree(node, env) {
  switch (node.t) {
    case 'VAR': return env[node.name];
    case 'CONST': return node.v;
    case 'NOT': return evalTree(node.a, env) ? 0 : 1;
    case 'AND': return (evalTree(node.a, env) && evalTree(node.b, env)) ? 1 : 0;
    case 'OR': return (evalTree(node.a, env) || evalTree(node.b, env)) ? 1 : 0;
    case 'NAND': return (evalTree(node.a, env) && evalTree(node.b, env)) ? 0 : 1;
    case 'NOR': return (evalTree(node.a, env) || evalTree(node.b, env)) ? 0 : 1;
  }
}

// toNand/toNor share sub-nodes by object identity (e.g. NOT(a) reuses the same
// `a` twice), so this is really a DAG. Count/collect each unique node once.
function collectNodes(root) {
  const seen = new Set(), order = [];
  (function visit(n) {
    if (seen.has(n)) return;
    seen.add(n);
    if (n.a) visit(n.a);
    if (n.b) visit(n.b);
    order.push(n);
  })(root);
  return order; // leaves first, root last
}
function countGates(node) {
  return collectNodes(node).filter(n => n.t !== 'VAR' && n.t !== 'CONST').length;
}

if (typeof module !== 'undefined') module.exports = { buildBasicTree, toNand, toNor, evalTree, countGates, collectNodes };
