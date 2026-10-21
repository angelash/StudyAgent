import type {
  QuestionLicenseClass,
  QuestionSourceType,
  Subject,
} from '@study-agent/contracts';

export type ExternalSourceReference = {
  id: string;
  label: string;
  subjects: Subject[];
  sourceType: QuestionSourceType;
  licenseClass: QuestionLicenseClass;
  licenseName: string | null;
  sourcePathOrUrl: string;
  verifiedAt: string;
  allowedUsage: 'allow_import' | 'allow_with_noncommercial_limits' | 'reference_only' | 'disallow_import';
  notes: string;
};

const externalSourceRegistry: ExternalSourceReference[] = [
  {
    id: 'openstax',
    label: 'OpenStax',
    subjects: ['english', 'math'],
    sourceType: 'open_content',
    licenseClass: 'B_OPEN',
    licenseName: 'Creative Commons (see per-book license)',
    sourcePathOrUrl: 'https://help.openstax.org/s/article/Openstax-textbook-licensing-and-customization',
    verifiedAt: '2026-04-25',
    allowedUsage: 'allow_import',
    notes: '官方明确提供开放许可说明。适合做英语阅读和补充性数学概念素材，导入时需按具体书目保留署名和许可信息。',
  },
  {
    id: 'oer-commons',
    label: 'OER Commons',
    subjects: ['chinese', 'math', 'english'],
    sourceType: 'open_content',
    licenseClass: 'B_OPEN',
    licenseName: 'Varies by resource (openly licensed only)',
    sourcePathOrUrl: 'https://help.oercommons.org/support/solutions/articles/42000107074-oer-commons-collection-policy',
    verifiedAt: '2026-04-25',
    allowedUsage: 'allow_import',
    notes: '平台只允许公有领域或明确开放许可资源入库。适合作为后续按条目筛选引入的开放资源池。',
  },
  {
    id: 'ck12',
    label: 'CK-12',
    subjects: ['math', 'english'],
    sourceType: 'open_content',
    licenseClass: 'B_OPEN',
    licenseName: 'CK-12 Terms / historical CC BY-NC references',
    sourcePathOrUrl: 'https://info.ck12.org/terms-of-use',
    verifiedAt: '2026-04-25',
    allowedUsage: 'allow_with_noncommercial_limits',
    notes: '可作为开放内容参考，但存在非商业和素材边界，不能默认作为商业化主线题源。',
  },
  {
    id: 'smartedu',
    label: '国家中小学智慧教育平台',
    subjects: ['chinese', 'math', 'english'],
    sourceType: 'public_reference',
    licenseClass: 'C_PUBLIC_REFERENCE_ONLY',
    licenseName: null,
    sourcePathOrUrl: 'https://user.smartedu.cn/register',
    verifiedAt: '2026-04-25',
    allowedUsage: 'reference_only',
    notes: '资源适合教研参考和链接跳转，未取得明确授权前不应做批量抓取、再分发或重建型题库。',
  },
  {
    id: 'khan-academy',
    label: 'Khan Academy',
    subjects: ['math', 'english'],
    sourceType: 'public_reference',
    licenseClass: 'C_PUBLIC_REFERENCE_ONLY',
    licenseName: null,
    sourcePathOrUrl:
      'https://support.khanacademy.org/hc/en-us/articles/42929097425037-What-s-allowed-and-not-allowed-under-Khan-Academy-s-Terms-of-Service',
    verifiedAt: '2026-04-25',
    allowedUsage: 'disallow_import',
    notes: '官方明确限制 scraping 及将其内容用于训练/开发 AI，不纳入题库导入方案。',
  },
  {
    id: 'chinatextbook-coldarchive',
    label: 'ChinaTextbook 本地冷归档',
    subjects: ['chinese', 'math', 'english'],
    sourceType: 'public_reference',
    licenseClass: 'C_PUBLIC_REFERENCE_ONLY',
    licenseName: null,
    sourcePathOrUrl: 'https://github.com/TapXWorld/ChinaTextbook',
    verifiedAt: '2026-10-21',
    allowedUsage: 'reference_only',
    notes: 'H:\\ColdArchive\\2026-10-21\\ChinaTextbook 与 E:\\ChinaTextbook 为同一Git提交的教材冷/热副本；完整元数据索引在 resources/curriculum/chinatextbook-coldarchive-index-v1.json。未跟踪明确LICENSE，仅用于来源存在核查、人工教材映射候选和教研参考，不直接导入或发布。',
  },
];

export function listExternalSourceReferences() {
  return [...externalSourceRegistry];
}

export function listSubjectOpenReferences(subject: Subject) {
  return externalSourceRegistry.filter(
    (item) =>
      item.subjects.includes(subject) &&
      (item.allowedUsage === 'allow_import' || item.allowedUsage === 'allow_with_noncommercial_limits'),
  );
}
