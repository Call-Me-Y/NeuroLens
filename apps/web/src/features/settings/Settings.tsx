import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHead, Panel, Badge } from "../../components/ui";
import { useApp } from "../../stores/app";
import { download } from "../../services/repository";
export default function Settings() {
  const { compact, set, notify } = useApp();
  const [directory, setDirectory] = useState(
    localStorage.getItem("nl-directory") || "",
  );
  return (
    <>
      <PageHead
        eyebrow="PREFERENCES"
        title="设置"
        description="调整工作空间的显示与偏好。"
      />
      <div className="settings-grid">
        <Panel title="外观与阅读">
          <div className="settings-body">
            <div className="setting-row">
              <div>
                <h4>紧凑导航</h4>
                <p>缩小侧栏，为分析图表留出更多空间。</p>
              </div>
              <input
                aria-label="紧凑导航"
                type="checkbox"
                checked={compact}
                onChange={(e) => {
                  set({ compact: e.target.checked });
                  localStorage.setItem("nl-compact", String(e.target.checked));
                }}
              />
            </div>
            <div className="setting-row">
              <div>
                <h4>界面主题</h4>
                <p>统一浅色主题，保持专业图表的清晰度。</p>
              </div>
              <Badge tone="neutral">浅色</Badge>
            </div>
            <div className="setting-row">
              <div>
                <h4>显示语言</h4>
                <p>保留英文专业术语和图表符号。</p>
              </div>
              <Badge tone="neutral">简体中文</Badge>
            </div>
          </div>
        </Panel>
        <Panel title="存储与环境">
          <div className="settings-body">
            <label className="form-label">
              工作目录偏好
              <input
                value={directory}
                placeholder="填写后续桌面服务使用的工作目录"
                onChange={(e) => setDirectory(e.target.value)}
              />
            </label>
            <p className="field-note">
              仅保存偏好，不会在网页中创建或访问该目录。
            </p>
            <button
              className="btn"
              onClick={() => {
                localStorage.setItem("nl-directory", directory);
                notify("目录偏好已保存在此浏览器");
              }}
            >
              保存偏好
            </button>
            <div className="setting-row">
              <div>
                <h4>计算环境</h4>
                <p>统一在资源管理中配置。</p>
              </div>
              <Link className="text-link" to="/resources/runtime">
                打开向导 →
              </Link>
            </div>
          </div>
        </Panel>
        <Panel title="诊断与版本">
          <div className="settings-body">
            <h3>
              NeuroLens <Badge>0.1.0</Badge>
            </h3>
            <p>前端预览 · 图表与帮助本地提供</p>
            <button
              className="btn"
              onClick={() =>
                download(
                  "NeuroLens-diagnostics.json",
                  JSON.stringify(
                    {
                      version: "0.1.0",
                      mode: "demo",
                      timestamp: new Date().toISOString(),
                      browser: navigator.userAgent,
                      viewport: { width: innerWidth, height: innerHeight },
                      online: navigator.onLine,
                    },
                    null,
                    2,
                  ),
                )
              }
            >
              导出诊断信息
            </button>
            <p className="field-note">
              包含浏览器和显示尺寸，不包含敏感文本、密钥或模型路径。
            </p>
            <Link className="text-link" to="/help/about">
              关于与开源组件 →
            </Link>
          </div>
        </Panel>
      </div>
    </>
  );
}
