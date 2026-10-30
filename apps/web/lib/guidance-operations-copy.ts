import { z } from 'zod';
const id=z.string().min(1).max(180),key=z.string().min(8).max(180),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const guidanceStatusCommandSchema=z.object({expectedRevision:z.number().int().positive(),requestKey:key,status:z.enum(['active','paused','completed'])}).strict();
export const guidanceRetrospectiveCommandSchema=z.object({expectedRevision:z.number().int().positive(),requestKey:key,fingerprint:hash,reason:z.string().trim().min(5).max(1500)}).strict();
export const guidanceOperationSchema=z.discriminatedUnion('kind',[z.object({kind:z.literal('status'),command:guidanceStatusCommandSchema}).strict(),z.object({kind:z.literal('retrospective'),command:guidanceRetrospectiveCommandSchema}).strict()]);
export const guidanceOperationsCopySchema=z.object({format:z.literal('guidance-plan-operations-copy-v1'),ownerId:id,planId:id,studentId:id,reason:z.string().max(1500),fingerprint:hash.nullable(),acknowledged:z.boolean(),pending:guidanceOperationSchema.nullable(),rejected:z.array(guidanceOperationSchema).max(20),lastOperation:guidanceOperationSchema.nullable(),lastReceipt:z.object({kind:z.enum(['status','retrospective']),requestKey:key,revision:z.number().int().positive(),status:z.enum(['proposed','active','paused','completed'])}).strict().nullable()}).strict();
export type GuidanceOperation=z.infer<typeof guidanceOperationSchema>;
export type GuidanceOperationsCopy=z.infer<typeof guidanceOperationsCopySchema>;
export type GuidanceRetrospective={fingerprint:string;reviewed:boolean;followupSessionIds:string[];measurementContext?:{notice:string};comparisons:Array<{atomId:string;atomName:string;outcome:string;note:string;retentionSamples:number}>};
