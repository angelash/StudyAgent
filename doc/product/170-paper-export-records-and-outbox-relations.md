# 170 冻结导出、真实队列关系与文件登记

2026-10-31。接[168原生协议](168-paper-selection-export-native-protocol.md)、[169文档续题](169-native-question-continuations-and-text-integrity.md)和[150总计划](150-integrated-delivery-plan-and-work-ledger.md)的R5。本批实现记录准备与关系核对，尚未启用应用业务或schema32。

## 准确输入与原命令

后续[171持久化与实际隐私恢复](171-paper-library-persistence-privacy-and-native-recovery.md)已将六集合和32门禁接入主干，补齐同事务原命令/当前授权、真实删除/监护栅栏及SQLite/PG产物保留和清除恢复；完整回归与版本断言复验按批次分列。正式库仍24/revision187，未部署。以下本批早期31/未注册边界保留；业务接口/实际worker/学生旧读取防旁路/工作台UI继续实施，整体active。

新增严格导出契约，create只接清单ID、准确旧修订/指纹、原始标题、版式和有序books/formats。cancel/retry固定exportId、册/格式及expectedTaskVersion/expectedGeneration。完整原命令、完整原回执与摘要独立保留；成功回执不是当前队列状态。每册×格式一个固定taskId，kind为`library.paper-export.render`，准确payload为exportId/intentFingerprint/book/format，maxAttempts=3。

从清单来源到文档来源的适配固定为title→paperTitle、originalPage→pageNumber；未知页码保留null。正整数发布版编码为`published-vN`，null编码为`research-v1`，不接受裸数字字符串、补零版或临时猜补。原题身份继续使用完整`paper:`题键；题序、题位、来源SHA、发布版、标题和已核实页码必须与准确旧清单修订一致。新清单重排或清空不改变既有导出。

执行器输入字节固定为递归排序对象键的JSON、UTF-8、无BOM及结尾换行；数组保留原序。documentSha256针对实际传入的完整字节。严格记录同时保留完整document与媒体来源清单；渲染输入按实际PNG摘要去重，来源授权身份仍分别保留。字段形状、12MiB输入、8MiB文字、媒体大小/像素、100题/10卷及来源映射有界核对；HTML/MathML/字体支持仍须运行真实的逐册预检，记录准备不能替代它。

## 队列、文件与删除证明

TaskOperation为新导出类型绑定commandId、接受时刻和准确代次；原命令与实际控制须同事务提交。重试增加实际generation，成功不能覆盖。无原导出命令、另一作者、错误代次或试图经普通任务接口控制导出均拒绝。针对新类型的检查点审计保留准确progress，普通既有任务仍沿原审计协议。

每次真实lease的工作区身份绑定taskId/generation/token，即使同一generation的过期租约重领，也使用另一工作区。先在真实队列完成reserved检查点，再允许IO；rendered检查点绑定同一身份及book/format/SHA/bytes/pageCount/sourceMapHash。实际发布须有匹配的rendered进度，并与现有队列完成栅栏同事务写入。取消或旧token输掉实际栅栏时，发布行和文件状态一并回滚。

`paperExportFiles`保留reserved/available/collecting/deleted及不可变身份摘要。引用发布必须匹配真实成功任务、代次、输出和成功审计；失败/取消后的非空output仍需原rendered检查点。未知文件不会由记录校验器删除。

PrivacyReceipt新增可选`erasedPaperExports`：逐导出保存exportId/intentFingerprint、作者/学生摘要、原任务id/payloadHash及删除当时实际文件id/identityFingerprint。每个文件摘要绑定原export/task/generation/token/createdAt/workspace等不可变身份；不保存题干、标题、媒体URL、完整原命令或来源映射。证明必须属于这次账号删除或确实被删除的学生范围；“保留孩子”不能作为删除其本人导出的凭据。独立删除账本严格保留并验证此字段。

私人业务记录消失后，保留文件还须匹配准确删除回执、原任务及固定cleanup任务，不能仅凭一个删除日期或同作者摘要接受任意孤儿。cleanup以同一文件身份完成，deleted必须对应真实成功回执。最新账本可能含备份之后才存在的文件，读取器不据此补造备份中没有的导出、曝光或文件行。

## 原生关系与实际证据

新增预注册关系核对器，读取六集合、实际SQL任务及完整任务审计，双向核对准确清单历史、原create/control、学生准确来源曝光、slot/task、reserved/rendered检查点、成功发布及删除证明。真正的恢复栅栏也会增加generation；必须同时存在实际`restored`任务审计与`operations.restored`事件，不能只要求用户retry导致代次变化。该核对器当前未接入DomainDatabase启用路径。

最终相同源码专项113通过/0失败/0跳过：65项本批记录和真实SQLite队列关系，另48项既有选题/实际来源/队列回归。首、二批各111项单独保留，不合计。候选contracts/config/API类型检查及实际API构建通过；既有隐私HTTP/最新账本恢复另批6通过，不能当作新增导出的真实账号删除验收。

隔离桥接使用同一冻结字节，先持久reserved，再调用实际文档执行器，核对两份真实产物与来源映射，经rendered检查点和真实完成栅栏发布一个PDF slot。生成一页PDF及一页DOCX，原PDF和集成render_docx.py独立渲染的DOCX页面都实际打开；题序7→3、未知页码、核实页4、答题区和答案分离保持。DOCX在此仅为同次临时产物，并非第二个成功slot。桥接使用直接QA harness，不能表述为应用HTTP/worker已接通。

原始类型收窄失败、测试代码类型错误、第一次桥接的模块路径失败及渲染后页码文字提取检查失败均保留。页码首断言未处理PDF提取出的`第4 页`空格，两个渲染实际均成功；在相同未改文件上按完整来源标签去提取空白复验通过，原失败不覆盖。第一次交互编译输出未另存完整日志，后续相同问题的完整重现和准确源码已保存。详见[本批证据](../evidence/2026-10-31/workspace-r5-export-records-and-outbox/receipt.json)。

## 下一阶段与完整目标

应用仍31，正式库只读24/revision187；`PAPER_EXPORT_NATIVE_READY=false`。六集合未注册，未接选题/导出业务路由，不把QA专用SQL协议表冒充正式持久业务。原正式构建与配置继续受保护，仅本地提交。

下一步先完成六集合的Store/DomainDatabase、事务唯一约束、启动/备份/恢复核对、实际隐私删除及最新账本应用，再在隔离副本注册32和最低读取门禁；已封存的最终31读取器保持。随后接当前授权/来源重核、真实执行与回收worker、准确文件句柄读取、两实例及SQLite/PG和原生媒体恢复。学生进行中诊断限制与准确曝光还须封住旧正文、参考、媒体/PDF/打印旁路。

界面继续按149复用原学习工作台资料列表、WorkspaceDialog、抽屉、焦点及退出保护，接完整稿、双标签、禁存储与未知原结果恢复。其他R5、R6全教材/GESP、R7/R8、原72/WS及教师、实机、新机器、实体打印和真人1/3/7/14日全部目标仍未关闭，整体active。
