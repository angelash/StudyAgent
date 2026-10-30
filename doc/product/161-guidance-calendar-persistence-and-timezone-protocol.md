# 161 指导日历确认、完整命令与时区持久协议

日期：2026-10-30。实施前具体协议，接[150总计划](150-integrated-delivery-plan-and-work-ledger.md)R4及[160排期规格](160-guidance-calendar-conflicts-and-due-review.md)。先本地提交，再在主目录内的新隔离副本实施。当前主干源码25；158/159的最终27输入仍在隔离回归。本文不代表schema28或接口已经交付。

## 当前证据与本批边界

160前置隔离检查已实际复现旧请求键跨家庭返回计划；已补实际对象、学科、类型和原计划作用域、引用权限及缺失引用拒绝。全冲突原来仍塞入一个任务，现候选返回零时段、拒绝保存，工作台确认按钮禁用；同一孩子各学科的有效忙碌区间都参加检查。SQLite专项9通过、37未选；实际PG专项8通过、17未选；浏览器最终7/7包含四个宽度和原工作台课程旅程。前三轮接口和前两轮浏览器失败分别保留；完整回归尚未终结，未归并主干。

这些旧活动没有完整作者/命令哈希，不能因作用域修复就宣称具有精确原命令回执。新增严格命令、跨学科日预算、当地日期/DST、原指导与正式ReviewTask关联在本协议实施；教师、实机和真人保持效果继续单列。

## 原记录与新记录

复用`diagnosticPlans`、`guidancePlanRevisions`、`reviewTasks`和`studioScheduleEvents`，不创建另一份指导计划、评分或掌握记录。正式复测的身份和开始条件继续由原诊断服务负责。

新增`guidanceCalendarArrangements`，每个原planId只有一条当前安排，id稳定绑定原计划；唯一约束覆盖planId。记录协议、真实studentId/subject/planId、创建者、revision、当前条目、冻结历史、原计划/报告/范围/定义依据、原任务状态及实际时间。条目分为action与review：action明确引用原actionId及用户选定的稳定occurrenceKey，可以明确安排多次；review的entryKey固定为原reviewTaskId，同一个原复测只能有一个当前安排。事件ID由安排和entryKey稳定派生，取消后再次明确安排沿同一身份与修订；不能生成另一份ReviewTask。

新增`studioCalendarCommands`，唯一约束覆盖actorId/requestKey。统一保存kind、严格规范化完整input、commandHash、原对象/权限身份、准确原结果和at。kind先限定为legacy-plan-create、legacy-plan-session、guidance-calendar-confirm、guidance-calendar-revise；不能把未知kind当旧版输入处理。结果的原revision、原计划快照、准确事件ID及原复测安排修订均冻结，当前投影另返回。

新旧命令记录以实际输入协议区分，不能给旧活动补造作者或原输入。新版旧课程计划创建/任务操作必须带完整命令协议，先查作者原键并核对全文，再核对当前权限；同键异内容409。旧活动有键而无法证明完整原命令时，返回可恢复的409和合法原计划读取入口，保留全文；不自动新建或猜测成功。无键历史仍可合法只读。

## 具体输入与接口

`POST /learning/guidance-calendar/preflight`只读，输入限定：protocol=`guidance-calendar-input-v1`、planId、expectedPlanRevision、timeZone、dailyBudgetMinutes、entries。timeZone必须是可回读的IANA标识；dailyBudgetMinutes为10～180整数，明确表示该孩子跨学科的每日安排总量，不修改原指导计划的minutesPerDay。

每个entry包含entryKey、sourceKind、actionId或reviewTaskId、localDate、localTime、offsetMinutes、durationMinutes。时间精确到分钟；durationMinutes为5～60整数。action条目保留稳定occurrenceKey，review条目必须引用实际属于原计划的pending任务；最多60条，不接受任意标题、URL、evidenceId或客户端UTC结果。用户不能借此安排另一孩子、修改原action教学内容或给自己增加监护权限。

预检返回规范化input、当前安排revision或null、合法原依据摘要、每项解析后的UTC开始/结束与偏移、逐本地日占用和剩余额度、阻断原因、实际可确认条目以及fingerprint。部分冲突不能直接丢掉用户选择：确认前必须明确选择保留哪些条目，再预检这一份完整选择；全冲突可确认项为零。

`POST /learning/guidance-calendar/arrangements`输入为原规范化input、preflightFingerprint、expectedArrangementRevision、requestKey、acknowledgeExactSchedule=true。首次expectedArrangementRevision为null；修改须为实际正整数，不把缺字段当首次。

`GET /learning/guidance-calendar/requests/:key`仅向原作者返回原命令和原结果；`GET /learning/guidance-calendar/arrangements/:id`向当前有权主体返回当前日程及合法历史，不向其他监护人暴露作者原请求键或私人观察。原计划入口仍能定位当前安排。后续修改走`POST /learning/guidance-calendar/arrangements/:id/revisions`，使用相同严格输入、预检和明确确认，另带完整reason；提交完整期望条目集合，删除项显示为明确取消，不在读取时执行。

