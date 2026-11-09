# NeuroLens：大模型安全分析工作空间

NeuroLens 是本地运行的模型安全研究工具，提供**神经元分析九视图、API 安全评测、提示词脱敏**，以及模型、数据集和计算环境管理。网页由本地服务提供；Windows 版使用独立的 Edge 应用窗口打开。运行记录和结果保存在本机。

![NeuroLens 首页与三个工作区入口](pic/首页.png)

> 截图仅展示操作界面。图中的模型、进度和评测数值不是新安装后的默认结果。

## 核心功能

### 神经元分析

选择本地模型和样本后，工具生成模型回复，测量逐层表征、FFN 神经元激活与敏感度，并用本地 Qwen3Guard 对问题和回复进行自动安全分类。九个联动视图支持切换层、样本和神经元；没有运行结果时显示空视图。可导出包含原始回复和测量值的 JSON。

![神经元分析九视图与任务配置](pic/神经元分析.png)

当前引擎主要适配具有 `model.layers[].mlp.down_proj` 的模型结构。层级语义演化使用共享 PCA 等探索性测量；它不是论文中的已训练安全探针，图上的样本占比也不是裁判置信度。

### API 安全评测

填写兼容聊天补全接口的服务商地址、模型 ID 和 API 密钥，验证连接后，从当前数据集中按类别等量抽样。工具保存逐条回复，并使用本地 Qwen3Guard 形成安全、存疑、不安全等判定。正确拒绝计入安全响应；请求失败保持未判定。密钥只用于当前请求，不写入结果文件。

![API 安全评测配置、统计与响应明细](pic/api安全评测.png)

### 提示词脱敏

电话、邮箱和身份证使用本地规则识别；中文姓名与地址使用本地 NER 模型识别。支持自定义敏感词、识别预览、批量 TXT 处理、保存键值对和按原映射还原。映射表保存在本机浏览器中；下载脱敏文本时不会附带映射表。

![提示词脱敏、识别预览与键值对库](pic/提示词脱敏.png)

## 使用 Windows 安装包

1. 运行 `build/installer/NeuroLens-Setup-0.1.0.exe`，按向导安装。默认安装到当前用户的 `%LOCALAPPDATA%\Programs\NeuroLens`，可选择创建桌面快捷方式。
2. 从开始菜单或桌面打开 NeuroLens。应用会启动本地服务，并以最大化的 Edge 应用窗口显示首页；未找到 Edge 时会尝试默认浏览器。
3. 安装包包含网页、图表脚本、算法代码和内置数据集，**不包含 Python 计算环境与模型权重**。首次使用请按下面两步准备资源，下载内容会进入安装目录的对应文件夹。

### 第一步：图形化配置计算环境

打开左侧 **资源管理 → 计算环境**。向导自动检测 Python、PyTorch、Transformers、NVIDIA 显卡和安装工具。点击“下一步”，选择 **CPU 标准环境**或 **NVIDIA GPU 环境**，再点击“开始在线安装”；完成后在“验证结果”查看状态。初次测试小模型可先选 CPU。环境安装在应用目录的 `.venv`，不会加入安装包。

![计算环境配置向导的设备检测页面](pic/计算环境.png)

向导优先使用已有 `uv`；若 Windows 上未找到，会尝试通过 `winget` 在线安装。下载 Python、PyTorch 和 Transformers 需要网络；GPU 方案还需要兼容的 NVIDIA 显卡和驱动。安装后可点击“重新检测”。

### 第二步：在页面下载模型

打开 **资源管理 → 手动模型下载**。页面检查配置、分词器和权重是否齐全。点击相应卡片底部的下载按钮，等待状态变成“已就绪”；已有完整文件会跳过，必要时点击“重新检测”。

![手动模型下载页，分别显示评测对象、安全裁判与脱敏模型](pic/手动模型下载.png)

