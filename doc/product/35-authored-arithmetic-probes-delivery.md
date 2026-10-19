# 分解、加减与乘除的补充测量素材

2026-10-20，接续 `f4f1657`。本批覆盖 KG-02/03、ASSESS-02/04/05/06、DIAG-03 的五个基础算术知识点，继续补充真实对照素材与升级证据。

## 任务与可观察行为

新增240道原创任务，20种补充任务结构，每种12题。十的分解等式继续沿用原 `part-whole-symbol` 题族，不能把文字改成等式或改变输入控件算成新独立题族。其余结构分别记录目标行为、任务关系与原题区别：

- 十以内分解：分解等式、总量守恒检查、遮挡集合、整体与部分的关系模型选择。
- 20以内加法：凑十分配的中间步骤、凑十守恒核对、不重叠分类清单、数线连续向右移动。
- 20以内减法：逆向合并核查、先减到十的分段步骤、数线向左移动、含无关记录编号的库存变化。
- 表内乘法：因数在情境中的角色、重复加法的乘法模型、空间圆点阵列、等步长跳跃。
- 表内除法：平均分守恒、公平发放轮数、等长跳跃、连续长度平均分。

多空题保存每个位置的表现，其余使用判断、选择和数值协议。各题含实际解法分析。结构区别仅是教研描述，尚无真实学生统计独立性或标准化常模校准。

## 历史与内容身份

本批沿用v2内容身份，将题面、答案、协议、表格与选项纳入标识。原3435题和前一批192题各自完整快照保留；未调整历史v1标识、题族、维度、题面、答案或交互来填覆盖。既有编辑、来源说明和草稿映射继续保留，启动只补缺失的新题与映射。

当前256点均有教学卡，原创任务共3867道；9点已有基础与迁移各两种不同任务关系的完整对照，仍有247点存在至少一种素材深度缺口。教材课时对齐、知识覆盖广度和真实学生测量效度单独验收。

## 验证与收据

新增9项测试：从题面与表格独立求解数学关系、枚举模型干扰项、数量守恒、所有作答协议的正确/错误评分、旧内容快照、同族保留及五点实际组卷。相关内容与协议30项通过。完整默认回归232项通过、0失败、6项PostgreSQL专项默认跳过；该6项另行实机全部通过。API生产构建与全仓类型检查通过，本批未修改Web或共享契约。

SQLite与PostgreSQL各自通过生产模式真实HTTP：正式管理员引导、学习码学生、9点逐点评测及冻结核查、实际独立作答、并发、暂停恢复、提示排除、重评与历史保留。各库构造旧3435题状态后升级，五类旧记录规范化哈希一致，故意保留的已有编辑和草稿映射未被覆盖；累计432道新题与432条映射仅补一次。各库共五次重启。对照观察完整仍不能直接标为稳定掌握，原门槛没有降低。

```powershell
node scripts/qa/audit-authored-curriculum.cjs data/qa/arithmetic-probe-content-audit-rerun.json
node scripts/qa/verify-verification-groups.cjs data/qa/arithmetic-probe-content-runtime-rerun.json sqlite content-upgrade
node scripts/qa/verify-verification-groups.cjs data/qa/arithmetic-probe-content-pg-runtime-rerun.json postgres content-upgrade
node scripts/qa/verify-storage-performance.cjs arithmetic-probe-content data/qa/arithmetic-probe-content-performance-rerun.json
```

本机合成负载为1000家庭、2万证据及3867道当前原创任务。三个顺序读取接口p95为16.08–47.19ms，8并发身份读取p95为72.70ms，满足该样本500ms目标；不能外推为生产容量。源码指纹与内容审计、两库运行收据核对一致。

六份证据归档在 `doc/evidence/2026-10-20/arithmetic-probe-content-{audit,performance,regression,postgres-regression,runtime,postgres-runtime}.json`；不覆盖前一批收据。浏览器仍因操作结果未知而待验证，其余教材、247点素材、当前候选跨环境复验与52项最终交叉验收继续，持续目标保持active。
