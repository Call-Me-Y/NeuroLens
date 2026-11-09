import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minimize2, X, ArrowUpRight, Info } from "lucide-react";
import { Link } from "react-router-dom";
export function Badge({
  children,
  tone = "blue",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function PageHead({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Panel({
  title,
  tag,
  subtitle,
  children,
  actions,
  className = "",
}: {
  title: string;
  tag?: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [expanded]);
  return (
    <section className={`panel ${className} ${expanded ? "expanded" : ""}`}>
      <header className="panel-head">
        <div>
          <h3>
            {tag && <span className="panel-tag">{tag}</span>}
            {title}
          </h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="panel-actions">
          {actions}
          <button
            className="icon-btn"
            aria-label={expanded ? "收起视图" : "放大" + title}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </header>
      {children}
    </section>
  );
}
export function Stat({
  label,
  value,
  detail,
  trend,
}: {
  label: string;
  value: string;
  detail: string;
  trend?: string;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>
        {trend && <em>{trend}</em>}
        {detail}
      </small>
    </div>
  );
}
export function Empty({
  title = "暂无匹配数据",
  description = "请调整筛选条件后重试。",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty">
      <Info size={28} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function Drawer({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const a = ref.current?.querySelectorAll<HTMLElement>(
          'button,a,input,select,textarea,[tabindex="0"]',
        );
        if (!a?.length) return;
        const first = a[0],
          last = a[a.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      prior?.focus();
    };
  }, [onClose]);
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="关闭详情">
            <X />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function HelpLink({ slug = "quickstart" }: { slug?: string }) {
  return (
    <Link className="text-link" to={"/help/" + slug}>
      使用指南 <ArrowUpRight size={14} />
    </Link>
  );
}
