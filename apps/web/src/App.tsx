import { lazy, Suspense, useEffect } from "react";
import {
  BrowserRouter,
  NavLink,
  Routes,
  Route,
  Navigate,
  useLocation,
  Link,
} from "react-router-dom";
import {
  Home as HomeIcon,
  Network,
  ShieldCheck,
  ScanText,
  History,
  Boxes,
  BookOpen,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  CheckCircle2,
  X,
} from "lucide-react";
import { useApp } from "./stores/app";
import { Badge } from "./components/ui";
import { PageBoundary } from "./components/PageBoundary";
const Home = lazy(() => import("./features/home/Home"));
const RealAnalysis = lazy(() => import("./features/analysis/RealAnalysis"));
const ApiSafety = lazy(() => import("./features/api-safety/ApiSafety"));
const Desensitization = lazy(
  () => import("./features/desensitization/Desensitization"),
);
const Resources = lazy(() => import("./features/resources/Resources"));
const Activity = lazy(() => import("./features/experiments/Activity"));
const Help = lazy(() => import("./features/help/Help"));
const Settings = lazy(() => import("./features/settings/Settings"));
const navigation = [
  { path: "/home", title: "首页", icon: HomeIcon, group: "" },
  { path: "/analysis", title: "神经元分析", icon: Network, group: "核心功能" },
  { path: "/api-safety", title: "API 安全评测", icon: ShieldCheck, group: "" },
  { path: "/desensitization", title: "提示词脱敏", icon: ScanText, group: "" },
  { path: "/activity", title: "任务与记录", icon: History, group: "管理" },
  { path: "/resources", title: "资源管理", icon: Boxes, group: "" },
];
function Shell() {
  const { pathname } = useLocation();
  const { compact, set, notice, tasks } = useApp();
  const mergeTasks = useApp((state) => state.mergeTasks);
  const updateTask = useApp((state) => state.updateTask);
  const current = [
    ...navigation,
    { path: "/help", title: "帮助中心" },
    { path: "/settings", title: "设置" },
  ].find((n) => pathname.startsWith(n.path));
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  useEffect(() => {
    void fetch("/api/v1/records").then((response) => response.ok ? response.json() : null).then((data) => {
      if (Array.isArray(data?.records)) mergeTasks(data.records);
    }).catch(() => {});
  }, [mergeTasks]);
  useEffect(() => {
    const running = tasks.filter((item) => item.status === "运行中" && item.runId);
    if (!running.length) return;
    let active = true;
    const check = async () => {
      for (const item of running) {
        try {
          const route = item.kind === "神经元分析" ? "engine" : "api-safety";
          const response = await fetch(`/api/v1/${route}/runs/${item.runId}`);
          if (!active) return;
          if (response.status === 404) { updateTask(item.id, "失败"); continue; }
          if (!response.ok) continue;
          const job = await response.json();
          if (job.status === "complete") updateTask(item.id, "已完成");
          else if (job.status === "failed") updateTask(item.id, "失败");
          else if (job.status === "cancelled") updateTask(item.id, "已取消");
        } catch { /* Keep the last known status while the local service is unreachable. */ }
      }
    };
    void check();
    const timer = setInterval(() => void check(), 3000);
    return () => { active = false; clearInterval(timer); };
  }, [tasks, updateTask]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => set({ notice: "" }), 4500);
    return () => clearTimeout(t);
  }, [notice, set]);
  return (
    <div className={`app ${compact ? "compact" : ""}`}>
      <aside className="sidebar">
        <Link to="/home" className="brand">
          <img src="/brand/icon.ico" alt="" />
          <div>
            <strong>NeuroLens</strong>
            <small>MODEL SAFETY WORKSPACE</small>
          </div>
        </Link>
        <nav>
          {navigation.map((n) => (
            <div key={n.path}>
              {n.group && <div className="nav-group">{n.group}</div>}
              <NavLink title={n.title} to={n.path}>
                <n.icon size={19} />
                <span>{n.title}</span>
                {n.path === "/analysis" && (
                  <small className="nav-tag">LAB</small>
                )}
              </NavLink>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink title="帮助中心" to="/help">
            <BookOpen size={18} />
            <span>帮助中心</span>
          </NavLink>
          <NavLink title="设置" to="/settings">
            <SettingsIcon size={18} />
            <span>设置</span>
          </NavLink>
          <div className="sidebar-version">
            <span>NeuroLens 0.1.0</span>
            <button
              className="icon-btn"
              aria-label="切换侧栏宽度"
              onClick={() => {
                set({ compact: !compact });
                localStorage.setItem("nl-compact", String(!compact));
              }}
            >
              {compact ? (
                <PanelLeftOpen size={16} />
              ) : (
                <PanelLeftClose size={16} />
              )}
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>工作空间</span>
            <ChevronRight size={13} />
            <strong>{current?.title || "页面"}</strong>
          </div>
          <div className="topbar-right">
            <span className="local-indicator">
              <i />
              本地前端服务
            </span>
            <Link to="/activity" className="task-link">
              {tasks.filter((t) => t.status === "运行中").length} 个运行任务
            </Link>
            <Badge tone="amber">{pathname === "/api-safety" ? "LIVE API" : "LOCAL"}</Badge>
          </div>
        </header>
        <main className="content">
          <PageBoundary key={pathname}>
            <Suspense
              fallback={
                <div className="loading">
                  <span className="spinner" />
                  正在准备工作空间…
                </div>
              }
            >
              <Routes>
                <Route path="/" element={<Navigate to="/home" replace />} />
                <Route path="/home" element={<Home />} />
                <Route path="/analysis" element={<RealAnalysis />} />
                <Route path="/analysis/real" element={<Navigate to="/analysis" replace />} />
                <Route path="/api-safety" element={<ApiSafety />} />
                <Route path="/desensitization" element={<Desensitization />} />
                <Route path="/activity/:taskId?" element={<Activity />} />
                <Route path="/resources/:tab?" element={<Resources />} />
                <Route path="/help/:slug?" element={<Help />} />
                <Route path="/settings" element={<Settings />} />
                <Route
                  path="*"
                  element={
                    <div className="empty">
                      <h1>页面未找到</h1>
                      <Link className="btn" to="/home">
                        返回首页
                      </Link>
                    </div>
                  }
                />
              </Routes>
            </Suspense>
          </PageBoundary>
          <footer className="app-footer">
            <span>NEUROLENS · UNDERSTAND. EVALUATE. PROTECT.</span>
            <span>
              本地运行记录 / 结果可追溯
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {notice}
          <button
            className="icon-btn"
            aria-label="关闭提示"
            onClick={() => set({ notice: "" })}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
