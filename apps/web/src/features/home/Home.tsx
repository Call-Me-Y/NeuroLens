import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Network,
  ShieldCheck,
  ScanText,
  BookOpen,
  Cpu,
  FolderOpen,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { Panel, Badge } from "../../components/ui";
import { useApp } from "../../stores/app";
export default function Home() {
  const tasks = useApp((s) => s.tasks);
  return (
    <>
      <div className="home-hero">
        <div>
          <div className="eyebrow">
            <span className="live-dot" /> YOUR MODEL SAFETY WORKSPACE
          </div>
          <h1>
            让模型安全，
            <br />
            <span>变得清晰可见。</span>
          </h1>
          <p>
            连接宏观安全评测与微观神经元分析。
            <br />
            在一个工作空间里，理解模型、评估风险、保护数据。
          </p>
          <div className="hero-actions">
            <Link className="btn primary" to="/analysis">
              探索分析工作台 <ArrowRight size={16} />
            </Link>
            <Link className="btn" to="/help/quickstart">
              <BookOpen size={16} />
              快速开始
            </Link>
          </div>
          <div className="hero-foot">
            <span>
              <CheckCircle2 size={13} />
              本地优先
            </span>
            <span>
              <CheckCircle2 size={13} />
              多视图联动
            </span>
            <span>
              <CheckCircle2 size={13} />
              可追溯实验
            </span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="orbit o1" />
          <div className="orbit o2" />
          <div className="orbit o3" />
          <svg viewBox="0 0 420 330" aria-hidden="true">
            {Array.from({ length: 36 }, (_, i) => {
              const a = (i / 36) * Math.PI * 2;
              const x = 210 + Math.cos(a) * 126,
                y = 165 + Math.sin(a) * 126;
              return (
                <g key={i}>
                  <line
                    x1={210 + Math.cos(a * 3) * 44}
                    y1={165 + Math.sin(a * 3) * 44}
                    x2={x}
                    y2={y}
                    stroke="#a7b8cf"
                    opacity=".45"
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r={i % 3 === 0 ? 5 : 3}
                    fill={i < 16 ? "#d2967f" : "#7498bc"}
                  />
                </g>
              );
            })}
            {Array.from({ length: 24 }, (_, i) => (
              <circle
                key={i}
                cx={210 + Math.cos(i * 2.4) * Math.sqrt(i) * 11}
                cy={165 + Math.sin(i * 2.4) * Math.sqrt(i) * 11}
                r="3"
                fill="#788ea9"
              />
            ))}
          </svg>
          <div className="float-tag top">
            <i />
            安全神经元 · 可解释分析
          </div>
          <div className="float-tag bottom">
            <span className="mono">24</span> LAYERS{" "}
            <span className="float-divider" /> UNLOCK INSIGHTS
          </div>
        </div>
      </div>
      <div className="section-title">
        <div>
          <h2>从这里开始</h2>
          <p>三个工作区，一条完整的安全研究路径。</p>
        </div>
        <Badge tone="neutral">全部功能可体验</Badge>
      </div>
      <div className="feature-grid">
        {[
          {
            icon: Network,
            label: "神经元分析",
            en: "NEURON ANALYSIS",
            desc: "深入模型内部，观察语义演化、神经元功能与安全边界。",
            to: "/analysis",
            meta: "9 个联动视图",
            tone: "blue",
          },
          {
            icon: ShieldCheck,
            label: "API 安全评测",
            en: "API SAFETY",
            desc: "统一评测外部模型接口，定位风险类别，追踪每条响应。",
            to: "/api-safety",
            meta: "多维风险评估",
            tone: "green",
          },
          {
            icon: ScanText,
            label: "提示词脱敏",
            en: "DATA PROTECTION",
            desc: "识别文本中的敏感信息，以可读占位符保护数据和提示词。",
            to: "/desensitization",
            meta: "本地规则 · 可逆还原",
            tone: "purple",
          },
        ].map((f) => (
          <Link to={f.to} className={`feature-card ${f.tone}`} key={f.to}>
            <div className="feature-top">
              <span className="feature-icon">
                <f.icon size={24} />
              </span>
              <ArrowUpRight size={19} />
            </div>
            <div className="eyebrow">{f.en}</div>
            <h2>{f.label}</h2>
            <p>{f.desc}</p>
            <footer>
              <span>{f.meta}</span>
              <ArrowRight size={16} />
            </footer>
          </Link>
        ))}
      </div>
      <div className="home-bottom">
        <Panel
          title="最近活动"
          subtitle="继续上次的探索"
          actions={
            <Link className="text-link" to="/activity">
              全部记录 <ArrowRight size={14} />
            </Link>
          }
        >
          <div className="activity-list">
            {tasks.slice(0, 4).map((t) => (
              <Link key={t.id} to={"/activity/" + t.id}>
                <span className="activity-icon">
                  {t.kind === "神经元分析" ? (
                    <Network size={18} />
                  ) : t.kind === "API 安全评测" ? (
                    <ShieldCheck size={18} />
                  ) : (
                    <ScanText size={18} />
                  )}
                </span>
                <div>
                  <strong>{t.name}</strong>
                  <small>
                    {t.id} · {t.date}
                  </small>
                </div>
                <Badge tone={t.status === "已完成" ? "green" : "amber"}>
                  {t.status}
                </Badge>
                <ArrowUpRight size={15} />
              </Link>
            ))}
            {!tasks.length && <p className="field-note">尚无运行记录。完成一次分析、评测或脱敏后将在这里显示。</p>}
          </div>
        </Panel>
        <Panel title="神经元分析" subtitle="本地模型 · Qwen3Guard 自动判定">
          <div className="form-stack spacious">
            <p>选择本地模型与测试数据，运行逐层表征、神经元激活和自动安全判定。结果保存在本机，可导出完整 JSON。</p>
            <Link className="btn primary" to="/analysis">进入分析 <ArrowRight size={16} /></Link>
          </div>
        </Panel>
      </div>
      <div className="home-links">
        <Link to="/resources">
          <Cpu />
          <div>
            <strong>模型与计算环境</strong>
            <small>查看资源，准备本地分析</small>
          </div>
          <ArrowUpRight size={16} />
        </Link>
        <Link to="/help">
          <BookOpen />
          <div>
            <strong>帮助与研究指南</strong>
            <small>从第一步到理解每一张图</small>
          </div>
          <ArrowUpRight size={16} />
        </Link>
        <Link to="/activity">
          <Clock />
          <div>
            <strong>任务与研究记录</strong>
            <small>回溯参数、过程和结果</small>
          </div>
          <FolderOpen size={16} />
        </Link>
      </div>
    </>
  );
}
