import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Panel, Stat, Badge, Drawer, Empty } from "../../components/ui";
import { Chart, grid, axis } from "../../components/Chart";
import { download } from "../../services/repository";
import {
  MeasuredLayerFlow,
  MeasuredNeuronRing,
  MeasuredViolin,
} from "./RealCharts";
import {
  cohort,
  lineage,
  type RealResult,
} from "./realData";
export default function RealDashboard({
  result,
  runId,
  configuration,
}: {
  result: RealResult;
  runId: string;
  configuration: ReactNode;
}) {
  const [layer, setLayer] = useState(result.layer - 1),
    [neuron, setNeuron] = useState<number | null>(null);
  const [brushed, setBrushed] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0);
  const [detail, setDetail] = useState<string | null>(null);
  const setActiveLayer = (k: number) => {
    setLayer(k);
    setNeuron(null);
  };
  const brush = useCallback((ids: string[]) => {
    const next = [...new Set(ids)].sort();
    setBrushed((old) => (old.join("|") === next.join("|") ? old : next));
    setPage(0);
  }, []);
  const selectedIndices = useMemo(
    () => result.samples.map((_, i) => i),
    [result],
  );
  const indices = useMemo(
    () =>
      selectedIndices.filter(
        (i) => !brushed.length || brushed.includes(result.samples[i].id),
      ),
    [selectedIndices, brushed, result],
  );
  const rows = indices.map((i) => result.samples[i]),
    data = result.measurements[layer];
  const nodeIndex = data.neurons.findIndex((n) => n.id === neuron);
  const table = indices
    .filter((i) =>
      JSON.stringify(result.samples[i])
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      nodeIndex < 0
        ? a - b
        : Math.abs(data.activations[b][nodeIndex]) -
          Math.abs(data.activations[a][nodeIndex]),
    );
  const pages = Math.max(1, Math.ceil(table.length / 8)),
    p = Math.min(page, pages - 1),
    sample = result.samples.find((s) => s.id === detail);
  const flow = lineage(rows, data, result.samples, Object.fromEntries(result.samples.map((s) => [s.id, { label: s.automaticJudgment?.label || "未判定" }])));
  return (
    <>
      <p className="field-note">
        结果模型：{result.model} · 实验 {runId}。A
        区配置用于下一次运行，不会改写当前结果。
      </p>
      <div className="stats-grid analysis-stats real-stats">
        <Stat
          label="当前样本"
          value={String(rows.length)}
          detail={`全量 ${result.samples.length} 条实测记录`}
        />
        <Stat
          label="分析层级"
          value={`${layer + 1} / ${result.layers}`}
          detail="所有层均有实测激活与梯度"
        />
        <Stat
          label="候选 / 中间维度"
          value={`${data.neurons.length} / ${result.intermediate}`}
          detail="按全量样本平均敏感度选前 48 个"
        />
        <div className="real-export stat">
          <span>结果文件</span>
          <button
          className="btn"
          onClick={() =>
            download(
              "NeuroLens-real-" + runId + ".json",
              JSON.stringify(
                {
                  ...result,
                  runId,
                  selection: {
                    layer: layer + 1,
                    neuron,
                    sampleIds: rows.map((s) => s.id),
                  },
                },
                null,
                2,
              ),
            )
          }
        >
          导出结果
          </button>
          <small>包含模型测量与裁判结果 · JSON</small>
        </div>
      </div>
      <div className="analysis-grid">
        <div className="analysis-left">
          <Panel title="任务配置" tag="A" subtitle="本地权重 · 真实数据">
            {configuration}
          </Panel>
          <Panel
            title="自动安全判定"
            tag="B"
            subtitle="Qwen3Guard · 问题与回复"
          >
            <Chart
              height={215}
              option={{
                tooltip: { trigger: "item", formatter: "{b}: {c}（{d}%）" },
                legend: { bottom: 0 },
                series: [
                  {
                    type: "pie",
                    radius: ["43%", "68%"],
                    center: ["50%", "42%"],
                    label: { show: false },
                    data: ["未判定", "安全", "存疑", "不安全"].map(
                      (name, i) => ({
                        name,
                        value: rows.filter(
                          (s) => (s.automaticJudgment?.label || "未判定") === name,
                        ).length,
                        itemStyle: {
                          color: ["#c1ccd9", "#83b5a4", "#d5b774", "#d28c76"][
                            i
                          ],
                        },
                      }),
                    ),
                  },
                ],
              }}
            />
            <p className="field-note">
              根据问题和模型回复自动分类。未判定表示回复为空或裁判输出无法解析；尚无 Utility 基准得分。
            </p>
          </Panel>
          <Panel
            title="表征空间"
            tag="C"
            subtitle={`L${layer + 1} · 实测 PCA（各层独立拟合）`}
          >
            <Chart
              height={240}
              onBrush={brush}
              onClick={(p) => p.data?.sampleId && setDetail(p.data.sampleId)}
              option={{
                grid: { ...grid, left: 35, right: 15 },
                tooltip: { trigger: "item" },
                brush: {
                  toolbox: ["rect", "clear"],
                  xAxisIndex: 0,
                  yAxisIndex: 0,
                },
                toolbox: { right: 0 },
                xAxis: { ...axis, type: "value" },
                yAxis: { ...axis, type: "value" },
                series: ["benign", "harmful"].map((g, c) => ({
                  name: g === "benign" ? "良性请求" : "风险请求",
                  type: "scatter",
                  symbolSize: 9,
                  itemStyle: { color: c ? "#d69075" : "#739bbe" },
                  data: selectedIndices
                    .filter((i) => result.samples[i].group === g)
                    .map((i) => ({
                      value: result.projection[layer][i],
                      sampleId: result.samples[i].id,
                      name: result.samples[i].id,
                    })),
                })),
              }}
            />
            <p className="field-note">
              框选联动分位带、神经元、分布与实例；点选查看回复。
            </p>
          </Panel>
        </div>
        <div className="analysis-main">
          <div className="main-charts">
            <Panel
              title="层级语义演化"
              tag="D"
              subtitle={result.semanticProjection ? "全层共享 PCA 轴 · 逐层标准化 · 按判定分组" : "旧任务：隐藏状态范数 · 重新运行获取共享投影"}
            >
              {indices.length ? (
                <MeasuredLayerFlow
                  result={result}
                  indices={indices}
                  layer={layer}
                  onLayer={setActiveLayer}
                />
              ) : (
                <Empty />
              )}
              <div className="layer-slider">
                <span>浅层</span>
                <input
                  aria-label="分析层级"
                  type="range"
                  min={0}
                  max={result.layers - 1}
                  value={layer}
                  onChange={(e) => setActiveLayer(Number(e.target.value))}
                />
                <span>L{layer + 1}</span>
              </div>
              <p className="field-note">
                {result.semanticProjection ? "同一投影轴追踪各层表征，纵轴按当层样本标准化；零线是当层均值，不是安全决策边界。" : "旧任务仅保存范数，重新运行后将显示全层共享投影。"} 图例百分比是样本占比；下方柱为候选神经元梯度敏感度。
              </p>
            </Panel>
            <Panel
              title="神经元激活与关联"
              tag="E"
              subtitle="实测候选环 · 权重 / 梯度 · 激活相关"
            >
              {indices.length ? (
                <MeasuredNeuronRing
                  result={result}
                  indices={indices}
                  layer={layer}
                  selected={neuron}
                  onSelect={setNeuron}
                />
              ) : (
                <Empty />
              )}
              {neuron !== null && (
                <button className="btn subtle" onClick={() => setNeuron(null)}>
                  清除神经元选择
                </button>
              )}
            </Panel>
          </div>
          <Panel
            title="样本实例"
            tag="K"
            subtitle={
              neuron === null
                ? "真实输入与输出 · 点击编号查看判定"
                : `按 N${neuron} 的绝对激活排序`
            }
            actions={<Badge>{table.length} 条</Badge>}
          >
            <div className="table-toolbar">
              <input
                aria-label="搜索样本"
                placeholder="搜索编号、输入或回复"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>编号</th>
                    <th>输入组</th>
                    <th>类别</th>
                    <th>自动判定</th>
                    <th>生成 NLL</th>
                    <th>
                      {neuron === null ? "最大激活节点" : `N${neuron} 激活`}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {table.slice(p * 8, p * 8 + 8).map((i) => {
                    const s = result.samples[i];
                    return (
                      <tr key={s.id}>
                        <td>
                          <button
                            className="table-link"
                            onClick={() => setDetail(s.id)}
                          >
                            {s.id}
                          </button>
                        </td>
                        <td>{cohort(s)}</td>
                        <td>{s.category}</td>
                        <td>{s.automaticJudgment?.label || "未判定"}</td>
                        <td>{s.loss.toFixed(4)}</td>
                        <td>
                          {nodeIndex < 0
                            ? `L${layer + 1} · N${data.dominant[i]}`
                            : data.activations[i][nodeIndex].toPrecision(4)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!table.length && <Empty />}
            </div>
            <div className="pagination">
              <span>真实记录 · {table.length} 条</span>
              <div>
                <button
                  className="btn"
                  disabled={p === 0}
                  onClick={() => setPage(p - 1)}
                >
                  上一页
                </button>
                <span>
                  {p + 1} / {pages}
                </span>
                <button
                  className="btn"
                  disabled={p + 1 === pages}
                  onClick={() => setPage(p + 1)}
                >
                  下一页
                </button>
              </div>
            </div>
          </Panel>
          <div className="real-deep-grid">
        <Panel title="层间相似度" tag="F" subtitle="全量样本 · 线性 CKA">
            <Chart
              height={330}
              onClick={(p) =>
                Array.isArray(p.value) && setActiveLayer(p.value[0])
              }
              option={{
                grid: { left: 50, right: 80, top: 20, bottom: 45 },
                tooltip: { position: "top" },
                xAxis: {
                  type: "category",
                  data: result.similarity.map((_, i) => "L" + (i + 1)),
                },
                yAxis: {
                  type: "category",
                  data: result.similarity.map((_, i) => "L" + (i + 1)),
                },
                visualMap: {
                  min: 0,
                  max: 1,
                  right: 0,
                  top: "center",
                  inRange: { color: ["#f4f7fb", "#93b0d3", "#355f94"] },
                },
                series: [
                  {
                    type: "heatmap",
                    data: result.similarity.flatMap((r, y) =>
                      r.flatMap((v, x) => (v === null ? [] : [[x, y, v]])),
                    ),
                  },
                ],
              }}
            />
            <p className="field-note">
              全量样本的有偏线性 CKA，不随子集筛选重算。少于 4
              条或零方差时显示缺失；小样本可能有明显偏差。点击格子选择横轴层。
            </p>
        </Panel>
        <Panel title="样本溯源" tag="G" subtitle="输入组 · 神经元 · 模型判定">
            {rows.length ? (
              <Chart
                height={330}
                onClick={(p) => {
                  if (p.dataType === "node" && p.name?.startsWith("N")) {
                    const n = Number(p.name.slice(1));
                    setNeuron(data.neurons.some((v) => v.id === n) ? n : null);
                    setSearch("");
                  }
                }}
                option={{
                  tooltip: { trigger: "item" },
                  series: [
                    {
                      type: "sankey",
                      left: 20,
                      right: 70,
                      data: flow.nodes,
                      links: flow.links,
                      lineStyle: {
                        color: "source",
                        opacity: 0.25,
                        curveness: 0.5,
                      },
                      label: { color: "#64748b" },
                      nodeGap: 12,
                    },
                  ],
                }}
              />
            ) : (
              <Empty />
            )}
            <p className="field-note">
              输入组 → 当前层绝对平均激活最大的 FFN 节点 →
              模型判定。每条样本只计一次；代表节点可能不在前 48
              个候选中。这里没有生成攻击算法名称或安全四象限。
            </p>
        </Panel>
        <Panel title="激活分布" tag="H" subtitle="按输入组比较神经元激活">
            {indices.length ? (
              <MeasuredViolin
                result={result}
                indices={indices}
                layer={layer}
                neuron={neuron}
              />
            ) : (
              <Empty />
            )}
            <p className="field-note">
              按输入数据组比较，尚不把两组当作“攻击成功 / 失败”。选中 E
              中的节点可切换被观察神经元。
            </p>
        </Panel>
          </div>
        </div>
      </div>
      {sample && (
        <Drawer
          title={sample.id + " · 真实样本与模型判定"}
          onClose={() => setDetail(null)}
        >
          <Badge>{cohort(sample)}</Badge>
          <h4>输入</h4>
          <p className="quote-box">{sample.prompt}</p>
          <h4>模型原始回复</h4>
          <p className="quote-box">{sample.output || "（空回复）"}</p>
          <h4>Qwen3Guard 判定：{sample.automaticJudgment?.label || "未判定"}</h4>
          <p className="field-note">{sample.automaticJudgment?.reason || "未取得裁判结果"} · 原始标签 {sample.automaticJudgment?.rawLabel || "无"} · 类别 {sample.automaticJudgment?.categories?.join("、") || "无"} · 拒绝 {sample.automaticJudgment?.refusal === null ? "未知" : sample.automaticJudgment?.refusal ? "是" : "否"}</p>
          <p>
            {sample.generatedTokens} 个生成 token · {sample.latency} ms · NLL{" "}
            {sample.loss.toFixed(4)}
          </p>
          <p className="field-note">
            输出可能因 token 上限被截断；
            {sample.truncatedInput
              ? "输入也已截断至 256 token。"
              : "输入未截断。"}
            不能仅凭拒绝关键词判定安全。
          </p>
          <p className="field-note">判定来自独立的开源安全模型，仅用于评估当前生成回复。</p>
          <h4>来源</h4>
          <code>{runId}</code>
          <p>
            {result.model} · L{layer + 1}
          </p>
        </Drawer>
      )}
    </>
  );
}
