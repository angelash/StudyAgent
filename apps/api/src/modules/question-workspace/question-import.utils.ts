import { QuestionAnswerMode, QuestionImportQualityLevel, QuestionImportSplitMode, Subject } from '@study-agent/contracts';

export type TextbookPageDetection = {
  matched: boolean;
  detectionReasons: string[];
  rejectionReasons: string[];
  cleanedLines: string[];
  introLines: string[];
  sectionLabel: string | null;
};

export type TextbookSplitCandidate = {
  candidateIndexOnPage: number;
  splitMode: QuestionImportSplitMode;
  sectionLabel: string | null;
  candidateStem: string;
  excerpt: string;
  detectionReason: string;
};

export type QuestionImportQualityAssessment = {
  qualityLevel: QuestionImportQualityLevel;
  qualityFlags: string[];
};

const pageMarkerPattern = /^-- \d+ of \d+ --$/;
const questionMarkerPattern = /^(?:（\d+）|\(\d+\)|\d+[\.、]|[一二三四五六七八九十]+[\.、])/;
const pureQuestionIndexPattern = /^(?:（\d+）|\(\d+\)|\d+[\.、]|[一二三四五六七八九十]+[\.、])$/;
const boilerplatePattern =
  /(ISBN|版权所有|未经许可|违者必究|出版社|出版|编著|编委会|责任编辑|美术编辑|封面设计|设计工作室|印刷|新华书店|版次|印次|开本|定价|邮编|网址|电话|电子邮件|反馈平台|后记|课程教材研究所|中央美术学院|主编|副主编|主要编写人员)/i;
const smallNumberPattern = '[0-9一二三四五六七八九十百两]{1,3}';
const arithmeticPattern = new RegExp(
  `(?:${smallNumberPattern})\\s*(?:[+＋×xX÷]|-(?!\\d{3,}(?:-\\d+)+)|=|＝)\\s*(?:${smallNumberPattern})`,
);
const englishTokenPattern = /\b[A-Za-z]{2,}\b/;

const subjectDetectionConfig: Record<
  Subject,
  {
    exerciseTitlePattern: RegExp;
    sectionCuePattern: RegExp;
    instructionCuePattern: RegExp;
    featureReason: string;
    featureMatcher: (lines: string[], joinedText: string) => boolean;
  }
