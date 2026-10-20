"""Create reviewable lesson-mapping candidates from complete local textbook PDFs.

This never approves a mapping. It aligns reviewed TOC lessons to PDF pages and
records lexical evidence so a human reviewer can inspect the original page.
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / 'resources/curriculum/chinatextbook-chinese-v1.json'
REVIEWED = ROOT / 'resources/curriculum/reviewed-textbook-chapters-v1.json'
ATOMS = ROOT / 'resources/curriculum/atom-catalog-v1.json'
OUTPUT = ROOT / 'resources/curriculum/textbook-mapping-candidates-v1.json'

SIGNALS = {
  'initial': ['声母', '韵母', '拼读', '拼音'], 'tone': ['声调', '第一声', '第二声', '第三声', '第四声', '标调'],
  'radical': ['偏旁', '部首', '提手旁', '三点水', '木字旁', '草字头'], 'structure': ['左右结构', '上下结构', '半包围', '字形结构'],
  'antonym': ['反义词', '相反', '意思相反'], 'classifier': ['量词', '一（', '一只', '一片', '一条'],
  'questionmark': ['问号', '疑问句', '问句'], 'person': ['谁', '人物', '主人公'], 'eventorder': ['先.*再', '然后', '接着', '先后顺序', '顺序'],
  'complete-sentence': ['完整句', '谁在做什么', '写句子', '句子完整'], 'polyphone': ['多音字', '读音', '读一读'],
  'homophone': ['同音字', '选字', '填字', '词语'], 'synonym': ['近义词', '相近', '意思相近'],
  'reduplication': ['AABB', 'ABAB', '叠词', '重叠'], 'because': ['因为', '所以', '原因', '结果'],
  'pronoun': ['代词', '指的是', '他指', '她指', '他们', '她们'], 'timeword': ['时间', '早上', '中午', '晚上', '先后'],
  'listpunctuation': ['顿号', '并列', '、'], 'instruction': ['要求', '注意', '根据.*完成', '按照'],
  'sequence-writing': ['先.*再', '接着', '然后', '最后', '写一写'], 'contextmeaning': ['联系上下文', '词语', '意思', '解释'],
  'simile': ['比喻', '好像', '仿佛', '像.*一样'], 'personification': ['拟人', '当作人', '人的动作'],
  'main-sentence': ['中心句', '总起', '围绕', '这一段'], 'detail-evidence': ['画出', '动词', '从哪里看出', '依据'],
  'classification': ['同类', '分类', '共同', '概括'], 'dialoguepunctuation': ['提示语', '引号', '冒号', '说：'],
  'factopinion': ['事实', '看法', '感受', '评价'], 'notice': ['通知', '时间', '地点', '要求'],
  'paragraph-summary': ['概括', '主要', '事情', '结果'], 'contrast': ['但是', '然而', '可是', '转折'],
  'reference-chain': ['这句话', '这个人', '指的是', '指代', '前者', '后者'], 'inference': ['推测', '推断', '可能', '说明'],
  'observation-order': ['从上到下', '从远到近', '从近到远', '方位', '观察顺序', '先.*再'], 'comparison-method': ['比较', '对比', '相当于'],
  'numbers-method': ['数字', '数据', '列数字', '准确'], 'emotion-evidence': ['心情', '情感', '体会', '从.*看出'],
  'letter-format': ['称呼', '署名', '书信', '写信'], 'remove-redundancy': ['重复', '修改', '病句', '多余'],
  'evidence-explanation': ['证据', '依据', '理由', '说明'], 'motivation': ['为什么', '目的', '因为', '动机'],
  'environment': ['环境', '天气', '景物', '心情', '烘托'], 'information-combine': ['结合材料', '两则', '信息', '材料'],
  'source-reliability': ['来源', '出处', '作者', '可信'], 'claim-support': ['观点', '理由', '支持', '依据'],
  'outline': ['提纲', '主要事件', '要点'], 'ambiguity': ['歧义', '不清楚', '指代不明', '改成'],
  'quoted-source': ['引用', '转述', '原话'], 'logical-condition': ['只有.*才', '只要.*就', '必要条件', '充分条件', '条件'],
  'compare-summary': ['比较', '建议', '条件', '材料'], 'viewpoint-compare': ['观点', '看法', '相同', '不同', '分歧'],
  'rhetorical-question': ['反问', '难道', '怎能', '不是.*吗'], 'double-negative': ['双重否定', '不能不', '不得不'],
  'counterevidence': ['反例', '相反', '不一定', '证据'], 'explanation-vs-fact': ['事实', '猜测', '解释', '原因'],
  'narrative-order': ['倒叙', '插叙', '顺叙', '回忆'], 'perspective': ['第一人称', '第三人称', '叙述'],
  'title-theme': ['题目', '标题', '主要内容'], 'evidence-citation': ['引用', '证据', '概括', '推广'],
  'argument-revision': ['观点', '证据', '不同意见', '反驳'], 'oral-complete': ['说一说', '谁在做什么'],
  'oral-sequence': ['说一说', '先', '再'], 'oral-retell': ['复述', '讲一讲'], 'oral-explain': ['说一说', '为什么'],
  'oral-evidence': ['依据', '说明', '说一说'], 'oral-alternative': ['比较', '方案', '不同意见'],
}


def normalize(value: str) -> str:
    return re.sub(r'[^一-龥A-Za-z0-9]', '', value).lower()


def atom_signal(atom: dict) -> list[str]:
    atom_id = atom['id']
    if atom_id.endswith('-locate'):
        return ['哪里', '地点', '位置', '从哪', '到哪']
    if atom_id.endswith('-cause'):
        return ['因为', '所以', '原因', '结果']
    return SIGNALS.get(atom_id.split(':')[-1], [])


def main() -> None:
    manifest = json.loads(MANIFEST.read_text('utf-8'))
    reviewed = json.loads(REVIEWED.read_text('utf-8'))
    atoms = json.loads(ATOMS.read_text('utf-8'))['atoms']
    if manifest.get('format') != 'chinatextbook-chinese-manifest-v1' or len(manifest.get('books', [])) != 12:
        raise ValueError('Complete textbook manifest is missing')
    rows = []
    offsets = {}
    for textbook in manifest['books']:
        matches = [book for book in reviewed['books'] if book['grade'] == textbook['grade'] and book['term'] == textbook['term']]
        if len(matches) != 1:
            raise ValueError('Reviewed TOC does not uniquely match textbook')
        book = matches[0]
        extraction = json.loads((ROOT / textbook['extractedPath']).read_text('utf-8'))
        pages = extraction['pages']
        page_norm = [normalize(row['text']) for row in pages]
        lessons = [lesson for chapter in book['chapters'] for lesson in chapter['lessons'] if lesson.get('kind') != 'reference']
        scored_offsets = []
        for offset in range(-10, 41):
            matches_count = sum(any(normalize(lesson['name']) in page_norm[page]
              for page in range(max(0, lesson['printedPage'] + offset - 1), min(len(pages), lesson['printedPage'] + offset + 1))) for lesson in lessons)
            scored_offsets.append((matches_count, -abs(offset - 5), offset))
        offset = max(scored_offsets)[2]
        offsets[book['id']] = offset
        available = [atom for atom in atoms if atom['subject'] == 'chinese' and atom['grade'] <= book['grade'] and
          (atom['grade'] < book['grade'] or atom['term'] in ['both', book['term']])]
        ordered = sorted(lessons, key=lambda lesson: (lesson['printedPage'], lesson['tocPage']))
        for index, lesson in enumerate(ordered):
            expected = max(1, lesson['printedPage'] + offset)
            title = normalize(lesson['name'])
            starts = [page + 1 for page in range(max(0, expected - 3), min(len(pages), expected + 2)) if title in page_norm[page]]
            all_starts = [page + 1 for page, text in enumerate(page_norm)
              if page >= 6 and abs(page + 1 - expected) <= 12 and title and title in text]
            if not starts and all_starts:
                starts = [min(all_starts, key=lambda page: abs(page - expected))]
            start = starts[0] if starts else expected
            next_start = ordered[index + 1]['printedPage'] + offset if index + 1 < len(ordered) else len(pages)
            end = max(start, min(len(pages), max(start, next_start - 1)))
            text = '\n'.join(row['text'] for row in pages[start - 1:end])
            candidates = []
            for atom in (available if starts else []):
                terms = atom_signal(atom)
                hits = {term: len(re.findall(term, text, re.I)) for term in terms}
                hits = {term: count for term, count in hits.items() if count}
                score = sum(min(3, count) for count in hits.values())
                if score >= 2 and hits:
                    candidates.append({ 'atomId': atom['id'], 'signalTerms': list(hits), 'signalOccurrences': sum(hits.values()),
                      'score': score, 'evidencePages': [start, end] })
            candidates.sort(key=lambda item: (-item['score'], -next(atom['grade'] for atom in available if atom['id'] == item['atomId']), item['atomId']))
            candidates = candidates[:3]
            rows.append({ 'bookId': book['id'], 'sourceBookId': textbook['id'], 'lessonId': lesson['id'], 'lessonName': lesson['name'],
              'printedPage': lesson['printedPage'], 'pdfStartPage': start, 'pdfEndPage': end, 'titleMatched': bool(starts),
              'candidateAtomIds': [candidate['atomId'] for candidate in candidates],
              'rationale': ('完整本地PDF课时页出现匹配词；候选仍需逐课时审核。' if candidates else
                ('完整本地PDF未能由文本可靠定位该课时标题；必须人工翻页核对。' if not starts else '完整本地PDF可读，但未达到当前词汇候选阈值；保留待人工判断。')),
              'evidence': candidates, 'reviewStatus': 'candidate' if candidates else 'unreviewed', 'approvedAtomIds': [] })
    rows.sort(key=lambda row: (row['bookId'], row['printedPage'], row['lessonId']))
    result = { 'format': 'textbook-mapping-candidates-v1', 'mappingStatus': 'candidates_not_approved',
      'scope': 'Candidate evidence only. No candidate is a published textbook-to-atom mapping.',
      'sourceSha256': { 'textbookManifest': __import__('hashlib').sha256(MANIFEST.read_bytes()).hexdigest(),
        'reviewedToc': __import__('hashlib').sha256(REVIEWED.read_bytes()).hexdigest(), 'atomCatalog': __import__('hashlib').sha256(ATOMS.read_bytes()).hexdigest() },
      'pageOffsets': offsets, 'books': 12, 'lessons': len(rows), 'titleMatched': sum(row['titleMatched'] for row in rows),
      'lessonsWithCandidates': sum(bool(row['candidateAtomIds']) for row in rows),
      'candidateMappings': sum(len(row['candidateAtomIds']) for row in rows),
      'atomsCovered': len({atom_id for row in rows for atom_id in row['candidateAtomIds']}), 'rows': rows }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    print(json.dumps({key: result[key] for key in ['books', 'lessons', 'titleMatched', 'lessonsWithCandidates', 'candidateMappings', 'atomsCovered']}))


if __name__ == '__main__':
    main()
