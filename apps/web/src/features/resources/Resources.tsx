import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FolderOpen,
} from "lucide-react";
import { PageHead, Panel, Badge, HelpLink, Drawer } from "../../components/ui";
import { useApp } from "../../stores/app";
import { ModelDirectory } from "../../components/ModelDirectory";
import ModelDownloads from "./ModelDownloads";
import RuntimeWizard from "./RuntimeWizard";
import DatasetResources from "./DatasetResources";
export default function Resources() {
  const { tab = "models" } = useParams();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [path, setPath] = useState("");
  const [paths, setPaths] = useState<string[]>([]);
  const notify = useApp((s) => s.notify);
  return (
    <>
      <PageHead
        eyebrow="MODELS & RUNTIME"
        title="资源管理"
        description="让模型、数据和计算环境各归其位。"
        action={<HelpLink slug="environment" />}
      />
      <div className="tabs page-tabs">
        {[
          ["models", "模型库"],
          ["downloads", "手动模型下载"],
          ["datasets", "数据集"],
          ["runtime", "计算环境"],
        ].map(([id, label]) => (
          <button
            className={tab === id ? "active" : ""}
            key={id}
            onClick={() => navigate("/resources/" + id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "models" ? (
        <>
          <Panel
            title="模型目录"
            subtitle="默认扫描项目 test 文件夹，也可填写自定义目录"
          >
            <ModelDirectory />
          </Panel>
          <div className="section-title">
            <div><h2>自定义模型目录</h2><p>在上方扫描权重，或登记其他本地路径。</p></div>
            <button className="btn primary" onClick={() => setShow(true)}><FolderOpen size={15} />登记模型路径</button>
          </div>
          {paths.map((p) => (
            <div className="notice-banner" key={p}>
              <FolderOpen size={16} />
              {p}
              <Badge tone="amber">会话登记 · 未验证文件</Badge>
            </div>
          ))}
        </>
      ) : tab === "downloads" ? (
        <ModelDownloads />
      ) : tab === "datasets" ? (
        <DatasetResources />
      ) : (
        <RuntimeWizard />
      )}
      {show && (
        <Drawer title="登记外部模型目录" onClose={() => setShow(false)}>
          <p>此操作只保存本次网页会话的路径记录，不读取或复制文件。</p>
          <label className="form-label">
            模型目录
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="C:\Projects\AI\models\your-model"
            />
          </label>
          <button
            className="btn primary"
            disabled={!path.trim()}
            onClick={() => {
              setPaths([...new Set([...paths, path.trim()])]);
              setShow(false);
              setPath("");
              notify("路径已登记，待后续本地服务验证");
            }}
          >
            登记路径
          </button>
        </Drawer>
      )}
    </>
  );
}
