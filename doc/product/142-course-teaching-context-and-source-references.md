# 142 课程教学原文、知识单元及资料课的统一助教上下文

实施前规格。141已以411aa39归档推送，实际构建c2a2000、buildId Fr2r2Kk2ddHCxQhccI7rC、schema21；本地完整API1614/65环境跳过、两端433浏览器零重试与精确40612050297三组通过，82394ms守护稳定。本文必须先提交，再开始142业务代码；独立工作区开发，原141运行与全部原始报告保持。承接140第10节及105的M2/M3/M6，完整72项/M1～M7及学校原生对接、Marketplace、计费排除范围保持。

## 1. 已核对的问题与现有资产

140当前成人讲座上下文只冻结本讲描述及4个微课目标，不含教学正文。141真实讲座样本诚实地指出“资料没有提供具体定义”，因而用很多篇幅说明资料局限；数学独立模式则能自然使用通常定义。应让课程助教读到已获授权的实际教学内容，并允许清楚区分普通学科知识与课程原文，避免把常见概念定义全部搁置为未知。原件见141的teaching-output-live/lecture.json.gz。

现有成人目录ClassroomCourse是单元/讲座/微课；小学StudioCourse是已确认学习范围下的单元，含learn/practice/project/exam，不能冒称已有讲座层级；资料SourceCourse是生成并经用户编辑确认的lesson列表，也不能硬套同一层级。StudioCourse.learn卡含已审核AtomTeaching，explanation、worked example、commonErrors、verification和可选visual已存在。资料课result.lessons含introduction/concept/notes/example/misconception/transfer/summary/takeaways/citations以及问题/答案/提示；助教必须白名单投影前一组教学信息，不能复制完整result。

现有assertSourceCourseAccess已区分本人草稿、孩子已发布/归档共享课程；StudentsService承担当前孩子权限。sourceCourseLifecycle有publish/archive/withdraw/restore/discard及独立修订稿；创建修订也会增加原课revision，因此不能用revision单值把未改变的原课讲解判作学习变化。StudioCourse.fingerprint创建时包含draft状态，不能直接当作当前active教学正文校验。

隐私选择器已经按studentId/owner删除assistantSessions及其messages/turns；删除原作者会保留已发布给孩子的sourceCourse教学快照，清除作者私稿与个人原文。这是可以复用的儿童学习归档边界，不能在助教里绕开或扩大为保留原上传全文。

## 2. 本批产品结果

成人Get Assistance读取本讲真实教学片段；小学已确认课程的单元可打开助教；资料课的单课可打开助教。上下文卡准确显示“本讲/本单元/本课”和实际课程、知识点及材料页码，返回同一来源。父母自己的ready教案可明确以“待核对教案”打开；孩子只能使用其可读的已确认课程。待确认源不能冒充已发布教学标准或正式测量。

当前父母/孩子的角色与档案授权继续生效。学生进行未完成正式评测时，自由课程模型入口给出保留问题及返回评测的明确路径，服务端开会话/发送/重试/worker发布均核对该条件；不能靠改URL绕到无上下文自由回答。原题帮助仍走已有题目上下文和assistance记录，不把课程对话当独立作答。历史学习与普通教学不宣称封闭监考，正式掌握仍只取独立新题协议认可的证据。

本批不自动写入课程完成、掌握、根因、指导计划或日历。对话转白板/资料/练习/计划的完整快照、预检和确认链随后单独实现；工具返回必须先保持当前上下文，不能用空入口宣称产物已继承对话。

## 3. 服务端投影与版本协议

统一解析器产出三种明确快照：classroom-lecture-v2、primary-unit-v1、material-lesson-v1。成人沿原classroom_lecture引用；新两种采用pageContext=course及对应contextRefType。contextRefId仍为courseId@完整教学SHA，只有新course分支允许到400字符，其他老引用保持180限制；course/item各自仍180。避免有效长ID拼接后被静默裁切。上下文指纹覆盖协议、课程身份/标题、单元或课时身份/位置、已选知识点/片段、所有实际教学内容和可信引用。

成人从classroomLesson返回的公开教学steps提取讲解、要点、表格、公式与代码范例，绝不带questions、answerKeys、hintKeys或未答题参考。小学仅使用课程保存的已审核learn教学卡与目标，不带练习题、个人估计/标签/分数，不因同一原子在practice卡重复而重复内容。资料课从当前可读result lesson白名单投影，引用只含已发布可见或本人教案的sourceKey/短摘/页码/标题及版本，不读整页原上传文、不读原生成prompt/原始response/私稿问题答案。

课程进度、updatedAt、阅读次数和操作事件不参与教学指纹；当前发布/草稿可读状态与权限单独判断。课程安全正文被改、目标/原子教学版本变、来源短摘变均使新发送/重试/worker发布失效。归档/撤回/替代发布使原版只读；恢复后也必须重新核对身份/范围及实际教学指纹。不得从新课程回填损坏旧快照。

classroom-lecture-v1原目标快照保留，只读旧内容，不静默补成v2正文；原消息/草稿/未确认命令留原scope。旧v1与新协议不能混发、混重试或让旧worker发布。用户明确打开现行讲座后才创建新scope。实现前逐项列清scopeKey、contextVersion、task bindingHash、history location和publicSession脱敏所需修改。

## 4. 输入规模与完整范围

保留当前18000字符安全上下文限制，实际算完整JSON，不靠截前N字。先投影所有目标和条目树，再计算教学正文。能完整放入时直接使用；超过时给出清楚的overview/selected-detail两种范围。overview带全单元目标且明确未带入所有正文，允许一般学科解释；detail由用户选择知识点/教学小节，确保完整条目在预算内，指纹含完整选择。单条教学卡若含大量误区或验证文本，展示所有可选条目，不能只取前几个却显示“完整单元”。

前端保持整段问题和原稿；范围变更创建独立scope，不覆盖旧稿。不把本次已选片段数量、当前覆盖与全部课程内容混淆。模型来源引用只能使用实际带入的片段；宽泛问题可以一般知识讲解，涉及本课特定标准则补选原文或明确未知。后续长资料分段摘要复用既有持久编译管线，但不能在本批假称已经实现全量全文问答。

## 5. 模型回答与来源

