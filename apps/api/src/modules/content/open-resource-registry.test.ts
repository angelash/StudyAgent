import { describe, expect, it } from 'vitest';
import { listExternalSourceReferences, listSubjectOpenReferences } from './open-resource-registry';

describe('external source discovery boundaries', () => {
  it('exposes the indexed ChinaTextbook cold archive as a reference-only source', () => {
    const reference = listExternalSourceReferences().find(row => row.id === 'chinatextbook-coldarchive');
    expect(reference).toMatchObject({
      label: 'ChinaTextbook 本地冷归档',
      sourceType: 'public_reference',
      licenseClass: 'C_PUBLIC_REFERENCE_ONLY',
      licenseName: null,
      allowedUsage: 'reference_only',
      sourcePathOrUrl: 'https://github.com/TapXWorld/ChinaTextbook',
    });
    expect(reference?.notes).toContain('chinatextbook-coldarchive-index-v1.json');
  });

  it('never offers a reference-only cold archive to automatic import selection', () => {
    for (const subject of ['chinese', 'math', 'english'] as const) {
      expect(listSubjectOpenReferences(subject).map(row => row.id)).not.toContain('chinatextbook-coldarchive');
    }
  });
});
