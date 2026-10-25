import { describe, expect, it } from 'vitest';
import { stampWhiteboardWebm } from '../../../../web/app/studio/whiteboard-webm';

const join = (...parts: Uint8Array[]) => new Uint8Array(parts.flatMap(part => [...part]));
const node = (id: number[], payload: number[] | Uint8Array) => join(new Uint8Array([...id, 0x80 | payload.length]), new Uint8Array(payload));
const scale = (value: number) => node([0x2a, 0xd7, 0xb1], [value >>> 16, value >>> 8 & 255, value & 255]);
const cluster = new Uint8Array([0x1f, 0x43, 0xb6, 0x75, 0xff, 0xe7, 0x81, 0, 0xa3, 0x85, 0x81, 0, 0, 0x80, 0x11]);
const segment = (payload: Uint8Array) => join(new Uint8Array([0x18, 0x53, 0x80, 0x67, 1, 255, 255, 255, 255, 255, 255, 255]), payload);
describe('WebM duration metadata without packet or unknown-size rewriting', () => {
  it('preserves unknown Segment and Cluster headers and every payload byte while adding duration', () => {
    const input = segment(join(node([0x15, 0x49, 0xa9, 0x66], scale(1000000)), cluster));
    const output = stampWhiteboardWebm(input, 6400);
    expect([...output.slice(0, 12)]).toEqual([...input.slice(0, 12)]);
    expect([...output.slice(-cluster.length)]).toEqual([...cluster]);
    const duration = Buffer.from(output).indexOf(Buffer.from([0x44, 0x89, 0x88]));
    expect(new DataView(output.buffer).getFloat64(duration + 3, false)).toBe(6400);
    expect(output.length - input.length).toBe(11);
    expect(stampWhiteboardWebm(output, 6400)).toEqual(output);
  });
  it('respects the recorder time scale and retains preexisting floating point duration size', () => {
    const value = new Uint8Array(4); new DataView(value.buffer).setFloat32(0, 0, false);
    const input = segment(join(node([0x15, 0x49, 0xa9, 0x66], join(scale(2000000), node([0x44, 0x89], value))), cluster));
    const output = stampWhiteboardWebm(input, 6400);
    const offset = Buffer.from(output).indexOf(Buffer.from([0x44, 0x89, 0x84]));
    expect(new DataView(output.buffer).getFloat32(offset + 3, false)).toBe(3200);
    expect(output.length).toBe(input.length);
    expect([...output.slice(-cluster.length)]).toEqual([...cluster]);
  });
  it('rejects malformed or indexed containers and invalid observed durations instead of publishing them', () => {
    expect(() => stampWhiteboardWebm(new Uint8Array([0]), 10)).toThrow();
    expect(() => stampWhiteboardWebm(segment(new Uint8Array([0x15, 0x49, 0xa9, 0x66, 0x8a])), 10)).toThrow();
    expect(() => stampWhiteboardWebm(segment(join(node([0x11, 0x4d, 0x9b, 0x74], []), node([0x15, 0x49, 0xa9, 0x66], []))), 10)).toThrow();
    expect(() => stampWhiteboardWebm(segment(node([0x15, 0x49, 0xa9, 0x66], [])), NaN)).toThrow();
  });
});
