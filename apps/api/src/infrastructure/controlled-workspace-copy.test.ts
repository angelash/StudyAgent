import {describe,it,expect} from 'vitest';
import {readControlledCopy,controlledPreviewCommand,controlledAssessmentHref,sameControlledCommand} from '../../../web/lib/controlled-contrast-workspace';
import type {ControlledAvailability} from '@study-agent/contracts';

describe('original controlled workbench copies and scope recovery',()=>{
 const scope={ownerId:'actual-parent',studentId:'actual-child',subject:'math' as const,atomId:'actual-original-atom'};
 const available:ControlledAvailability={studentId:scope.studentId,subject:scope.subject,atomId:scope.atomId,scopeId:'original-scope',scopeVersion:3,protocols:[{publicationId:'original-published-pairs',publicationFingerprint:'a'.repeat(64),publicationRevision:2,cause:'language_condition_gap',atomId:scope.atomId,availableIndependentUnits:2,fullyCovered:true,expectedSeconds:120,gaps:[]}],notice:'Actual synthetic reviewed engineering material.'};
 const form={publicationId:'original-published-pairs',independentUnits:2,maxSeconds:300},command=controlledPreviewCommand(available,form,'original-full-preview-key');
 const copy={format:'controlled-contrast-workspace-v1',...scope,form,previewId:null,pending:{kind:'preview',input:command},rejected:[]};
 it('recovers the full original command rather than silently adopting a later scope or source edition',()=>{
  const later={...available,scopeVersion:4,protocols:[{...available.protocols[0],publicationFingerprint:'b'.repeat(64),publicationRevision:3}]};
  expect(readControlledCopy(JSON.parse(JSON.stringify(copy)),scope).pending).toEqual({kind:'preview',input:command});
  expect(controlledPreviewCommand(later,form,'another-explicit-command-key')).not.toEqual(command);
 });
 it('refuses another account, child, subject, target and an injected unreviewed selection override',()=>{
  for(const changed of [{...scope,ownerId:'another-user'},{...scope,studentId:'another-child'},{...scope,subject:'chemistry' as const},{...scope,atomId:'another-atom'}])expect(()=>readControlledCopy(copy,changed)).toThrow();
  expect(()=>readControlledCopy({...copy,pending:{kind:'preview',input:{...command,seenQuestionIds:[]}}},scope)).toThrow();
  expect(()=>readControlledCopy({...copy,pending:{kind:'preview',input:{...command,studentId:'another-child'}}},scope)).toThrow();
 });
 it('binds a lost start command to its original preview while keeping rejected inputs and exact recovery links',()=>{
  const start={kind:'start',previewId:'original-preview',input:{protocol:'controlled-start-input-v1',expectedPreviewFingerprint:'c'.repeat(64),acknowledgeActualChild:true,requestKey:'original-start-key'}};
  const restored=readControlledCopy({...copy,previewId:'original-preview',pending:start,rejected:[copy.pending]},scope);expect(restored.pending).toEqual(start);expect(restored.rejected).toEqual([copy.pending]);
  expect(()=>readControlledCopy({...copy,previewId:'another-preview',pending:start},scope)).toThrow();
  const target=new URL(controlledAssessmentHref(scope.studentId,scope.subject,'original-session'),'http://study.test');expect(target.pathname).toBe('/studio/assessment');expect(target.searchParams.get('session')).toBe('original-session');expect(target.searchParams.get('studentId')).toBe(scope.studentId);
 });
 it('compares the full retained command across JSONB object order and refuses altered input under the same old request key',()=>{
  expect(sameControlledCommand(command,Object.fromEntries(Object.entries(command).reverse()))).toBe(true);
  expect(sameControlledCommand(command,{...command,maxItems:2})).toBe(false);
  expect(sameControlledCommand(command,undefined)).toBe(false);
 });
});
