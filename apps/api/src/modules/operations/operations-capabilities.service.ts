import { Controller, ForbiddenException, Get, Injectable, Req, UseGuards } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadApiEnv } from '@study-agent/config';
import type { OperationsCapabilities, OperationsCapability } from '@study-agent/contracts';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { terminateChildProcess } from '../../common/terminate-child-process';
import { InMemoryStoreService } from '../../infrastructure/in-memory-store.service';
import { studyAssetRoot, workspaceRoot } from '../../infrastructure/workspace-paths';
import { resolveCodexInvocation } from '../ai/codex-command';
import { ClassroomImageService } from '../ai/classroom-image.service';
import { SpeechService } from '../ai/speech.service';
import { XiaojiuModelsService } from '../ai/xiaojiu-models.service';
import { PaperExportRuntimeService } from '../library/paper-export-runtime.service';

/** Runs fixed local diagnostics only. Output and exceptions never reach the client. */
export function capabilityCommand(command: string, args: string[], timeoutMs = 10000): Promise<string | null> {
  return new Promise(resolveResult => {
    const grouped = process.platform !== 'win32';
    const environment: NodeJS.ProcessEnv = {};
    for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOME', 'LD_LIBRARY_PATH', 'STUDY_GESP_WSL_DISTRO'])
      if (process.env[key]) environment[key] = process.env[key];
    Object.assign(environment, { PYTHONDONTWRITEBYTECODE: '1', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' });
    const child = spawn(command, args, { cwd: workspaceRoot(), env: environment, shell: false, windowsHide: true, detached: grouped, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', bytes = 0, invalid = false, settled = false;
    const finish = (value: string | null) => { if (settled) return; settled = true; clearTimeout(timer); resolveResult(value); };
    const stop = () => {
      if (invalid) return; invalid = true;
      void terminateChildProcess(child, grouped).then(() => finish(null), () => finish(null));
    };
    const timer = setTimeout(stop, timeoutMs); timer.unref();
    child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 65536) stop(); else output += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 65536) stop(); });
    child.on('error', () => finish(null));
    child.on('close', code => finish(!invalid && code === 0 ? output : null));
  });
}

const row = (id: OperationsCapability['id'], title: string, state: OperationsCapability['state'], message: string, repair: string | null = null, optional = true): OperationsCapability =>
  ({ id, title, state, optional, message, repair });
const pythonProbe = `import importlib,json\nr={}\nfor k,m in [('pdf','fitz'),('image','PIL'),('ocr','rapidocr_onnxruntime')]:\n try: importlib.import_module(m);r[k]=True\n except Exception: r[k]=False\nprint('STUDY_CAPABILITIES '+json.dumps(r))`;

@Injectable()
export class OperationsCapabilitiesService {
  private readonly env = loadApiEnv();
  private cached?: { until: number; value: Promise<OperationsCapabilities> };
  constructor(private readonly store: InMemoryStoreService, private readonly models: XiaojiuModelsService,
    private readonly speech: SpeechService, private readonly images: ClassroomImageService, private readonly paper: PaperExportRuntimeService) {}

  check(): Promise<OperationsCapabilities> {
    if (!this.cached || this.cached.until <= Date.now()) this.cached = { until: Date.now() + 30000, value: this.probe() };
    return this.cached.value;
  }

