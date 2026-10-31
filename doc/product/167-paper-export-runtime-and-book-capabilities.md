# 167 导出运行环境、按册能力与实际来源页

2026-10-31。接[166跨卷导出](166-selected-question-exports-and-paper-review.md)，为后续持久任务提供实际运行工具和只读预检。它们尚未接入应用路由、正式数据或工作台按钮。

## 已固定的运行工具

[安装清单](../../resources/paper-export/libreoffice-26.8.2-win-x64.json.gz)记录签名和SHA已核对的LibreOffice 26.8.2.2行政映像中19,417份文件、1,583,065,349字节。运行模块固定清单自身SHA，完整校验全部文件及未知额外文件；每次执行再核对五份关键执行文件。实际连接到的Office实例也必须报告同一版本。

[六份Windows/Python3.10 wheel清单](../../resources/paper-export/python310-win-wheels.json)和[哈希锁](../../resources/paper-export/requirements-win-py310.lock)固定python-docx、lxml、fontTools、PyMuPDF、Pillow及typing_extensions。六份wheel均从实际PyPI版本接口核对完整SHA；离线安装使用no-index和require-hashes，不依赖系统已有第三方包。

字体仍按166的源/派生/许可SHA处理，不安装系统字体。两个新缓存的完整字节与已验证缓存一致。Office和生成器分别使用自己的Python；子进程只接收必需系统环境，不继承模型或数据库凭据。Windows的platform.machine在清空架构环境后会返回空字符串，能力判断因此使用解释器实际编译目标，而不是补回一批无关环境变量。

## 独占、离线的目录重建

[setup-paper-export.ps1](../../scripts/operations/setup-paper-export.ps1)要求PowerShell 7.2以上、Windows x64、已安装的64位Python3.10，以及已准备的签名MSI、原始字体/许可和六份wheel。MSI原件SHA为`ff4b911403b67ee9e6249f820f9782c44bb32c94fdaa45b0da53a8e419e5307a`，安装器另核对The Document Foundation有效签名。字体输入仍是NotoSerifSC-VF.ttf、STIXTwoMath-Regular.ttf和对应两份原OFL文本；缺失或摘要不同即失败。

在项目根目录可执行以下命令；输入目录须已经按上述清单准备。输出只能是当前项目data内不存在的新目录，不能覆盖已有安装：

```powershell
./scripts/operations/setup-paper-export.ps1 -Installer ./data/tools/LibreOffice_26.8.2_Win_x86-64.msi -FontSources ./data/tools/paper-export-font-sources -Wheelhouse ./data/tools/paper-export-wheels -Python C:/Python310/python.exe -Destination "$PWD/data/runtime/paper-export-v1"
```

脚本创建新venv、安装固定离线wheel、执行MSI行政映像解包、派生字体，再运行[真实能力探测](../../scripts/processing/paper_export_probe.py)。探测先做完整工具校验，再真实生成和渲染包含中文及原生分式的DOCX/PDF。只有实际通过才创建installation.json；失败保留该次目录与局部日志，不能在不明状态下直接覆盖重跑。阶段超时保留实际PID，不以安装器父进程的状态推断Windows Installer服务已经终止。

installation.json是服务端私有配置，包含protocol、python、fontRoot、unoPython、soffice、capabilityReceipt和manifestSha256。它不自动写入正式.env或启动API。后续应用适配器还须实现配置读取、最新健康状态及公开能力投影；普通产品界面不展示本地路径、依赖文件清单或原始Office日志。

本批实际在同一台设备的全新er2目录完成上述流程，随后在最终准确源码上重新完整核对19,417份文件并通过真实自检。这是独立目录重建证据，不能替代新机器、Linux或不同Word版本验收。

## 按册预检与实际渲染

[只读预检CLI](../../scripts/processing/paper_export_preflight.py)接收服务端已经授权的workspace、冻结input及其完整SHA和font-root，返回paper-export-preflight-v1。practice和answers分别报告available、reason、items和media；这里的available只表示所请求内容可进入渲染，不代表已经产生合格文件。

完整原始JSON仍保存并校验结构、字段、身份、总文字和媒体声明预算，不重写或删除未使用内容。具体HTML、字形及媒体实际文件只按该册使用范围核对：答案中的不支持公式不会阻断纯练习册，题干中的不支持结构也不会阻断合法独立答案册。缺图、未支持结构和原参考缺失分别处理；原参考为空时明确显示未提供，不补造标准答案。未知私人作答字段对两册均拒绝。

预检不创建目录、业务活动或学习证据。原始输入SHA和目录清单在三个真实CLI场景中保持；未知异常只返回[固定允许错误码](../../scripts/processing/paper_export_protocol.py)。来源资格及进行中诊断限制必须先由后续应用接口核对，不能把预检成功当作读取、分享或下载授权。

实际文件仍经过独立Word生成和Office渲染。新增检查读取PDF中真正放置的图片矩形，包括被页面裁掉的区域，不能只检查可见文字。真实样本定位到未显式设置的DrawingML留边造成图片右侧越出18mm版心；现在显式固定四边距离和effectExtent，保留图片原内容。PDF使用无损图片和原分辨率，不通过降低画质消除溢出。

## 实际来源页与路径边界

每题在原生DOCX中有PaperItemNNNN和PaperEndNNNN起止书签。Office导出真实PDF目标，生成器核对对应页、位置、题序及前后关系；sourceMap追加endPage、endBookmark和pdfDestinationName，保留原itemId、number、source、startPage和bookmark。页码来自实际文件，不按题目长度猜算。纯字母数字名称避免Office对下划线书签名的转换；真实跨页表格已经保存开始与结束页。

Office的配置后端仍有一条使用Windows MAX_PATH的路径。相同DOCX在265字符后端路径下发生原生启动失败，252字符路径下成功，再次更长路径也失败。执行器使用短内部profile/cache名，并在启动前按UTF16长度检查固定后端路径，超限返回paper_export_path_limit；不改系统长路径设置，不连接用户常用Office实例。

两个已知测试崩溃转储曾使完整工具重检正确拒绝未知额外文件。逐SHA核对后将它们保存在忽略提交的私有QA目录，再重新完成全部工具校验；没有删除或忽略未知文件。原始内存、MSI长日志和二进制保持本地，不成为产品响应或公开归档。

## 当前证据与继续范围

[本批收据](../evidence/2026-10-31/workspace-r5-export-runtime-and-books/receipt.json)分别记录最终主干19项语义/实际PDF几何/清空环境测试、6次真实导出请求（4次应成功、2次应拒绝）、7项真实二进制/依赖/路径/安装拒绝和3项只读CLI；不相加为完整API或应用通过数。基础练习册6页、答案册2页、两个按册隔离场景以及独立canonical布局页面均实际打开；默认canonical公式字体仍不合下载白名单，下载候选仅采用逐文档UNO产物。

两次长正文原生条件页眉实验都显示错误的1335，尚未采用；不能把新增endPage当作续题标记已经完成。继续完成长正文、全部溢出/媒体/公式和题型、准确持久记录/原命令/回执/文件及删除恢复关系、任务与迟到发布栅栏、旧读取旁路/学生曝光、工作台UI及真实双库门禁。schema32仍未注册。原72/WS、全部教材/GESP、教师、实机、实体打印和真人1/3/7/14日要求继续保留，整体active。
