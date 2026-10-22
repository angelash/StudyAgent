import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { z } from 'zod';
import type { StudioConnector, StudioConnectorKind, StudioIntegrationOverview, StudioScheduleEvent, StudioSubject } from '@study-agent/contracts';
import { validate } from '../../common/validation';
import { InMemoryStoreService, InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';
import { parseIcs, renderIcs } from './ics-calendar';

const connectSchema = z.object({ studentId: z.string().min(1).max(180), subject: z.enum(['math', 'chinese', 'english']),
  kind: z.enum(['lms_ics', 'calendar_ics']), label: z.string().trim().min(2).max(120),
  feedUrl: z.string().url().max(2000).optional(), icsText: z.string().max(2_500_000).optional(),
  requestKey: z.string().min(8).max(180) }).strict()
  .refine(value => Boolean(value.feedUrl) !== Boolean(value.icsText), { message: '请选择 ICS 链接或 ICS 内容中的一种' });
const studyEventSchema = z.object({ studentId: z.string().min(1).max(180), subject: z.enum(['math', 'chinese', 'english']),
  title: z.string().trim().min(2).max(160), description: z.string().trim().max(1500).default(''),
  startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }),
  requestKey: z.string().min(8).max(180) }).strict().refine(value => {
    const duration = Date.parse(value.endsAt) - Date.parse(value.startsAt);
    return duration >= 5 * 60_000 && duration <= 8 * 60 * 60_000;
  }, { message: '学习安排需持续 5 分钟至 8 小时' });

type StudioConnectorRow = StudioConnector & { encryptedFeedUrl: string; requestKey?: string; requestHash?: string; createdBy?: string };

