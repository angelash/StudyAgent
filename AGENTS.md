# StudyAgent 工作规则

版本管理遵守[单主干与工作目录规则](.cursor/rules/single-main.mdc)：直接在主目录的 `main` 开发，不新建开发分支或 worktree；验证使用主目录内的隔离环境。

验证源码副本使用 `scripts/qa/snapshot-source.py` 的受控清单；禁止递归复制整个主目录或旧 `data/qa/`。测试输入精确列明，任务完成后保留证据并收尾历史快照，详见[QA 存储规则](scripts/qa/README.md)。

剩余工作按[五块执行计划](doc/product/190-mainline-and-five-block-delivery.md)推进，每块完成后自测、检查、提交推送，再继续下一块。发布到生产以 CI 为门：`npm run release:check-ci` 确认该精确提交的 GitHub Actions 全部通过后才能发布；schema/持久化、权限、AI 安全与对公网开放执行能力的改动，发布前需用户当次确认，详见[自动交付规则](.cursor/rules/automatic-delivery.mdc)。既有 R0～R8、72 项需求和 WS01～WS12 保留为追溯编号，不再作为额外开发批次。

新增代码不得直接访问 `store.<collection>`（会克隆整个集合并登记整集合读依赖），使用 `store.find/select/inspect/append/remove`，并在请求或 `store.transaction()` 内访问持久数据；`npm run qa:health` 以基线棘轮检查直接集合访问与超长行，只允许减少。

修改课程、教材、课堂或考核前，阅读并遵守：

- [课程与教学验收规则](.cursor/rules/teaching-content.mdc)
- [交付与证据规则](.cursor/rules/delivery-evidence.mdc)

这些规则来自[2026-10-28课程纠错复盘](doc/product/144-teaching-content-lessons-and-rules.md)。先核查实际代码和已保存数据；保留与当前任务无关的工作区改动。用户当次明确指令优先。
