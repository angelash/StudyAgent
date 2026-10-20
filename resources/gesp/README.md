# GESP C++ 教研资料与教学衔接

状态：资料补充、独立教研轨道、隔离C++运行器和1～4级49点原创学生试点已接入；完整课程审核、规则诊断和间隔复测待建设。基准日：2026-10-21。

## 查看入口

运行系统后从“教研后台 → GESP C++”进入 `/admin/gesp`。管理员与教师可按认证等级、场次、题型、来源、题面关键字和知识点候选检索，查看原卷依据、未审核参考材料、先修建议与教学草案。

- [历年题目索引](INDEX.md)：2023年3月至2026年9月逐场次原卷、来源与缺口。
- [1～8级候选知识点](KNOWLEDGE.md)：69条官方详细标准拆成114点，含1～4级49点。
- [1～4级教学衔接](TEACHING.md)：15单元的观察目标、数学准备、独立检查与证据记录；结构化版本为 [teaching-plan.json](teaching-plan.json)。
- [官方来源、规则与质量复核](../../doc/gesp/source-review.md)：2026修订、错链、镜像、政策时效与抽查范围。
- [当前接入与后续验收](../../doc/gesp/integration-handoff.md)：研究轨道及学生课程建设边界。
- [用户提供的非官方练习](user-exercises.json)：8个级别例题和3道思维小测，保留代码及约束问题。
- [离线校验结果](validation.json)：原始字节、题目定位、图谱和教学单元完整性。

## 当前资料数量

| 内容 | 数量与状态 |
| --- | --- |
| 官方PDF | 131份：106原卷、16解析、8样题、1考纲 |
| 公开镜像PDF | 3份，固定Git提交及原始哈希，与官方档案分开 |
| 历史场次等级组合 | 108个：105正确原卷、2官方解析、1公开镜像（官方来源仍缺） |
| 机器题目索引 | 3,132条：2,916历年题、216样题；全部待逐题审核 |
| 来源题数 | 官方原卷2,835、官方解析54、公开镜像27、样题216 |
| 题型 | 单选1,740、判断1,160、编程232 |
| 知识点 | 114个候选点、170条候选先修边，覆盖69条官方详细标准 |
| 初始教学草案 | 15单元覆盖1～4级49点，不是已发布课程 |
| 用户非官方练习 | 11题，与官方和镜像索引分别管理 |

2023年9月五级官网原卷错链实际指向六级，已隔离；五级和2023年3月二级优先使用官方解析，镜像原卷只作旁证。2024年9月四级用固定版本镜像补得“黑白方块”“区间排序”等27题，官网缺口仍保留。

1,070道判断题的答案符号未进入机器文本，需回看原PDF；232道编程题中230道提取到参考材料，隐藏测试数据未收集。公式、图示、跨页代码和排版可能提取不全；题族与知识映射未审核。机器索引数量不等于可教学、可自动评分或已验证测量的题数。

## 文件与运行数据

本目录版本化来源、索引元数据及候选设计。`questions.jsonl` 保留官方或镜像身份、PDF哈希与页码、提取定位、答案依据和待审核标记。`approvedAtomIds` 全为空，不能直接进入学生组题。

原始HTML、PDF、完整提取、单题文本、只读SQLite索引与抽查PNG在 `data/gesp`，受现有Git忽略规则控制，**不随提交保存，必须单独备份**。可用 `STUDY_GESP_ROOT` 配置部署后的档案目录；目录内部仍保持 `raw/`、`extracted/`、`questions/`、`catalog.sqlite3` 布局。采集脚本固定写工作区 `data/gesp`，部署时复制经校验的整包到配置目录。

独立GESP轨道不占用小学学科或年级。图谱中的 `runtimeCompatible=false` 指不能导入现有小学课程包；`integrationStatus=research_workbench_only` 指教研读取与原创试点尚未成为已审核正式课程。学生试点由 `student-curriculum-v2.json` 保存49个任务、98个概念/跟踪探针和162组隐藏测试；所有任务仍标记为 `original_authored_pilot`。既有小学课程仍为258点、15,758道原创任务。

## 复现与更新

Python 3.10以上，依赖见 [requirements](../../scripts/gesp/requirements.txt)。已有档案时在仓库根目录执行：

```powershell
python -X utf8 scripts/gesp/capture_sources.py --offline
python -X utf8 scripts/gesp/capture_supplements.py --offline
python -X utf8 scripts/gesp/build_knowledge_map.py
python -X utf8 scripts/gesp/build_catalog.py
python -X utf8 scripts/gesp/build_runtime_index.py
python -X utf8 scripts/gesp/validate_preparation.py --report resources/gesp/validation.json
node scripts/content/build-gesp-student-curriculum.cjs
```

最后一条命令从已冻结的六点试点基底重建 `student-curriculum-v2.json`，覆盖1～4级49个原创学生试点任务；重建后运行 `apps/api/src/modules/gesp/student-curriculum.test.ts`，确认覆盖、ID、探针和隐藏测试结构。

重建索引后重启API。在线更新官网资料使用 `capture_sources.py --refresh`；镜像固定在 `supplements.json` 所记提交，不追踪仓库最新分支。更新后审核差异并重建全部派生文件，不自动发布。

只有Git检出、没有原始资产时，优先恢复独立备份；也可执行下列命令按清单URL恢复。恢复工具必须匹配既有SHA-256，远程内容变更或提取器差异会失败，不会把新字节悄悄替换旧版本：

```powershell
python -X utf8 scripts/gesp/restore_archive.py
python -X utf8 scripts/gesp/build_runtime_index.py
python -X utf8 scripts/gesp/validate_preparation.py
```

完全离线可为恢复命令加 `--offline`，只使用本地原始文件重建提取和单题档案。它不更新来源清单。联网恢复不保证官方URL永远可用，不能替代备份。

当前小九AI环境可在上述命令前设置包路径，并使用已安装解释器：

```powershell
$env:PYTHONPATH = 'C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\python'
& 'C:\Python310\python.exe' -X utf8 scripts/gesp/validate_preparation.py
```
