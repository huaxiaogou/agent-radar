export const DEFAULT_PERSISTENT_LABEL_LIMIT = 18;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function estimatedLabelWidth(value) {
  const width = [...value].reduce((total, character) => total + (/^[\x00-\x7F]$/.test(character) ? 6.25 : 10.5), 0);
  return clamp(width + 3, 48, 212);
}

function displayLabel(value) {
  const characters = [...value];
  return characters.length <= 32 ? value : `${characters.slice(0, 31).join("")}…`;
}

function priorityScore(model) {
  const affordability = Math.max(0, -Math.log10(Math.max(model.costPerTask, 0.001)));
  return model.codingIndex * 0.58 + model.intelligenceIndex * 0.34 + affordability * 3.2;
}

function byPriority(left, right) {
  return priorityScore(right) - priorityScore(left)
    || right.codingIndex - left.codingIndex
    || right.intelligenceIndex - left.intelligenceIndex
    || left.costPerTask - right.costPerTask
    || left.id.localeCompare(right.id);
}

export function selectPersistentLabelCandidates(models, limit = DEFAULT_PERSISTENT_LABEL_LIMIT) {
  if (limit <= 0 || models.length === 0) return [];

  const ranked = [...models].sort(byPriority);
  const providerBudget = Math.min(10, Math.max(4, Math.ceil(limit * 0.55)));
  const providerRepresentatives = [];
  const representedProviders = new Set();

  for (const model of ranked) {
    if (representedProviders.has(model.providerName)) continue;
    representedProviders.add(model.providerName);
    providerRepresentatives.push(model);
    if (providerRepresentatives.length >= providerBudget) break;
  }

  const selectedIds = new Set(providerRepresentatives.map((model) => model.id));
  const selected = [...providerRepresentatives];
  for (const model of ranked) {
    if (selected.length >= limit) break;
    if (selectedIds.has(model.id)) continue;
    selectedIds.add(model.id);
    selected.push(model);
  }
  return selected;
}

export function rectanglesOverlap(left, right, margin = 0) {
  return !(
    left.right + margin <= right.left
    || left.left >= right.right + margin
    || left.bottom + margin <= right.top
    || left.top >= right.bottom + margin
  );
}

export function rectangleIntersectsPoint(rectangle, point, padding = 5) {
  const closestX = clamp(point.x, rectangle.left, rectangle.right);
  const closestY = clamp(point.y, rectangle.top, rectangle.bottom);
  const dx = point.x - closestX;
  const dy = point.y - closestY;
  return dx * dx + dy * dy < (point.radius + padding) ** 2;
}

function boxForCandidate(candidate, width) {
  const left = candidate.anchor === "start"
    ? candidate.x
    : candidate.anchor === "end"
      ? candidate.x - width
      : candidate.x - width / 2;
  return { left, right: left + width, top: candidate.y - 12, bottom: candidate.y + 5 };
}

function candidatePositions(model, bounds) {
  const horizontalDirection = model.x <= (bounds.left + bounds.right) / 2 ? 1 : -1;
  const verticalDirection = model.y <= (bounds.top + bounds.bottom) / 2 ? 1 : -1;
  const anchorFor = (direction) => direction > 0 ? "start" : "end";
  const near = model.radius + 10;
  const distances = [near, near + 24, near + 50];
  const candidates = [];

  for (const distance of distances) {
    candidates.push(
      {
        x: model.x + horizontalDirection * distance,
        y: model.y + verticalDirection * (model.radius + 9),
        anchor: anchorFor(horizontalDirection),
      },
      {
        x: model.x - horizontalDirection * distance,
        y: model.y + verticalDirection * (model.radius + 9),
        anchor: anchorFor(-horizontalDirection),
      },
      {
        x: model.x + horizontalDirection * distance,
        y: model.y + 4,
        anchor: anchorFor(horizontalDirection),
      },
      {
        x: model.x - horizontalDirection * distance,
        y: model.y + 4,
        anchor: anchorFor(-horizontalDirection),
      },
      {
        x: model.x,
        y: model.y + verticalDirection * distance,
        anchor: "middle",
      },
      {
        x: model.x,
        y: model.y - verticalDirection * distance,
        anchor: "middle",
      },
    );
  }
  return candidates;
}

function connectorEnd(rectangle, candidate) {
  if (candidate.anchor === "start") return { x: rectangle.left - 4, y: (rectangle.top + rectangle.bottom) / 2 };
  if (candidate.anchor === "end") return { x: rectangle.right + 4, y: (rectangle.top + rectangle.bottom) / 2 };
  return {
    x: (rectangle.left + rectangle.right) / 2,
    y: candidate.y < rectangle.top + 12 ? rectangle.bottom + 4 : rectangle.top - 4,
  };
}

export function placePersistentModelLabels(models, bounds, { limit = DEFAULT_PERSISTENT_LABEL_LIMIT } = {}) {
  const candidates = selectPersistentLabelCandidates(models, limit);
  const occupiedLabels = [];
  const placements = [];

  for (const model of candidates) {
    const label = displayLabel(model.shortName);
    const width = estimatedLabelWidth(label);
    for (const candidate of candidatePositions(model, bounds)) {
      const rectangle = boxForCandidate(candidate, width);
      const inside = rectangle.left >= bounds.left + 4
        && rectangle.right <= bounds.right - 4
        && rectangle.top >= bounds.top + 4
        && rectangle.bottom <= bounds.bottom - 4;
      if (!inside) continue;
      if (occupiedLabels.some((other) => rectanglesOverlap(rectangle, other, 5))) continue;
      if (models.some((point) => rectangleIntersectsPoint(rectangle, point, 5))) continue;

      const end = connectorEnd(rectangle, candidate);
      placements.push({
        modelId: model.id,
        label,
        x: candidate.x,
        y: candidate.y,
        anchor: candidate.anchor,
        rectangle,
        connector: { x1: model.x, y1: model.y, x2: end.x, y2: end.y },
      });
      occupiedLabels.push(rectangle);
      break;
    }
  }

  return placements;
}