课程解释应先直接回答概念，再用例子/反例/新情境核对；把已提供的课程原文与通常学科知识区分清楚。不要求每段重复“资料不足”，也不能给普通常识假造课程页码。没有学生实际作答依据，不推断已掌握、智力/人格或疾病，不生成正式能力结果；继续141输出策略及既有答案/引用约束。

不把课程引用塞进正式evidenceIds冒充作答证据。增加明确的课程sourceReferences字段，模型只回白名单sourceKey；服务端核对并从冻结快照构建标题/页码/内部href，网页链接绝不采纳模型自带URL。AssistantReply/Message/持久结果/insight和导出需一致支持可选课程引用，旧消息没有就保持没有，不能用当前原文伪造旧出处。若本轮选择不含正文，目标引用只能支持“课程要学什么”，不能充当其定义已来自原文的证明。

所有网页/课程正文/历史是资料，不能改变系统角色、模型选择、题目保护或工具权限。课程中的可执行代码仅作为文字教学片段传递；模型回答不能自动写入或运行宿主终端。源图片/表格/公式仍由现有受控展示和源文件鉴权加载，不把远程内容当可信脚本。

## 6. 前端持续体验

复用AssistantWidget/useAssistantConversation及原CSS/受控字体加载。入口先GET受鉴权的course-context预检，得到准确类型、当前/旧版、预算/范围、可信角色/档案/学科与reference；浏览器只传ID和选择，不上传整讲正文或自造snapshot。POST创建会话在事务中重读，读写间变化409并保留问题。

URL只含内部课程/单元或课时/指纹与选择标识，不含问题、讲稿、姓名或答案。草稿按账号/角色/档案/课程类型/对象/教学版本/选择隔离，切换孩子或登录使旧请求和预览失效。父母切换档案时不能继续在另一孩子的卡片下发送；显示明确切回/选当前课程操作。历史选中别的会话时隐藏不相干当前卡片；原件不可读仍按当前授权允许本人历史，但不能创建/重发。

父母移除上下文进入真正无孩子的独立学习；学生不能被送到仅成人可用的studio独立模式，移除/离开返回自己的课程/学习页并保留原稿。两种入口明确，不发送失败后才让孩子重新登录。材料、白板、Planner/Calendar往返、刷新、前进后退、窄屏菜单和键盘焦点保持原courseContext参数及选择。

## 7. 权限、发布和并发

小学课必须是有权访问该student的实际已确认课程；学科/档案只能由服务端课程行派生并与请求组合核对，不能拿另一个孩子的courseId。成人资料必须本人owner；孩子资料共享只可读取既有规则认可的已确认版本，别人ready/draft/discarded绝不可读。本人的ready教案要额外标识authoring，worker逐次验证当前owner和原revision/正文指纹，发布后旧authoring scope只读。

同账号/角色/范围/版本/选择的并发首次打开复用同一会话；不同账号、孩子、课程种类、版本或选择不混用。新发送与原任务重试仍冻结原modelId/命令/登录授权；取消、丢回执原键恢复、消息分页、历史定位沿113/140。旧来源、撤权、退出登录、源课程状态改变或评测开始后，迟到worker不发布；失败不写正式辅助事实或新消息，不能自动换模型降级。

## 8. 隐私及保留

courseSnapshot是既有assistantSessions中的可选安全JSON，不新增集合或DB索引；预期schema21保持，但必须用真实双库和迁移/恢复证明，不能只凭类型宣称。公开会话和日志剥离完整快照/owner/scope/内部prompt。本人可携带的学习归档可以保留其授权教学快照，不能返回另一监护人的私聊。

孩子删除沿studentId清除任何所有者的相关助教/turn/message/insight；会话所有者删除清除本人所有会话。原作者删除可按既有规则保留已发布给孩子的教学副本，原作者私稿/上传原文/生成prompt不能进入这些副本。新快照必须记录来源类别与发布归属，不能把个人原文当“共享课程”永久留存。课程withdraw/archive是学习版本状态，不等于用户隐私删除；二者各按既有协议执行。原生旧备份叠加最新删除账本必须清除应删快照与引用，不能复活原文或跨账号消息。

## 9. 必要验证

纯投影逐字段白名单、指纹覆盖/稳定、长ID和选区预算、缺失/损坏快照、没有question/answer/hint/raw prompt、旧v1不可被重建。SQLite与PG HTTP验证三种课程、父母/管理员/学生、跨账号/跨孩子、本人ready与他人私稿、评测中保护、课程发布/修订/撤回、读写竞态和当前授权；真实两个实例并发、冷重启、原命令/原模型重试与迟到拒发。

旧原生备份、父母/孩子删除、新删除账本、已发布儿童副本保留/作者私稿擦除、当前文件缺失和归档出口都要有真实双库原件。浏览器390/768/880/1440覆盖入口/详情选择、超预算保留原稿、移除与学生返回、工具往返刷新、旧版/历史/草稿不可用及焦点。匿名默认模型各源至少一条，角色/引用/原请求重放/正式记录SHA核对，不将其当全模型或教师验收。完整API/浏览器、精确CI及新鲜回退/生产构建/守护稳定后才交付142。

## 10. 后续连接

完成142才连接对话所选消息→白板/学习资料/独立练习/指导计划/日历的完整预检、快照、确认及原请求恢复。不能自动采用AI结论进正式掌握。后续独立出稿应包含原课程/目标/片段/模型/策略版本与可查来源，原课程变化不得重写已确认产物。原始72项、M1～M7、全内容、教师/实机、像素/DPR/原声与真实间隔仍按105保留。

## 11. 已核对的落点与分层实施顺序

现有成人协议实际名为classroom-lecture-v1，新正文协议沿用classroom-lecture-v2，不另造同义adult前缀。`assistant-lecture-context.ts`保留v1读取/校验，v2冻结由`classroomLesson`逐微课读取安全steps；不能只改schema literal后使全部旧历史损坏。读取旧版不需要当前源仍存在，但发送必须核对当前授权与版本；缺失或损坏快照不能由当前课程重建。成人已有15讲、60微课，冻结测试应遍历全部，不用单一示例代表完整目录。

