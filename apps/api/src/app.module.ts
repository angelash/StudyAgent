import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { ApiResponseInterceptor } from './common/api-response.interceptor';
import { RequestContextMiddleware } from './common/request-context.middleware';
import { CoreModule } from './infrastructure/core.module';
import { AuthModule } from './modules/auth/auth.module';
import { StudentsModule } from './modules/students/students.module';
import { ContentModule } from './modules/content/content.module';
import { AssessmentsModule } from './modules/assessments/assessments.module';
import { MissionsModule } from './modules/missions/missions.module';
import { AiModule } from './modules/ai/ai.module';
import { ProgressModule } from './modules/progress/progress.module';
import { PlansModule } from './modules/plans/plans.module';

@Module({
  imports: [CoreModule, AuthModule, StudentsModule, ContentModule, AssessmentsModule, MissionsModule, AiModule, ProgressModule, PlansModule],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiResponseInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
