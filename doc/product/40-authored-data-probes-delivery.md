# 分针、分类表、周期与相反方位对照

2026-10-20，接续 `072ac6e`。覆盖 KG-02/03、ASSESS-02/04/05/06、DIAG-03；为二年级原创数学路径剩余四点增加178道任务、16种结构和16张共用原创SVG。

## 任务与观察

- 分针56题：数字与分钟单位的主张核对22题；实际钟面的大格/分钟双栏11题；从分钟反向确定终点11题；从12出发、尚未满圈的两段连续大格记录12题。范围限于整大格，未把非零时刻相减或经过时长混入本点。
- 分类表42题：含登记编号的抄录核对12题；行列重排后的两个类别读数12题；类别与班级两个条件交叉定位12题；三类各有已登记0/未登记两种条件6题。“未登记”没有隐藏数量，不能推断为0。
- 周期48题：明确完整重复节后的主张、所在节与节内位置、新起点轮值、不含边界的下一目标，各12题。包含2/3/4项节长和重复符号；起点明确到项号，避免仅凭相同颜色推断相位，也不从有限前缀声称存在唯一规律。
- 方位32题：四个面向的正确/错误主张8题；半圈转身前后记录4题；交换起终点的直路返程4题；使用四种北向标、四个地标回到中心16题。不能把纸面上方默认当北方。

保留 `minute-hand-groups`、`table-second-column`、`periodic-three`、`opposite-compass` 四个历史题族；增加分项记录、更换控件或调整节长不另算独立结构。原4714题的完整内容、标识、分析与交互快照保持。任务结构区别不代表已证明统计独立性、难度等值或真实学生测量效度。

12张钟面包含11个分针终点和一个共用空盘。真实走钟图的时针随分钟前进；长短两针粗细交替，不能凭粗细作答。复看图集后缩短长针，保留与两位数刻度的间距。4张方位图直接复用各自的北向标与地标位置，不通过重命名图片扩题。替代文字说明观察条件，不直接报分钟换算或地图回程答案；不据此声称视觉与文字测量等价。

## 验证与运行

新增15项测试，从实际SVG指针端点、数字位置、北向箭头和地标坐标独立推导答案；按实际表格标题读取记录；逐项展开重复节，核对新起点和排除边界。178题的正确与合法错误响应均通过正式协议及评分，全部单选干扰项逐一判错。分钟总数或最终符号正确而中间记录错误时，报告仍保留该分项错误，不直接上升为深层原因。

最终默认回归288项通过、0失败、6项PG专项默认跳过；另6项PG实机全部通过。全仓类型检查、API/Web生产构建通过。16张SVG共51,331字节，生成内容逐字节一致、全部被题目引用、无脚本和外链，全部本地图像解码通过；两张图集实际复看。CI加入图像核验命令，远程CI尚未运行；图集检查不能替代浏览器验收。

运行脚本为持久化客观题逐一核对标准答案和合法零分错答，覆盖图上选择、配对、多选等已有协议，避免随机选中结构题时误用通用数字。SQLite与PostgreSQL各有32点正式学生身份的首测→假设→对照→独立响应→报告证据，生产限流保持开启；并发、提示排除、重评、旧蓝图/报告/草稿及五次重启通过。原3435题五类记录和既有编辑保留，累计1457道新题及映射仅补一次。

```powershell
npm run build --workspace @study-agent/api
node scripts/build-data-probe-assets.cjs
node scripts/qa/verify-data-assets.cjs data/qa/data-probe-content-assets.json
node scripts/qa/audit-authored-curriculum.cjs data/qa/data-probe-content-audit-final.json
node scripts/qa/verify-verification-groups.cjs data/qa/data-probe-content-runtime-final.json sqlite content-upgrade
node scripts/qa/verify-verification-groups.cjs data/qa/data-probe-content-postgres-runtime-final.json postgres content-upgrade
node scripts/qa/verify-storage-performance.cjs data-probe-content data/qa/data-probe-content-performance.json
```

当前256点、4892道任务，32点具有基础/迁移对照结构，仍有224点存在素材深度缺口。一年级16点、二年级15点的当前原创数学结构审计无缺口，不代表一、二年级全教材已覆盖。稳定掌握仍需有效样本、区间下界、不同迁移题族和真实间隔保持证据；完成本轮对照不能直接获得稳定掌握。

本机1000合成家庭、2万证据、4892任务的顺序读取p95为11.15–23.15ms，8并发身份读取68.22ms；不外推生产容量。七份收据为 `doc/evidence/2026-10-20/data-probe-content-{assets,audit,performance,regression,postgres-regression,runtime,postgres-runtime}.json`，两张图集位于同目录 `data-probe-content-images/`。教材审核映射、其余素材、当前候选跨环境、浏览器和52项逐项最终验收继续，总目标保持active。
