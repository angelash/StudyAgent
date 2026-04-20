import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
      enabled: subject === 'math',
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

  bindStudent(parentUser: InMemoryUserAccount, studentId: string) {
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
