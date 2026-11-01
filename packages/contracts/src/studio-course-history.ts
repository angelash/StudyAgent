import { z } from 'zod';
import { atomTeachingSchema } from './diagnostics';
import { textbookTeachingPublicBaseSchema, textbookTeachingCourseDraftSchema, textbookTeachingCourseSelectionSchema } from './textbook-teaching';
import type { ClassroomLesson } from './classroom';
import type { StudioCourse } from './studio';

const key=z.string().min(1).max(180),hash=z.string().regex(/^[a-f0-9]{64}$/),revision=z.number().int().min(0).max(1000),text=z.string().max(100000);
// The generated classroom is checked against teachingClassroomSnapshot by the
// history model; this structural check never authenticates the projection.
const classroom=z.custom<ClassroomLesson>(value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value)));
const lesson=z.object({id:key,atomId:key.nullable(),title:text,objective:text,kind:z.enum(['learn','practice','project','exam']),
 state:z.enum(['not_started','attempted','familiar','proficient','mastered']),href:text,
 teaching:z.object({atomVersion:z.number().int().min(1),teaching:atomTeachingSchema}).strict().optional(),targetAtomIds:z.array(key).max(1000).optional(),
 textbookTeaching:textbookTeachingPublicBaseSchema.extend({fingerprint:hash,lesson:classroom}).strict().optional(),textbookTeachingLessonId:key.optional(),estimatedMinutes:z.number().min(0).max(100000).optional()}).strict();
export const studioCourseSnapshotSchema:z.ZodType<StudioCourse>=z.object({id:key,studentId:key,subject:z.enum(['math','chinese','english','chemistry']),grade:z.number().int().min(1).max(12),
 term:z.enum(['upper','lower']),title:text,description:text,objective:text,status:z.enum(['draft','active','completed']),source:z.literal('studyagent_curriculum'),scopeVersion:z.number().int().min(1),
 textbookVersion:text,curriculumVersion:key.optional(),teachingVersion:key.optional(),focusAtomIds:z.array(key).max(10000),teachingSelection:textbookTeachingCourseSelectionSchema.optional(),contentRevision:revision.optional(),
 units:z.array(z.object({id:key,title:text,objective:text,lessons:z.array(lesson).max(2000)}).strict()).max(1000),
 materials:z.array(z.object({id:key,title:text,detail:text,status:z.enum(['available','needs_review'])}).strict()).max(10000),fingerprint:key,createdAt:z.string().datetime(),updatedAt:z.string().datetime(),
 learningProgress:z.object({viewedLessonIds:z.array(key).max(10000),startedLessonIds:z.array(key).max(10000),lastLessonId:key.nullable(),updatedAt:z.string().datetime().nullable()}).strict().optional(),
 pace:z.object({version:z.literal('course-pace-v1'),minutesPerSession:z.number().int().min(5).max(60),teachingLanguage:z.literal('source'),estimatedMinutes:z.number().min(0),notice:text,
 sessions:z.array(z.object({id:key,minutes:z.number().min(0),activities:z.array(z.object({lessonId:key,title:text,kind:z.enum(['learn','practice','project','exam']),part:z.number().int().min(1),parts:z.number().int().min(1),minutes:z.number().min(0)}).strict()).max(10000)}).strict()).max(10000)}).strict().optional()}).strict();
export const textbookTeachingCourseUpgradeDraftSchema=textbookTeachingCourseDraftSchema.omit({title:true,objective:true}).extend({courseId:key,expectedCourseFingerprint:key,expectedRevision:revision}).strict();
export const textbookTeachingCourseUpgradeSchema=textbookTeachingCourseUpgradeDraftSchema.extend({previewFingerprint:hash,requestKey:key.refine(value=>value.length>=8)}).strict();
export type TextbookTeachingCourseUpgradeDraft=z.infer<typeof textbookTeachingCourseUpgradeDraftSchema>;
export type TextbookTeachingCourseUpgrade=z.infer<typeof textbookTeachingCourseUpgradeSchema>;
export const textbookTeachingCourseUpgradeResultSchema=z.object({protocol:z.literal('textbook-teaching-course-upgrade-result-v1'),courseId:key,revision:revision.min(1),
 previousFingerprint:key,fingerprint:key,requestKey:key,at:z.string().datetime()}).strict();
export type TextbookTeachingCourseUpgradeResult=z.infer<typeof textbookTeachingCourseUpgradeResultSchema>;
export type TextbookTeachingCourseUpgradePreview={protocol:'textbook-teaching-course-upgrade-preview-v1';course:StudioCourse;previousRevision:number;previousFingerprint:string;
 changes:{addedTargets:string[];removedTargets:string[];previousLessons:number;nextLessons:number};previewFingerprint:string;canUpgrade:boolean;warnings:string[]};
export type StudioCourseVersionMetadata={revision:number;fingerprint:string;previousFingerprint:string|null;at:string;title:string;targets:number;lessons:number};
export type StudioCourseHistory={protocol:'textbook-teaching-course-history-v1';courseId:string;currentRevision:number;versions:StudioCourseVersionMetadata[]};
export type StudioCourseVersion={protocol:'textbook-teaching-course-version-v1';courseId:string;revision:number;course:StudioCourse};
export type TextbookTeachingCourseUpgradeReceipt={requestKey:string;requestHash:string;result:TextbookTeachingCourseUpgradeResult;course:StudioCourse};