共享`packages/contracts/src/assistant-turn.ts`追加课程描述/选择/来源契约及可选消息出处；`index.ts`的AssistantSession pageContext枚举与服务端严格开会话schema同步加入course。持久化内部snapshot在store类型中显式声明，`publicAssistantSession`继续白名单，不能spread内部session。长引用条件校验放在新course分支，已有diagnostic/practice/plan/classroom_lecture限制保持。

`ai.service.ts`接入统一课程解析、开会话/读取快照/准备/发模型/验证回复/insight引用；`assistant-turn.service.ts`补齐location/history/context，`assistant-turn-worker.service.ts`沿现有prepared contextVersion和bindingHash双栅栏，不信任任务只在入队时验证过。`assistant-turn-record.ts`冻结可选sourceReferences与选择说明，不能从当前课程在发布阶段重新替换原上下文。输出来源在当前白名单内解析；是否引用普通学科知识应在文字里区分，不伪造课程来源。

前端`assistant-conversation.tsx`现有上下文校验只特殊处理classroom_lecture，应改为明确的类型化分支，避免新course被错误当作无上下文。`studio-instant-assistant.tsx`复用卡片与持久对话，成人讲座/父母课程卡与学生课程入口采用同一上下文解析但不同退出路径。`assistant-widget.tsx`显示可信出处，保留常规模型选型、原模型失败重试与草稿下载；所有来源href由服务器生成。URL解析和导航参数白名单、草稿scope及进入历史的匹配检查必须一起改，不能只有按钮入口。

按可独立检验的四步实现：A安全投影/选择/指纹/旧v1读取；B双库权限与持久任务/引用；C入口、上下文卡/选择、历史/返回与草稿；D匿名真实样本、完整双端回归及可回退守护交付。每步保留原失败，不将A或B完成标为142交付。协议或数据范围变更先更新本设计并提交。

## 12. 正文规模的原始初查

141固定实际编译的15讲/60微课已只读遍历。按id/title/objective及每个step的id/title/phase/narration和block的id/kind/text/items/table/diagram/code白名单提取，最小8703、最大10185字符。soc-u1-l1为26步、其余各24步。原初查在`data/qa/142-adult-teaching-budget-preliminary.json`，仅证明现有教学资产规模，不代表142完整assistant contextJSON已通过18000限制；真正投影还须加入课程身份、选择、来源、范围声明与系统上下文再计算。图片以受控描述表达，不伪称模型已读取图片像素。该初查不调用模型、不读题目/答案/提示函数，不写正式学习数据。

## 13. 两条模型通道与出处的一致性

已核对`ai.service.ts`：当前Xiaojiu通道会区分lecture/independent/learner，旧OpenAI兼容通道仍固定小学陪伴提示词。142抽取共享教学系统指令构造器，两通道按真实上下文采用相同角色、资料边界和输出结构；两个provider的mock调用各要核对成人/小学/资料课原始完整JSON，不以真实默认CLI成功替代另一通道契约检查。独立成人学习继续自然讲解，诊断/原题帮助保留原证据与答案保护。

输出格式扩展为reply/evidenceIds及可选sourceKeys；不要求旧响应或规则输出虚构课程来源。输入sourceKeys只取已冻结可见片段的短稳定键，服务端转换为`sourceReferences`可信对象，拒绝未知键、模型自造URL/标题/页码或把课程键塞入evidenceIds。模型响应schema、最终AssistantReply schema、落库消息、worker结果、insight及导出必须同步更新，不能只在前端显示假出处。原始题目/报告的evidenceIds约束继续，course解释没有正式作答证据时evidenceIds仍为空。

成人引用按所选微课/教学step定位，图片只含公开描述而不伪称模型看过图；小学引用按已审核教学卡和atomVersion定位；资料课引用按原safe citation/sourceKey、页码和短摘定位。原快照已有引用就从原快照还原，不允许从当前课程补造旧出处。历史分页及返回链接须覆盖引用对象，公开会话仍不暴露完整snapshot/prompt/owner/scopeKey。

## 14. A层实际实现与边界

独立模块`assistant-teaching-content.ts`已完成三种安全投影、严格持久快照/全教学目录指纹、完整/概览/细选范围及确切JSON预算检查。讲座读取实际steps/逐块白名单，保留图表/代码及图片描述，不读取图片像素；小学只取approved learn卡，保留所有误区与四个核对维度；资料课逐字段取教学正文/短摘和原页版本/范围，不读取questions、原上传text、input提示词或originalResult。该层假定调用方已经授权，不能作为鉴权器独立开放。

完整/概览带全部目标；细选只带所选条目的完整目标，coverage明确记录总/已选知识点与条目，避免全部目标本身超限时连一张完整卡也无法使用。目录指纹仍覆盖本课全部安全教学，未选正文变化也使原版本只读。进度、status、updatedAt、revision及旧混合draft hash不作为教学版本。来源绑定目标/段落，拒绝不一致、重复标识与丢失引用；资料引用的真实性仍承接原课程审核，不假称此层重新读取整页验证。

首轮17项中14过/3失败：概览继承parts至少1条导致两个用例失败，已删细选条目阻止读取有效旧快照导致一例失败。原源/测试/JSON/日志在修复前保留。修复组合82通过；补齐目标本身超限、阶段变化及引用串绑后84通过（19新增投影、5旧讲座、60输出策略），API/测试类型检查与独立API真实编译通过。主目录374编译及本工作区四份contracts/config编译共378控制保持原SHA，没有重建共享依赖、调用模型或正式计量写入。见[原始失败](../evidence/2026-10-28/course-teaching-content-first/receipt.json)与[A层验证](../evidence/2026-10-28/course-teaching-content-verified/receipt.json)。

实际新编译遍历15讲/60微课，全部完整教学快照在18000内，含来源/身份/选择元数据后的最小11394、最大13167字符；这不等于加上其余assistant context后的完整输入已验证。现有v1讲座和正式服务141保持；B层HTTP授权、v1/v2衔接、上下文/worker双栅栏、可信出处发布与隐私恢复，C层前端与D层完整门禁/运行尚待。本批不能记作142可用入口或上线。

## 15. B1成人正文接线、旧v1及双通道指令

