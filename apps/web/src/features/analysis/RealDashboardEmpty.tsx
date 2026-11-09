import type { ReactNode } from "react";
import { Panel, Stat } from "../../components/ui";

function EmptyView({ label }: { label: string }) {
  return <div className="real-empty-view"><span className="real-empty-mark" aria-hidden="true" /><strong>暂无结果</strong><small>{label}</small></div>;
}

export default function RealDashboardEmpty({ configuration, legacy }: { configuration: ReactNode; legacy?: boolean }) {
  return <>
    <div className="stats-grid analysis-stats real-stats">
      <Stat label="当前样本" value="—" detail="等待分析任务完成" />
      <Stat label="分析层级" value="—" detail="尚无层级测量" />
      <Stat label="候选 / 中间维度" value="—" detail="尚无神经元数据" />
      <div className="real-export stat"><span>结果文件</span><button className="btn" disabled>导出结果</button><small>任务完成后可导出 JSON</small></div>
    </div>
    <div className="analysis-grid">
      <div className="analysis-left">
        <Panel title="任务配置" tag="A" subtitle="本地权重 · 真实数据">{configuration}</Panel>
        <Panel title="自动安全判定" tag="B"><EmptyView label="等待模型回复与裁判判定" /></Panel>
        <Panel title="表征空间" tag="C"><EmptyView label="等待逐层表征" /></Panel>
      </div>
      <div className="analysis-main">
        <div className="main-charts">
          <Panel title="层级语义演化" tag="D" subtitle="全层共享表征投影 · 25%–75% 分位带"><EmptyView label="等待层级测量与自动判定" /></Panel>
          <Panel title="神经元激活与关联" tag="E"><EmptyView label="等待神经元测量" /></Panel>
        </div>
        <Panel title="样本实例" tag="K"><EmptyView label="等待样本输出" /></Panel>
        <div className="real-deep-grid">
          <Panel title="层间相似度" tag="F"><EmptyView label="等待层间相似度" /></Panel>
          <Panel title="样本溯源" tag="G"><EmptyView label="等待样本与节点关联" /></Panel>
          <Panel title="激活分布" tag="H"><EmptyView label="等待激活分布" /></Panel>
        </div>
      </div>
    </div>
    {legacy && <p className="field-note">当前结果只包含单层数据。重新运行任务后可显示完整九视图。</p>}
  </>;
}
