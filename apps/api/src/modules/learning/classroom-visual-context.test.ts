import { describe, it, expect } from 'vitest';
import type { ClassroomStep } from '@study-agent/contracts';
import { visualTeachingContext } from './classroom-visual-context';
const step = { id: 'context-test', title: '匿名对照', phase: 'concept', narration: '先观察。再比较。', blocks: [
        { id: 'points', kind: 'points', text: '', items: ['当前要点', '下一句要点', '结尾一起显示的要点'] },
        { id: 'table', kind: 'table', text: '匿名观察表', atSentence: 1, table: { headers: ['时段', '人数'], rows: [['上午', '3'], ['下午', '5']] } },
        { id: 'code', kind: 'code', text: '', code: 'private-tool-data' },
    ], answerKeys: ['private-answer-data'] } as unknown as ClassroomStep;
describe('classroom image teaching context', () => {
    it('includes only board items and table rows already visible at the current sentence', () => { expect(visualTeachingContext(step, 0)).toEqual({ visiblePoints: ['当前要点'], visibleTables: [] }); });
    it('includes final revealed table values without serializing unrelated private properties or code', () => { const context = visualTeachingContext(step, 1); expect(context.visiblePoints).toHaveLength(3); expect(context.visibleTables).toEqual([{ caption: '匿名观察表', headers: ['时段', '人数'], rows: [['上午', '3'], ['下午', '5']] }]); expect(JSON.stringify(context)).not.toContain('private-'); });
});
