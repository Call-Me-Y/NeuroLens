import { Component, type ReactNode } from "react";

export class PageBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <section className="empty" role="alert">
          <h2>页面暂时无法载入</h2>
          <p>
            应用更新或资源加载中断可能导致此问题。重新载入会清除本次会话的临时任务与文本，请先保存其他页面中的内容。
          </p>
          <button
            className="btn primary"
            onClick={() => window.location.reload()}
          >
            重新载入页面
          </button>
        </section>
      );
    return this.props.children;
  }
}
