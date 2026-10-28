import type { ClassroomLesson, StudioCourse, StudioLesson } from '@study-agent/contracts';
import { CHEMISTRY_TUTORIAL_VERSION, chemistryExperiments, chemistryReference, chemistryTutorialForAtom, chemistryTutorials } from './chemistry-tutorial-content';

export function chemistryTextbookBasis() {
  return { title: chemistryReference.title, editionNotice: chemistryReference.editionNotice, href: chemistryReference.href,
    tutorialVersion: CHEMISTRY_TUTORIAL_VERSION,
    mappings: chemistryTutorials.map(item => ({ atomId: 'chemistry:9-upper:' + item.code,
      lesson: item.caption, topic: item.topic, printedPages: item.pages })) };
}

/** Pure revision: retains course identity, lesson state, pace, scope and all learner evidence. */
export function withChemistryTutorial(course: StudioCourse): StudioCourse {
  return { ...course, teachingVersion: CHEMISTRY_TUTORIAL_VERSION,
    description: '广州 · 人教版九上化学参考教程。28节图文讲解、10种模型演示、28道随堂检查，衔接原有诊断、独立考核与间隔复测。',
    materials: [
      ...course.materials.filter(item => !['mapping', 'chemistry-reference', 'chemistry-visuals'].includes(item.id)),
      { id: 'chemistry-reference', title: '参考本课题对照', detail: '28节课对应已读七单元参考本的课题及页段；当前学校用书版次待核对，见资料面板。', status: 'available' },
      { id: 'chemistry-visuals', title: '图示、演示与随堂检查', detail: '28张原创科学图示、10种可操作模型、每节1道随堂检查；模型反馈不作为独立考核成绩。', status: 'available' },
    ] };
}

export function supplementChemistryLesson(course: StudioCourse, source: StudioLesson, lesson: ClassroomLesson): ClassroomLesson {
  if (course.subject !== 'chemistry' || course.teachingVersion !== CHEMISTRY_TUTORIAL_VERSION) return lesson;
  const tutorial = chemistryTutorialForAtom(source.atomId);
  if (!tutorial) throw new Error('新版化学讲解缺少对应课题：' + source.id);
  const concept = lesson.steps.find(step => step.phase === 'concept')!;
  const guidance = tutorial.insight + '看图时，' + tutorial.readImage;
  concept.narration += '。' + guidance;
  concept.durationMs = Math.max(concept.durationMs, concept.narration.length * 180);
  concept.blocks.push({ id: source.id + ':v2:insight', kind: 'text', text: tutorial.insight },
    { id: source.id + ':v2:figure', kind: 'image', text: tutorial.caption,
      image: { src: `/classroom/chemistry-v2/${tutorial.code}.svg`, alt: tutorial.readImage, caption: tutorial.caption + ' · 原创示意图' } },
    { id: source.id + ':v2:read-figure', kind: 'text', text: '读图：' + tutorial.readImage });
  if (tutorial.experiment) {
    const experiment = structuredClone(chemistryExperiments[tutorial.experiment]);
    concept.blocks.push({ id: source.id + ':v2:experiment', kind: 'experiment', text: experiment.title, experiment });
  }
  const checkStep = lesson.steps.find(step => step.phase === 'check')!;
  const practiceNotice = '先完成下方随堂检查，说明判断依据，再进入独立练习。随堂反馈帮助理解，本身不证明已经掌握。';
  checkStep.narration += '。' + practiceNotice;
  checkStep.blocks.push({ id: source.id + ':v2:practice-notice', kind: 'text', text: practiceNotice });
  lesson.sourceReferences = [{ sourceKey: 'pep-chemistry-reference:' + chemistryReference.sha256, title: chemistryReference.title,
    page: tutorial.pages[0] + 5, locator: `${tutorial.topic} · 参考本印刷页 ${tutorial.pages[0]}–${tutorial.pages[1]}`,
    href: chemistryReference.href, quote: '课题与页段依据已读参考本；讲解、图示、模型和检查题为原创。' + chemistryReference.editionNotice }];
  lesson.practiceVersion = CHEMISTRY_TUTORIAL_VERSION + ':' + tutorial.code;
  lesson.questions = [{ id: source.id + ':' + CHEMISTRY_TUTORIAL_VERSION + ':check', prompt: tutorial.check.prompt,
    options: [...tutorial.check.options], hint: tutorial.check.hint, hintCount: 2,
    purpose: 'application', topic: { lessonId: source.id, title: source.title } }];
  return lesson;
}

export function chemistryTutorialKeys(lesson: ClassroomLesson) {
  const tutorial = chemistryTutorials.find(item => lesson.practiceVersion === CHEMISTRY_TUTORIAL_VERSION + ':' + item.code);
  if (!tutorial || lesson.questions.length !== 1 || lesson.questions[0].id !== lesson.id + ':' + CHEMISTRY_TUTORIAL_VERSION + ':check') return undefined;
  const id = lesson.questions[0].id;
  return { answers: { [id]: { answer: tutorial.check.answer, explanation: tutorial.check.explanation } },
    hints: { [id]: [tutorial.check.hint, tutorial.insight] } };
}
