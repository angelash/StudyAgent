# 168 选题、导出原命令与原生恢复协议

2026-10-31。接[166产品行为](166-selected-question-exports-and-paper-review.md)、[167实际工具](167-paper-export-runtime-and-book-capabilities.md)及150的R5。本协议先提交，再实施。当前应用31、正式24；32未注册，最终31读取器已封存并实际运行。

## 作者、范围与准确来源

scope为严格联合：`{kind:'private_preparation',studentId:null}`供有效成人本人备课，或`{kind:'student_self',studentId}`供当前有效学生账号对应的本人档案。家长选择孩子的参数不能代替学生授权；私人备课不生成孩子曝光。清单和导出仅作者本人可读写，不能通过复制URL转移教研资格。跨学科仍必须同一作者/学生范围。

原命令保存authorization：actorRole、actorVersion以及learningAccess；成人learningAccess必须null，学生必须为准确studentId、guardianId、accessVersion。执行和下载另行重核当前授权，原身份快照不授予永久访问权。

准确source保存paperId、position、sourceQuestionId、detailSha256、publicationVersion、title、originalPage；originalPage仅核实过的正整数或null，首批为null。另存research。去重键为`[paperId,position,sourceQuestionId]`，不按文本或包hash合并。服务端从实际原卷核对题ID、题位、摘要和发布版本；客户端不能提交正文/答案、媒体路径、标题推断或私人作答。缺题不可选择，整卷PDF无可靠题位映射时保留原阅读/打印。

sourceQuestionId必须是catalog的完整question_key（含`paper:`前缀），不能传预览页的裸UUID；现有测量候选及原卷练习也使用完整键。实际原卷detail的UTF-8完整SHA须与索引和原请求一致；单份原始detail读取上限64MiB，不能仅信索引，也不从另一份题库题目猜补缺失原件。同卷选题必须同一摘要/发布版本，每份清单最多1000次完整修订，达到上限保留原稿并明确另建清单，不截断旧历史。

## 六个原生集合

所有对象严格校验额外字段；规范JSON hash为递归排序键后SHA-256，实际文件SHA针对完整字节。原字符串不trim后冒充同一请求，UTC时间由服务端固定。原input、原result与当前视图分开读取。

`paperSelectionLists`保存protocol=`paper-selection-list-record-v1`、id、actorId、scope、createdAt、updatedAt、revision、history。history每项为revision、commandId、at、previousFingerprint、snapshot、fingerprint；首项previousFingerprint=null，其后准确接前项指纹。snapshot为完整title和有序items，每题为id/source/research，id由准确题位身份决定。revision从1连续并等于history长度，当前仅取最后一项，不保存可漂移的第二份current。空清单合法，最多100题、10卷。移除/清空增加修订，保留旧历史。

`paperSelectionCommands`保存protocol=`paper-selection-command-record-v1`、id、actorId、scope、authorization、requestKey、requestHash、input、at、result、resultHash。input严格联合：create含kind/requestKey/scope/title/items；revise含kind/requestKey/listId/expectedRevision/expectedFingerprint/title/items。客户端items只含paperId/position/sourceQuestionId/detailSha256/publicationVersion。result为listId/revision/fingerprint/at。id由actorId/requestKey确定，requestHash绑定actorId/scope/完整input，数据库唯一actorId/requestKey。同键异命令409，同键同命令返回准确原回执；失败保留完整待确认稿，不生成假的已提交回执。

`paperExports`保存protocol=`paper-export-record-v1`、id、actorId、scope、authorization、createdAt、intent、slots。不可变intent含protocol=`paper-export-intent-v1`、listId/listRevision/listFingerprint、document、documentSha256、media、books、formats、commandId、createdAt、fingerprint。document采用166的完整输入，固定题序/正文/选项/原参考/版式；documentSha256针对传给执行器的准确UTF-8字节，区别于intent规范摘要。media每项含id/sourceUrl/paperId/sha256/bytes/mediaType/width/height，实际内容须有界读取并核对SHA，不接受客户端路径。预检仍按册检查各自内容。

slots为books×formats的唯一有序列表，每项book/format/taskId/published。book为practice/answers，format为pdf/docx，各slot一个固定任务。kind=`library.paper-export.render`，payload严格含exportId/intentFingerprint/book/format，payloadHash绑定全文，maxAttempts=3，owner/requestKey绑定原请求。published初始null，成功含fileId/generation/sha256/bytes/pageCount/sourceMap/publishedAt/fingerprint，由同事务完成栅栏一次写入。一个slot失败不改变其他slot。执行器内部为同册生成并检查两格式，slot只发布其请求格式，另一份为本次临时文件。

