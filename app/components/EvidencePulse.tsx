import type { EvidenceNode } from "../lib/radar-data";

const nodeLabels: Record<EvidenceNode["kind"], string> = {
  origin: "起源候选",
  independent: "独立来源",
  implementation: "工程实现",
  conflict: "冲突或待确认",
};

export function EvidencePulse({ nodes, compact = false }: { nodes: EvidenceNode[]; compact?: boolean }) {
  return (
    <div className={compact ? "evidence-pulse is-compact" : "evidence-pulse"} aria-label="证据脉冲线">
      <div className="pulse-track" aria-hidden="true">
        {nodes.map((node, index) => (
          <span
            className={`pulse-node node-${node.kind}`}
            style={{ left: `${nodes.length === 1 ? 50 : 8 + (index * 84) / (nodes.length - 1)}%` }}
            key={`${node.label}-${index}`}
            title={`${nodeLabels[node.kind]}：${node.label}`}
          />
        ))}
      </div>
      <ol className="sr-only">
        {nodes.map((node) => (
          <li key={node.label}>{nodeLabels[node.kind]}：{node.label}</li>
        ))}
      </ol>
    </div>
  );
}