  private async probe(): Promise<OperationsCapabilities> {
    const root = workspaceRoot(), at = new Date().toISOString();
    // Each optional capability is independent; missing tools cannot fail the report or ordinary learning.
    const jobs: Array<() => Promise<OperationsCapability | OperationsCapability[]>> = [
      async () => row('storage', '业务存储', this.store.persistence.durable ? 'ready' : 'configured', this.store.persistence.durable ? '当前业务库已打开并启用持久化。' : '当前为隔离内存模式，重启后不保留记录。', this.store.persistence.durable ? null : '正式使用前配置 SQLite 或 PostgreSQL 并重新启动服务。', false),
      async () => {
        const directory = studyAssetRoot();
        const available = (await stat(directory).catch(() => null))?.isDirectory() ?? false;
        return row('assets', '资料资产目录', available ? 'configured' : 'unavailable', available ? '目录存在；具体资料、媒体及哈希仍按引用逐项校验。' : '未找到资料资产目录，相关资料可能无法打开。', available ? null : '恢复资料资产并核对 STUDY_ASSET_ROOT，保留原件与备份。');
      },
      async () => {
        const enabled = this.env.XIAOJIU_CHAT_ENABLED === 'true'; this.models.catalog();
        return row('text_models', 'AI 模型目录', enabled ? 'configured' : 'disabled', enabled ? '已读取模型目录；本次不发送生成请求，账号和供应商可用性尚未实测。' : 'AI 生成已关闭，已有课程与确定性学习功能可以继续。', enabled ? '如生成失败，请核对原模型连接与登录状态；本次不切换供应商。' : '需要 AI 生成时启用 XIAOJIU_CHAT_ENABLED 并核对模型连接。');
      },
      async () => {
        const invocation = resolveCodexInvocation(this.env.CODEX_COMMAND);
        const output = invocation.shell ? null : await capabilityCommand(invocation.command, ['--version']);
        const available = Boolean(output?.trim());
        return row('cli', '模型命令行工具', available ? 'ready' : 'unavailable', available ? '原配置命令可启动并返回版本；未发起生成或验证账号。' : '原配置命令无法直接启动。', available ? null : '安装或修复原命令行工具，将 CODEX_COMMAND 指向可执行文件后重启；不改用其他供应商。');
      },
      async () => {
        const available = Boolean(this.speech.capabilities().provider);
        return row('speech', '课堂语音', available ? 'configured' : 'unavailable', available ? '语音服务已配置；本次不合成音频，听感与供应商状态须实际试听。' : '未配置语音服务，可继续阅读文字与字幕。', available ? null : '按语音配置说明设置原供应商凭据并重启，再从课堂进行实际试听。');
      },
      async () => {
        const output = await capabilityCommand(process.env.STUDY_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-X', 'utf8', '-c', pythonProbe]);
        let modules: Record<string, boolean> = {};
        try { const lines = output?.trim().split(/\r?\n/).filter(line => line.startsWith('STUDY_CAPABILITIES ')); if (lines?.length === 1) modules = JSON.parse(lines[0].slice('STUDY_CAPABILITIES '.length)); } catch { /* Fixed public status only. */ }
        return [row('pdf', 'Python 与 PDF 处理', modules.pdf === true && modules.image === true ? 'ready' : 'unavailable', modules.pdf === true && modules.image === true ? '当前处理器可导入 PDF 和图像依赖；具体文档仍需任务预检。' : '当前 Python 或 PDF、图像依赖缺失。', modules.pdf === true && modules.image === true ? null : '在处理器的 Python 环境安装 scripts/processing/requirements.txt，核对 STUDY_PYTHON 后重试。'),
          row('ocr', '扫描页文字识别', modules.ocr === true && modules.image === true && modules.pdf === true ? 'configured' : 'unavailable', modules.ocr === true && modules.image === true && modules.pdf === true ? 'OCR 依赖可导入；模型资产和扫描效果仍须真实任务检查。' : 'OCR 或基础文档依赖不可用，原生文本和人工核对仍保留。', modules.ocr === true && modules.image === true && modules.pdf === true ? null : '在同一处理环境安装 OCR 依赖并离线准备模型资产，核对后再处理扫描页。')];
      },
      async () => {
        const [ffmpeg, ffprobe] = await Promise.all([
          capabilityCommand(process.env.STUDY_FFMPEG || 'ffmpeg', ['-version']),
          capabilityCommand(process.env.STUDY_FFPROBE || 'ffprobe', ['-version']),
        ]);
        const available = Boolean(ffmpeg?.startsWith('ffmpeg version') && ffprobe?.startsWith('ffprobe version'));
        return row('ffmpeg', '音视频处理', available ? 'ready' : 'unavailable', available ? 'FFmpeg 与 FFprobe 可启动；具体音视频格式仍按任务检查。' : 'FFmpeg 或 FFprobe 不可启动，相关录音转换或视频导出可能受限。', available ? null : '安装 FFmpeg 与 FFprobe 并核对 STUDY_FFMPEG、STUDY_FFPROBE 或服务进程 PATH，重新启动后再检查。');
      },
      async () => {
        const capability = await this.images.capabilities();
        return row('image', '课堂参考图', capability.available ? 'configured' : 'unavailable', capability.available ? '技能依赖和本地代理检查通过；本次未生成图片。' : '生图技能、依赖或本地代理尚未就绪，文字课堂可以继续。', capability.available ? null : '核对集成生图技能目录，运行 scripts/operations/setup-imagegen.cjs 并确认小九已登录。');
      },
      async () => {
        const output = await capabilityCommand(process.execPath, [resolve(root, 'scripts/gesp/run_submission.cjs'), '--capabilities'], 15000);
        let available = false;
        try { const value = JSON.parse(output || 'null'); available = value?.protocol === 'gesp-runner-capabilities-v1' && value.available === true && value.namespaces === true; } catch { /* Never forward native process errors. */ }
        return row('cpp', 'C++ 隔离执行', available ? 'ready' : 'unavailable', available ? '工具链和隔离命名空间检查通过；本次不运行学生代码。' : 'Linux / WSL 工具链或隔离能力不可用，保留代码草稿。', available ? null : '按 GESP 运行说明安装 g++、timeout、unshare，核对 WSL 发行版与命名空间权限；不得降级到宿主执行。');
      },
      async () => {
        const config = await this.paper.installation();
        const files = await Promise.all([config.python, config.unoPython, config.soffice, config.fontRoot, config.capabilityReceipt].map(file => stat(file).catch(() => null)));
        const available = files.every((file, index) => index === 3 ? file?.isDirectory() : file?.isFile());
        return row('paper_export', 'PDF / DOCX 导出', available ? 'configured' : 'unavailable', available ? '导出安装清单和所列文件存在；字体、实际转换和文档完整性仍按每次导出预检。' : '导出安装清单所需文件缺失，完整选题和原稿仍保留。', available ? null : '运行项目导出安装检查，修复字体、Python 与 Office 工具，并重新生成安装回执。');
      },
    ];
    const ids: OperationsCapability['id'][] = ['storage', 'assets', 'text_models', 'cli', 'speech', 'pdf', 'ffmpeg', 'image', 'cpp', 'paper_export'];
    const titles = ['业务存储', '资料资产目录', 'AI 模型目录', '模型命令行工具', '课堂语音', 'Python 与 PDF 处理', '音视频处理', '课堂参考图', 'C++ 隔离执行', 'PDF / DOCX 导出'];
    const settled = await Promise.allSettled(jobs.map(job => job()));
    const checks = settled.flatMap((result, index) => result.status === 'fulfilled' ? result.value : index === 5
      ? [row('pdf', titles[index], 'unavailable', '当前处理环境检查失败。', '核对 Python 和文档处理依赖后重试。'), row('ocr', '扫描页文字识别', 'unavailable', '当前处理环境检查失败。', '核对 OCR 依赖及离线模型后重试。')]
      : row(ids[index], titles[index], 'unavailable', '该项检查未通过；其他功能按各自状态使用。', index === 9 ? '核对 STUDY_PAPER_EXPORT_INSTALLATION 和原安装回执，修复导出环境后重试。' : '核对该功能的原配置与依赖，修复后重新检查。', index !== 0));
    return { at, cacheSeconds: 30, scope: '仅检查本地依赖、配置与已打开的存储；不安装工具、不调用生成、不修改学习记录。配置就绪不等于供应商在线或真实设备验收。', checks };
  }
}

@UseGuards(AuthGuard)
@Controller('admin/operations/capabilities')
export class OperationsCapabilitiesController {
  constructor(private readonly capabilities: OperationsCapabilitiesService) {}
  @Get()
  check(@Req() req: AuthenticatedRequest) {
    if (req.user.role !== 'admin') throw new ForbiddenException('依赖检查需要管理员权限');
    return this.capabilities.check();
  }
}
