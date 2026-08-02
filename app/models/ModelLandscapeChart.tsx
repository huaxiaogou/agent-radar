"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_PERSISTENT_LABEL_LIMIT,
  placePersistentModelLabels,
} from "../lib/model-landscape-layout.mjs";

export type LandscapeBounds = { left: number; right: number; top: number; bottom: number };
export type LandscapeTick = { value: number; label: string; position: number };
export type LandscapePlotModel = {
  id: string;
  name: string;
  shortName: string;
  providerName: string;
  codingIndex: number;
  intelligenceIndex: number;
  costPerTask: number;
  costLabel: string;
  href: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  shape: "circle" | "square" | "diamond";
  family: string;
};

type Props = {
  models: LandscapePlotModel[];
  codingTicks: LandscapeTick[];
  costTicks: LandscapeTick[];
  bounds: LandscapeBounds;
};

function groupedModels(models: LandscapePlotModel[]) {
  const groups = new Map<string, LandscapePlotModel[]>();
  for (const model of [...models].sort((left, right) => left.providerName.localeCompare(right.providerName) || left.name.localeCompare(right.name))) {
    const group = groups.get(model.providerName) || [];
    group.push(model);
    groups.set(model.providerName, group);
  }
  return [...groups.entries()];
}

function pointShape(model: LandscapePlotModel) {
  if (model.shape === "diamond") {
    return <path d={`M ${model.x} ${model.y - model.radius} L ${model.x + model.radius} ${model.y} L ${model.x} ${model.y + model.radius} L ${model.x - model.radius} ${model.y} Z`} style={{ fill: model.color }} />;
  }
  if (model.shape === "square") {
    return <rect x={model.x - model.radius * .82} y={model.y - model.radius * .82} width={model.radius * 1.64} height={model.radius * 1.64} rx="2" style={{ fill: model.color }} />;
  }
  return <circle cx={model.x} cy={model.y} r={model.radius} style={{ fill: model.color }} />;
}

