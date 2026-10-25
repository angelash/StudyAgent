import type { ProjectStage } from './course-project';
import type { ClassroomSpeechTrack } from './classroom-speech';
import type { StudioSpeechCapabilities } from './studio';

export const projectTeachingVersion = 'project-teaching-v1' as const;
export type ProjectTeachingStep = { id: string; kind: 'intro'|'field'|'evidence'|'reflection'; title: string; instruction: string; fieldId?: string };
export type ProjectTeachingView = { version: typeof projectTeachingVersion; projectId: string; definitionFingerprint: string;
  stages: Array<{stageId:string;steps:Array<ProjectTeachingStep & {speech:ClassroomSpeechTrack}>}>; speech:StudioSpeechCapabilities };

/** Derives navigation from the original frozen fields; never changes the project definition. */
export function projectTeachingSteps(stage:ProjectStage):ProjectTeachingStep[] {
  return [{id:'intro',kind:'intro',title:'项目导向',instruction:stage.title+'。'+stage.objective},
    ...stage.fields.map(field=>({id:'field:'+field.id,kind:'field' as const,fieldId:field.id,title:field.label,instruction:field.prompt})),
    {id:'evidence',kind:'evidence',title:'整理证据与附件',instruction:'保留支持作品的匿名观察、资料摘录和来源。说明哪些是事实、哪些是解释，以及还缺少什么。可以补充与本阶段有关的附件。'},
    {id:'reflection',kind:'reflection',title:'自评与提交',instruction:'对照本阶段的量规，选择符合当前作品的描述，并写出具体依据。确认产物和证据后再提交；提交会保留当时的版本，自评和AI建议不会登记为人工复核。'}];
}
