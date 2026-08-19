/* render.js — turns a netlist tree (circuits.js) or a truth table into HTML/SVG.
   Layout: nodes are leveled by longest path from the inputs (column = level),
   then stacked top-to-bottom within their column. Because toNand()/toNor() reuse
   node objects for shared sub-expressions, walking by *object identity* means a
   shared gate is drawn once and simply gets two outgoing wires (a real fan-out). */

function renderTruthTable(vars, rows) {
  let html = '<table class="tt"><thead><tr>' + vars.map(v => `<th>${v}</th>`).join('') + '<th>F</th></tr></thead><tbody>';
  rows.forEach((out, i) => {
    const bits = vars.map((_, idx) => (i >> (vars.length - 1 - idx)) & 1);
    const cls = out === 1 ? 'v1' : out === 'X' ? 'vx' : 'v0';
    html += '<tr>' + bits.map(b => `<td>${b}</td>`).join('') + `<td class="${cls}">${out}</td></tr>`;
  });
  return html + '</tbody></table>';
}

/* ---------- layout ---------- */
const GEOM = { colW: 120, rowH: 48, gateW: 56, gateH: 32, notW: 36, notH: 26, bubble: 5, pad: 40 };

function levelOf(node, memo) {
  if (memo.has(node)) return memo.get(node);
  let lv;
  if (node.t === 'VAR' || node.t === 'CONST') lv = 0;
  else if (node.t === 'NOT') lv = levelOf(node.a, memo) + 1;
  else lv = Math.max(levelOf(node.a, memo), levelOf(node.b, memo)) + 1;
  memo.set(node, lv);
  return lv;
}

function layout(root) {
  const nodes = collectNodes(root); // leaves..root, each object appears once
  const levelMemo = new Map();
  nodes.forEach(n => levelOf(n, levelMemo));
  const byLevel = new Map();
  nodes.forEach(n => {
    const lv = levelMemo.get(n);
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv).push(n);
  });
  const pos = new Map(); // node -> {x,y,level}
  byLevel.forEach((col, lv) => {
    col.forEach((n, i) => {
      pos.set(n, { level: lv, x: GEOM.pad + lv * GEOM.colW, y: GEOM.pad + i * GEOM.rowH });
    });
  });
  const maxLevel = Math.max(...byLevel.keys());
  const maxRows = Math.max(...[...byLevel.values()].map(c => c.length));
  return { pos, width: GEOM.pad * 2 + maxLevel * GEOM.colW + 90, height: GEOM.pad * 2 + (maxRows - 1) * GEOM.rowH + 20 };
}

/* ---------- gate glyphs (centered at cx,cy) ---------- */
function shapeAndFamily(cx, cy, hasBubble, label) {
  const w = GEOM.gateW, h = GEOM.gateH, r = h / 2, x = cx - w / 2, y = cy - h / 2, flat = w - r;
  let s = `<path d="M ${x} ${y} h ${flat} a ${r} ${r} 0 0 1 0 ${h} h ${-flat} Z" class="gate-shape"/>`;
  s += `<text x="${x + 8}" y="${cy + 4}" class="gate-label">${label}</text>`;
  if (hasBubble) s += `<circle cx="${x + w + GEOM.bubble}" cy="${cy}" r="${GEOM.bubble}" class="gate-bubble"/>`;
  return s;
}
function shapeOrFamily(cx, cy, hasBubble, label) {
  const w = GEOM.gateW, h = GEOM.gateH, x = cx - w / 2, y = cy - h / 2;
  let s = `<path d="M ${x} ${y} Q ${x + w * 0.55} ${y} ${x + w} ${cy} Q ${x + w * 0.55} ${y + h} ${x} ${y + h} `
    + `Q ${x + w * 0.22} ${cy} ${x} ${y} Z" class="gate-shape"/>`;
  s += `<text x="${x + w * 0.2}" y="${cy + 4}" class="gate-label">${label}</text>`;
  if (hasBubble) s += `<circle cx="${x + w + GEOM.bubble}" cy="${cy}" r="${GEOM.bubble}" class="gate-bubble"/>`;
  return s;
}
function shapeNot(cx, cy) {
  const w = GEOM.notW, h = GEOM.notH, x = cx - w / 2, y = cy - h / 2;
  let s = `<path d="M ${x} ${y} L ${x + w} ${cy} L ${x} ${y + h} Z" class="gate-shape"/>`;
  s += `<circle cx="${x + w + GEOM.bubble}" cy="${cy}" r="${GEOM.bubble}" class="gate-bubble"/>`;
  return s;
}
function drawGate(node, cx, cy) {
  switch (node.t) {
    case 'AND': return shapeAndFamily(cx, cy, false, 'AND');
    case 'NAND': return shapeAndFamily(cx, cy, true, 'NAND');
    case 'OR': return shapeOrFamily(cx, cy, false, 'OR');
    case 'NOR': return shapeOrFamily(cx, cy, true, 'NOR');
    case 'NOT': return shapeNot(cx, cy);
  }
  return '';
}
// Right-edge "output pin" of a node, accounting for its bubble if any.
function outX(node, cx) {
  if (node.t === 'AND' || node.t === 'OR') return cx + GEOM.gateW / 2;
  if (node.t === 'NAND' || node.t === 'NOR') return cx + GEOM.gateW / 2 + GEOM.bubble * 2;
  if (node.t === 'NOT') return cx + GEOM.notW / 2 + GEOM.bubble * 2;
  return cx; // VAR / CONST
}
function inXs(node, cx) {
  if (node.t === 'NOT') return [cx - GEOM.notW / 2];
  return [cx - GEOM.gateW / 2, cx - GEOM.gateW / 2];
}

