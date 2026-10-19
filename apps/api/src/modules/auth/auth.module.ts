import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccountsController } from './accounts.controller';

@Module({
  controllers: [AuthController, AccountsController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
