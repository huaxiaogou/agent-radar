const DEFAULT_WIDTH = 1180;
const DEFAULT_HEIGHT = 540;
const HORIZONTAL_PADDING = 120;
const VERTICAL_PADDING = 70;

export const GRAPH_NODE_RX = 88;
export const GRAPH_NODE_RY = 44;

function relationNames(relations) {
  const names = [];
  const seen = new Set();

  for (const relation of relations) {
    for (const name of [relation.from, relation.to]) {
      if (!name || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  }

  return names;
}

function assignDepths(names, relations) {
  const indegree = new Map(names.map((name) => [name, 0]));
  const outgoing = new Map(names.map((name) => [name, []]));

  for (const relation of relations) {
    if (!indegree.has(relation.from) || !indegree.has(relation.to)) continue;
    outgoing.get(relation.from).push(relation.to);
    indegree.set(relation.to, indegree.get(relation.to) + 1);
  }

  const depths = new Map(names.map((name) => [name, 0]));
  const queue = names.filter((name) => indegree.get(name) === 0);
  const visited = new Set();

  while (queue.length > 0) {
    const name = queue.shift();
    if (visited.has(name)) continue;
    visited.add(name);

    for (const target of outgoing.get(name)) {
      depths.set(target, Math.max(depths.get(target), depths.get(name) + 1));
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }

  // Cycles have no zero-indegree entry. Keep their members together in a
  // deterministic fallback column instead of letting layout iteration diverge.
  const maxAcyclicDepth = Math.max(0, ...[...depths.entries()].filter(([name]) => visited.has(name)).map(([, depth]) => depth));
  for (const name of names) {
    if (!visited.has(name)) depths.set(name, maxAcyclicDepth + 1);
  }

  return depths;
}

export function edgeBetweenEllipses(from, to, rx = GRAPH_NODE_RX, ry = GRAPH_NODE_RY) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) {
    return { x1: from.x + rx, y1: from.y, x2: to.x + rx, y2: to.y };
  }

  const boundaryScale = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
  const offsetX = dx * boundaryScale;
  const offsetY = dy * boundaryScale;

  return {
    x1: from.x + offsetX,
    y1: from.y + offsetY,
    x2: to.x - offsetX,
    y2: to.y - offsetY,
  };
}

export function buildGraphLayout(relations) {
  const validRelations = relations.filter((relation) => relation?.from && relation?.to && relation.from !== relation.to);
  const names = relationNames(validRelations);
  const depths = assignDepths(names, validRelations);
  const maxDepth = Math.max(0, ...depths.values());
  const columns = Array.from({ length: maxDepth + 1 }, () => []);

  for (const name of names) columns[depths.get(name)].push(name);

  const largestColumn = Math.max(1, ...columns.map((column) => column.length));
  const width = Math.max(DEFAULT_WIDTH, HORIZONTAL_PADDING * 2 + maxDepth * 300);
  const height = Math.max(DEFAULT_HEIGHT, VERTICAL_PADDING * 2 + (largestColumn - 1) * 145);
  const usableWidth = width - HORIZONTAL_PADDING * 2;
  const usableHeight = height - VERTICAL_PADDING * 2;

  const nodes = columns.flatMap((column, depth) =>
    column.map((name, index) => ({
      name,
      x: maxDepth === 0 ? width / 2 : HORIZONTAL_PADDING + (depth * usableWidth) / maxDepth,
      y: VERTICAL_PADDING + ((index + 1) * usableHeight) / (column.length + 1),
      rx: GRAPH_NODE_RX,
      ry: GRAPH_NODE_RY,
    })),
  );
  const nodeByName = new Map(nodes.map((node) => [node.name, node]));

  const edges = validRelations.map((relation, index) => {
    const from = nodeByName.get(relation.from);
    const to = nodeByName.get(relation.to);
    const geometry = edgeBetweenEllipses(from, to, from.rx, from.ry);
    const dx = geometry.x2 - geometry.x1;
    const dy = geometry.y2 - geometry.y1;
    const edgeLength = Math.hypot(dx, dy) || 1;
    const labelSide = index % 2 === 0 ? -1 : 1;

    return {
      ...relation,
      ...geometry,
      labelX: (geometry.x1 + geometry.x2) / 2 + (-dy / edgeLength) * 15 * labelSide,
      labelY: (geometry.y1 + geometry.y2) / 2 + (dx / edgeLength) * 15 * labelSide,
    };
  });

  return { width, height, nodes, edges };
}
