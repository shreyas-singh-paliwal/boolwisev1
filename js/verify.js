/* verify.js — brute-force check, over every input combination, that the original
   (possibly don't-care) truth table, the minimized expression, the NAND-only
   circuit and the NOR-only circuit all agree. */

function verifyAll(vars, rows, basicTree, nandTree, norTree) {
  const n = vars.length;
  const mismatches = [];
  for (let i = 0; i < 2 ** n; i++) {
    const env = {};
    vars.forEach((v, idx) => { env[v] = (i >> (n - 1 - idx)) & 1; });
    const expected = rows[i];
    const basic = evalTree(basicTree, env);
    const nand = evalTree(nandTree, env);
    const nor = evalTree(norTree, env);
    const agree = basic === nand && nand === nor;
    const matchesExpected = expected === 'X' || expected === basic;
    if (!agree || !matchesExpected) {
      mismatches.push({ i, expected, basic, nand, nor });
    }
  }
  return { ok: mismatches.length === 0, checked: 2 ** n, mismatches };
}

if (typeof module !== 'undefined') module.exports = { verifyAll };
