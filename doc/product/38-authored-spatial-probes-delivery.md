# 图形、立体与整时的补充测量素材

2026-10-20，接续 `e0c582c`。覆盖 KG-02/03、ASSESS-02/04/05/06、DIAG-03，补齐当前一年级原创数学路径最后三个点的基础/迁移任务结构。

## 任务与教学图

新增79道原创任务，分为12种补充结构，其中3种沿用已有题族：

- 平面图形25题：名称主张核对8题、边角计数4题、剪分后重建边界4题、同时核对规则前提与结论9题。
- 立体图形15题：整体名称核对6题、完整表面分类3题、平底面印迹及不适用条件3题、滚动与支撑双条件3题。
- 整时39题：实际钟面读数12题、指针职责2题、遮挡下的信息充分性13题、按目标只修正一根指针12题。

题数由实际任务决定，没有要求每组凑够12题。立体共用一张三模型卡；只能看见长针指12的情形只留一题；已有正确钟面被设置任务复用，不改文件名扩成新图。名称核对在每个图形上同时包含正确和错误主张，避免图形种类决定答案。整时设置明确为可单独拨针的练习盘，不把不符合真实走钟联动的教具状态称为当前时间，也不混入时长、加减或时段判断。

43张原创SVG位于 `apps/web/public/question-assets/spatial-probes-v1`，合计84,497字节，全部按内容去重、实际解码并检查五张联系图。等长、直角和切线标记对应真实几何关系；钟面两针长短固定，粗细和颜色交替，不能靠较粗的针猜时针。遮挡提示置于钟面外，12个数字均保留。生成器与已交付文件逐字节一致，无脚本、事件、外链或外部字体下载；该目录通过Git属性固定LF，避免Windows检出改变校验字节。

替代文字提供同一数学条件，边角计数通过顶点序列表达而不直接给计数答案；遮挡题不泄露被遮住的针。文字与图形表示不能证明视觉感知测量等价，本批不据此推断视力、注意力或空间障碍。任务结构区别也不等于真实学生统计独立性或标准化校准。原有4347题的标识、内容、题族、协议与分析完整快照保留。

## 验证与运行

新增12项测试，从实际SVG读取多边形与指针端点，独立完成半平面剪分、面积守恒、边长与直角核查、遮挡信息核对及拨针执行；同时核对立体表面、平底面条件、双条件唯一性、全部正确响应与每个合法干扰项的正式协议及评分。素材耗尽时对照组保留缺口，题族和稳定掌握门槛不降低。

最终默认全量261项通过、0失败、6项PG专项默认跳过；该6项另行PostgreSQL实机全部通过。API/Web生产构建和全仓类型检查通过。CI新增原创SVG解码检查，远程CI未运行。

SQLite和PostgreSQL分别使用正式身份、生产模式HTTP和限流，完成22点首测→原因假设→对照预览→独立作答与核查报告；对照完整不直接升级为稳定掌握。两库还验证并发开始、提示证据排除、评分修订、旧报告/蓝图与草稿保留，以及五次重启。原3435题的五类原记录和既有编辑保留，四批累计991道新题及991条映射只补一次。

```powershell
npm run build --workspace @study-agent/api
node scripts/build-spatial-probe-assets.cjs
node scripts/qa/verify-spatial-assets.cjs data/qa/spatial-probe-content-assets-final.json
node scripts/qa/audit-authored-curriculum.cjs data/qa/spatial-probe-content-audit-final.json
node scripts/qa/verify-verification-groups.cjs data/qa/spatial-probe-content-runtime.json sqlite content-upgrade
node scripts/qa/verify-verification-groups.cjs data/qa/spatial-probe-content-postgres-runtime.json postgres content-upgrade
```

当前256点、4426道原创任务，22点具有完整基础/迁移结构；仍有234点至少存在一项素材深度缺口。当前一年级原创数学16点均有这些结构，这不表示一年级教材全部内容已覆盖。本机1000合成家庭、2万证据、4426任务样本下，顺序读取p95为9.95–29.12ms，8并发身份读取70.81ms；不外推生产容量。

七份收据归档为 `doc/evidence/2026-10-20/spatial-probe-content-{assets,audit,performance,regression,postgres-regression,runtime,postgres-runtime}.json`。五张原创内容联系图在同目录 `spatial-probe-content-images`，属于本地教学图检查，不是浏览器页面验收。浏览器阻断仍未解除；教材审核映射、其余素材、当前候选跨环境和52项最终逐项验收继续，总目标保持active。