独立API代码的新讲座会话已默认冻结classroom-lecture-v2；原有课程/单元/微课概要与完整安全teaching快照共同冻结，外层与内层指纹/身份/目标范围均核对。读取原classroom-lecture-v1仍按其严格旧schema和原摘要原样返回，始终是旧版只读；不会重建或补进当前正文，新发送必须明确打开当前版本。原scope/hash/worker绑定随实际教学内容改变，纯讲稿变更即使课程版本和目标相同，也阻止排队回答发布。当前源正文不一致时可保留有效旧历史，但不能创建不完整的新教学快照。

新增共享`assistant-teaching-instructions.ts`，Xiaojiu与OpenAI兼容通道都按成人正文/成人旧目标/独立学习/学生或家长证据教练选择同一教学指令。普通概念直接讲解、匿名例子/反例/新情境和课程观点/通常学科知识边界保持；成人不再被旧OpenAI小学提示词覆盖。响应此时仍是原reply/evidenceIds，课程sourceKeys/可信出处链仍待B2，不能声称已显示课程来源。

真实编译的AiService.assistantSnapshot遍历15讲/60微课，完整contextJson12266～14050字符，全部在18000内且无题目/答案键；它是匿名结构调用而非认证/供应商测试，实际HTTP另证。最终SQLite/策略/投影/调用组合124全过，PG组合18全过（16HTTP/1PG原生/1SQLite对照），范围重叠。测试包括持久旧v1历史可读而新发/重开409、其他账号404、正文独立变化时worker不调用模型且不发布、原模型/回执/冷重开/原生删除账本恢复。类型检查与独立API编译通过，378控制未变，没有真实模型调用、正式计量写入或生产142升级。

旧行为4失败/2保护、旧双通道指令3失败/3保护原件均保留。首轮组合29/1源目录与例子fixture不一致已保留并提供一致resolver；两次新增测试的类型标注错误也保留。PG首次因默认本工作区不存在凭据文件而在测试前退出，不计测试失败/跳过，第二次使用既有15439隔离QA配置运行，没有复制凭据。见[旧正文/协议失败](../evidence/2026-10-28/lecture-teaching-migration-before/receipt.json)、[首轮fixture](../evidence/2026-10-28/lecture-teaching-migration-first/receipt.json)、[旧双通道失败](../evidence/2026-10-28/teaching-provider-context-before/receipt.json)及[B1完整原件](../evidence/2026-10-28/lecture-teaching-b1-verified/receipt.json)。

正式运行仍141/Fr2r2Kk2ddHCxQhccI7rC。接续B2小学/资料课受鉴权上下文、条件长引用、评测中保护/当前权限/发布与worker栅栏、可信来源键与隐私恢复；C入口/选择/草稿/历史/学生返回，D真实默认样本/完整两端门禁/精确CI/可回退交付保持。B1不能记作完整142或全产品交付。

## 16. B2接线契约与授权实施前补充

新增受现有AuthGuard保护的GET `/ai/assistant/course-context`，入参kind=primary_unit/material_lesson、courseId/itemId，以及可选fingerprint和JSON编码selection；只接受结构化选择，不接收正文或自造档案。返回AssistantCourseDescriptor，包括服务端推导的studentId/subject、published/authoring语境、原教学指纹/referenceId、实际选择/覆盖、预算与全部可选条目以及内部返回href。持久开会话pageContext新增course、contextRefType为这两个kind；仅course类型的contextRefId放宽到400，其余原180保持。新可选contextSelection由严格schema检查，仅讲座或course可以携带，不改变原诊断/练习/计划协议。

新增私有courseSnapshot，协议assistant-course-v1，冻结kind、studentId、subject、published/authoring、teaching快照和外层指纹。外层覆盖档案/学科及发布语境，模型仅接收安全teaching和语境，不接收studentId/owner/prompt/完整上传文。公开session仍白名单，scopeKey继续包含账号/角色/档案/学科/原类型/reference/item；选择已进入教学指纹。同内容发布也使原authoring范围只读。小学只有active/completed的已确认课程可新发；资料课只有有权访问的active发布版，或当前本人ready且draft教案可新发，后者明确待核对且学生不可用。archive/withdraw/discard/替代发布只保留按当前权限可读的本人旧会话，不重新生成旧正文。原sourceCourse的revision、阅读状态等仍不作教学指纹。

AiService调用统一的assistant-course-context解析器；复用StudentsService和assertSourceCourseAccess，始终按实际课程行派生身份范围，再与开会话请求精确匹配。发问/重试/worker heartbeat及发布走现有assistantAuthority→assistantSnapshot，重复检查发布语境、原快照、当前内容和当前权限。userRole=student存在in_progress/paused正式诊断时，自由课程入口返回assessment_in_progress及内部返回评测href，保持原问题；开会话/发送/重试/发布均受限，历史仍按原授权只读。不改变原题帮助的规则提示与assistance记录，不把课程聊天标为独立作答。

共享AssistantCourseSummary/Descriptor及ContextView.course表示新上下文，AssistantTurnService的位置、历史与context一起接入。href只由服务器按现有studio/资料课内部路由和已编码ID构造，客户端不得提供URL；学生移除回其学习页，成人移除回真正独立学习，C层实现。完整JSON预算要包含外层上下文；descriptor预算预留与实际prepare/render一致核对，不能只看某一段。完整/概览保留全目标，细选仅带实际知识点目标，覆盖数字明确。过长选择拒绝并保留问题，不自动换范围。

课程输出另增可选sourceKeys（最多50）；Xiaojiu只在显式courseSources模式使用扩展schema，不放宽原普通聊天/课堂board/presentation协议；OpenAI兼容路径同样严格。未知键、将课程键塞进evidenceIds或模型自造出处属性都拒绝。服务器从prepared冻结正文构造AssistantSourceReference（key/kind/courseId/itemId/title、可选page/quote/sourceVersion、内部href），不能从现行课程重写旧出处。AssistantReply/HistoryMessage、持久消息、worker回执/legacy重放、insight和后续UI/导出均保留可选sourceReferences；缺省旧消息不回填。发布前再次核对来源对象与原冻结出处一致。课程sources不自动生成正式测量、根因、指导或日历。

