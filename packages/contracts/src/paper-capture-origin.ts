import {z} from 'zod';
export const PAPER_CAPTURE_PDF_RENDERER='pdf-lib-1.17.1/a4-contain-24pt-v1';
export const PAPER_CAPTURE_PDF_NOTICE='图片组的派生PDF；原上传图片与原页身份独立保留。PDF页号仅对应这份冻结组版本，不表示原书页码或内容审核。';
const id=z.string().min(1).max(180),hash=z.string().regex(/^[a-f0-9]{64}$/),dimension=z.number().int().positive().max(6000);
export const paperCapturePdfPageSchema=z.object({page:z.number().int().min(1).max(120),pageId:id,originalSha256:hash,baselineSha256:hash,versionFingerprint:hash,renderedSha256:hash,width:dimension,height:dimension,
 pdfWidth:z.number().positive(),pdfHeight:z.number().positive(),imageBox:z.object({x:z.number().nonnegative(),y:z.number().nonnegative(),width:z.number().positive(),height:z.number().positive()}).strict(),coordinateSpace:z.literal('pdf-bottom-left-points-v1')}).strict();
export const paperCapturePdfReceiptSchema=z.object({protocol:z.literal('paper-capture-derived-pdf-v1'),groupId:id,groupRevision:z.number().int().positive(),groupFingerprint:hash,renderer:z.literal(PAPER_CAPTURE_PDF_RENDERER),pdfSha256:hash,pdfBytes:z.number().int().positive().max(80*1024*1024),pages:z.array(paperCapturePdfPageSchema).min(1).max(120),fingerprint:hash,notice:z.literal(PAPER_CAPTURE_PDF_NOTICE)}).strict();
export type PaperCapturePdfPage=z.infer<typeof paperCapturePdfPageSchema>;
export type PaperCapturePdfReceipt=z.infer<typeof paperCapturePdfReceiptSchema>;
export type PaperCaptureMaterialOrigin={protocol:'paper-capture-material-origin-v1';derivationId:string;
 sourceGroupScope:{creatorFingerprint:string;studentId:string|null;subject:'math'|'chinese'|'english'|'chemistry'|null};pdf:PaperCapturePdfReceipt;fingerprint:string};
export type PaperCaptureCourseSource={protocol:'paper-capture-course-source-v1';derivationId:string;originFingerprint:string;sourceGroupScope:PaperCaptureMaterialOrigin['sourceGroupScope'];groupId:string;groupRevision:number;groupFingerprint:string;pdfSha256:string;page:PaperCapturePdfPage};
