import { BadRequestException, Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { streamFile } from '../../common/stream-file';
import { ClassroomVisualService } from './classroom-visual.service';
@UseGuards(AuthGuard)
@Controller('learning/classroom/sessions/:sessionId/visuals')
export class ClassroomVisualController {
    constructor(private readonly visuals: ClassroomVisualService) { }
    @Get()
    list(
    @Req()
    req: AuthenticatedRequest,
    @Param('sessionId')
    sessionId: string) { return this.visuals.list(req.user, sessionId); }
    @Post()
    create(
    @Req()
    req: AuthenticatedRequest,
    @Param('sessionId')
    sessionId: string,
    @Body()
    body: unknown) { return this.visuals.create(req.user, sessionId, body); }
    @Post(':id/:action')
    action(
    @Req()
    req: AuthenticatedRequest,
    @Param('sessionId')
    sessionId: string,
    @Param('id')
    id: string,
    @Param('action')
    action: string,
    @Body()
    body: unknown) { if (!['select', 'unselect', 'cancel', 'retry', 'delete'].includes(action))
        throw new BadRequestException('未知图片操作'); return this.visuals.action(req.user, sessionId, id, action as 'select', body); }
    @Get(':id/file')
    file(
    @Req()
    req: AuthenticatedRequest,
    @Param('sessionId')
    sessionId: string,
    @Param('id')
    id: string,
    @Res({ passthrough: true })
    response: Response) { return streamFile(this.visuals.file(req.user, sessionId, id), req.headers.range, response); }
}
