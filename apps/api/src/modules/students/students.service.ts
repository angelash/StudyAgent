import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { validate } from '../../common/validation';
import { hashToken } from '../auth/auth.service';
import { StudentProfile, SubjectEnrollment } from '@study-agent/contracts';
import { DomainEventBusService } from '../../infrastructure/domain-event-bus.service';
import {
  InMemoryStoreService,
  InMemoryUserAccount,
  ParentStudentBinding,
} from '../../infrastructure/in-memory-store.service';

type CreateStudentCommand = {
  nickname: string;
  grade: number;
  preferredSessionMinutes: number;
  defaultVersionMap: {
    chinese: string;
    math: string;
    english: string;
  };
};

@Injectable()
export class StudentsService {
  constructor(
    private readonly store: InMemoryStoreService,
    private readonly eventBus: DomainEventBusService,
  ) {}

  createStudent(parentUser: InMemoryUserAccount, command: CreateStudentCommand) {
    command = validate(z.object({ nickname: z.string().trim().min(1).max(50), grade: z.number().int().min(1).max(6),
      preferredSessionMinutes: z.number().int().min(5).max(90), defaultVersionMap: z.object({
        chinese: z.string().max(150), math: z.string().max(150), english: z.string().max(150),
      }).strict() }).strict(), command);
    if (!['parent', 'admin'].includes(parentUser.role)) {
      throw new ForbiddenException('Only parent or admin can create student profile');
    }

    const profile: StudentProfile = {
      id: this.store.nextId('student'),
      userId: this.store.nextId('student_user'),
      nickname: command.nickname,
      grade: command.grade,
      preferredSessionMinutes: command.preferredSessionMinutes,
      defaultVersionMap: command.defaultVersionMap,
    };

    this.store.students.push(profile);

    const enrollments: SubjectEnrollment[] = (['chinese', 'math', 'english'] as const).map((subject) => ({
      id: this.store.nextId('enroll'),
      studentId: profile.id,
      subject,
      enabled: Boolean(command.defaultVersionMap[subject]),
      textbookVersionId: command.defaultVersionMap[subject],
    }));
    this.store.subjectEnrollments.push(...enrollments);

    const binding: ParentStudentBinding = {
      id: this.store.nextId('binding'),
      parentUserId: parentUser.id,
      studentId: profile.id,
      relation: 'guardian',
      status: 'active',
    };
    this.store.bindings.push(binding);

    this.eventBus.publish('student.created', {
      studentId: profile.id,
      parentUserId: parentUser.id,
    });

    for (const enrollment of enrollments) {
      this.eventBus.publish('student.subject_enrolled', {
        studentId: profile.id,
        subject: enrollment.subject,
        textbookVersionId: enrollment.textbookVersionId,
      });
    }

    return {
      profile: {
        ...profile,
        enrollments,
      },
      enrollments,
      binding,
    };
  }

  createInvitation(parentUser: InMemoryUserAccount, studentId: string, recipientPrincipal: string) {
    this.assertCanAccessStudent(parentUser, studentId);
    if (!['parent', 'admin'].includes(parentUser.role)) throw new ForbiddenException();
    const principal = validate(z.string().trim().min(3).max(254), recipientPrincipal).toLowerCase();
    const token = randomBytes(32).toString('base64url');
    const invitation = { id: this.store.nextId('invite'), studentId, issuerId: parentUser.id,
      recipientPrincipal: principal, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(), consumedAt: null };
    this.store.studentInvitations.push(invitation);
    this.eventBus.publish('student.invitation_created', { studentId, issuerId: parentUser.id, invitationId: invitation.id });
    return { id: invitation.id, token, expiresAt: invitation.expiresAt, recipientPrincipal: principal };
  }

  bindStudent(parentUser: InMemoryUserAccount, studentId: string, inviteToken?: string) {
    const student = this.store.students.find((item) => item.id === studentId);
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const existing = this.store.bindings.find(
      (item) => item.parentUserId === parentUser.id && item.studentId === studentId && item.status === 'active',
    );
    if (existing) {
      return existing;
    }

    const invitation = inviteToken ? this.store.studentInvitations.find((item) => item.studentId === studentId &&
      item.tokenHash === hashToken(inviteToken) && item.recipientPrincipal === parentUser.principal &&
      !item.consumedAt && Date.parse(item.expiresAt) > Date.now()) : undefined;
    if (!invitation || parentUser.role !== 'parent') throw new ForbiddenException('需要孩子监护人发给当前账号的有效邀请');
    invitation.consumedAt = new Date().toISOString();

    const binding: ParentStudentBinding = {
      id: this.store.nextId('binding'),
      parentUserId: parentUser.id,
      studentId,
      relation: 'guardian',
      status: 'active',
    };
    this.store.bindings.push(binding);
    return binding;
  }

  getProfile(requestUser: InMemoryUserAccount, studentId: string) {
    this.assertCanAccessStudent(requestUser, studentId);

    const profile = this.store.students.find((item) => item.id === studentId);
    if (!profile) {
      throw new NotFoundException('Student not found');
    }

    const enrollments = this.store.subjectEnrollments.filter((item) => item.studentId === studentId);
    return {
      ...profile,
      enrollments,
    };
  }

  listChildren(parentUser: InMemoryUserAccount) {
    const bindings = this.store.bindings.filter((item) => item.parentUserId === parentUser.id && item.status === 'active');
    return bindings.map((binding) => this.getProfile(parentUser, binding.studentId));
  }

  assertCanAccessStudent(requestUser: InMemoryUserAccount, studentId: string) {
    if (requestUser.role === 'admin') {
      return;
    }

    const hasBinding = this.store.bindings.some(
      (item) => item.parentUserId === requestUser.id && item.studentId === studentId && item.status === 'active',
    );
    if (!hasBinding) {
      throw new ForbiddenException('You cannot access this student');
    }
  }
}
