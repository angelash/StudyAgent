import { describe, expect, it } from 'vitest';
import { sourceCourseContentSchema } from '@study-agent/contracts';
import { z } from 'zod';
import { credentialsSchema, validate } from './validation';

describe('validation migration and constrained collection limits',()=>{
  it('rejects an oversized teaching collection before reading or parsing its entries',()=>{
    let entryReads=0;
    const oversized=new Proxy(Array(10000),{get(target,key,receiver){if(/^\d+$/u.test(String(key))){entryReads++;throw new Error('oversized entries must not be visited');}return Reflect.get(target,key,receiver);}});
    const result=sourceCourseContentSchema.safeParse({title:'Anonymous limit probe',overview:'Checks collection admission before element work.',lessons:oversized});
    expect(result.success).toBe(false);if(!result.success)expect(result.error.issues).toContainEqual(expect.objectContaining({code:'too_big',path:['lessons']}));expect(entryReads).toBe(0);
  });
  it('preserves normalization, strict unknown-field rejection and string-keyed records',()=>{
    expect(validate(credentialsSchema,{principal:'  TEST@LOCAL.TEST ',credential:'Fixture-only-password'}).principal).toBe('test@local.test');
    expect(()=>validate(credentialsSchema,{principal:'test@local.test',credential:'Fixture-only-password',admin:true})).toThrow('输入格式有误');
    expect(validate(z.record(z.string(),z.string().max(10)),{'lesson-id':'saved','中文字段':'草稿'})).toEqual({'lesson-id':'saved','中文字段':'草稿'});
  });
});
