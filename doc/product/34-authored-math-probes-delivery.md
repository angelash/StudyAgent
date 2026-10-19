# 数位、退位与部分积的测量素材

2026-10-20，接续 `ce2dccc`。覆盖 KG-02/03、ASSESS-02/04/05/06、DIAG-03 的本批内容深度与升级行为，不代表小学三科教材或测量素材已全部完成。

## 明确任务结构

新增192道原创任务，分属16种明确描述的任务结构，每结构12题。结构内改数字不增加题族，每类都记录目标行为、任务结构及与原题的区别，可在源码与内容审计中逐类核对。

- 十进制位值：超过十个一的重新打包、表示守恒核对、库存包装反推、数字卡换位后的数量追踪。
- 个位退位判断：用反例核对判断规则、反向构造需要退位的最大个位、从实物捆与散根作决策、复核他人的中间判断理由。
- 退一作十：联动记录十与一、检查数量守恒、逆向还原换算前状态、把换算迁移到等价减法。
- 多位数乘一位数：十位部分积的单位、联动记录两个部分积与总积、空间分区阵列、复合包装情境下选择完整数量模型。

部分任务直接保留多空逐位置结果，可观察数位遗漏、位置变化和部分积合并的表现，不能把最终得分直接说成已经查明根因。每题含实际解法说明。新增题的确定性评分不依赖模型，基础与迁移仍由不同任务结构形成对照；结构区分不宣称已有真实学生统计标定。

## 内容身份与历史保留

逐题测试发现，仅依据题干和答案的旧标识不足以区分不同表格。新增素材明确采用v2标识，将题面、答案、作答协议、表格/图块、选项纳入内容身份；只改讲解不会改变题目身份。旧v1标识保持原语义，原3435道题的题面、答案、题族、维度和交互整体SHA-256快照未变。

启动时仅补充缺少的新题和映射，不重写已有题目、来源说明或草稿映射。新内容的逐题分析随题保存。知识定义与此前已冻结评测、计划和历史评分保持原版本规则；稳定掌握门槛没有降低。

## 当前覆盖与运行

当前原创任务共3627道，知识点256个。本批4点均可从实际素材安排基础至少两种、迁移至少两种且不跨组重复的对照；按现有结构审计，仍有252点存在至少一种测量素材深度缺口。教材章节、审核映射与真实学生效度另行核对，不能用任务条数代替完成。

SQLite与PostgreSQL分别通过生产模式真实HTTP专项：正式管理员引导、学习码学生、4点各自的评测/冻结核查/实际独立作答，以及并发、暂停草稿、提示排除、重评与历史保留。四点完成对照观察后仍未被标为稳定掌握。各库另构造旧3435题状态，保留既有题目分析、来源说明与草稿映射；升级及再启动仅补充192题和192映射，原五类记录逐条规范化哈希保持一致。总计各五次重启。

```powershell
node scripts/qa/audit-authored-curriculum.cjs data/qa/math-probe-content-audit-rerun.json
node scripts/qa/verify-verification-groups.cjs data/qa/math-probe-content-runtime-rerun.json sqlite content-upgrade
node scripts/qa/verify-verification-groups.cjs data/qa/math-probe-content-pg-runtime-rerun.json postgres content-upgrade
node scripts/qa/verify-storage-performance.cjs math-probe-content data/qa/math-probe-content-performance-rerun.json
```

新增9项内容测试：数学答案、逆向条件枚举、数量守恒、干扰项唯一性、多空与其他协议、内容身份、旧题快照和实际对照覆盖。相关内容/协议21项通过。性能专项采用3627道当前原创任务、1000个合成家庭和2万条合成证据，三个顺序接口p95为10.13–21.98ms，8并发身份读取p95为70.95ms；满足该本机样本的500ms目标，不外推生产负载。

最终全量默认回归223项通过、0失败、6项PG默认跳过；该6项另行实机全部通过。API生产构建与全仓类型检查通过；本批未修改Web或共享契约，沿用上一候选已通过的构建。运行与内容审计源码指纹均与最终候选匹配。归档证据包括 `math-probe-content-regression.json`、`math-probe-content-postgres-regression.json`、`math-probe-content-runtime.json`、`math-probe-content-postgres-runtime.json`、`math-probe-content-audit.json`、`math-probe-content-performance.json`。

所有新证据使用 `math-probe-content-*` 前缀，不覆盖上一候选的历史收据。浏览器、其余素材和教材、当前候选跨环境及52项最终交叉验收继续推进，持续目标保持active。