验证分别包含SQLite/PG真实HTTP：父母/学生/管理员、本人ready和其他人私稿、跨档案/跨账号、长ID条件、所有选择与正文超限、旧历史/缺损快照、sourceKeys伪造与两通道、发布/撤回/归档、原命令重放、并发首次开、队列中评测开始/撤权/正文修改、原生恢复与最新删除账本。所有源引用仍是教学来源，不是学生能力证据。B2、C、D未全部通过并交付前，正式保持141，完整72项与M1～M7不缩减。

## 17. 冻结出处预览的具体补充（实施前）

出处href必须能读取当时实际用于回答的已选教学，而不是无提示地转到改过的现行课程。新增GET `/ai/assistant/sessions/:sessionId/sources/:sourceKey`，仅允许当前登录者自己的会话及当前可访问的学习档案。读取冻结的lecture-v2/courseSnapshot安全投影，不从当前课补造原文；无来源的旧v1和未知key返回404，损坏原件返回409。返回AssistantSourcePreview：可信reference、当前版本状态、实际选择/覆盖、相关安全教学段落及目标。资料课以lesson-citation标明它是本课所用资料短摘，不能伪称逐段都来自该页。此接口只读，不调用模型或改变进度/证据。

AssistantSourceReference记录contextFingerprint以及服务器构造的href（studio中的原会话/sourceKey/课程版本定位）；可另给originHref打开当前可用课程/资料页，UI明确区别“当时的教学出处”和当前课程。路径/标题/页码/版本/quote全部从prepared的冻结快照派生，模型只返回sourceKeys。C层加载预览时先核对原会话和身份，不能因打开出处擅自创建新会话或丢原草稿；学生不被送入成人独立模式。预览关闭、刷新和返回保留原会话/选择/焦点，来源更新后原引文仍保持。

## 18. B1首次精确远端失败的原始记录

42ad7f0/40622126236已全部终态：application/PG success，browser failure。原始报告实际433例，432通过，1例失败并重试仍失败，故434次尝试中2失败、1重试；不能记全绿或零重试。Linux API1639通过/73环境跳过。失败是保留旧讲座的浏览器fixture从新v2快照只改外层description并重算外层SHA，却保留旧teaching.description/catalog identity，运行校验正确拒绝。修复fixture生成完整一致的旧教学版本，另外覆盖真实旧v1格式；保留生产完整性检查和原历史/不新建/不重发断言。全日志、原报告/截图/trace及精确Git原源见[首次精确CI原件](../evidence/2026-10-28/course-b1-ci-first/receipt.json)。当前B2未归入这次CI结论，正式141保持。

## 19. B2a课程权限/持久会话与浏览器fixture修复

已实现GET course-context与course pageContext，primary_unit/material_lesson的严格输入/条件400长引用、服务端档案学科派生和匹配、private assistant-course-v1快照/全模型上下文预算、本人ready作者语境与已确认发布语境、实际选择和覆盖、原版历史/分页/内部返回定位。未知字段/伪造快照/错档案/错学科拒绝；新发及task原授权/原模型/发布栅栏继续。资料课发布即使正文不变也使旧authoring只读，归档/撤回不重建旧版。学生正式评测in_progress/paused时新入口/发问/worker被阻断并提供评测返回，旧历史可读且标明canSend=false。仅为学生新增精确GET course-context白名单，成人讲座接口仍403。

新增18条实际HTTP覆盖父母/真实学习码学生/持久管理员fixture、其他家庭及其他监护人的私聊隔离、245字符引用而旧引用仍180、完整正文/无私稿题目原上传全文、ready/published、评测开始后排队失效、正文在供应商运行中变化后拒发、两实例同scope/同命令去重、撤权后不能重试原授权但可显式新命令、监护绑定撤回、冷重开、损坏原件和超限完整/细选。SQLite与相关旧控制组合71通过，独立真实PG18通过，类型检查与本工作区contracts/API构建通过。mock provider调用与真实CLI资格分开，本层没有真实模型启动或生产数据写入；合成诊断状态仅用于边界fixture，不生成能力结果。

首轮12/3因为新GET未加入学生默认拒绝白名单，修后67/1是未注册网址实际404却被测试期望403；两轮原件保留，后者只改未注册路径预期，真实成人接口403不变。测试中未声明类型的CJS provider导致unknown编译错误亦留证并改为真实provider类型。原件见[首轮](../evidence/2026-10-28/course-session-http-first/receipt.json)、[路由fixture](../evidence/2026-10-28/course-session-http-second/receipt.json)及[权限完整专项](../evidence/2026-10-28/course-session-authority-verified/receipt.json)。新PG runner只读取既有15439 QA配置，专用CI PG步骤接入，不复制或公开凭据。

B1远端fixture现由完整freeze函数生成一致旧v2，另显式构造严格旧v1，生产校验没有放宽。实际浏览器18项/18原始尝试全部通过、零失败/跳过/flaky/重试，383个固定输入原SHA保持；包含两种旧版读历史、原草稿/原请求、身份切换、导航往返和不自动POST。QA Web仍真实07EJTat-vlUXvvAcBPNV4，无前端Git变化；这不是新course UI验证或全站回归。见[实际18项](../evidence/2026-10-28/course-lecture-fixture-browser/receipt.json)。

生产独立验收最后仍是141；但执行隔离检查时发现主目录另一组化学课程源码/构建同时变化，原376控制中的31份主目录产物已不同。两目录realpath不同、主目录没有本批courseDescriptor代码，化学改动均保留，没有执行主目录恢复/构建/部署。因此不能沿用“主目录编译仍全SHA保持”的说法；原141收据是历史交付，之后主目录交付必须重新核对并协调，不能覆盖其他任务活跃输入。并发状态原件在权限收据中。

此时sourceReferences只是已预留共享契约，尚未实现模型sourceKeys解析/可信出处生成落库/原出处预览，不能记作已有来源展示；B2b及原生course恢复、C完整入口/选择/草稿/出处交互、D真实样本/完整两端/精确CI与新鲜可回退交付继续。新增路由/类型的整体设计总册将在完整接线后刷新，不用141静态验证冒充当前源码覆盖。原72项与M1～M7、教师/实机/像素/DPR/原声/全内容/真实间隔门槛均保持。

## 20. B2b可信出处、原文预览和原生恢复

