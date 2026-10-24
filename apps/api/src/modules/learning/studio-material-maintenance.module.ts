import { Module } from '@nestjs/common';
import { StudioMaterialMaintenanceService } from './studio-material-maintenance.service';
@Module({providers:[StudioMaterialMaintenanceService],exports:[StudioMaterialMaintenanceService]})
export class StudioMaterialMaintenanceModule{}
