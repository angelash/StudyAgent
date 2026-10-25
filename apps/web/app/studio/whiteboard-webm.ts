/** Stamp MediaRecorder's WebM Info without rewriting clusters, packet bytes or unknown Segment sizes. */
type Element = { id: number; start: number; sizeAt: number; width: number; body: number; end: number; unknown: boolean };
function element(bytes: Uint8Array, start: number, limit: number): Element {
  const widthAt = (at: number, max: number) => {
    const first = bytes[at]; if (!first) throw new Error('WebM 元素长度无效。');
    for (let width = 1; width <= max; width++) if (first & (1 << (8 - width))) return width;
    throw new Error('WebM 元素长度无效。');
  };
  const idWidth = widthAt(start, 4), sizeAt = start + idWidth, width = widthAt(sizeAt, 8), body = sizeAt + width;
  if (body > limit) throw new Error('WebM 元数据不完整。');
  let id = 0, size = BigInt(bytes[sizeAt] & ((1 << (8 - width)) - 1));
  for (let i = 0; i < idWidth; i++) id = id * 256 + bytes[start + i];
  for (let i = 1; i < width; i++) size = size * 256n + BigInt(bytes[sizeAt + i]);
  const unknown = size === (1n << BigInt(width * 7)) - 1n;
  if (!unknown && (size > BigInt(Number.MAX_SAFE_INTEGER) || body + Number(size) > limit)) throw new Error('WebM 元数据越界。');
  return { id, start, sizeAt, width, body, end: unknown ? limit : body + Number(size), unknown };
}
function sizeBytes(value: number, preferred: number): Uint8Array {
  let width = preferred;
  while (width <= 8 && BigInt(value) >= (1n << BigInt(width * 7)) - 1n) width++;
  if (width > 8 || value < 0 || !Number.isSafeInteger(value)) throw new Error('WebM 元数据长度不可表示。');
  let encoded = BigInt(value) | 1n << BigInt(width * 7); const result = new Uint8Array(width);
  for (let i = width - 1; i >= 0; i--) { result[i] = Number(encoded & 255n); encoded >>= 8n; }
  return result;
}
function concat(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let cursor = 0;
  for (const part of parts) { result.set(part, cursor); cursor += part.length; } return result;
}
export function stampWhiteboardWebm(bytes: Uint8Array, durationMs: number): Uint8Array {
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('录制时长无效。');
  let cursor = 0, segment: Element | undefined;
  while (cursor < bytes.length) { const node = element(bytes, cursor, bytes.length); if (node.id === 0x18538067) { segment = node; break; }
    if (node.unknown) throw new Error('不支持的 WebM 元数据。'); cursor = node.end; }
  if (!segment) throw new Error('录制文件缺少 WebM Segment。');
  let info: Element | undefined; cursor = segment.body;
  while (cursor < segment.end) {
    const node = element(bytes, cursor, segment.end);
    // A seek index would need its own offset repair. This recorder does not emit one.
    if (node.id === 0x114d9b74) throw new Error('当前录制器生成的索引格式尚不支持补全时长。');
    if (node.id === 0x1549a966) { info = node; break; }
    if (node.unknown || node.id === 0x1f43b675) break; cursor = node.end;
  }
  if (!info || info.unknown) throw new Error('录制文件缺少完整 WebM Info。');
  let scale = 1000000, duration: Element | undefined; cursor = info.body;
  while (cursor < info.end) {
    const node = element(bytes, cursor, info.end); if (node.unknown) throw new Error('WebM Info 元数据无效。');
    if (node.id === 0x2ad7b1) { scale = 0; for (const byte of bytes.slice(node.body, node.end)) scale = scale * 256 + byte; }
    if (node.id === 0x4489) duration = node; cursor = node.end;
  }
  if (!Number.isSafeInteger(scale) || scale <= 0) throw new Error('WebM 时间单位无效。');
  const value = durationMs * 1000000 / scale;
  if (duration) {
    const result = bytes.slice(), view = new DataView(result.buffer);
    if (duration.end - duration.body === 8) view.setFloat64(duration.body, value, false);
    else if (duration.end - duration.body === 4) view.setFloat32(duration.body, value, false);
    else throw new Error('WebM 时长字段格式无效。');
    return result;
  }
  const field = new Uint8Array(11); field.set([0x44, 0x89, 0x88]); new DataView(field.buffer).setFloat64(3, value, false);
  const updatedInfo = concat([bytes.slice(info.start, info.sizeAt), sizeBytes(info.end - info.body + field.length, info.width), bytes.slice(info.body, info.end), field]);
  const difference = updatedInfo.length - (info.end - info.start);
  return concat([bytes.slice(0, segment.sizeAt), segment.unknown ? bytes.slice(segment.sizeAt, segment.body) : sizeBytes(segment.end - segment.body + difference, segment.width),
    bytes.slice(segment.body, info.start), updatedInfo, bytes.slice(info.end)]);
}

export async function whiteboardWebmDuration(blob: Blob, durationMs: number): Promise<Blob> {
  return new Blob([stampWhiteboardWebm(new Uint8Array(await blob.arrayBuffer()), durationMs) as Uint8Array<ArrayBuffer>], { type: blob.type });
}
