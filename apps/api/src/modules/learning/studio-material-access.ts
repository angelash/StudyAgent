import { ForbiddenException } from '@nestjs/common';
import type { StudioSourceMaterial } from '@study-agent/contracts';
import type { InMemoryUserAccount } from '../../infrastructure/in-memory-store.service';
import { StudentsService } from '../students/students.service';

export type StudioMaterialRecord = StudioSourceMaterial & { requestKey?: string; requestHash?: string;
  pageImages?: Record<string, string>; pageFiles?:Array<{page:number;sha256:string;size:number}>; commands?: Array<{ key: string; hash: string; kind: string }> };
export function assertMaterialAccess(user: InMemoryUserAccount, material: StudioSourceMaterial, students: StudentsService) {
  if (material.studentId) students.assertCanAccessStudent(user, material.studentId);
  else if (user.role === 'student' || material.ownerUserId !== user.id) throw new ForbiddenException('无法访问其他账号的私人资料');
}
export function studioMaterialView(row: StudioMaterialRecord): StudioSourceMaterial {
  const { requestKey: _requestKey, requestHash: _requestHash, commands: _commands, pageImages, pageFiles:_pageFiles, ...material } = structuredClone(row);
  return { ...material, status: material.status ?? 'ready', hasPageImages: Boolean(pageImages && Object.keys(pageImages).length) || material.hasPageImages };
}
