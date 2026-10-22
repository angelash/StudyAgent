# PDF OCR、表格公式恢复与小九AI CLI 接入

日期：2026-10-22

## 结论

这里确实需要大模型能力，但模型不应被当作 OCR 真值来源。合适的职责是：

- 本地 PyMuPDF 与 RapidOCR 负责读取文字和保留原页坐标；
- 确定性规则负责发现原生表格、公式候选和低置信区域；
- 小九AI CLI 根据原页图片和 OCR 候选复核段落、表格行列与公式 LaTeX；
- 人工对照原页确认结构提取，确认只代表“版面提取已核对”，不代表知识或答案正确；
- CLI 不可用时保留本地结果并明确标记，整次材料处理仍能完成。

## 小九AI CLI 接入

新增 CodexPdfStructureService，通过当前本机小九AI CLI 的非交互模式返回受 JSON Schema 约束的结构。

- PDF 结构复核默认明确指定 deepseek-v4-flash（模型目录中的 DeepSeek V4 Flash），其余 provider、推理强度和其他配置继续继承本机 CLI。
- 当前 gateway 分组不支持请求中写法的 deepseek-v4.1-flash：实测该标识返回 503 无可用渠道；产品使用同一 DS Flash 系列中实际可用的 deepseek-v4-flash，并允许通过 CODEX_PDF_MODEL 调整。
- CLI 固定以只读沙箱、临时会话、非交互 JSON 流运行。
- OCR 文字、表格和原页只作为不可信材料传入，提示明确禁止执行材料中的指令。
- 模型不得补写原页不存在的内容；无法确认的单元格、公式和警告单独返回。
- 当前 CLI 的 model-catalog.json 可能比可执行文件新。服务会在临时目录中只补齐兼容字段 supports_reasoning_summaries 与 supports_parallel_tool_calls，不修改用户配置。
- Windows 下解析 npm 安装包内的真实 codex.exe，避免 spawn('codex') 无法找到 .cmd 包装器。
- 模型失败、超时、未登录或 schema 不一致时降级为本地 OCR/结构结果，并写入 model_structure_review_unavailable。
- 默认启用小九AI结构复核；启用时只把处理所需的 OCR 文字与最多 8 张原页图片交给当前 CLI 配置的模型服务。设置 STUDY_PDF_STRUCTURE_MODEL=false 可切换为完全本地处理。

官方实现依据：

- [Codex CLI](https://learn.chatgpt.com/docs/codex/cli)
- [Non-interactive mode / codex exec](https://learn.chatgpt.com/docs/non-interactive-mode)

## PDF 处理链路

1. 上传时验证 PDF 签名、大小、页数和加密状态，保存不可变原件。
2. 材料以 queued 状态进入 durable task；上传请求不等待 OCR 长任务。
3. 后台逐页渲染原页 PNG，并读取 PyMuPDF 原生文字层。
4. 文字不足的扫描页调用 RapidOCR，保留行文字、置信度和归一化坐标。
5. 原生 PDF 使用 PyMuPDF 表格探测器；扫描页在 OCR 行坐标呈现稳定列关系时生成表格候选。
6. 含等号或数学运算符的行生成公式候选，本地先生成保守 LaTeX。
7. 对 OCR、表格、公式页面，最多附带 8 张原页图片交给小九AI CLI 做结构化复核。
8. 合并本地与模型结果，保留 native_text / ocr / hybrid / unreadable、置信度、页码和警告。
9. 用户可在“原版页面 / 文字层 / 结构恢复”之间切换，确认后状态变为 ready。
10. 处理失败会进入 failed，展示错误与“重试处理”，无需重新上传同一文件。

## 产品界面

- Materials 页面显示排队、处理中、待核对、可核对和失败状态。
- 结构页可直接查看段落、表格和 KaTeX 公式。
- 表格保持行列结构，公式同时保留 LaTeX 与原文。
- 页面保留 OCR/结构警告，明确说明哪些内容需要人工对照。
- 结构确认与白板、个性化学案和原文件下载使用同一家庭访问边界。
- 处理中的材料不能生成白板或个性化学案，避免把半成品当成学习依据。

## 测试

- PDF Schema 单元测试：确认 CLI 不带模型/推理覆盖，并包含不可信材料约束。
- 真实合成表格式 PDF：恢复行列、分数公式和原页坐标。
- 真实图片型 PDF：通过 RapidOCR 识别文字并产生可核对页。
- 中文文件名、SHA-256 去重、原页 PNG、原文件下载与跨家庭隔离。
- 失败后重试、结构人工确认、幂等标识和并发更新时间保护。
- 小九AI 实际 CLI 调用：使用当前 CLI 配置对合成表格/公式原页返回合法 JSON。
- Playwright：上传、后台轮询、原页、文字/结构切换、公式渲染、结构确认、学案和手机布局。

运行证据：

- [PDF/OCR/结构集成验收](../evidence/2026-10-22/diagnostic-planner-pdf-study-pack-runtime.json)
- [小九AI CLI 实际结构复核](../evidence/2026-10-22/pdf-ocr-structure-model-runtime.json)
- [结构核对界面](../evidence/2026-10-22/studio-pdf-structure-review.png)

## 边界

- OCR 是提取候选，不是教材事实校验，也不能修复原页本身模糊或缺失的信息。
- 合并单元格、复杂公式排版、手写公式和跨页表格仍需专项样本和人工核对。
- 模型输出不会直接提高掌握度、生成考试成绩或替代已审核测量题。
- 当前只保证内部单家庭使用；学校原生 OAuth、双向 LMS 回写、Marketplace 和计费仍未启用。