function elbowPath(x1, y1, x2, y2) {
  if (Math.abs(y1 - y2) < 0.5) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
}

/** Render a netlist tree (see circuits.js) as an SVG string. inputNames labels the leaves. */
function renderCircuitSVG(root) {
  if (root.t === 'CONST') return `<p class="const-note">F is constant ${root.v} — no gates needed.</p>`;

  const { pos, width, height } = layout(root);
  const nodes = [...pos.keys()];
  let wires = '', pins = '', gates = '', labels = '';

  nodes.forEach(n => {
    const p = pos.get(n);
    const cy = p.y + GEOM.gateH / 2 - 2;
    if (n.t === 'VAR') {
      labels += `<text x="${p.x - 8}" y="${cy + 4}" text-anchor="end" class="io-label">${n.name}</text>`;
      pins += `<circle cx="${p.x}" cy="${cy}" r="2.5" class="io-dot"/>`;
      p._cy = cy; p._outX = p.x;
      return;
    }
    if (n.t === 'CONST') {
      labels += `<text x="${p.x - 8}" y="${cy + 4}" text-anchor="end" class="io-label">${n.v}</text>`;
      p._cy = cy; p._outX = p.x;
      return;
    }
    const kids = n.b ? [n.a, n.b] : [n.a];
    const kidYs = kids.map(k => pos.get(k)._cy);
    const midY = kidYs.reduce((a, b) => a + b, 0) / kidYs.length;
    p._cy = midY;
    gates += drawGate(n, p.x + (n.t === 'NOT' ? GEOM.notW / 2 : GEOM.gateW / 2), midY);
    p._outX = outX(n, p.x + (n.t === 'NOT' ? GEOM.notW / 2 : GEOM.gateW / 2));
    const pinXs = inXs(n, p.x + (n.t === 'NOT' ? GEOM.notW / 2 : GEOM.gateW / 2));
    const h = n.t === 'NOT' ? GEOM.notH : GEOM.gateH;
    const pinYs = kids.length === 1 ? [midY] : [midY - h * 0.28, midY + h * 0.28];
    kids.forEach((k, idx) => {
      const kp = pos.get(k);
      wires += `<path d="${elbowPath(kp._outX, kp._cy, pinXs[idx], pinYs[idx])}" class="wire"/>`;
      pins += `<circle cx="${pinXs[idx]}" cy="${pinYs[idx]}" r="2" class="io-dot"/>`;
    });
  });

  const rootPos = pos.get(root);
  const outX2 = rootPos._outX + 34;
  wires += `<path d="M ${rootPos._outX} ${rootPos._cy} L ${outX2} ${rootPos._cy}" class="wire"/>`;
  labels += `<text x="${outX2 + 6}" y="${rootPos._cy + 4}" class="io-label out">F</text>`;

  return `<svg viewBox="0 0 ${Math.max(width, outX2 + 40)} ${height}" class="circuit-svg">${wires}${gates}${pins}${labels}</svg>`;
}

if (typeof module !== 'undefined') module.exports = { renderTruthTable, renderCircuitSVG };
