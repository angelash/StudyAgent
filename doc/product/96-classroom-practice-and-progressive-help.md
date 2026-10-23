# 全微课Practice、逐级提示与不会记录

日期：2026-10-24。实现提交：`9c2821c8b706e2417703061b378e961cef8c3412`。对应[完整建设计划](92-experience-and-content-master-plan.md)E02/E03，关联XP-E03、E04、E05及XP-B04/B06；见[验收收据](../evidence/2026-10-24/classroom-practice-acceptance.json)。完整目标继续进行。

## 1. 60微课练习内容

首课保留5道既有题，其余59课各另编2道情境题，增加118题。微课Practice从64题增至182题，每课至少3题，覆盖情境应用、概念边界和证据判断。五单元60道核查题继续独立保存，共242个不同题目ID和题干。

新内容按单元分文件维护，逐题给出目的、四个选项、私有答案、两级提示和具体解释；组装时稳定调整选项次序，保持答案对应。新增30道含表格题和2道受控图示题，五个单元都有首课以外的图表练习；示例数据明确标为教学示例，不冒充真实社会调查。

题目涵盖覆盖与非回应、因果设计、角色冲突、文化资本、社会网络、机会与生活条件、制度过程、人口分母、技术采用及环境后果等实际区分。并非对同一题只换数字和词语。原有模板题仍保留为概念应用，新题不被计算为已经标定的独立测量题族。

这些是自编成人学习材料。结构检查、代表性答案金样本和数值核对不等于逐题教师审核或真实学习效果验证；XP-E04保持in_progress，正式小学测量题库数量不增加。

## 2. 提示先记录、再逐级读取

会话冻结私有`hintKeys`；公开视图不返回该表，也不提前返回题目提示正文。`hintCount`只说明可用级数；已经读取的正文通过`hintReceipts`返回，每条包含题目、级别、文字与真实时间。

`POST /learning/classroom/sessions/:id/hints`可指定level。必须按顺序读取，跨级返回409，越过实际级数返回400。同请求键重放不增加级别；新键请求已读级别也不新增提示事实。旧客户端省略level时只请求第1级，避免重试自动升级。

浏览器根据已经记录的级别请求下一步，逐项显示判断方向和关键线索。回执丢失时仍重试同一目标级别，服务器不会误记为继续查看更深提示。刷新和API重启保留正文、级别与辅助事实。成功重试会清除旧连接错误。

已经提交的题不能追加提示来改写首次状态；同一已完成请求可安全重放。旧会话缺少提示表时，仅使用当时冻结题目中的原提示，不从当前课程补入新级别。旧的“使用过帮助”事实不被猜成具体提示级别或时间。

## 3. 不会、跳过、错误与辅助分开

作答增加`disposition: answered/skip/dont_know`，并校验它和选项是否一致。已有客户端的空选项继续按skip解释，不把过去的跳过改猜为不会。

首次回执保存提示级别与辅助事实；客户端false不能清除服务端已经记录的帮助。首次作答锁定，回看不覆盖旧答案。

复盘分别显示已记录、独立正确、答错、跳过、不会和使用帮助。不会不计为错误或跳过；帮助可与其他类别重合。复盘可回看原题和解释、返回相关微课。题目数据完整展示，表格在手机可横向查看；不会与跳过都有真实操作。

这些记录仍是本次课堂表现，不直接设置知识掌握，不增加正式独立测量样本。

## 4. 练习更新与已读记录

每份练习版本摘要包括题面、私有答案和两级提示；修改提示或量规也会触发新会话版本。旧卷保持原题、私有量规与提示快照，新题不能混进旧会话。

阅读与练习身份分开。`classroomTeachingFingerprint`仅比较讲解目标、内容、步骤和正式验证入口；如果它们完全相同，旧版已读事实继续出现在`readingProgress`。当前版本练习进度仍只来自当前完整内容指纹的会话，不把旧单题表现复制到新三题组。

课程库、目录、周记录与继续讲解使用兼容的阅读记录；当前练习和辅助分别保存。旧版练习仍从保存地址恢复，并由学习者明确选择打开新版。讲解本身实质变化时，旧读记录不冒充新讲解已经读完。

## 5. 代码与证据

- [内容模型](../../apps/api/src/modules/learning/classroom-practice-model.ts)、[内容入口](../../apps/api/src/modules/learning/classroom-practice-content.ts)，以及[单元一](../../apps/api/src/modules/learning/classroom-practice-u1.ts)、[单元二](../../apps/api/src/modules/learning/classroom-practice-u2.ts)、[单元三](../../apps/api/src/modules/learning/classroom-practice-u3.ts)、[单元四](../../apps/api/src/modules/learning/classroom-practice-u4.ts)、[单元五](../../apps/api/src/modules/learning/classroom-practice-u5.ts)。
- [课程组装](../../apps/api/src/modules/learning/classroom-curriculum.ts)：私有提示、稳定选项、练习和讲解两种身份。
- [课堂服务](../../apps/api/src/modules/learning/classroom.service.ts)：提示顺序/重放、旧提示、不会与阅读兼容。
- [共享契约与复盘](../../packages/contracts/src/classroom.ts)、[练习页面](../../apps/web/app/studio/classroom/practice-panel.tsx)。
- [内容测试](../../apps/api/src/modules/learning/classroom-practice-content.test.ts)、[真实SQLite集成](../../apps/api/src/modules/learning/classroom.integration.test.ts)、[浏览器旅程](../../tests/e2e/classroom-practice.spec.ts)。

证据分别说明静态内容结构、语义代表例、真实SQLite持久化与浏览器表现。全课程逐题教学审核、真实设备、后续独立新题验证、长期保持、项目量规和完整像素状态矩阵继续按账本推进。
