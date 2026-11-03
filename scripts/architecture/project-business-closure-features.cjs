// Source-backed reconciliation of business already delivered in blocks 1-4.
// This records interfaces, not content approval or fresh end-to-end acceptance.
module.exports = function reconcile(areas) {
  const area = id => { const value = areas.find(row => row.id === id); if (!value) throw Error('Missing feature area ' + id); return value; };
  const feature = (id, key) => { const value = area(id).features.find(row => row[0] === key); if (!value) throw Error('Missing feature ' + key); return value; };
  feature('curriculum', 'CUR-06')[2] += ' textbookLessonSource textbookReferenceDocument';
  feature('learning', 'LEARN-01')[2] += ' learnerKnowledge';
  feature('gesp', 'GESP-07')[2] += ' teachingCandidates';
  area('curriculum').features.push(['CUR-11', '完整教学稿编辑、逐项材料与明确发布采用',
    'TextbookTeachingController.source TextbookTeachingController.preflight TextbookTeachingController.command TextbookTeachingController.result TextbookTeachingController.materials TextbookTeachingController.list TextbookTeachingController.get',
    'textbookTeachingPackages textbookTeachingVersions textbookTeachingSources textbookTeachingCommands textbookTeachingAdoptions textbookTeachingCourseRevisions',
    '准确教材版本和页段、目标定义、完整稿件、材料映射、原请求键及预期版本',
    '原教材工作台读取准确原页；完整讲解、例题、图示、检查与保持逐项编辑和阅读预览。本机完整副本和原请求回执可恢复，来源或目标变化重新核对；明确审核发布与私人采用分别执行，旧课堂保留原快照。',
    '来源预览、逐项目标及材料缺口、稿件版本、原命令和采用回执',
    '候选与可保存草稿不等完整可发布；未审材料、题族、评分和充分未见库存仍阻断相应资格，内容生产当前按用户要求暂停。',
    ['apps/api/src/modules/diagnostics/textbook-teaching.controller.ts', 'apps/web/app/admin/curriculum/teaching-package-workspace.tsx', 'doc/product/192-textbook-followups-gesp-teaching-and-first-response-evidence.md']]);
  area('studio').features.push(['STUDIO-40', '原课程创建、升级影响与精确历史恢复',
    'studioTeachingOptions studioCourseOriginalRequest studioCourseUpgradePreview studioCourseUpgrade studioCourseUpgradeRequest studioCourseVersions studioCourseVersion studioCourseLessonVersion',
    'studioCourses classroomSessions', '当前身份与课程、原版本指纹、完整创建或升级命令和原请求键',
    '来源教学选项与预览绑定版本；创建及升级原命令可独立读回，确认前显示影响。升级后旧课程与课时快照仍可按准确修订读取，原课堂及首答不覆盖；明确拒绝与未知结果分开处理。',
    '教学选项、原请求回执、升级预览与历史课程课时快照',
    '新版本不自动替换历史学习事实；教师内容审核、真实学习效果与运行部署另计。', ['apps/api/src/modules/learning/learning.controller.ts', 'doc/product/185-schema33-integration-and-browser-regressions.md']]);
  area('studio').features.push(['STUDIO-41', '纸面三用途采集、原图恢复与分组识别',
    'PaperCaptureController.repairCommand PaperCaptureController.repairCandidate PaperCaptureController.repairUploads PaperCaptureController.repairUpload PaperCaptureController.repairUploadProgress PaperCaptureController.repairChunk PaperCaptureController.cancelRepairUpload PaperCaptureController.repairList PaperCaptureController.repairStart PaperCaptureController.repairProgress PaperCaptureController.cancelRepair PaperCaptureController.retryRepair PaperCaptureController.limits PaperCaptureController.result PaperCaptureController.list PaperCaptureController.start PaperCaptureController.get PaperCaptureController.uploadCommands PaperCaptureController.chunk PaperCaptureController.complete PaperCaptureController.cancel PaperCaptureController.page PaperCaptureController.pageFiles PaperCaptureController.revise PaperCaptureController.listGroups PaperCaptureController.group PaperCaptureController.reviseGroup PaperCaptureController.recognize PaperCaptureController.derivationList PaperCaptureController.derivation PaperCaptureController.derivationFiles PaperCaptureController.cancelDerivation PaperCaptureController.retryDerivation PaperCaptureController.derivedPdf PaperCaptureController.image',
    'paperImageUploads paperCapturePages paperCaptureGroups paperCaptureCommands paperCaptureDerivations paperCaptureFileAssets paperCaptureRepairUploads paperCaptureRepairCommands paperCaptureRepairs',
    '本人或孩子范围、单题/整页/教辅用途、分块原件、页序旋转裁剪、原命令及版本',
    '统一资料入口区分三种用途，上传限额和进度可读；原件不覆盖，处理版本、明确原件恢复与分组PDF冻结保留来源身份。识别任务可取消重试，逐页结果、旧版本和缺口分别核；完整本机副本、原命令与源字节恢复有专用流程。',
    '原图与派生图、分组原PDF、OCR候选、页级核对与任务原回执',
    'OCR候选不自动成为正式题；真实相机权限、扫描手写全集与实体设备效果仍另验。', ['apps/api/src/modules/learning/paper-capture.controller.ts', 'doc/product/191-native-matrices-chinese-formulas-and-pdf-cell-geometry.md']]);
  area('content').features.push(['CONTENT-15', '个人选题与可恢复PDF/DOCX导出',
    'PaperSelectionController.list PaperSelectionController.get PaperSelectionController.command PaperSelectionController.commandResult PaperSelectionController.metadata PaperSelectionController.read PaperSelectionController.readResult PaperExportController.preflight PaperExportController.command PaperExportController.commandResult PaperExportController.list PaperExportController.get PaperExportArtifactController.file',
    'paperSelectionLists paperSelectionCommands paperExports paperExportCommands paperSourceExposures paperExportFiles',
    '当前身份和选题清单、准确来源、题序留白、答案可见性、冻结导出输入与原请求键',
    '跨卷选题独立保存，来源阅读与曝光按原对象记录；预检重新核身份、来源和结构。导出冻结完整题目与原生公式表格、答案册分离，实际任务保留原命令、产物哈希与受控下载；取消、恢复和到期回收沿原队列及文件栅栏。',
    '选题清单、来源元数据、原读请求、预检、导出任务及PDF/DOCX文件',
    '工具缺失不丢选题，错误和过期来源不假成功；文档渲染与实体打印分开计，未审内容不因导出而获批准。', ['apps/api/src/modules/library/paper-selection.controller.ts', 'apps/api/src/modules/library/paper-export.controller.ts', 'doc/product/191-native-matrices-chinese-formulas-and-pdf-cell-geometry.md']]);
};
