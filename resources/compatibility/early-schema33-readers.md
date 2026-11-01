# 早期未发布33读取器验证资产

[四集合读取器](early-schema33-four-collections-reader-v1.json.gz)与[五集合读取器](early-schema33-five-collections-reader-v1.json.gz)来自已封存的[教研候选源码](../../doc/evidence/2026-11-01/workspace-r6-teaching-editor-candidate/receipt.json)和[课程创建候选源码](../../doc/evidence/2026-11-01/workspace-r6-course-builder-candidate/receipt.json)。包内保存实际CJS读取器、编译输入指纹、准确Git基线的题族资源、来源归档摘要及外部依赖摘要。

这两个文件用于证明同为33号的早期未发布协议不能读取新增课程历史语义；它们不是最终33的回退或恢复基线。实际SQLite和PG先分别以原协议保存、发布并冷读教学稿，五集合样本另含已采用课程，再验证二者拒绝ready-schema33-course-history-v1且保留全部原生行、任务、历史、元数据和标记，SQLite字节亦保持。自动化从这些受版本控制的资源解包到自己的隔离QA目录，不依赖未提交的旧构建目录。

具体批次、原准备失败、源码与边界见[原生兼容证据](../../doc/evidence/2026-11-01/workspace-r6-course-history-native-proof/receipt.json)。不以这些合成协议探针代替完整内容、生产部署、教师、实机、实体打印或真人保持验收。

## 六集合课程历史33与准确教材版本候选

[实际六集合编译读取器](course-history-schema33-reader-v1.json.gz)从p184的API第三次实际编译产物封存，支持原ready-schema33-course-history-v1；并非按新源码重写的模拟读取器。[当前执行收据](course-history-schema33-reader-v1.receipt.json)关联独立SQLite与真实PostgreSQL各2项：先证明原保存/发布/采用及冷读取有效，再证明新ready-schema33-exact-edition-v1在任何行、任务、历史、元数据或SQLite字节改变之前被拒绝。

压缩资产内pending字段是保存时点的历史状态；后续实际探针见外部收据，不能据此推断未验证或把当时待完成改写成已完成。新协议仍是隔离候选，应用主干32与正式24保持。详细范围和完整API待结束状态见[教材版本候选](../../doc/evidence/2026-11-01/workspace-r6-exact-edition-candidate/receipt.json)。
