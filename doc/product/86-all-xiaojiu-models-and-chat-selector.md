# 小九AI全模型接入与聊天选型

日期：2026-10-22

## 结论

StudyAgent 的助教对话现在可以使用小九AI中当前启用的全部模型。模型不是写死在页面上，而是由本机小九AI目录动态生成；前端按常用模型和厂商分组展示，并在每条助手回复下记录实际使用的模型。

默认模型保持为 DeepSeek V4 Flash 的当前可用渠道，界面按用户指定显示为 DeepSeek V4.1 Flash。模型 ID deepseek-v4.1-flash 在当前 gateway 分组仍返回无可用渠道，因此没有把不可调用的标识写入配置。

## 已接入模型

- OpenAI：GPT-6 Astra、GPT-6.1 Sol、GPT-6 Sol、GPT-6 Luna、GPT-5.6 Sol、GPT-5.6 Terra、GPT-5.6 Luna、GPT-5.5。
- xAI：Grok-4.6、Grok-4.7。
- 智谱：GLM-5.2、GLM-5.3 Flash、GLM-5.3。
- DeepSeek：DeepSeek V4.1 Flash；当前实际调用 slug 为 deepseek-v4-flash。
- Anthropic：Claude Opus 5、Claude Opus 5.5、Claude Sonnet 5、Claude Fable 5.1。
- 小米：MiMo V2.6 Pro、MiMo V2.6 Flash、MiMo V2.6 Pro Ultraspeed。
- 通义千问：Qwen3.8 Max。
- Auto：使用 XIAOJIU_CHAT_DEFAULT_MODEL 指定的当前默认模型。

真实 CLI 探测覆盖 22 个传统模型，22/22 成功返回。每个模型使用独立临时会话和同一最小指令，不使用历史聊天，不调用学习业务工具。

## 后端

- GET /api/ai/models 返回经过认证的模型目录、显示名、厂商和默认模型。
- 聊天消息可携带 modelId；服务端只接受模型目录中的 slug，拒绝任意命令参数或未知模型。
- 小九AI聊天通过非交互 CLI、只读沙箱和临时会话执行，继承当前 provider 及其他 CLI 设置。
- 输出使用 JSON Schema 约束 reply 和 evidenceIds；证据 ID 仍由学习业务层验证。
- 模型输出不合格时自动重试一次，连续失败会向聊天界面返回明确错误，不会伪装成本地模型回答。
- 模型名、模型 ID 和来源随助手消息持久化，刷新后仍可核对。
- 当前活动中的诊断题继续使用确定性提示，不允许模型泄露标准答案。
- 模型调用只接收当前会话的角色、学科、页面上下文、脱敏学习证据、最近10条对话和本轮问题；标准答案、评分配置及其他家庭数据不会进入模型上下文。

## 前端

- 家长陪伴助教、学生学习助教和 Studio 对话均提供模型下拉选择。
- 默认选择 DeepSeek V4.1 Flash；也可切到 Auto 或任一模型。
- 选项按常用模型和 OpenAI、xAI、智谱、DeepSeek、Anthropic、小米、通义千问分组。
- 选择保存在本机浏览器设置中，下次打开继续使用。
- 助手回复显示实际调用模型；模型不可用时显示可恢复错误，用户可以切换模型后重试。
- 移动端使用原生下拉选择，保持触屏和键盘可用性。

## 配置

- XIAOJIU_CHAT_ENABLED=true：启用小九AI模型聊天。
- XIAOJIU_CHAT_DEFAULT_MODEL=deepseek-v4-flash：Auto 和默认选型使用的模型。
- XIAOJIU_CHAT_TIMEOUT_MS=90000：单次模型调用超时。
- CODEX_PDF_MODEL=deepseek-v4-flash：PDF结构复核默认模型。

## 验收

- 22个真实模型CLI调用全部通过。
- 模型目录、聊天路由、默认模型、恶意模型ID、消息持久化和PDF结构复核专项测试通过。
- Playwright验证模型下拉包含Auto和22个模型，默认DeepSeek，切换模型后可以正常继续会话。
- 全量API 733项通过、6项环境跳过；浏览器验收6/6通过。

证据：

- [22个模型真实调用记录](../evidence/2026-10-22/xiaojiu-model-catalog-runtime.json)
- [业务聊天服务真实模型调用](../evidence/2026-10-22/xiaojiu-model-chat-runtime.json)
- [全模型产品验收汇总](../evidence/2026-10-22/xiaojiu-all-models-acceptance.json)
- [模型选择器截图](../evidence/2026-10-22/studio-model-selector.png)
