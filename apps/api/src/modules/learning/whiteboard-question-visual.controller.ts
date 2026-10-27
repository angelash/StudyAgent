import { Body, Controller, Get, NotFoundException, Param, Post, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { WhiteboardQuestionVisualService } from './whiteboard-question-visual.service';

function imageFile(file: { bytes: Buffer; sha256: string }, response: Response) {
  response.setHeader('Cache-Control', 'private, no-store'); response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('X-Image-Sha256', file.sha256);
  response.setHeader('Access-Control-Expose-Headers', 'X-Image-Sha256'); return new StreamableFile(file.bytes, { type: 'image/png', length: file.bytes.length, disposition: 'inline' });
}
function filePart(part: string): 'image' | 'original' { if (part !== 'image' && part !== 'original') throw new NotFoundException('图片部分不存在'); return part; }
@UseGuards(AuthGuard)
@Controller('learning/studio/whiteboard-question-visuals')
export class WhiteboardQuestionVisualController {
  constructor(private readonly images: WhiteboardQuestionVisualService) {}
  @Get('capabilities') capabilities() { return this.images.capabilities(); }
  @Get('source') source(@Req() r: AuthenticatedRequest, @Query() q: unknown) { return this.images.source(r.user, q, r.authSession); }
  @Get('requests/:key') receipt(@Req() r: AuthenticatedRequest, @Param('key') key: string) { return this.images.receipt(r.user, key, r.authSession); }
  @Get() list(@Req() r: AuthenticatedRequest, @Query() q: unknown) { return this.images.list(r.user, q, r.authSession); }
  @Post('preflight') preflight(@Req() r: AuthenticatedRequest, @Body() input: unknown) { return this.images.preflight(r.user, input, r.authSession); }
  @Post('adopt') adopt(@Req() r: AuthenticatedRequest, @Body() input: unknown) { return this.images.adopt(r.user, input, r.authSession); }
  @Post() create(@Req() r: AuthenticatedRequest, @Body() input: unknown) { return this.images.prepare(r.user, input, r.authSession); }
  @Get(':id') get(@Req() r: AuthenticatedRequest, @Param('id') id: string) { return this.images.get(r.user, id, r.authSession); }
  @Get(':id/requests/:key') controlReceipt(@Req() r: AuthenticatedRequest, @Param('id') id: string, @Param('key') key: string) { return this.images.receipt(r.user, key, r.authSession, id); }
  @Get(':id/:part') file(@Req() r: AuthenticatedRequest, @Param('id') id: string, @Param('part') part: string, @Res({ passthrough: true }) response: Response) {
    return imageFile(this.images.file(r.user, id, filePart(part), r.authSession), response);
  }
  @Post(':id/edit') edit(@Req() r: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) { return this.images.prepare(r.user, input, r.authSession, id); }
  @Post(':id/cancel') cancel(@Req() r: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) { return this.images.control(r.user, id, 'cancel', input, r.authSession); }
  @Post(':id/retry') retry(@Req() r: AuthenticatedRequest, @Param('id') id: string, @Body() input: unknown) { return this.images.control(r.user, id, 'retry', input, r.authSession); }
}
@UseGuards(AuthGuard)
@Controller('learning/studio/:boardType/:boardId/questions/:turnId/teaching-versions')
export class WhiteboardQuestionTeachingVersionController {
  constructor(private readonly images: WhiteboardQuestionVisualService) {}
  private target(boardType: string, boardId: string, turnId: string) {
    if (!['whiteboards', 'topic-whiteboards'].includes(boardType)) throw new NotFoundException('原白板类型不存在');
    return { boardKind: boardType === 'topic-whiteboards' ? 'topic' as const : 'guidance' as const, boardId, turnId };
  }
  @Get() versions(@Req() r: AuthenticatedRequest, @Param('boardType') type: string, @Param('boardId') board: string, @Param('turnId') turn: string) {
    return this.images.source(r.user, this.target(type, board, turn), r.authSession).versions;
  }
  @Get(':id/board') board(@Req() r: AuthenticatedRequest, @Param('boardType') type: string, @Param('boardId') board: string, @Param('turnId') turn: string, @Param('id') id: string) {
    return this.images.teaching(r.user, this.target(type, board, turn), id, r.authSession).board;
  }
  @Get(':id/figure/:part') file(@Req() r: AuthenticatedRequest, @Param('boardType') type: string, @Param('boardId') board: string, @Param('turnId') turn: string,
    @Param('id') id: string, @Param('part') part: string, @Res({ passthrough: true }) response: Response) {
    return imageFile(this.images.versionFile(r.user, this.target(type, board, turn), id, filePart(part), r.authSession), response);
  }
}