已按第16～17节接通三类教学的可选sourceKeys与服务器构建的sourceReferences。模型只能返回本次已选正文实际关联的短key；重复key按原顺序去重，未知key、未带入的段落、把课程key混进作答evidenceIds、模型自带出处对象/URL/页码均不能发布。Xiaojiu仅显式courseSources启用扩展schema，普通聊天/board/presentation保持原协议，混用在CLI启动前拒绝；OpenAI兼容通道使用同样的教学指令和严格输出。发布阶段再次比对prepared冻结快照派生的完整出处，不能用供应商返回的地址或现行课程回填。

AssistantReply、持久assistantMessages、分页历史、insight及两条legacy原请求重放分支均保存可选出处。原消息没有出处就保持没有；旧lecture-v1不补正文或伪造引用。sourceVersion对小学来自原atomVersion，对资料课来自原sourceVersion，讲座来自原课程版本；contextFingerprint记录外层授权教学身份。教学引用仍不是独立作答、掌握程度或正式诊断依据，不产生新的计量结果。

已实现受鉴权GET `/ai/assistant/sessions/:sessionId/sources/:sourceKey`，学生仅增加这一精确GET白名单。只读取本人当前授权会话的冻结安全投影，返回实际选择/覆盖及与该key关联的段落和目标；细选不能借此读取未选正文，overview不能冒充已经带入正文。资料课以lesson-citation标识本课所用短摘，来源页不等于所有讲解逐段都来自该页。现行课程编辑后原引用/段落保持，current=false；其他监护人私聊和未知来源404，损坏原件409，无旧v1正文404。href指向原会话/来源定位，originHref单独表示当前课程；C层仍需完成可见预览和往返，不能据API存在宣称该链接界面已交付。

SQLite专项75通过；包含三种来源的原预览、真实学习码、两种provider、未引用旧回答、发布前伪造属性、原请求重放/冷重开和范围保护。真实PG课程HTTP23通过；随后含SQLite对照和实际PG原生恢复的组合25通过，重叠范围不相加。恢复使用独立空根/独立临时数据库、真实backup/restore和当前删除账本：恢复原课程快照/原出处/原回执；作者删除清除其私稿、成人资料及本人所有相关会话/排队任务，同时另一监护人的已发布课程与安全快照继续可读；再删除孩子后，将最新两条删除记录应用到原旧备份，原会话、快照、出处、turn/message/insight不能复活。家庭导出保留本人授权快照与引用，排除另一监护人私聊、prepared和内部授权；作者自己原资料的合法导出与新助教安全快照是不同范围。

原先4项未实现红色基线保留；第一轮38通过/1失败是新增测试在倒序分页把用户消息当回答，改为按sender选取，不放松产品约束。原生首轮0通过/1失败/1环境跳过是测试误将作者自己资料的导出全文也列为禁止，缩小到新增助教快照/消息/insight后通过；另一监护人私聊排除断言保持。新unit fixture类型联合需要显式v2缩窄，首次类型失败亦保留。所有合成provider/CLI transport替身与真实CLI分开，本轮尚无142真实供应商调用。

完整API已串行执行结束：180组通过/11组环境跳过，1690项通过/0失败/66项环境跳过，实际1335.01秒；955份本工作区API源码/产物、contracts源码/产物及运维/CI输入在完整运行前后全SHA保持。整套结束后仅移除contracts源末尾一条多余空行，业务文本完全相同，未在活跃运行中改源。前后端类型检查、独立contracts/API构建及3845条文档链接检查通过。见[来源与双库专项](../evidence/2026-10-28/course-sources-verified/receipt.json)、[完整API原件](../evidence/2026-10-28/course-sources-full-api/receipt.json)、[初始未实现基线](../evidence/2026-10-28/course-sources-before/receipt.json)、[首轮分页fixture](../evidence/2026-10-28/course-sources-first/receipt.json)和[原生首轮及类型原件](../evidence/2026-10-28/course-sources-native-first/receipt.json)。C完整入口/选区/草稿/出处往返、D真实默认样本/整站/新精确CI及主目录协调交付仍待，完整72项与M1～M7继续。

## 21. B2a精确远端通过与登录参考复核

8c53da7/40631645799已全部终态，application、postgres、browser三组success。实际浏览器报告434例/434原始尝试全部通过，零失败/跳过/flaky/重试，包含先前失败的完整一致旧v2与旧v1历史fixture。这次远端只覆盖B2a代码，不能作为B2b来源/恢复或C新入口的证据；完整原日志、报告和指定Git源码见[精确CI原件](../evidence/2026-10-28/course-b2a-ci-verified/receipt.json)。

用户重新登录后，原社会学白板/图/表和历史已实际读回。现有笔记按钮能展开对应板书；设置含六种音色、0.5/0.75/1/1.25/1.5/2六档语速、手写/标准字体、点阵背景和重播导览。当前练习采用匿名情境分类加理由。此轮只读已有状态并打开/关闭设置和展开历史笔记，没有新发对话、作答、上传、音频生成或执行代码；静态恢复状态不证明逐句时序或真实听感，也不能视作全课程/像素/CSS完整捕获。见[登录后实际页面原件](../evidence/2026-10-28/hyperknow-course-resumed-observation/receipt.json)。

## 22. C层页面接线与导航细则（实施前）

现有StudioInstantAssistant成人讲座保留为独立分支；新课程助手组件处理primary_unit/material_lesson，并统一复用AssistantWidget及持久会话hook。URL使用audience=course、courseKind/courseId/courseItem/courseVersion及可选courseSelection；由受鉴权descriptor补齐服务端档案/学科、选择与版本。不得把工作台已有course详情参数或上次选中孩子当作课程授权。没有显式档案时可按descriptor补齐；已显式选择另一档案/学科时阻断发送并提供切回操作。成人资料课明确独立学习，学生不能移除后进入成人模式。工作台处理home/instant时优先该页面意图，避免残留course参数强制打开详情。

工作台到资料/日历以及返回、刷新、浏览器前进后退必须保留完整课程参数和明确选择；切换档案保留课程身份并显示不匹配，不能在另一个孩子卡片下继续发送。范围选择单独审阅complete/overview/detail，逐知识点分组展示全部part，应用时使用descriptor重新预检并明确新scope；原问题留在原scope，提供整段副本带到新范围的显式操作。过预算仍可编辑和下载原问题，不创建不完整会话、不自动裁切正文或改用overview。选择器错误/取消保留原选择与草稿。

