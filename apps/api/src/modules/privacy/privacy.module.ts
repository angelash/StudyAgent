import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';
import { StudentMediaModule } from '../student-media/student-media.module';
import { StudioMaterialMaintenanceModule } from '../learning/studio-material-maintenance.module';
@Module({ imports: [AuthModule, StudentMediaModule,StudioMaterialMaintenanceModule], controllers: [PrivacyController], providers: [PrivacyService] })
export class PrivacyModule {}
