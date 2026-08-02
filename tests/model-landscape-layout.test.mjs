import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PERSISTENT_LABEL_LIMIT,
  placePersistentModelLabels,
  rectangleIntersectsPoint,
  rectanglesOverlap,
  selectPersistentLabelCandidates,
} from "../app/lib/model-landscape-layout.mjs";

function plottedModel(index, overrides = {}) {
  return {
    id: `model-${index}`,
    shortName: `Model ${index}`,
    providerName: `Provider ${index % 8}`,
    codingIndex: 42 + (index % 18),
    intelligenceIndex: 39 + (index % 21),
    costPerTask: 0.03 + (index % 20) * 0.08,
    costLabel: `$${(0.03 + (index % 20) * 0.08).toFixed(2)}`,
    x: 145 + (index % 19) * 71,
    y: 112 + Math.floor(index / 19) * 108,
    radius: 5 + (index % 4),
    ...overrides,
  };
}

test("persistent model labels preserve true point coordinates and avoid every marker", () => {
  const models = Array.from({ length: 95 }, (_, index) => plottedModel(index));
  const coordinates = models.map(({ id, x, y }) => ({ id, x, y }));
  const placements = placePersistentModelLabels(
    models,
    { left: 112, right: 1518, top: 74, bottom: 710 },
  );

  assert.ok(placements.length > 0, "dense charts should retain a useful persistent label layer");
  assert.ok(placements.length <= DEFAULT_PERSISTENT_LABEL_LIMIT);
  assert.deepEqual(models.map(({ id, x, y }) => ({ id, x, y })), coordinates, "label layout must never jitter metric coordinates");

  for (const placement of placements) {
    assert.equal(
      models.some((model) => rectangleIntersectsPoint(placement.rectangle, model, 3)),
      false,
      `${placement.modelId} label intersects a visible marker`,
    );
  }
  for (let left = 0; left < placements.length; left += 1) {
    for (let right = left + 1; right < placements.length; right += 1) {
      assert.equal(rectanglesOverlap(placements[left].rectangle, placements[right].rectangle, 5), false);
    }
  }
  for (const placement of placements) {
    assert.match(placement.metrics, /^编 \d+ · 通 \d+ · \$/);
    assert.ok(placement.rectangle.bottom - placement.rectangle.top >= 30, "two-line labels need a real value rail");
  }
});

test("persistent candidates represent providers before filling the capability frontier", () => {
  const models = Array.from({ length: 30 }, (_, index) => plottedModel(index, {
    providerName: `Provider ${index % 6}`,
    codingIndex: 80 - index / 3,
  }));
  const selected = selectPersistentLabelCandidates(models, 12);

  assert.equal(selected.length, 12);
  assert.equal(new Set(selected.map((model) => model.id)).size, selected.length);
  assert.ok(new Set(selected.map((model) => model.providerName)).size >= 6, "provider representation should not collapse into one leaderboard vendor");
});
