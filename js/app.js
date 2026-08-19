/* app.js — DOM glue. Everything computational lives in parser/qm/circuits/verify. */

let state = { vars: ['A', 'B'], rows: [0, 0, 0, 0] };
let mode = 'expr';

const $ = id => document.getElementById(id);

function switchTab(which) {
  mode = which;
  ['truth', 'expr', 'terms'].forEach(m => {
    $(`tab-${m}`).classList.toggle('active', m === which);
    $(`pane-${m}`).classList.toggle('hidden', m !== which);
  });
}

function onVarCountChange() {
  const n = parseInt($('numVars').value, 10);
  state.vars = 'ABCDEF'.split('').slice(0, n);
  state.rows = new Array(2 ** n).fill(0);
  buildEditableTruthTable();
}

function buildEditableTruthTable() {
  $('truthTableWrap').innerHTML = editableTableHTML(state.vars, state.rows);
}
function editableTableHTML(vars, rows) {
  let html = '<table class="tt"><thead><tr>' + vars.map(v => `<th>${v}</th>`).join('') + '<th>Out</th></tr></thead><tbody>';
  rows.forEach((out, i) => {
    const bits = vars.map((_, idx) => (i >> (vars.length - 1 - idx)) & 1);
    const cls = out === 1 ? 'v1' : out === 'X' ? 'vx' : 'v0';
    html += '<tr>' + bits.map(b => `<td>${b}</td>`).join('') + `<td class="outcell ${cls}" onclick="cycleOut(${i})">${out}</td></tr>`;
  });
  return html + '</tbody></table>';
}
function cycleOut(i) {
  const cur = state.rows[i];
  state.rows[i] = cur === 0 ? 1 : cur === 1 ? 'X' : 0;
  buildEditableTruthTable();
}

function clearError(id) { $(id).classList.add('hidden'); }
function showError(id, msg) { $(id).textContent = msg; $(id).classList.remove('hidden'); }

function generate() {
  clearError('exprError'); clearError('termsError');
  try {
    if (mode === 'expr') {
      const result = truthFromExpression($('exprInput').value, 0);
      state = result;
      $('numVars').value = String(state.vars.length);
      buildEditableTruthTable();
    } else if (mode === 'terms') {
      const kind = document.querySelector('input[name=termKind]:checked').value;
      const result = truthFromTerms(kind, $('termsInput').value, $('dcInput').value, parseInt($('numVars').value, 10));
      state = { vars: result.vars, rows: result.rows };
      $('numVars').value = String(state.vars.length);
      buildEditableTruthTable();
    }
  } catch (e) {
    showError(mode === 'expr' ? 'exprError' : 'termsError', e.message);
    return;
  }

  const { vars, rows } = state;
  const min = minimize(rows, vars);
  const basicTree = buildBasicTree(min.sopTerms);
  const nandTree = toNand(basicTree);
  const norTree = toNor(basicTree);

  // expression text
  const sopText = min.sopTerms.length ? min.sopTerms.map(litsToString).join(' + ') : (rows.every(r => r !== 1) ? '0' : '1');
  const posText = min.posTerms.length ? min.posTerms.map(litsToSum).join('') : (rows.every(r => r !== 0) ? '1' : '0');
  $('sopOut').textContent = 'F = ' + sopText;
  $('posOut').textContent = 'F = ' + posText;

  const ones = [], zeros = [], dc = [];
  rows.forEach((v, i) => (v === 1 ? ones : v === 0 ? zeros : dc).push(i));
  const dcSuffix = dc.length ? ` + d(${dc.join(', ')})` : '';
  $('canonMinterms').textContent = `F = Σm(${ones.join(', ')})${dcSuffix}`;
  $('canonMaxterms').textContent = `F = ΠM(${zeros.join(', ')})${dcSuffix}`;

  $('resultTruthTable').innerHTML = renderTruthTable(vars, rows);
  $('resultKmap').innerHTML = renderKmap(vars, rows, min.sopTerms);
  // $('resultKmap').innerHTML = renderKmap(vars, rows);

  $('circuitBasic').innerHTML = renderCircuitSVG(basicTree);
  $('circuitNand').innerHTML = renderCircuitSVG(nandTree);
  $('circuitNor').innerHTML = renderCircuitSVG(norTree);
  $('gateCounts').textContent =
    `AND/OR/NOT: ${countGates(basicTree)} gates · NAND-only: ${countGates(nandTree)} gates · NOR-only: ${countGates(norTree)} gates`;

  const v = verifyAll(vars, rows, basicTree, nandTree, norTree);
  const badge = $('verifyBadge');
  if (v.ok) {
    badge.textContent = `✓ Verified — all ${v.checked} input combinations agree across the original function, simplified SOP, NAND-only, and NOR-only circuits.`;
    badge.className = 'verify-badge ok';
  } else {
    badge.textContent = `✗ Mismatch found on ${v.mismatches.length} of ${v.checked} input rows — see console.`;
    badge.className = 'verify-badge bad';
    console.warn('Verification mismatches:', v.mismatches);
  }

  $('results').classList.remove('hidden');
}

function litsToString(lits) { return lits.length ? lits.map(l => l.name + (l.neg ? "'" : '')).join('') : '1'; }
function litsToSum(lits) { return lits.length ? '(' + lits.map(l => l.name + (l.neg ? "'" : '')).join(' + ') + ')' : ''; }

function updateTermLabels() {
  const kind = document.querySelector('input[name=termKind]:checked').value;
  $('termsLabel').textContent = kind === 'minterms' ? 'Minterm indices — Σm(' : 'Maxterm indices — ΠM(';
}

buildEditableTruthTable();