扩展hook只读原会话分支到course，逐字段核对location的pageContext/type/reference/item/student/subject，使用原会话GET，不因旧版/评测阻断而POST新会话。旧版只能读取；当前评测中可读原历史且显示评测返回，首次入口被阻断时提供学生评测入口。学生移除返回自己的课程或学习页；父母移除进入无孩子的独立模式。选择历史时不展示无关当前课程卡。现有原键/原模型/取消/重试/晚到与身份epoch协议保持。

出处使用服务器给出的内部href展示为独立的教学来源条目。打开assistantSourceSession/key时先进入只读预览分支，仅GET原出处；不挂载会创建会话的Widget，不自动调用模型。来源预览显示当时选区与覆盖、当前/原版、资料短摘与相关教学块，图表/代码以现有受控组件和纯文本表达，不执行HTML或教学代码。返回原对话保留版本/选择，并定位原消息和键盘焦点；另设打开当前课程链接，不能用现行课替代当时原文。错误、换账号及不可读来源关闭旧内容，支持显式重读。

入口放在小学课程当前单元和资料课每个已确认课时，本人ready教案也可带作者语境进入；其他私稿与学生未确认课无入口。保留当前reference CSS、字体注册器与Hero资产，不另引字体加载器。验收包含实际父母/学习码账号、390/768/880/1440、两种课程入口、旧版/范围超限/完整问题保留、档案切换/历史/工具往返、直接打开出处无POST、原引文/原消息返回和登录晚到。先以真实浏览器红色行为基线保留缺口，再补交互，不以接口专项替代新页面验证。142完整C/D门禁和总目标不缩减。

## 23. C1出处页面与历史返回的实际实现

已实现回答中的可信教学出处入口及独立AssistantSourcePreviewPanel。来源链接只接受内部路径，必须绑定本条消息的sessionId/sourceKey；打开source参数先进入只读预览，不挂载会创建会话的Widget。页面按原来源返回的实际段落显示叙述、知识要点、完整表格、受控关系图和全部标注、原样代码及图片文字说明；不运行教学代码，不将图像描述冒称原像素。仅合并与段落标题完全相同的重复显示标题，原API快照不变。当前版本状态、作者语境、原页/短摘、实际问答选择与本条出处关联范围分别显示，打开当前课程另设入口。

原出处未通过授权或读取失败时清除内容，提供具名中文错误与明确重读；此时只有返回学习页，不能用“返回原对话”创建另一账号的新会话。原内容读回成功后才显示返回原对话。返回采用完整原路由以重建Studio本地状态，保留原scope草稿；hash只存原消息ID，初始化按该ID读取受鉴权历史anchor，保留分页游标与“恢复最近消息”。较早回答不再被最近25条覆盖；焦点只交还一次，显式回到最近消息会移除旧fragment，刷新亦保持最近视图。

字体继续使用原受控注册器，覆盖静态标签、错误以及全部表格/代码/图片/图标注文字，没有增加字体加载器。回答出处样式归AssistantWidget，在别的学习页回看历史也能加载。独立构建Jcr_j0P3x9ZXlBAYuOW7D，Web类型检查通过，实际23条/23原始浏览器尝试全部通过、零失败/跳过/flaky/重试，820份源码/编译与固定输入在运行前后全SHA保持。包含5项新出处旅程及原18项讲座/历史/原请求/导航控制；新旅程覆盖直接/刷新无助教POST、原草稿及原消息焦点、390完整表格和逐字节代码/无执行、实际其他账号404/无内容/无原对话动作，以及早于70条历史的原回答定位和恢复最近/刷新。看过实际390截图，不将其作为所有状态/设备/DPR/像素对照。完整发现为439例/42文件，此处没有执行全部439。见[最终页面原件](../evidence/2026-10-28/course-source-ui-verified/receipt.json)。

原缺口2/2失败、首轮19/1的Next Link只改URL不更新本地视图、第二轮21/1的告警定位和语言预期、以及较早消息4/1失败均原样保留，修复未改后端权限。阶段22/22与字体22/22也分别保留，不和最终23相加。见[原页面缺口](../evidence/2026-10-28/course-page-before/receipt.json)、[首轮](../evidence/2026-10-28/course-source-ui-first/receipt.json)、[第二轮](../evidence/2026-10-28/course-source-ui-second/receipt.json)、[阶段通过](../evidence/2026-10-28/course-source-ui-third/receipt.json)、[字体通过](../evidence/2026-10-28/course-source-ui-fonts/receipt.json)及[旧消息原失败](../evidence/2026-10-28/course-source-old-anchor-before/receipt.json)。

此外已扩展Widget的course类型/选择传递与只读原会话精确字段校验、工作台导航参数白名单及home/instant优先级，属于C2接线基础；不能据此宣称小学/资料课入口、选择器、档案/评测阻断或学生退出已在页面完成。C2继续实现这些完整流程和真实学习码浏览器验证；D真实默认样本、完整439及之后新增旅程、新精确CI和主目录协调/可回退交付仍待。本轮未新增真实CLI或正式测量，也未部署主目录，完整72项与M1～M7保持。

B2b精确9c61928/40638340785已三组success：Linux API1682通过/74环境跳过，课程PG25通过，434浏览器/434原始尝试全过且零重试；它覆盖B2b代码，不包含本节C1界面。当前C1没有改动该head的API/contracts业务源码，完整本地1690/66及其编译连续性按原范围继承，不冒称重新执行。原CI日志、实际报告和指定Git源见[来源后端精确CI](../evidence/2026-10-28/course-sources-exact-ci/receipt.json)。

## 24. C2具体页面状态与问题副本（实施前）

新StudioCourseAssistant使用原course-context接口预检、原Widget和模型目录，分别支持小学单元、学生/成人资料课与作者ready教案；首屏及每次选择都校验返回身份、档案/学科、原指纹、全部目标/条目和内部链接，再允许创建会话。parent/admin角色仍沿原parent助教语义，student沿真实学习码身份。只读course优先descriptor的原sessionId，必要时仅可使用同账号同scope已有的本机sessionId，并GET逐字段核对；不从别的课程/孩子缓存借用。