`paperExportCommands`保存protocol=`paper-export-command-record-v1`及与selection command相同的身份、完整input/result、摘要和时间字段。create input含kind/requestKey/listId/listRevision/listFingerprint/title/layout/books/formats；cancel/retry input含kind/requestKey/exportId/book/format/expectedTaskVersion/expectedGeneration。create result含kind/exportId/intentFingerprint/slots/at，slots每项book/format/taskId/generation=1。control result含kind/exportId/book/format/taskId/previousVersion/generation/at；retry增加真实代次，cancel不增加。唯一actorId/requestKey。当前task version/state另读，不改原回执。

`paperSourceExposures`保存protocol=`paper-source-exposure-record-v1`、id、actorId、studentId、authorization、requestKey、requestHash、input、at、result、resultHash。input含kind(read/selection/export)/requestKey/paperId/detailSha256/publicationVersion/positions/answers/origin；positions为非空准确题位数组或明确document标记，origin为原list/command/export精确ID或null。result含exposureId/sources/document/answers/at，sources为准确来源。id由actorId/requestKey确定，数据库唯一同二者。仅学生本人可登记；保留清单/排队导出时同事务登记相应题位。登记表示可能接触，不证明看过、作答或答对。

`paperExportFiles`独立追踪业务删除后的IO。字段为protocol=`paper-export-file-record-v1`、id、exportId、intentFingerprint、actorFingerprint、studentFingerprint、taskId、generation、token、createdAt、updatedAt、state、workspace、output、cleanupTaskId、deletionReceiptId。state为reserved/available/collecting/deleted。workspace是服务端由task/generation/lease token生成的相对标识，任何IO前先登记reserved；不能包含任意路径。output初始null，发布前含book/format/sha256/bytes/pageCount/sourceMapHash。published只引用同export/slot/generation的available行。失败/取消的非空output必须有原登记检查点证明。私人文件不跨作者共享目录或下载资格。业务删除后不保留题干、标题、原命令或媒体URL，只留非正文定位/摘要及真实删除回执ID用于回收。

## 完整重建与接口

不能只校验字段形状。启动、冷开和迁移前须双向重建：命令→每个历史修订；导出→准确旧清单修订及冻结全文/媒体；task→原请求/slot/intent；发布→真实成功任务的代次/结果；file→实际任务或最新真实删除回执。断链、重复slot、孤立命令、缺作者、假删除凭据或篡改均拒读。

沿用`/library`，新增selection-lists、selection-commands、exports、export-commands、source-reads。清单GET只返回目录/身份/当前可用性；命令POST提交完整create/revise，command GET按原requestKey返回原input/result及当前投影。导出预检POST只读来源、按册能力和预算；create POST同事务重核依赖、冻结全文并入队；control POST绑定准确slot和原taskVersion/generation。

exports GET返回各slot当前安全状态，实际产物仅经`exports/:id/files/:book/:format`读取。下载/预览每次核对当前作者、scope、published、原来源资格/发布版本及文件完整字节。Range读取绑定同一已验证文件句柄及身份，不能hash后重新按路径打开另一份文件。本地路径、Office日志和授权快照不对产品公开。

学生有in_progress正式diagnosticSession时，不新增/修订有内容清单、不登记新正文曝光、不排队/重试导出、不读取正文/参考/媒体/PDF/已生成产物；仍可保留原稿、读取目录、取消及返回原诊断。旧LibraryService.preview/media和原卷练习的正文/参考/打印同样执行，不能仅封新按钮。学生旧预览先走明确幂等阅读命令，再读正文；元数据GET保持只读，不从旧浏览历史补造曝光。成人私人预览继续按本人权限。

候选排除延续paper-exposure：按paperId/position/sourceQuestionId及明确document匹配，不比较导出包hash绕过同源。家长私人备课不写孩子事件，也不改变首答/掌握/复测/计划完成。

## 租约、文件、隐私和恢复

使用现有durable_tasks租约、心跳与TaskOperation。开始、每个IO检查点和最终发布重读原账号/学习权限/来源/代次；先登记独占工作区，再核对input/媒体字节并运行167工具。取消、撤权、关闭、删除、过期租约胜出后不发布，迟到文件只属于原已登记工作区，不能挂入新代次。