旧课程计划端点保留，新增协议绑定完整title/goal/targetDate/firstSessionAt/minutesPerDay/fingerprint，任务命令绑定planId/sessionId/action/expectedRevision。恢复返回`operationReceipt`中的原结果与另列`current`；当前状态晚于原操作时，不改写原回执。

## 时区、冲突与预算的确定性

服务器用Intl时区数据库解析localDate/localTime/offsetMinutes，再将所得UTC回读到同一时区，年/月/日/时/分/偏移必须完全相符。日期本身也要回读合法，不能接受2月30日被自动归一化。DST缺失时刻返回明确阻断；重复时刻列出真实可用偏移，要求用户选择。普通日期也核对偏移，不信任浏览器当前时区或客户端ISO。

将该孩子所有学科的有效忙碌区间与本次所有候选统一按真实UTC比较，首尾相接不算重叠；跳过/明确取消的安排不占未来预算，已执行的实际安排继续占当日时间。替换条目仅排除正在明确替换的原事件，不能忽略同一计划其他安排。另一家庭的日程不参加检查，不返回私有标题或正文。

按所选timeZone的本地日期分割跨午夜区间，以真实分钟计算每日占用。DST当天按实际经过的时间计量，不能假定每天恒为1440分钟。对重叠的既有忙碌区间先求并集，避免同一时间重复计预算；保留明确的冲突计数。当前条目和本次新候选一并计入，不因学科筛选、月视图或分页漏算。超过预算必须返回具体日期、已占用/候选/预算分钟；不自动把已确认时间移到下一天。

fingerprint绑定严格完整输入、解析结果、当前安排revision、原计划/报告版本和定义指纹、原review的状态/安排修订、当前相关日历身份/修订/时间及预算并集。确认时在同一事务重读并重新计算；任何依据变化或另一标签占用了时间都409，原输入仍可完整下载与恢复。两实例通过原生事务、唯一键和版本冲突重读防重复，不以进程内锁作为唯一保证。

## 原计划和真实复测

预检可展示合法原计划的阻断原因；确认仅接受当前active且impact不要求复核的指导计划。保存观察、预检日历和读取历史均不自动启用计划。暂停/结束/依据变化使新安排不可确认；已有历史仍可读，并明确显示当前执行条件。

action时间只创建教学日程，不改活动完成或正式证据。review时间必须不早于原earliestDueAt及原诊断服务规定的真实间隔；已开始或已有sessionId的复测不能挪动。若改变原dueAt，必须明确展示原时间、拟定时间和完整改期理由，并在同一事务调用原`GuidanceService.reschedule`保存实际scheduleHistory和修订。只改变日历显示不能制造新的到期状态。

打开日历事件返回原plan/action/review，开始仍由原`startReview`/`DiagnosticsService.start`再次核对服务器当前时间、当前权限、计划依据、原任务、未见审核新题及曝光。日程完成只表示执行，不能写DiagnosticResponse或关闭原因。保持计量涉及最近教学/帮助锚点，须另固定计量版本和旧报告比较条件；本协议不悄悄改变`retentionDelayDays`。

## 工作台、完整副本和ICS

在原任务指导页与日历管理区提供“预览时间安排”，沿原WorkspaceDialog、列表、按钮、字体和侧栏。保留原计划和报告返回，显示当地日期、时刻、时区、UTC偏移、当日负担与具体阻断；明确区分学习任务、正式复测和普通日程。

完整副本按原作者/原计划/每标签保存所有条目、预算、时区、完整理由、预检及pending原命令，支持JSON下载/恢复和双标签比较。未知网络结果只重放同一完整原命令；确定400/409先保留被拒原命令，再由用户明确采用当前依据重新预检。禁存储时先下载完整副本再允许离开或提交。多个表单各自通过退出保护，不只执行最后挂载的一个。

ICS继续原导出路径，稳定UID取事件身份，SEQUENCE取真实日程修订。仅导出有权共享的教学标题、公开完成标准、真实时间和合法工作台返回；不导出私聊、私人观察ID、答案、内部命令键、学习码或连接凭据。重复导出不是另一活动，取消和修改要保留稳定身份，不能让共享日历把旧事件当新任务。

## schema28与门禁

在159最终27完整门禁后，保存实际27读取器、操作脚本与全部依赖SHA，再新增28集合、约束和ready-schema28。真实旧27须在读写28业务前拒绝；不能通过改一个常量伪造旧读取器。迁移必须先严格校验当前记录、来源引用、历史命令/快照及事件/原任务关系，再推进标记；未知29及不完整标记拒绝。

SQLite/PG分别验证两实例同键同文/异文、跨对象与撤权、原命令经后续修订恢复、全/部分/新增冲突、跨学科/跨午夜预算、DST缺失与重复、真实review未到期/已开始/改期及ICS稳定身份。原生备份要验证外层SHA重算仍不能掩盖错误原计划/任务/孩子引用；账号/孩子导出删除、最新删除账本、冷恢复及回滚同批接入。

320/390/768/1440px、键盘、禁存储、双标签、丢回执、两个退出保护、原工作台课程计划及31旧入口继续核对。完整API/整站、双库与实际内容/教师/实机/真人证据分别记录，保留每轮失败与复验。本规格和任何工程门禁不提升原72/WS为verified，R3更多原因、保持计量与R5～R8完整范围继续。
