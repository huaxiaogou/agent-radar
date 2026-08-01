import { buildGraphLayout } from "./geometry.js";

type GraphRelation = {
  from: string;
  to: string;
  type: string;
  note: string;
};

type GraphNode = {
  name: string;
  x: number;
  y: number;
  rx: number;
  ry: number;
};

type GraphEdge = GraphRelation & {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
};

type GraphLayout = {
  width: number;
  height: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

function nodeTone(name: string) {
  if (/manager|coding agent/i.test(name)) return "product";
  if (/harness|execution|protocol|runtime/i.test(name)) return "runtime";
  return "practice";
}

function labelLines(name: string) {
  const words = name.split(/\s+/);
  if (words.length < 2 || name.length <= 16) return [name];

  const splitAt = Math.ceil(words.length / 2);
  return [words.slice(0, splitAt).join(" "), words.slice(splitAt).join(" ")];
}

export function ConceptGraph({ relations }: { relations: GraphRelation[] }) {
  const layout = buildGraphLayout(relations) as GraphLayout;

  return (
    <div className="graph-grid" aria-hidden="true">
      <svg
        className="concept-graph"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={layout.width}
        height={layout.height}
        data-node-count={layout.nodes.length}
        data-edge-count={layout.edges.length}
      >
        <defs>
          <marker id="graph-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 8 4 L 0 8 z" />
          </marker>
        </defs>

        <g className="graph-edges">
          {layout.edges.map((edge) => {
            const labelWidth = Math.max(38, edge.type.length * 14 + 18);
            return (
              <g className="graph-edge" data-graph-edge={`${edge.from}:${edge.to}`} key={`${edge.from}-${edge.to}`}>
                <line x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} markerEnd="url(#graph-arrow)" />
                <g className="graph-edge-label" transform={`translate(${edge.labelX} ${edge.labelY})`}>
                  <rect x={-labelWidth / 2} y="-12" width={labelWidth} height="24" rx="6" />
                  <text textAnchor="middle" dominantBaseline="central">{edge.type}</text>
                </g>
              </g>
            );
          })}
        </g>

        <g className="graph-nodes">
          {layout.nodes.map((node) => {
            const lines = labelLines(node.name);
            return (
              <g className={`graph-node graph-node-${nodeTone(node.name)}`} data-graph-node={node.name} transform={`translate(${node.x} ${node.y})`} key={node.name}>
                <ellipse rx={node.rx} ry={node.ry} />
                <text textAnchor="middle">
                  {lines.map((line, index) => (
                    <tspan x="0" dy={index === 0 ? `${-(lines.length - 1) * 0.55}em` : "1.1em"} key={line}>{line}</tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
