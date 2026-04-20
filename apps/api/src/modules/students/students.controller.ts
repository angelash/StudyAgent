import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { StudentsService } from './students.service';

@UseGuards(AuthGuard)
@Controller()
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Post('students')
  createStudent(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      nickname: string;
      grade: number;
      preferredSessionMinutes: number;
      defaultVersionMap: {
        chinese: string;
        math: string;
        english: string;
      };
    },
  ) {
    return this.studentsService.createStudent(req.user, body);
  }

  @Get('students/:studentId/profile')
  getProfile(@Req() req: AuthenticatedRequest, @Param('studentId') studentId: string) {
    return this.studentsService.getProfile(req.user, studentId);
  }

  @Post('parents/:parentId/bindings')
  bindStudent(
    @Req() req: AuthenticatedRequest,
    @Param('parentId') parentId: string,
    @Body() body: { studentId: string },
  ) {
    if (req.user.id !== parentId && req.user.role !== 'admin') {
      throw new ForbiddenException('Cannot bind student for another parent');
    }

    return this.studentsService.bindStudent(req.user, body.studentId);
  }

  @Get('parents/:parentId/students')
  listChildren(@Req() req: AuthenticatedRequest, @Param('parentId') parentId: string) {
    if (req.user.id !== parentId && req.user.role !== 'admin') {
      throw new ForbiddenException('Cannot list another parent students');
    }

    return this.studentsService.listChildren(req.user);
  }
}
