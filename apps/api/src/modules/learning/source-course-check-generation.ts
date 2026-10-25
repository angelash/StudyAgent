import { z } from 'zod';
import { sourceCourseCheckContentSchema,type SourceCourseCheckContent } from '@study-agent/contracts';
import { validateSourceCourseCheck,sourceCheckDigest,type PreparedSourceCheck } from './source-course-check-content';

export const sourceCheckJsonSchema=z.toJSONSchema(sourceCourseCheckContentSchema);
const reviewSchema=z.object({decision:z.enum(['pass','revised','uncertain']),issues:z.array(z.string().trim().min(1).max(500)).max(12),revisedContent:sourceCourseCheckContentSchema.nullable()}).strict();
export const sourceCheckReviewJsonSchema=z.toJSONSchema(reviewSchema);
export function validateSourceCheckReview(value:unknown,prepared:PreparedSourceCheck,initial:SourceCourseCheckContent){
  const review=reviewSchema.parse(value);
  if(review.decision==='pass'&&(review.issues.length||review.revisedContent)||review.decision==='uncertain'&&(!review.issues.length||review.revisedContent)||review.decision==='revised'&&(!review.issues.length||!review.revisedContent))throw Error('source_check_review_inconsistent');
  const content=validateSourceCourseCheck(prepared,review.revisedContent??initial);
  if(review.decision==='revised'&&sourceCheckDigest(content)===sourceCheckDigest(initial))throw Error('source_check_review_unchanged');
  return{decision:review.decision,issues:review.issues,content};
}