范围弹层列完整/概览/逐条细选，按全部知识目标分组列出全部可选part，原文超预算不能创建会话，但原范围输入仍可编辑/下载。用户先明确核对范围，再应用可发送的返回结果；每种版本/选择独立scope，原稿不覆盖。可勾选把当前整段问题复制到新范围：副本仅以随机标识进入URL，正文留同账号sessionStorage并绑定目标reference/item；原scope本机草稿始终保留。新范围已有草稿时不能自动覆盖，只在用户明确保留/下载当前稿后替换，亦可放弃副本。换账号、无效副本或目标不匹配不能读入。

每次发送原命令前读当前context.course.canSend；进入评测或原课程变化时阻止新命令并保留整段问题。手动读取最新状态会重新核对该范围，不能自动换课、换模型或把失败请求重发。ApiRequestError只补充承载已有受控error.details，课程页面从中提取并严格检查评测内部返回href；不改服务端评测/作答/评分规则。旧v1讲座和非course对话控制保持。

工作台URL没有显式档案时可按服务器预检补齐；显式选择另一档案/学科时保持原课程参数、隐藏旧内容并显示切回操作。成人资料课按预检补齐独立语境。SourcePreview另GET原session/context核对来源reference及当前页面档案/学科；沿用不含studentId的原出处DTO，避免为了页头增加泄露字段。档案不匹配时不能显示教学内容，只允许明确切回；换账号及晚到响应继续按epoch/Abort边界清除。

页面入口与完整范围在实际浏览器先留缺口，再验证父母/真实学习码、本人ready/其他人私稿、完整/概览/细选/超预算长问题、原稿副本与新范围已有草稿、版本更改/历史/出处、档案/学科切换和资料/日历往返。隔离fixture只提供匿名教学和受控状态，模型调用用替身；不把fixture评测状态当正式测量结果。完整C/D与439及新增全站、真实默认模型、精确CI和协调交付继续，不以C2局部用例替代完整产品目标。

## 25. C2课程入口、范围与真实学生流程

已实现小学单元“获取单元帮助”、已发布资料课及本人ready教案“获取课时帮助”。新StudioCourseAssistant先读取受鉴权descriptor，严格检查实际类型、档案学科、教学版本、全部目标/条目与内部返回路径，再创建对应持久会话；没有显式档案时按服务器补齐，显式档案或学科不符时隐藏原内容并提供切回，学生不能切入成人独立会话。工作台切换档案保留课程参数，资料/日历往返及刷新保留完整scope；独立成人资料课不会继承自动选中的孩子。来源预览还只读原session/context核对当前档案与来源身份，不增加公开出处DTO的学生字段。

完整/概览/细选在弹层逐目标列出全部教学条目，应用前明确预检完整JSON预算。超预算不创建会话，输入仍能编辑和下载；应用新范围使用独立scope，保留原草稿。可明确复制整段问题，URL只含随机副本ID，正文在同账号sessionStorage绑定目标reference/item；目标已有草稿先保留，用户可下载当前稿后采用或放弃副本，采用/放弃后释放暂存副本。原问题和新稿的刷新/后退/前进分别恢复。弹层关闭取消原预检，迟到响应不改变选择并恢复触发按钮焦点。

只读原课程沿原session或同账号同scope本机已知session GET逐字段校验，没有就保留问题而不创建新会话；发送前检查当前context.course.canSend并禁止学生正在正式评测时发出新模型命令。已有评测入口返回准确原评测链接；从评测返回保留原问题和历史，评测结束后显式重新核对才恢复发送。重新核对入口持续可用，避免descriptor与较新context跨越评测结束时按钮消失。只读提示区分旧教学版本与评测期间状态；后端评分/作答/测量规则没有改变。学生移除课程返回自己原课程，原草稿可后退恢复；未发布资料私稿没有学生入口也不能直链创建对话。

实际Web独立构建tFuILN_vmOeroJihJ_1zf，类型检查通过，40条/40原始浏览器尝试全过，零失败/跳过/flaky/重试，824份固定源码/编译/fixture输入在运行前后全SHA保持。两种课程入口分别390/768/880/1440含受控字体ready检查；112条/16目标的超预算完整范围可选最后一个目标，完整问题复制后原范围仍保留；原稿冲突需显式采用；真实学习码在390打开小学与学生资料课、读取原出处、退出和拒绝私稿；真实有效正式评测在进入课程后创建，预发检查没有POST新turn，问题完整保留，原评测页面实际可读，隔离评测abort后重新核对恢复发送；新入口遇已有评测不创建会话；工具往返和预检取消晚到也通过。看过实际390页面截图，未据此声称全部状态像素/DPR/教师/听感通过。

初始5通过/2缺入口、阶段32全过、扩展35通过/2失败和最终40分别留证，范围重叠不相加。扩展的真实缺陷是评测结束后更新context覆盖blocked而旧descriptor仍只读，原重新核对按钮被隐藏，已修为固定入口；另一失败是测试把内嵌Home按钮定位为链接，只修语义定位。所有原报告/截图/trace保留。见[入口原缺口](../evidence/2026-10-28/course-entry-before/receipt.json)、[阶段32](../evidence/2026-10-28/course-entry-first/receipt.json)、[原35/2](../evidence/2026-10-28/course-entry-second/receipt.json)及[最终40原件](../evidence/2026-10-28/course-entry-third/receipt.json)。

C1精确cc9a3d5/40647352222现已三组success：Linux API1682通过/74环境跳过、课程PG25通过、439浏览器/439原始尝试零失败/跳过/flaky/重试，原日志/报告/Git源见[C1精确CI](../evidence/2026-10-28/course-source-page-exact-ci/receipt.json)；这不是本节C2代码的精确CI。本节未改API/contracts业务源码，原完整API1690/66范围继承不冒称重跑，未新增真实CLI或正式用户数据。当前整站发现456例/42文件，后续开始完整执行、刷新源码总册、三类匿名真实默认模型、最终精确CI及与主目录化学开发协调的可回退守护交付。原72项11 implemented/50 in_progress/11 planned/0 verified和完整M1～M7继续，C2局部通过不代表142或全产品完成。