export function ModelLandscapeChart({ models, codingTicks, costTicks, bounds }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const activeId = hoveredId || focusedId || selectedId || null;
  const activeModel = activeId ? models.find((model) => model.id === activeId) || null : null;
  const modelGroups = useMemo(() => groupedModels(models), [models]);
  const placements = useMemo(
    () => placePersistentModelLabels(models, bounds, { limit: DEFAULT_PERSISTENT_LABEL_LIMIT }),
    [bounds, models],
  );
  const modelById = useMemo(() => new Map(models.map((model) => [model.id, model])), [models]);
  const families = useMemo(() => {
    const groups = new Map<string, LandscapePlotModel[]>();
    for (const model of models) {
      const family = groups.get(model.family) || [];
      family.push(model);
      groups.set(model.family, family);
    }
    return [...groups.entries()]
      .filter(([, family]) => family.length > 1)
      .map(([key, family]) => [key, family.sort((left, right) => left.costPerTask - right.costPerTask)] as const);
  }, [models]);

  return <>
    <div className="model-landscape-console">
      <label className="model-landscape-picker">
        <span>定位模型</span>
        <select name="landscape-model" autoComplete="off" translate="no" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          <option value="">选择任一模型…</option>
          {modelGroups.map(([provider, providerModels]) => <optgroup label={provider} key={provider}>
            {providerModels.map((model) => <option value={model.id} key={model.id}>{model.name}</option>)}
          </optgroup>)}
        </select>
      </label>
      <div className={`model-landscape-inspector${activeModel ? " has-model" : ""}`} aria-live="polite">
        {activeModel ? <>
          <i style={{ backgroundColor: activeModel.color }} aria-hidden="true" />
          <span translate="no"><strong>{activeModel.name}</strong><small>{activeModel.providerName}</small></span>
          <dl>
            <div><dt>编程</dt><dd>{activeModel.codingIndex.toFixed(0)}</dd></div>
            <div><dt>通用</dt><dd>{activeModel.intelligenceIndex.toFixed(0)}</dd></div>
            <div><dt>成本</dt><dd>{activeModel.costLabel}</dd></div>
          </dl>
          <a href={activeModel.href} target="_blank" rel="noreferrer">查看指标原页 ↗</a>
        </> : <p><b>{placements.length} 个关键标签常驻</b><span>悬停、聚焦圆点或从左侧选择，查看全部 {models.length} 个模型。</span></p>}
      </div>
    </div>
    <p className="model-landscape-scroll-cue"><span aria-hidden="true">↔</span> 横向滑动查看完整模型分布</p>
    <div className="model-landscape-scroll" tabIndex={0} aria-label="模型能力成本全景图，可横向滚动">
      <svg className="model-landscape-plot" viewBox="0 0 1600 820" role="img" aria-labelledby="model-landscape-title model-landscape-description">
        <title id="model-landscape-title">动态模型编程能力—成本全景</title>
        <desc id="model-landscape-description">横轴为 Artificial Analysis Intelligence Index 的美元单任务成本，对数刻度；纵轴为编程指数；点面积为通用智能指数；颜色区分厂商，菱形表示开源权重。常驻标签经过圆点障碍避让，其余模型可通过悬停、键盘聚焦或定位器读取。</desc>
        <g className="model-chart-grid" aria-hidden="true">
          {codingTicks.map((tick) => <g key={tick.value}><line x1={bounds.left} x2={bounds.right} y1={tick.position} y2={tick.position} /><text x={bounds.left - 14} y={tick.position + 4} textAnchor="end">{tick.label}</text></g>)}
          {costTicks.map((tick) => <g key={tick.value}><line x1={tick.position} x2={tick.position} y1={bounds.top} y2={bounds.bottom} /><text x={tick.position} y={bounds.bottom + 28} textAnchor="middle">{tick.label}</text></g>)}
        </g>
        <g className="model-chart-axes" aria-hidden="true">
          <line x1={bounds.left} x2={bounds.left} y1={bounds.top} y2={bounds.bottom} />
          <line x1={bounds.left} x2={bounds.right} y1={bounds.bottom} y2={bounds.bottom} />
          <text x={(bounds.left + bounds.right) / 2} y="784" textAnchor="middle">单任务成本（USD，对数刻度）</text>
          <text transform="rotate(-90 34 390)" x="34" y="390" textAnchor="middle">编程指数</text>
        </g>
        <g className={`model-provider-lines${activeModel ? " has-active" : ""}`} aria-hidden="true">
          {families.map(([family, points]) => <polyline
            className={activeModel?.family === family ? "is-active" : undefined}
            style={{ stroke: points[0].color }}
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
            key={family}
          />)}
        </g>
        <g className={`model-market-points${activeModel ? " has-active" : ""}`}>
          {models.map((model) => (
            <a
              href={model.href}
              target="_blank"
              rel="noreferrer"
              aria-label={`查看 ${model.name} 的指标原页`}
              onMouseEnter={() => setHoveredId(model.id)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setFocusedId(model.id)}
              onBlur={() => setFocusedId(null)}
              key={model.id}
            >
              <g
                className={`model-market-point${activeId === model.id ? " is-active" : ""}`}
                data-model-id={model.id}
                data-provider={model.providerName}
                role="img"
                aria-label={`${model.name}：编程指数 ${model.codingIndex}，通用智能指数 ${model.intelligenceIndex}，单任务成本 ${model.costLabel}`}
              >
                <title>{model.name}：编程 {model.codingIndex.toFixed(0)}，通用 {model.intelligenceIndex.toFixed(0)}，成本 {model.costLabel}</title>
                <circle className="model-market-hit" cx={model.x} cy={model.y} r="22" />
                {activeId === model.id && <circle className="model-market-active-ring" cx={model.x} cy={model.y} r={model.radius + 7} />}
                {pointShape(model)}
              </g>
            </a>
          ))}
        </g>
        <g className="model-market-labels" aria-hidden="true">
          {placements.map((placement) => {
            const model = modelById.get(placement.modelId);
            if (!model) return null;
            return <g className={activeId === model.id ? "is-active" : undefined} key={model.id}>
              <line {...placement.connector} />
              <text x={placement.x} y={placement.y} textAnchor={placement.anchor as "start" | "middle" | "end"} lang="en">{placement.label}</text>
            </g>;
          })}
        </g>
      </svg>
    </div>
  </>;
}
