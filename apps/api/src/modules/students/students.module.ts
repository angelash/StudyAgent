import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { StudentAccessService } from './student-access.service';

@Module({
  controllers: [StudentsController],
  providers: [StudentsService, StudentAccessService],
  exports: [StudentsService],
})
export class StudentsModule {}
