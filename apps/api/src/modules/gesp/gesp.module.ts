import { Module } from '@nestjs/common';
import { GespController } from './gesp.controller';
import { GespService } from './gesp.service';
import { StudentsModule } from '../students/students.module';

@Module({ imports: [StudentsModule], controllers: [GespController], providers: [GespService] })
export class GespModule {}
