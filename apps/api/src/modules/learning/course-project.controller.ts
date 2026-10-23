import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { CourseProjectService } from './course-project.service';

@UseGuards(AuthGuard)
@Controller('learning/projects')
export class CourseProjectController {
  constructor(private readonly projects: CourseProjectService) {}
  @Get('catalog') catalog(@Req() req: AuthenticatedRequest, @Query() query: unknown) { return this.projects.catalog(req.user, query); }
  @Get(':id') get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return this.projects.get(req.user, id); }
  @Post() open(@Req() req: AuthenticatedRequest, @Body() input: unknown) { return this.projects.open(req.user, input); }
  @Patch(':id') save(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) { return this.projects.save(req.user, id, input); }
  @Post(':id/submissions') submit(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) { return this.projects.submit(req.user, id, input); }
  @Post(':id/reviews') review(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) { return this.projects.review(req.user, id, input); }
  @Post(':id/legacy') legacy(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) { return this.projects.importLegacy(req.user, id, input); }
  @Post(':id/advice') async advice(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) {
    const controller = new AbortController(), disconnect = () => { if (!req.res?.writableEnded) controller.abort(); };
    req.res?.once('close', disconnect);
    try { return await this.projects.advise(req.user, id, input, controller.signal); }
    finally { req.res?.off('close', disconnect); }
  }
}
