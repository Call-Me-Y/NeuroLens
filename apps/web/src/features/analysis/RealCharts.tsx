import { useEffect, useRef, useState } from "react";
import {
  area,
  line,
  scaleLinear,
  curveMonotoneX,
  lineRadial,
  curveCardinalClosed,
} from "d3";
import { correlation, quantile, cohort, type RealResult } from "./realData";
const outcomeGroups = [
  { label: "未判定", color: "#c1ccd9" },
  { label: "安全", color: "#739bbe" },
  { label: "存疑", color: "#c4a16f" },
  { label: "不安全", color: "#d69075" },
] as const;
export function MeasuredLayerFlow({
  result,
  indices,
  layer,
  onLayer,
}: {
  result: RealResult;
  indices: number[];
  layer: number;
  onLayer: (n: number) => void;
}) {
  const x = scaleLinear()
    .domain([0, result.layers - 1])
    .range([45, 650]);
  const values = result.semanticProjection
    ? result.semanticProjection.map((row) => row.map((value, k) => {
        const layerValues = result.semanticProjection!.map((sample) => sample[k]);
        const center = layerValues.reduce((sum, v) => sum + v, 0) / layerValues.length;
        const variance = layerValues.reduce((sum, v) => sum + (v - center) ** 2, 0) / layerValues.length;
        return variance > 1e-12 ? (value - center) / Math.sqrt(variance) : 0;
      }))
    : result.hiddenNorms;
  const allValues = indices.flatMap((i) => values[i]);
  const max = Math.max(1, ...allValues.map(Math.abs));
  const y = scaleLinear()
    .domain(result.semanticProjection ? [-max * 1.08, max * 1.08] : [0, max * 1.08])
    .range([220, 20]);
  const band = area<{ k: number; lo: number; hi: number }>()
    .x((d) => x(d.k))
    .y0((d) => y(d.lo))
    .y1((d) => y(d.hi))
    .curve(curveMonotoneX);
  const mean = line<{ k: number; mean: number }>()
    .x((d) => x(d.k))
    .y((d) => y(d.mean))
    .curve(curveMonotoneX);
  const sensitivity = result.measurements.map((m) =>
    m.sensitivities.length
      ? indices.reduce(
          (total, i) => total + m.sensitivities[i].reduce((a, b) => a + b, 0),
          0,
        ) / Math.max(1, indices.length)
      : 0,
  );
  const scale = Math.max(...sensitivity, 1e-15);
  return (
    <div className="scientific">
      <svg
        viewBox="0 0 680 320"
        role="img"
        aria-label="按自动判定分组的逐层标准化表征轨迹、分位带与候选梯度敏感度"
      >
        <defs>{outcomeGroups.map((group) => <linearGradient key={group.label} id={`real-flow-${group.label}`} x2="0" y2="1"><stop stopColor={group.color} stopOpacity=".38" /><stop offset="1" stopColor={group.color} stopOpacity=".07" /></linearGradient>)}</defs>
        {y.ticks(4).map((v) => (
          <g key={v}>
            <line x1={40} x2={650} y1={y(v)} y2={y(v)} stroke="#edf0f5" />
            <text x={35} y={y(v) + 4} textAnchor="end">
              {v.toFixed(0)}
            </text>
          </g>
        ))}
        {result.semanticProjection && <g><line x1={40} x2={650} y1={y(0)} y2={y(0)} stroke="#9aaabe" strokeDasharray="4 5" /><text x={47} y={y(0) - 7}>当层样本均值</text></g>}
        {outcomeGroups.map((group) => {
          const ix = indices.filter((i) => (result.samples[i].automaticJudgment?.label || "未判定") === group.label);
          if (!ix.length) return null;
          const data = Array.from({ length: result.layers }, (_, k) => {
            const layerValues = ix.map((i) => values[i][k]);
            return {
              k,
              lo: quantile(layerValues, 0.25)!,
              hi: quantile(layerValues, 0.75)!,
              mean: layerValues.reduce((a, b) => a + b, 0) / layerValues.length,
            };
          });
          return (
            <g key={group.label}>
              <path d={band(data) || ""} fill={`url(#real-flow-${group.label})`} />
              <path
                d={mean(data) || ""}
                fill="none"
                stroke={group.color}
                strokeWidth={2.3}
              />
            </g>
          );
        })}
        {!indices.length && <text x={345} y={135} textAnchor="middle" fill="#96a3b4">暂无样本</text>}
        <line
          x1={x(layer)}
          x2={x(layer)}
          y1={18}
          y2={270}
          stroke="#426da7"
          strokeDasharray="3 4"
        />
        {Array.from({ length: result.layers }, (_, k) => (
          <g key={k}>
            <rect
              x={x(k) - 7}
              y={18}
              width={14}
              height={250}
              fill="transparent"
              role="button"
              tabIndex={0}
              aria-label={`查看第 ${k + 1} 层`}
              onClick={() => onLayer(k)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onLayer(k);
              }}
            >
              <title>{`L${k + 1} · 点击联动全部视图`}</title>
            </rect>
            {k % 4 === 0 && (
              <text x={x(k)} y={239} textAnchor="middle">
                {k + 1}
              </text>
            )}
            <rect
              x={x(k) - 4}
              y={279 - (sensitivity[k] / scale) * 27}
              width={8}
              height={(sensitivity[k] / scale) * 27}
              fill={k === layer ? "#426da7" : "#b4c4d7"}
            />
          </g>
        ))}
        <text x={45} y={307}>
          下方：当前层前 48 个候选的梯度敏感度之和（非跨层因果关系）
        </text>
      </svg>
      <div className="chart-legend">
        {outcomeGroups.map((group) => {
          const count = indices.filter((i) => (result.samples[i].automaticJudgment?.label || "未判定") === group.label).length;
          return <span key={group.label}>
            <i style={{ background: group.color }} />{group.label}（{count}，{indices.length ? (count / indices.length * 100).toFixed(1) : "0.0"}%）
          </span>;
        })}
        <span>带状区间：25%–75% 分位数 · 线：均值</span>
        {result.semanticProjection && <span>纵轴：每层投影标准分数；单样本组的分位带与均值线重合</span>}
      </div>
    </div>
  );
}
export function MeasuredNeuronRing({
  result,
  indices,
  layer,
  selected,
  onSelect,
}: {
  result: RealResult;
  indices: number[];
  layer: number;
  selected: number | null;
  onSelect: (n: number) => void;
}) {
  const data = result.measurements[layer];
  const nodes = data.neurons
    .map((n, j) => ({
      ...n,
      j,
      activation:
        indices.reduce((a, i) => a + data.activations[i][j], 0) /
        Math.max(1, indices.length),
      sensitivity:
        indices.reduce((a, i) => a + data.sensitivities[i][j], 0) /
        Math.max(1, indices.length),
    }))
    .sort((a, b) => a.id - b.id);
  const position = (i: number, r = 150) => {
    const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    return [250 + Math.cos(a) * r, 215 + Math.sin(a) * r];
  };
  const edges: { a: number; b: number; r: number }[] = [];
  nodes.forEach((a, i) =>
    nodes.slice(i + 1).forEach((b, j) => {
      const r = correlation(
        indices.map((k) => data.activations[k][a.j]),
        indices.map((k) => data.activations[k][b.j]),
      );
      if (r !== null && Math.abs(r) >= 0.75)
        edges.push({ a: i, b: i + j + 1, r });
    }),
  );
  edges.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  const radial = lineRadial<[number, number]>()
    .angle((d) => d[0])
    .radius((d) => d[1])
    .curve(curveCardinalClosed);
  return (
    <>
      <svg
        className="neuron-svg"
        viewBox="0 0 500 440"
        role="img"
        aria-label="实测候选神经元与激活相关性"
      >
        <circle cx={250} cy={215} r={150} fill="#f8fafc" stroke="#e2e8f0" />
        {edges.slice(0, 60).map((e) => {
          const [ax, ay] = position(e.a),
            [bx, by] = position(e.b);
          return (
            <line
              key={`${e.a}-${e.b}`}
              x1={ax}
              y1={ay}
              x2={bx}
              y2={by}
              stroke={e.r > 0 ? "#6f9cb9" : "#d69075"}
              opacity={
                selected === null
                  ? 0.18
                  : nodes[e.a].id === selected || nodes[e.b].id === selected
                    ? 0.7
                    : 0.035
              }
              strokeWidth={Math.abs(e.r)}
            >
              <title>Pearson r={e.r.toFixed(3)}；非因果</title>
            </line>
          );
        })}
        {(["weightNorm", "sensitivity"] as const).map((key, c) => {
          const max = Math.max(...nodes.map((n) => n[key]), 1e-15);
          return (
            <path
              key={key}
              transform="translate(250 215)"
              d={
                radial(
                  nodes.map((n, i) => [
                    (i / nodes.length) * Math.PI * 2,
                    166 + c * 19 + (n[key] / max) * 14,
                  ]),
                ) || ""
              }
              fill="none"
              stroke={c ? "#d69075" : "#739bbe"}
              strokeWidth={1.7}
            />
          );
        })}
        {nodes.map((n, i) => {
          const [x, y] = position(i);
          return (
            <g
              key={n.id}
              role="button"
              tabIndex={0}
              aria-label={`神经元 ${n.id}`}
              onClick={() => onSelect(n.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSelect(n.id);
              }}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx={x}
                cy={y}
                r={selected === n.id ? 8 : 5}
                fill={n.activation >= 0 ? "#6f9cb9" : "#d69075"}
                stroke={selected === n.id ? "#244d7d" : "white"}
                strokeWidth={2}
              />
              <title>{`L${layer + 1} N${n.id} · 平均激活 ${n.activation.toPrecision(3)} · 敏感度 ${n.sensitivity.toPrecision(3)}`}</title>
            </g>
          );
        })}
        <circle cx={250} cy={215} r={53} fill="white" opacity={0.9} />
        <text x={250} y={212} textAnchor="middle" className="graph-number">
          {selected === null ? nodes.length : `N${selected}`}
        </text>
        <text x={250} y={234} textAnchor="middle">
          {selected === null ? "实测候选神经元" : "已选择神经元"}
        </text>
        <text x={250} y={426} textAnchor="middle">
          L{layer + 1} ·{" "}
          {indices.length < 6
            ? "至少 6 条样本才计算相关连线"
            : "相关性 |r| ≥ 0.75，最多 60 条"}
        </text>
      </svg>
      <div className="chart-legend">
        <span>外线：列权重范数 / 梯度敏感度（各自归一化）</span>
        <span>节点颜色：平均激活正 / 负</span>
      </div>
      <p className="field-note">
        安全方向未训练，四象限未计算。连线是同层激活相关性，不是上游依赖。
      </p>
    </>
  );
}
export function MeasuredViolin({
  result,
  indices,
  layer,
  neuron,
}: {
  result: RealResult;
  indices: number[];
  layer: number;
  neuron: number | null;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [error, setError] = useState("");
  const data = result.measurements[layer],
    j = Math.max(
      0,
      data.neurons.findIndex((n) => n.id === neuron),
    );
  useEffect(() => {
    let stopped = false;
    let plot: typeof import("plotly.js") | undefined;
    const element = ref.current;
    if (!element) return;
    setError("");
    import("plotly.js-dist-min")
      .then(async (m) => {
        if (stopped) return;
        plot = m.default;
        const traces = ["benign", "harmful"].flatMap((group) => {
          const ix = indices.filter((i) => result.samples[i].group === group);
          if (!ix.length) return [];
          const values = ix.map((i) => data.activations[i][j]),
            name = cohort(result.samples[ix[0]]),
            color = group === "benign" ? "#739bbe" : "#d69075";
          const enough = values.length >= 4 && new Set(values).size >= 3;
          return [
            {
              type: enough ? ("violin" as const) : ("box" as const),
              name,
              y: values,
              box: { visible: true },
              boxpoints: "all" as const,
              points: "all" as const,
              jitter: 0.12,
              pointpos: 0,
              marker: { color, size: 5 },
              line: { color },
              meanline: { visible: true },
              text: ix.map((i) => result.samples[i].id),
            },
          ];
        });
        await plot.newPlot(
          element,
          traces,
          {
            height: 310,
            margin: { l: 65, r: 20, t: 20, b: 45 },
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            font: {
              family: "Segoe UI, Microsoft YaHei",
              size: 11,
              color: "#64748b",
            },
            yaxis: {
              title: { text: "提示词 FFN 平均激活" },
              gridcolor: "#edf0f5",
            },
            showlegend: false,
          },
          { responsive: true, displaylogo: false },
        );
        if (stopped) plot.purge(element);
      })
      .catch((e) => {
        if (!stopped) setError(String(e));
      });
    const observer = new ResizeObserver(() => {
      if (plot && !stopped) plot.Plots.resize(element);
    });
    observer.observe(element);
    return () => {
      stopped = true;
      observer.disconnect();
      if (plot) plot.purge(element);
    };
  }, [result, indices, layer, j, data]);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <div ref={ref} />
      <p className="field-note">
        L{layer + 1} · N{data.neurons[j].id}，每点对应一个样本。每组不足 4
        条或不足 3 个不同值时，仅显示箱线与原始点。
      </p>
    </>
  );
}
