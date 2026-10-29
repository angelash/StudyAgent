# 157 教学安排撤回、只读历史与schema25隔离迁移

日期：2026-10-30。实施前规格，承接[156本人练习UI](156-assistant-practice-workspace-ui.md)、[147第24节](147-conversation-practice-guidance-and-review.md#24-下一批安排本人分组开始与首答的具体设计)与[150总计划](150-integrated-delivery-plan-and-work-ledger.md)R2。156的完整回归运行于冻结源码，本规格不改变该候选的应用或数据库。先完成并提交本规格，再实施撤回。

## 实际落点

原assistantPracticeAssignments只接受assigned状态，原创建输入、payloadFingerprint和回执由完整性校验器重算。已开始活动通过原assignment和groupStart回读，写入统一由assertAssistantPracticeWriter检查；媒体的新建、完成与实际作答亦经该检查。直接改status或删安排会破坏历史恢复，隐藏按钮也不能阻止旧客户端写入。

撤回采用独立持久记录，不改原安排、题包、首答、理由、帮助、完成、曝光及其原键。原安排创建回执仍指向同一个冻结对象；公开投影另列撤回状态、说明与时间。任何重新安排都是新的明确安排，不把旧撤回记录重新启用。

## 原命令与唯一撤回

新增严格POST `/learning/assistant-practice/assignments/:id/withdraw`：expectedStateVersion固定为首次0；assignmentFingerprint必须等于原共享payloadFingerprint；reason为5～500字；requestKey为8～180字。拒绝客户端指定actor、日期、题包或其他字段。HTTP201返回原撤回回执。

仅当前有权的监护人及原有内部admin规则允许撤回；学生本人、普通教师、operator和其他家庭不能撤回，作者私人候选的读取权不代替监护资格。先核对当前身份和孩子授权，再查询原命令。另一合法监护人可撤回同一孩子安排，但不能因此读到作者私聊。

新增assistantPracticeAssignmentWithdrawals，协议assistant-practice-assignment-withdrawal-v1。每assignment唯一一条，并对actorFingerprint+requestKey唯一；记录原assignment/student/subject/payloadFingerprint、version=1、共享reason、实际actorRole/可移除actorUserId、不可变actorFingerprint、原完整命令与请求hash、时间、冻结回执。回执只含撤回ID、原安排ID、stateVersion=1、withdrawnAt及原payloadFingerprint。

事务内先核对原命令是否已经成功，同键同完整输入返回原回执；同键异内容409。两个实例/两个监护人竞争时仅一个成功，另一命令409并要求读回原撤回。新命令不能把已撤回安排当作version0。不能静默把另一监护人的撤回回执冒充为自己的成功。

## 对原活动和媒体的影响

撤回事务落库后，尚未开始的组拒绝新开始；原已成功开始命令仍在当前本人身份核对后返回原活动。已开始组保留原in_progress/completed状态，读取继续返回原题、答案、首次理由、订正及帮助历史；writable=false与withdrawal投影明确只读原因，不把未完成组自动记为完成或失败。

新草稿、回答、帮助、完成及媒体新建/续传/完成全部检查撤回。若原命令在撤回前已成功，仍可核对该原回执；如果没有原成功记录，则拒绝，不能因原请求键存在于本机而准许写入。原命令恢复不重新排题，不增加正式能力证据。当前身份或学习码授权已失效时，原回执同样先拒绝；撤回不扩宽读取授权。

媒体处理在读取字节前、归一化结束发布前及作答引用时重新检查同一原活动资格。撤回不能让迟到的上传完成发布为新合法答案，也不删除仍被历史首答/订正/草稿引用的原件。明确取消且未被引用的合成上传继续走原有清理规则；撤回不伪造用户已请求取消或物理删除。

浏览器在原安排显示“撤回这份安排”，先填写会给孩子及合法监护人看到的说明，再确认。完整reason和原pending撤回命令纳入专用管理副本；禁存储时先下载原副本再发送，丢回执沿原完整命令恢复。学生页面轮询/聚焦读回撤回后停止新写入，保留本人未提交答案和理由及下载/比较入口。原已成功作答反馈与撤回说明分别显示。

## 隐私、冷恢复与版本栅栏

新集合进入studentRecords、隐私导出、孩子删除、作者/撤回人账号删除、最新删除账本和SQLite/PG原生备份恢复。孩子删除清除撤回及整套关联；撤回人账号删除但孩子由另一监护人保留时，保留已明确共享的教学说明及时间、原回执和稳定指纹，去除actorUserId和其他私人授权引用。普通共享导出不输出原requestKey、hash、完整内部命令或另一监护人的私聊。

完整性校验核对：撤回引用实际原安排；student/subject/payloadFingerprint与冻结原件一致；撤回时间不早于安排；唯一记录/唯一actor请求；version与原输入/回执/hash一致；未删除actor必须匹配原指纹，已匿名actor必须匹配合法account_delete回执和保留孩子。撤回不是删源或source_unavailable的别名；account_deleted来源与withdrawal可以同时存在，旧备份不能丢掉较新的删除账本或复活私人关联。

这是新增持久集合，当前24读取器不会理解撤回对写入资格的影响。新增schema25以及ready-schema25和最低reader保护；先保存实际schema24编译读取器及依赖的哈希，再实施25。23/24原件由新读取器正常迁移；旧24读取器必须在读写新业务前实际拒绝25，原数据库字节保持。新迁移只新增约束和版本标记，原24数据不批量重写；未知未来版本和未完成恢复标记继续拒绝。迁移/reader/原生恢复及相应固定版本测试同步更新，不把旧版读者也改成能读25后再声称它会拒绝。

验证只在主目录data/qa源码副本、独立数据库和端口进行。正式schema24/revision187及实际API/Web构建继续保护；schema25不会因本地代码提交而自动发布。

## 本批退出与全目标

SQLite与真实PG分别验证：未开始撤回、已开始/已完成只读、三点跨组、原创建/开始/作答/帮助/完成回执、两实例同键/异键竞争、另一监护人、学生/其他家庭拒绝、媒体归一化迟到、实际原件hash和冷恢复。篡改撤回关联后即使重算bundle hash也须拒绝；最新作者/孩子删除账本分别验收。

浏览器覆盖明确reason/确认、原命令丢回执、手机和键盘焦点、学生迟到读/撤回清屏、未提交完整输入保留、两标签并发、原历史和原媒体。保留首次失败与复验；工程通过不代替真人使用或教学效果。

本批只关闭R2的撤回缺口。成人/AI持久教学、D3真实证据原因/指导、D4冲突排期与真实到期复测、R5～R8和原72/WS仍继续；不以schema升级、测试数量或撤回按钮宣称完整产品已经完成。
