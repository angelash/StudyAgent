import { Module } from '@nestjs/common';
import { GespController } from './gesp.controller';
import { GespService } from './gesp.service';

@Module({ controllers: [GespController], providers: [GespService] })
export class GespModule {}
