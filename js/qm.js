/* qm.js — Quine–McCluskey minimization.
   Input: list of target indices (the "1"s, or the "0"s for POS) + don't-cares + bit width.
   Output: chosen prime-implicant terms as bit-strings, e.g. "1-0" (n=3, B is "don't care"). */

function countOnes(bits) { return [...bits].filter(c => c === '1').length; }

// Two terms combine iff same length and differ in exactly one non-dash position.
function tryCombine(a, b) {
  if (a.length !== b.length) return null;
  let diffAt = -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      if (a[i] === '-' || b[i] === '-') return null;
      if (diffAt !== -1) return null;
      diffAt = i;
    }
  }
  if (diffAt === -1) return null;
  return a.slice(0, diffAt) + '-' + a.slice(diffAt + 1);
}

function findPrimeImplicants(targets, dontCares, bits) {
  const all = new Set([...targets, ...dontCares]);
  let groups = new Map(); // ones-count -> [{term, cover:Set}]
  all.forEach(m => {
    const term = m.toString(2).padStart(bits, '0');
    const k = countOnes(term);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ term, cover: new Set([m]) });
  });

  const primes = new Map(); // term -> cover Set
  while (groups.size) {
    const keys = [...groups.keys()].sort((a, b) => a - b);
    const next = new Map();
    const used = new Set();
    for (let i = 0; i < keys.length - 1; i++) {
      for (const a of groups.get(keys[i])) {
        for (const b of groups.get(keys[i + 1])) {
          const combined = tryCombine(a.term, b.term);
          if (!combined) continue;
          used.add(a.term + '|' + [...a.cover].sort((x, y) => x - y).join(','));
          used.add(b.term + '|' + [...b.cover].sort((x, y) => x - y).join(','));
          const k = countOnes(combined);
          if (!next.has(k)) next.set(k, []);
          let entry = next.get(k).find(e => e.term === combined);
          if (!entry) { entry = { term: combined, cover: new Set() }; next.get(k).push(entry); }
          [...a.cover, ...b.cover].forEach(m => entry.cover.add(m));
        }
      }
    }
    // unmatched terms in this pass are prime implicants
    for (const k of keys) {
      for (const item of groups.get(k)) {
        const sig = item.term + '|' + [...item.cover].sort((x, y) => x - y).join(',');
        if (!used.has(sig)) {
          if (!primes.has(item.term)) primes.set(item.term, new Set());
          item.cover.forEach(m => primes.get(item.term).add(m));
        }
      }
    }
    groups = next.size ? next : new Map();
    if (!next.size) break;
  }
  return [...primes.entries()].map(([term, cover]) => ({ term, cover }));
}

/** Essential-PI pass, then greedy set cover, over `required` indices only. */
function selectCover(primeImplicants, required) {
  const chosen = [];
  const covered = new Set();
  required.forEach(m => {
    const options = primeImplicants.filter(pi => pi.cover.has(m));
    if (options.length === 1 && !chosen.includes(options[0])) {
      chosen.push(options[0]);
      options[0].cover.forEach(x => { if (required.includes(x)) covered.add(x); });
    }
  });
  let remaining = required.filter(m => !covered.has(m));
  while (remaining.length) {
    let best = null, bestScore = -1;
    for (const pi of primeImplicants) {
      if (chosen.includes(pi)) continue;
      const score = remaining.filter(m => pi.cover.has(m)).length;
      if (score > bestScore) { bestScore = score; best = pi; }
    }
    if (!best || bestScore <= 0) break;
    chosen.push(best);
    remaining = remaining.filter(m => !best.cover.has(m));
  }
  return chosen;
}

/** term ("1-0") -> literal list [{name,neg}], skipping dashes. Empty list = constant 1. */
function termToLiterals(term, vars) {
  const lits = [];
  for (let i = 0; i < term.length; i++) {
    if (term[i] === '1') lits.push({ name: vars[i], neg: false });
    else if (term[i] === '0') lits.push({ name: vars[i], neg: true });
  }
  return lits;
}

/** Minimize a truth table. Returns SOP terms (product-of-literals for the 1s)
 *  and POS terms (sum-of-literals for the 0s, already De-Morgan'd for display). */
function minimize(truthRows, vars) {
  const n = vars.length;
  const ones = [], zeros = [], dc = [];
  truthRows.forEach((v, i) => (v === 1 ? ones : v === 0 ? zeros : dc).push(i));

  const sopPI = findPrimeImplicants(ones, dc, n);
  const sopChosen = ones.length ? selectCover(sopPI, ones) : [];
  const sopTerms = sopChosen.map(pi => termToLiterals(pi.term, vars));

  const posPI = findPrimeImplicants(zeros, dc, n);
  const posChosen = zeros.length ? selectCover(posPI, zeros) : [];
  // each chosen term is a product-term of F'; De Morgan -> OR of complemented literals
  const posTerms = posChosen.map(pi => termToLiterals(pi.term, vars).map(l => ({ name: l.name, neg: !l.neg })));

  return { ones, zeros, dc, sopTerms, posTerms };
}

if (typeof module !== 'undefined') module.exports = { minimize, findPrimeImplicants, selectCover, termToLiterals };