function key() { return createHash('sha256').update(process.env.JWT_SECRET || 'local-only-studyagent-studio').digest(); }
function encrypt(value: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv), encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(buffer => buffer.toString('base64url')).join('.');
}
function decrypt(value: string) {
  const [iv, tag, encrypted] = value.split('.').map(item => Buffer.from(item, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
const blockedIp = new BlockList();
for (const [network, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const)
  blockedIp.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [['::', 128], ['::1', 128], ['2001:db8::', 32], ['fc00::', 7],
  ['fe80::', 10], ['ff00::', 8]] as const) blockedIp.addSubnet(network, prefix, 'ipv6');

function mappedIpv4(address: string) {
  const value = address.toLowerCase().split('%')[0];
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(value)?.[1];
  if (dotted) return dotted;
  const pair = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(value);
  if (!pair) return null;
  const high = Number.parseInt(pair[1], 16), low = Number.parseInt(pair[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

export function publicIp(address: string) {
  const family = isIP(address);
  if (family === 4) return !blockedIp.check(address, 'ipv4');
  if (family !== 6) return false;
  const mapped = mappedIpv4(address);
  if (mapped) return publicIp(mapped);
  return !blockedIp.check(address.split('%')[0], 'ipv6');
}

@Injectable()
export class StudioIntegrationService {
  constructor(private readonly store: InMemoryStoreService, private readonly students: StudentsService) {}

  private view(row: StudioConnectorRow): StudioConnector {
    const { encryptedFeedUrl: _secret, requestKey: _requestKey, requestHash: _requestHash, createdBy: _createdBy, ...safe } = row;
    return safe;
  }
  private eventView(row: StudioScheduleEvent & { createdBy?: string; requestHash?: string }): StudioScheduleEvent {
    const { createdBy: _createdBy, requestHash: _requestHash, requestKey: _requestKey, ...safe } = row; return safe;
  }

  overview(user: InMemoryUserAccount, studentId: string, subject: StudioSubject): StudioIntegrationOverview {
    this.students.assertCanAccessStudent(user, studentId);
    return { connectors: this.store.select('studioConnectors', { studentId, subject }).filter(row => row.status !== 'revoked').map(row => this.view(row)),
      events: this.store.select('studioScheduleEvents', { studentId, subject }).map(row => this.eventView(row)) };
  }

  async connect(user: InMemoryUserAccount, input: unknown) {
    const command = validate(connectSchema, input); this.students.assertGuardian(user, command.studentId);
    const requestHash = createHash('sha256').update(JSON.stringify({ studentId: command.studentId, subject: command.subject,
      kind: command.kind, label: command.label, feedUrl: command.feedUrl ?? null, icsText: command.icsText ?? null })).digest('hex');
    const previous = this.store.find('studioConnectors', { createdBy: user.id, requestKey: command.requestKey });
    if (previous) {
      if (previous.requestHash !== requestHash) throw new ConflictException('请求标识已用于不同的同步连接，请重新发起');
      return { connector: this.view(previous), events: this.store.select('studioScheduleEvents', { connectorId: previous.id }) };
    }
    let ics = command.icsText ?? '', feedUrl = command.feedUrl ?? '', sourceHost = command.feedUrl ? new URL(command.feedUrl).hostname : '本地导入';
    if (feedUrl) ics = await this.fetchFeed(feedUrl);
    const parsed = parseIcs(ics);
    if (!parsed.length) throw new BadRequestException('日历中没有可导入的日程');
    const now = new Date().toISOString(), id = this.store.nextId('studio_connector');
    const row = { id, studentId: command.studentId, subject: command.subject, kind: command.kind as StudioConnectorKind,
      label: command.label, sourceHost, status: 'connected' as const, lastSyncedAt: now, eventCount: parsed.length,
      lastError: null, version: 1, createdAt: now, encryptedFeedUrl: feedUrl ? encrypt(feedUrl) : '',
      requestKey: command.requestKey, requestHash, createdBy: user.id };
    const events = this.toEvents(row.id, command.studentId, command.subject, command.kind, parsed);
    this.store.append('studioConnectors', row);
    for (const event of events) this.store.append('studioScheduleEvents', event);
    return { connector: this.view(row), events };
  }

  async sync(user: InMemoryUserAccount, id: string) {
    const row = this.connector(user, id);
    if (!row.encryptedFeedUrl) throw new BadRequestException('本地 ICS 导入没有订阅链接；请重新导入已更新的日历');
    row.status = 'syncing';
    try {
      const parsed = parseIcs(await this.fetchFeed(decrypt(row.encryptedFeedUrl)));
      for (const old of this.store.select('studioScheduleEvents', { connectorId: id })) this.store.remove('studioScheduleEvents', { id: old.id });
      const events = this.toEvents(row.id, row.studentId, row.subject, row.kind, parsed);
      for (const event of events) this.store.append('studioScheduleEvents', event);
      Object.assign(row, { status: 'connected', lastSyncedAt: new Date().toISOString(), eventCount: events.length, lastError: null, version: row.version + 1 });
      return { connector: this.view(row), events };
    } catch (error) {
      Object.assign(row, { status: 'error', lastError: error instanceof Error ? error.message.slice(0, 500) : '同步失败', version: row.version + 1 });
      throw error;
    }
  }

  disconnect(user: InMemoryUserAccount, id: string) {
    const row = this.connector(user, id); row.status = 'revoked'; row.version += 1;
    for (const event of this.store.select('studioScheduleEvents', { connectorId: id })) this.store.remove('studioScheduleEvents', { id: event.id });
    return this.view(row);
  }

  createStudyEvent(user: InMemoryUserAccount, input: unknown) {
    const command = validate(studyEventSchema, input); this.students.assertGuardian(user, command.studentId);
    const requestHash = createHash('sha256').update(JSON.stringify(command)).digest('hex');
    const previous = this.store.find('studioScheduleEvents', { createdBy: user.id, requestKey: command.requestKey });
    if (previous) {
      if (previous.requestHash !== requestHash) throw new ConflictException('请求标识已用于不同的学习安排，请重新发起');
      return previous;
    }
    const now = new Date().toISOString(), id = this.store.nextId('studio_event');
    const event: StudioScheduleEvent & { createdBy: string; requestHash: string } = { id, connectorId: 'studyagent', studentId: command.studentId,
      subject: command.subject, title: command.title, description: command.description, startsAt: command.startsAt,
      endsAt: command.endsAt, allDay: false, externalUid: `studyagent:${id}`, source: 'studyagent', createdAt: now,
      requestKey: command.requestKey, createdBy: user.id, requestHash };
    this.store.append('studioScheduleEvents', event); return this.eventView(event);
  }

  removeStudyEvent(user: InMemoryUserAccount, id: string) {
    const event = this.store.find('studioScheduleEvents', { id, source: 'studyagent' });
    if (!event) throw new NotFoundException('学习安排不存在或不是 StudyAgent 任务');
    this.students.assertGuardian(user, event.studentId);
    if (event.planId) throw new ConflictException('这是学习计划任务，请在计划中使用完成、跳过或重新打开');
    this.store.remove('studioScheduleEvents', { id }); return { removed: true, id };
  }

  exportCalendar(user: InMemoryUserAccount, studentId: string, subject: StudioSubject) {
    this.students.assertCanAccessStudent(user, studentId);
    const events = this.store.select('studioScheduleEvents', { studentId, subject });
    return renderIcs(`StudyAgent ${subject}`, events.map(event => ({ uid: event.externalUid, title: event.title,
      description: event.description, startsAt: event.startsAt, endsAt: event.endsAt, allDay: event.allDay })));
  }

  private connector(user: InMemoryUserAccount, id: string) {
    const row = this.store.find('studioConnectors', { id }); if (!row || row.status === 'revoked') throw new NotFoundException('同步连接不存在或已撤销');
    this.students.assertGuardian(user, row.studentId); return row;
  }
  private toEvents(connectorId: string, studentId: string, subject: StudioSubject, kind: StudioConnectorKind, parsed: ReturnType<typeof parseIcs>): StudioScheduleEvent[] {
    const now = new Date().toISOString();
    return parsed.map((event, index) => ({ id: `${connectorId}:event:${index}`, connectorId, studentId, subject, title: event.title,
      description: event.description, startsAt: event.startsAt, endsAt: event.endsAt, allDay: event.allDay, externalUid: event.uid,
      source: kind === 'lms_ics' ? 'lms' : 'calendar', createdAt: now }));
  }
  private async fetchFeed(initial: string) {
    let target = new URL(initial);
    for (let redirects = 0; redirects < 4; redirects += 1) {
      if (target.protocol === 'webcal:') target.protocol = 'https:';
      if (target.protocol !== 'https:' || target.username || target.password || target.port && target.port !== '443') throw new BadRequestException('仅支持 HTTPS 日历订阅地址');
      const literal = target.hostname.replace(/^\[|\]$/g, ''), literalFamily = isIP(literal);
      let addresses: Array<{ address: string; family: number }>;
      if (literalFamily) addresses = [{ address: literal, family: literalFamily }];
      else {
        try { addresses = await lookup(target.hostname, { all: true, verbatim: true }); }
        catch { throw new BadRequestException('日历订阅域名无法解析'); }
      }
      if (!addresses.length || addresses.some(address => !publicIp(address.address))) throw new BadRequestException('日历订阅地址不能指向本机、局域网或保留地址');
      const response = await this.requestFeed(target, addresses[0]);
      if (response.status === 413) throw new BadRequestException('日历文件超过 2.5MB');
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const rawLocation = response.headers.location, location = Array.isArray(rawLocation) ? rawLocation[0] : rawLocation;
        if (!location) throw new ServiceUnavailableException('日历订阅重定向缺少目标地址');
        target = new URL(location, target); continue;
      }
      if (response.status < 200 || response.status >= 300) throw new ServiceUnavailableException(`日历源返回 ${response.status}`);
      return response.body;
    }
    throw new BadRequestException('日历订阅重定向次数过多');
  }

  private requestFeed(target: URL, address: { address: string; family: number }) {
    return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
      const family = isIP(address.address) as 4 | 6;
      const req = httpsRequest(target, { method: 'GET', servername: target.hostname,
        headers: { accept: 'text/calendar,text/plain;q=0.8', 'user-agent': 'StudyAgent-Calendar/1.0' },
        lookup: (_hostname, _options, callback) => callback(null, address.address, family) }, response => {
        const status = response.statusCode ?? 0, contentLength = Number(response.headers['content-length'] ?? 0);
        if (contentLength > 2_500_000) { response.resume(); resolve({ status: 413, headers: response.headers, body: '' }); return; }
        if ([301, 302, 303, 307, 308].includes(status)) { response.resume(); resolve({ status, headers: response.headers, body: '' }); return; }
        if (status < 200 || status >= 300) { response.resume(); resolve({ status, headers: response.headers, body: '' }); return; }
        const chunks: Buffer[] = []; let length = 0;
        response.on('data', (chunk: Buffer) => {
          length += chunk.length;
          if (length > 2_500_000) { req.destroy(new BadRequestException('日历文件超过 2.5MB')); return; }
          chunks.push(chunk);
        });
        response.on('end', () => resolve({ status, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
        response.on('error', reject);
      });
      req.setTimeout(12_000, () => req.destroy(new Error('calendar request timeout')));
      req.on('error', error => error instanceof BadRequestException ? reject(error) : reject(new ServiceUnavailableException('无法连接日历订阅，请检查地址或稍后同步')));
      req.end();
    });
  }
}
