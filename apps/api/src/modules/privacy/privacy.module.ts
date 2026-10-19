import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';
import { StudentMediaModule } from '../student-media/student-media.module';
@Module({ imports: [AuthModule, StudentMediaModule], controllers: [PrivacyController], providers: [PrivacyService] })
export class PrivacyModule {}