| 模型 | 保存位置 | 用途 | 权重约需下载 |
| --- | --- | --- | ---: |
| [SmolLM2-135M-Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct) | `test/SmolLM2-135M-Instruct` | 神经元分析的轻量评测对象 | 269 MB |
| [Qwen3Guard-Gen-0.6B](https://huggingface.co/Qwen/Qwen3Guard-Gen-0.6B) | `models/Qwen3Guard-Gen-0.6B` | 神经元分析和 API 评测的安全裁判 | 1.50 GB |
| [中文姓名与地址 NER](https://github.com/Call-Me-Y/NeuroLens/blob/d52582494d2d6d143dd524cc57b1c033cf5a54e3/models/chinese-ner-per-addr-rbt3/model.safetensors) | `models/chinese-ner-per-addr-rbt3` | 提示词脱敏的姓名、地址识别 | 152 MB |

NER 下载使用 GitHub LFS，当前方式要求本机安装 Git、Git LFS，并具有该仓库的 GitHub SSH 访问权限；仓库不可访问时下载会失败。电话、邮箱、身份证等本地规则不依赖 NER 权重。`models` 中的裁判与 NER 模型不会被当作评测对象；评测对象默认从 `test` 扫描。

### 第三步：运行与查看结果

- **神经元分析**：确保 SmolLM2 与 Qwen3Guard 均“已就绪”，选择模型、数据集和样本数，点击“开始分析”。完整结果保存在 `outputs/runs`。
- **API 安全评测**：确保 Qwen3Guard“已就绪”，填写接口、模型 ID 和密钥，点击“验证连接”，再点击“开始评测”。完整结果保存在 `outputs/api-safety`。
- **提示词脱敏**：选择识别规则，输入文本并预览、执行；需要中文姓名和地址识别时先下载 NER。保存键值对后，可在“还原文本”中选择集合恢复原文。
- **任务与记录**：点击记录可返回对应工作区。神经元分析和 API 评测结果也保存在 `outputs`；浏览器本地保存任务索引、脱敏记录与键值对。请自行妥善保存敏感映射和导出的结果。

## 数据集与结果口径

安装包内置 `data/`。神经元分析默认使用 `data/JBB-Behaviors/benign-behaviors.csv` 与 `harmful-behaviors.csv`；API 安全评测默认使用 `data/JailBench/JailBench.csv`。在 **资源管理 → 数据集** 可查看文件、字段和样本信息，修改三个运行数据源的相对路径及列名。保存配置时验证 CSV；新任务会记录当次数据源配置。

JBB-Behaviors 来自 [JailbreakBench](https://github.com/JailbreakBench/jailbreakbench)，许可文件保留在 `data/JBB-Behaviors/LICENSE`。部分其他数据由旧项目迁入，来源和再分发条件未全部明确；对外分发前应逐项核实。安全裁判采用 Qwen3Guard，并非原论文的完整裁判流程；当前项目也未实现论文中的训练安全探针、全部因果验证和微调方法。

## 从源码构建 EXE 和安装包

在 **Windows x64** 构建机上准备：

1. 从 [Node.js 官方下载页](https://nodejs.org/en/download)安装 Node.js 24 LTS，确认 `node` 和 `npm` 可在 PowerShell 中调用。
2. 安装 [MSYS2](https://www.msys2.org/)，在 UCRT64 终端更新后安装 `mingw-w64-ucrt-x86_64-gcc`。将 `C:\msys64\ucrt64\bin` 加入构建终端的 `PATH`，确认 `g++.exe` 与 `windres.exe` 都可调用。已有兼容的 MinGW 工具链也可以使用。
3. 从 [Inno Setup 官方下载页](https://jrsoftware.org/isdl.php)安装 **Inno Setup 6**。当前脚本固定查找 `C:\Program Files (x86)\Inno Setup 6\ISCC.exe`；安装到其他位置时，先修改 `scripts/build-windows.ps1` 中的 `$iscc`。
4. 获取本项目完整源码，在项目根目录执行：

```powershell
npm ci
npm run package:win
```

脚本构建网页、复制运行文件与 `pic` 图标、将当前 `node.exe` 放入 `build/app/runtime`、编译 Windows 启动器，再用 `installer/NeuroLens.iss` 生成 `build/installer/NeuroLens-Setup-0.1.0.exe`。输出还包括 `build/app/NeuroLens.exe` 和附加文件。安装包不包含 `.venv`、PyTorch、下载的模型权重、`node_modules` 或开发工具。构建前请关闭从 `build/app` 启动的 NeuroLens 及其后台服务；脚本会阻止覆盖正在使用的运行文件。

仅从源码运行网页时，可执行：

```powershell
npm ci
npm run build
npm start
```

随后打开 `http://127.0.0.1:4173/home`。前端测试命令为 `npm test`。主要目录：`apps/web` 为界面，`scripts` 为本地服务与打包脚本，`engine` 为 Python 算法，`data` 为内置数据，`pic` 为截图和图标，`test` 为评测对象，`models` 为裁判与 NER，`outputs` 为运行结果。

## 论文与项目关系

本项目的神经元可视化设计参考论文 **NeuroBreak: Unveil Internal Jailbreak Mechanisms in Large Language Models**：[arXiv 论文主页](https://arxiv.org/abs/2509.03985) · [原始 v1 PDF](https://arxiv.org/pdf/2509.03985v1)。NeuroLens 在此基础上构建独立的本地工作空间，并加入 API 安全评测、提示词脱敏与资源向导；它不是原论文全部算法和实验结果的等价复现。
