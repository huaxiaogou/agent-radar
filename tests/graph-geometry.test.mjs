import assert from "node:assert/strict";
import test from "node:test";
import { buildGraphLayout, GRAPH_NODE_RX, GRAPH_NODE_RY } from "../app/graph/geometry.js";

const relations = [
  { from: "Agent Manager", type: "操作", to: "Multi-agent Orchestration", note: "人的控制平面" },
  { from: "Multi-agent Orchestration", type: "约束于", to: "Graph Engineering", note: "协调策略进入执行图" },
  { from: "Graph Engineering", type: "依赖", to: "Durable Execution", note: "检查点、重试、暂停" },
  { from: "Agent Harness", type: "承载", to: "Context Engineering", note: "运行时组织可见上下文" },
  { from: "Agent Manager", type: "观察", to: "Agent Harness", note: "任务状态、审批与遥测" },
];

function ellipseEquation(point, center) {
  return ((point.x - center.x) ** 2) / (GRAPH_NODE_RX ** 2) + ((point.y - center.y) ** 2) / (GRAPH_NODE_RY ** 2);
}

test("every graph edge terminates on both node ellipse boundaries", () => {
  const layout = buildGraphLayout(relations);
  const nodes = new Map(layout.nodes.map((node) => [node.name, node]));

  assert.equal(layout.edges.length, relations.length);
  for (const edge of layout.edges) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    assert.ok(from, edge.from);
    assert.ok(to, edge.to);
    assert.ok(Math.abs(ellipseEquation({ x: edge.x1, y: edge.y1 }, from) - 1) < 1e-9, `${edge.from} start`);
    assert.ok(Math.abs(ellipseEquation({ x: edge.x2, y: edge.y2 }, to) - 1) < 1e-9, `${edge.to} end`);
  }
});

test("layout expands deterministically when future relations add nodes", () => {
  const expanded = buildGraphLayout([
    ...relations,
    { from: "Agent Harness", type: "连接", to: "Model Context Protocol", note: "工具协议" },
    { from: "Model Context Protocol", type: "接入", to: "Tool Gateway", note: "运行入口" },
    { from: "Tool Gateway", type: "保护", to: "Sandbox", note: "权限边界" },
  ]);

  assert.equal(expanded.nodes.length, 9);
  assert.equal(expanded.edges.length, 8);
  assert.ok(expanded.width >= 1180);
  for (const node of expanded.nodes) {
    assert.ok(Number.isFinite(node.x));
    assert.ok(Number.isFinite(node.y));
  }
});