> = {
  math: {
    exerciseTitlePattern: /(练习[一二三四五六七八九十百0-9]+|整理和复习|总复习)/,
    sectionCuePattern: /(做一做|想一想|算一算|填一填|练一练|选一选|说一说|画一画|量一量|连一连|估一估|解决问题|判断对错|看图列式)/,
    instructionCuePattern: /(在.*里填|列竖式|写出|选择合适|判断|先.*再|看图|口算|解答|填空|提出.*问题|说明理由|请你|把.*填完整)/,
    featureReason: '检测到数学算式',
    featureMatcher: (lines) => lines.filter((line) => containsArithmeticExpression(line)).length >= 2,
  },
  chinese: {
    exerciseTitlePattern: /(语文园地|口语交际|习作|写话|练习|复习|单元练习|阅读)/,
    sectionCuePattern: /(读一读|写一写|想一想|说一说|背一背|填一填|照样子|连一连|选一选|默写|组词|造句|阅读理解|口语交际|习作|写话)/,
    instructionCuePattern: /(根据.*填空|按课文内容填空|照样子写|把句子补充完整|阅读短文|回答问题|写一写|说一说|用.*造句|默写|写话|习作|选择正确|判断对错)/,
    featureReason: '检测到语文阅读或表达特征',
    featureMatcher: (_lines, joinedText) => /(拼音|词语|课文|句子|短文|古诗|生字|造句|阅读|写话|习作)/.test(joinedText),
  },
  english: {
    exerciseTitlePattern: /(Unit|Recycle|Story time|Read and write|Let'?s|练习|复习)/i,
    sectionCuePattern: /(Listen and|Read and|Look and|Match|Choose|Circle|Tick|Write|Talk|Ask and answer|Let's)/i,
    instructionCuePattern: /(听录音|看图|补全单词|选择正确|连词成句|根据情景|Read and write|Look and say|Listen and choose|Match the|Fill in the blanks)/i,
    featureReason: '检测到英语词汇或句型',
    featureMatcher: (lines, joinedText) =>
      lines.filter((line) => englishTokenPattern.test(line)).length >= 2 || /(单词|句子|对话|字母|听录音|英语)/.test(joinedText),
  },
};
const combinedInstructionCuePattern = new RegExp(
  Object.values(subjectDetectionConfig)
    .map((item) => item.instructionCuePattern.source)
    .join('|'),
  'i',
);

export function analyzeTextbookPage(pageText: string, subject: Subject = 'math'): TextbookPageDetection {
  const config = subjectDetectionConfig[subject];
  const rawLines = normalizeImportLines(pageText);
  const boilerplateLines = rawLines.filter((line) => isBoilerplateLine(line));
  const cleanedLines = dedupeConsecutiveLines(rawLines.filter((line) => !isBoilerplateLine(line)));
  const detectionReasons: string[] = [];
  const rejectionReasons: string[] = [];
  const normalizedCleanedText = cleanedLines.join(' ');

  if (cleanedLines.length === 0) {
    return {
      matched: false,
      detectionReasons,
      rejectionReasons: ['内容清洗后为空'],
      cleanedLines,
      introLines: [],
      sectionLabel: null,
    };
  }

  if (config.exerciseTitlePattern.test(normalizedCleanedText)) {
    detectionReasons.push('检测到练习页标题');
  }

  if (config.sectionCuePattern.test(normalizedCleanedText)) {
    detectionReasons.push('检测到习题小节提示语');
  }

  if (config.instructionCuePattern.test(normalizedCleanedText)) {
    detectionReasons.push('检测到典型练习指令');
  }

  if (config.featureMatcher(cleanedLines, normalizedCleanedText)) {
    detectionReasons.push(config.featureReason);
  }

  const questionMarkerCount = cleanedLines.filter((line) => questionMarkerPattern.test(line)).length;
  if (questionMarkerCount >= 2) {
    detectionReasons.push('检测到多题编号或题序');
  }

  if (boilerplateLines.length >= Math.max(3, Math.ceil(rawLines.length * 0.4)) && detectionReasons.length < 2) {
    rejectionReasons.push('页面包含大量出版或版权信息');
  }

  const contactHintCount = rawLines.filter((line) => /(ISBN|网址|电话|电子邮件|反馈平台|后记|定价|邮编)/i.test(line)).length;
  if (contactHintCount >= 2 && detectionReasons.length < 3) {
    rejectionReasons.push('页面更像封面、版权页或后记');
  }

  if (detectionReasons.length < 2) {
    rejectionReasons.push('练习题识别信号不足');
  }

  const firstMarkerIndex = cleanedLines.findIndex((line) => questionMarkerPattern.test(line));
  const introLines =
    firstMarkerIndex > 0
      ? cleanedLines
          .slice(0, firstMarkerIndex)
          .filter(
            (line) =>
              config.exerciseTitlePattern.test(line) ||
              config.sectionCuePattern.test(line) ||
              config.instructionCuePattern.test(line),
          )
          .slice(-2)
      : [];

  const sectionLabel =
    cleanedLines.find((line) => config.exerciseTitlePattern.test(line) || config.sectionCuePattern.test(line)) ??
    introLines.find((line) => config.exerciseTitlePattern.test(line) || config.sectionCuePattern.test(line)) ??
    null;

  return {
    matched: rejectionReasons.length === 0,
    detectionReasons,
    rejectionReasons,
    cleanedLines,
    introLines,
    sectionLabel,
  };
}

export function splitTextbookPageCandidates(pageText: string, subject: Subject = 'math'): TextbookSplitCandidate[] {
  const detection = analyzeTextbookPage(pageText, subject);
  if (!detection.matched) {
    return [];
  }

  const markerIndexes = detection.cleanedLines
    .map((line, index) => (questionMarkerPattern.test(line) ? index : -1))
    .filter((index) => index >= 0);

  if (markerIndexes.length === 0) {
    return [
      buildFallbackCandidate({
        cleanedLines: detection.cleanedLines,
        detectionReason: [...detection.detectionReasons, '按整页候选回退'].join('；'),
        sectionLabel: detection.sectionLabel,
      }),
    ];
  }

  const segments: string[][] = [];
  let currentSegment: string[] = [];
  for (const line of detection.cleanedLines.slice(markerIndexes[0])) {
    if (questionMarkerPattern.test(line)) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
      }
      currentSegment = [line];
      continue;
    }

    if (currentSegment.length > 0) {
      currentSegment.push(line);
    }
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  const validSegments = segments.filter((segment) => segment.join('').length >= 4);
  if (validSegments.length === 0) {
    return [
      buildFallbackCandidate({
        cleanedLines: detection.cleanedLines,
        detectionReason: [...detection.detectionReasons, '题号切分失败，按整页候选回退'].join('；'),
        sectionLabel: detection.sectionLabel,
      }),
    ];
  }

  return validSegments.map((segment, index) => {
    const excerptLines = dedupeConsecutiveLines([...detection.introLines, ...segment]).slice(0, 12);
    return {
      candidateIndexOnPage: index + 1,
      splitMode: 'question',
      sectionLabel: detection.sectionLabel,
      candidateStem: buildCandidateStem(excerptLines),
      excerpt: excerptLines.join('\n').slice(0, 1200),
      detectionReason: [...detection.detectionReasons, '按题号切分候选'].join('；'),
    };
  });
}

export function assessImportCandidateQuality(candidate: {
  splitMode: QuestionImportSplitMode;
  sectionLabel: string | null;
  candidateStem: string;
  excerpt: string;
  detectionReason: string;
}): QuestionImportQualityAssessment {
  const qualityFlags: string[] = [];

  if (candidate.splitMode === 'page') {
    qualityFlags.push('page_fallback');
  }

  if (candidate.sectionLabel == null || candidate.sectionLabel.trim().length === 0) {
    qualityFlags.push('missing_section_label');
  }

  const trimmedStem = candidate.candidateStem.trim();
  if (trimmedStem.length < 8) {
    qualityFlags.push('stem_too_short');
  }

  if (/^(?:（\d+）|\(\d+\)|\d+[\.、]|[一二三四五六七八九十]+[\.、])/.test(trimmedStem) && trimmedStem.length < 12) {
    qualityFlags.push('stem_maybe_incomplete');
  }

  const excerptLineCount = candidate.excerpt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length;
  if (excerptLineCount >= 6) {
    qualityFlags.push('excerpt_contains_extra_context');
  }

  if (/按整页候选回退|题号切分失败/.test(candidate.detectionReason)) {
    qualityFlags.push('split_fallback');
  }

  const qualityLevel = qualityFlags.some((flag) => ['page_fallback', 'stem_too_short', 'split_fallback'].includes(flag))
    ? 'low'
    : qualityFlags.length >= 2
      ? 'medium'
      : 'high';

  return {
    qualityLevel,
    qualityFlags,
  };
}

export function suggestAnswerModeFromCandidate(
  candidate: {
    candidateStem: string;
    excerpt: string;
  },
  subject: Subject = 'math',
): QuestionAnswerMode | null {
  const normalized = `${candidate.candidateStem}\n${candidate.excerpt}`;

  if (/(选择|选项|A[\.．、 ]|B[\.．、 ]|C[\.．、 ]|D[\.．、 ])/i.test(normalized)) {
    return 'single_choice';
  }

  if (/(判断|对吗|正确吗|是否正确)/.test(normalized)) {
    return 'boolean';
  }

  if (subject === 'english' && /(listen|read|look|match|write|talk|spell|choose|circle|tick)/i.test(normalized)) {
    return 'text_blank';
  }

  if (subject === 'chinese' && /(写话|习作|阅读短文|回答问题|说一说|造句)/.test(normalized)) {
    return 'short_answer';
  }

  if (/(列竖式|怎样解答|说明理由|你还能提出|解决问题|说说)/.test(normalized)) {
    return 'stepwise';
  }

  if (/(厘米|米|元|角|时|分|填上|填空|写出相应)/.test(normalized)) {
    return 'text_blank';
  }

  if (/[+＋\-×xX÷=＝]/.test(normalized)) {
    return 'numeric_blank';
  }

  return null;
}

function buildFallbackCandidate(input: {
  cleanedLines: string[];
  detectionReason: string;
  sectionLabel: string | null;
}): TextbookSplitCandidate {
  const excerptLines = input.cleanedLines.slice(0, 12);
  return {
    candidateIndexOnPage: 1,
    splitMode: 'page',
    sectionLabel: input.sectionLabel,
    candidateStem: buildCandidateStem(excerptLines),
    excerpt: excerptLines.join('\n').slice(0, 1200),
    detectionReason: input.detectionReason,
  };
}

function normalizeImportLines(pageText: string) {
  return pageText
    .replace(/\u00a0/g, ' ')
    .split(/\r?\n/)
    .flatMap((line) => splitInlineQuestionMarkers(line))
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .filter((line) => !pageMarkerPattern.test(line))
    .filter((line, index) => !(index === 0 && /^\d+$/.test(line)))
    .filter((line) => !/^[\d一二三四五六七八九十]{1,2}$/.test(line));
}

function splitInlineQuestionMarkers(line: string) {
  return line
    .replace(/\s+(?=(?:（\d+）|\(\d+\)|\d+[\.、]|[一二三四五六七八九十]+[\.、]))/g, '\n')
    .split('\n');
}

function dedupeConsecutiveLines(lines: string[]) {
  return lines.filter((line, index) => line !== lines[index - 1]);
}

function isBoilerplateLine(line: string) {
  return boilerplatePattern.test(line);
}

function containsArithmeticExpression(line: string) {
  if (isBoilerplateLine(line)) {
    return false;
  }
  return arithmeticPattern.test(line);
}

function buildCandidateStem(lines: string[]) {
  const markerIndex = lines.findIndex((line) => questionMarkerPattern.test(line));
  if (markerIndex >= 0) {
    const markerLine = lines[markerIndex];
    if (pureQuestionIndexPattern.test(markerLine)) {
      const nextContentLine = lines.slice(markerIndex + 1).find((line) => line.length >= 2);
      if (nextContentLine) {
        return `${markerLine}${nextContentLine}`.slice(0, 80);
      }
    }
    return markerLine.slice(0, 80);
  }

  const candidateLine =
    lines.find((line) => containsArithmeticExpression(line)) ??
    lines.find((line) => combinedInstructionCuePattern.test(line)) ??
    lines.find((line) => line.length >= 6);

  return (candidateLine ?? '教材导入候选').slice(0, 80);
}
