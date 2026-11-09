import { useEffect, useState } from "react";

type Model = {
  name: string;
  path: string;
  modelType: string;
  layers?: number;
  weights: boolean;
};
export function ModelDirectory() {
  const [directory, setDirectory] = useState(
    localStorage.getItem("nl-model-directory") || "",
  );
  const [models, setModels] = useState<Model[]>([]);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("正在检测模型…");
  async function scan(value: string) {
    setMessage("正在检测模型…");
    try {
      const response = await fetch(
        `/api/v1/models?path=${encodeURIComponent(value)}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "读取失败");
      setDirectory(data.directory);
      setModels(data.models);
      setSelected((old) =>
        data.models.some((m: Model) => m.path === old)
          ? old
          : data.models[0]?.path || "",
      );
      localStorage.setItem("nl-model-directory", data.directory);
      setMessage(`检测到 ${data.models.length} 个模型目录`);
    } catch (e) {
      setModels([]);
      setSelected("");
      setMessage(e instanceof Error ? e.message : "模型服务不可用");
    }
  }
  useEffect(() => {
    void scan(directory);
  }, []);
  return (
    <div className="form-stack spacious">
      <label>
        模型文件夹
        <input
          value={directory}
          onChange={(e) => setDirectory(e.target.value)}
          placeholder="默认：项目目录下 test"
        />
      </label>
      <div>
        <button className="btn" onClick={() => void scan(directory)}>
          检测目录
        </button>{" "}
        <button className="btn subtle" onClick={() => void scan("")}>
          恢复默认
        </button>
      </div>
      <p className="field-note" role="status">
        {message}。扫描配置和权重文件，不加载模型。
      </p>
      {models.length > 0 && (
        <label>
          已检测模型
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.path} value={m.path}>
                {m.name} · {m.modelType} ·{" "}
                {m.weights ? "已发现权重" : "缺少权重"}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected && <code className="path">{selected}</code>}
      <p className="field-note">
        这里用于扫描评测对象模型；Qwen3Guard 裁判和脱敏 NER 模型不参与评测对象选择。
      </p>
      <p className="field-note">
        测试模型：项目 test 文件夹中提供 SmolLM2-135M-Instruct。也可以从{" "}
        <a
          href="https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct"
          target="_blank"
          rel="noreferrer"
        >
          Hugging Face 模型主页
        </a>{" "}
        下载后放入该文件夹。
      </p>
    </div>
  );
}
