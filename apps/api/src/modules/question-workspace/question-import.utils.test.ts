import { describe, expect, it } from 'vitest';
import { analyzeTextbookPage, splitTextbookPageCandidates } from './question-import.utils';

describe('question-import.utils', () => {
  it('rejects cover or copyright style pages', () => {
    const detection = analyzeTextbookPage(`
      义务教育教科书 数学 二年级 上册
      人民教育出版社 课程教材研究所 编著
      书号 ISBN 978-7-107-36923-0
      版权所有·未经许可不得采用任何方式擅自复制或使用本产品任何部分
      电话 400-810-5788
      网址 http://www.pep.com.cn
    `);

    expect(detection.matched).toBe(false);
    expect(detection.rejectionReasons.length).toBeGreaterThan(0);
  });

  it('splits multiple inline questions into separate candidates', () => {
    const candidates = splitTextbookPageCandidates(`
      Practice 1 1. 36+6= 2. 45-3= 3. 18+9= 4. 60-8=
    `);

    expect(candidates).toHaveLength(4);
    expect(candidates[0]).toMatchObject({
      candidateIndexOnPage: 1,
      splitMode: 'question',
    });
    expect(candidates[0].candidateStem).toContain('1. 36+6=');
    expect(candidates[3].candidateStem).toContain('4. 60-8=');
  });

  it('keeps instruction context when splitting numbered exercises', () => {
    const candidates = splitTextbookPageCandidates(`
      量一量，填一填。
      在（ ）里填上“厘米”或“米”。
      （1）课桌长 60（ ）。
      （2）麻雀的足印长 3（ ）。
      （3）篮球场长 28（ ）。
    `);

    expect(candidates).toHaveLength(3);
    expect(candidates[0].excerpt).toContain('在（ ）里填上“厘米”或“米”');
    expect(candidates[0].candidateStem).toContain('（1）课桌长 60');
    expect(candidates[1].candidateIndexOnPage).toBe(2);
  });

  it('builds a useful stem when the marker and the content are split into separate lines', () => {
    const candidates = splitTextbookPageCandidates(`
      先估计，再用尺子量。
      看看哪条线段长，再量一量。
      （6）
      （ ） 大树高 8 米。
    `);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].candidateStem).toContain('大树高 8 米');
  });
});