控制命令与cancel/retry同事务保存。重试保持原intent/taskId并增加队列generation，用新token/工作区。成功不能重试覆盖产物；另一版须明确新export。来源变化不自动重冻题单。

私人清单/命令/导出随本人账号或所属学生删除。关闭拒绝执行/下载并保留事实；永久删除事务取消任务、移除私人集合、为已登记文件绑定实际PrivacyReceipt并安排cleanup。学生本人曝光属于学生学习事实，删除另一监护人账号且孩子合法保留时不误删；最后学生删除按最新账本清除全部对应范围。任务payload/历史不得残留被删除的私人正文。

SQLite/pg_dump原生备份列出准确input/媒体/产物引用及SHA，工作停止后排除不可验证的进行中IO。恢复先应用独立提供的最新删除账本；任务/文件按真实回执栅栏处理，不从账本补造备份后新清单/曝光。残留任务转中断终态，保留产物逐字节验证。未知文件保留核查，不递归清根或穿过junction；恢复后新执行保持原意图并显式新代次，不恢复旧lease。

32只在新完整关系和迁移事务准备好后注册，正式库不迁移。真实归档31读取器必须拒读32且原行不变；备份、恢复、隐私和应用读取器同时接入，不能只改版本常量。

## 工作台与实施次序

继续复用原资料列表、WorkspaceDialog、抽屉、按钮、焦点返回和退出保护。清单标题/顺序、导出版式和未决命令分别存完整稿，按账号/准确scope隔离。两标签CAS，禁存储可下载完整保护文件；未知结果先读原命令，重试保持原全文/原键。清空是明确修订，来源失效保留原题位和原因。预览展示实际下载产物，保持原筛选、页码、原题/复习返回入口，覆盖手机/键盘。

先实现严格记录、原命令与完整关系重建，再在独立副本注册32、接双库/队列/真实文件/删除恢复，最后接原UI和相称完整回归。各轮原失败保留。167长正文续题仍未通过，须同时验证DOCX/PDF，不能仅补PDF。

R5全部题型、其他错题来源、声音/参考状态，R6全教材/GESP、R7/R8、原72/WS和教师/实机/实体打印/真人1/3/7/14日继续；本协议不提升整体验收。

## 第一批记录与实际来源基础

后续[171](171-paper-library-persistence-privacy-and-native-recovery.md)已把六集合、原命令/关系/当前授权事务、实际隐私删除/监护栅栏及SQLite/PG文件恢复归入主干源码32，实际封存31门禁通过。完整API2552/12/106及对应版本断言复验46/0/8、另批真实PG20/0/1分列；正式库只读副本24→32保留89,864条原业务行及revision187，正式源库和1063运行文件保持。`PAPER_EXPORT_NATIVE_READY=true`仅表示完整原生读取基础准备好；业务路由/实际worker/同句柄下载、学生旧读取防旁路与原UI仍待实施。下述31/未注册状态保留其当时历史边界，全部目标继续active。

后续[170导出记录与真实队列关系](170-paper-export-records-and-outbox-relations.md)补齐不可变意图、准确文档字节/版本编码、原控制命令、实际队列检查点/完成栅栏、文件身份及删除证明严格核对。113项专项和另批既有隐私6项通过；实际PDF/DOCX桥接及页面复核保持。仍是预注册记录层和直接QA桥接，未接六集合正式持久业务/实际删除、业务路由/worker、32迁移或工作台UI；本页下方早期状态按其当时边界保留，完整范围继续active。

严格清单/原命令/原回执、连续修订、准确学生曝光记录和纯原生关系重建已归入主干；实际SQLite源读取核对完整原文SHA、准确题键、缺题、重复UUID和变更发布版本。最终专项82通过/0失败/1项既有PG恢复条件跳过，其中本批35项关系/原命令与6项真实SQLite来源测试；十份准确源码及首次失败见[收据](../evidence/2026-10-31/workspace-r5-native-selection-records/receipt.json)。主干contracts/API无输出类型检查通过。原语法失败保留，后续类型收窄失败未单独保存原始编译日志，证据注明该缺口。

这批没有注册32、写入新集合或接通选题业务路由。`PAPER_EXPORT_NATIVE_READY=false`拒绝忽略尚未实现的导出/文件原生行；持久清单事务、导出记录/真实任务/文件与隐私恢复、学生旧读取防旁路及原工作台UI仍须继续。正式24/revision187及1063份运行文件保持，未推送部署，整体active。
