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
