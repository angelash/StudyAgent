import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { WhiteboardQuestionBoardKind } from '@study-agent/contracts';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { WhiteboardQuestionService } from './whiteboard-question.service';
import { WhiteboardQuestionNarrationService } from './whiteboard-question-narration.service';

async function narrate(service: WhiteboardQuestionNarrationService, req: AuthenticatedRequest, response: Response,
  kind: WhiteboardQuestionBoardKind, board: string, id: string, sceneId: string, input: unknown) {
  const abort = new AbortController(), disconnect = () => { if (!req.res?.writableEnded) abort.abort(); };
  req.res?.once('close', disconnect);
  let result: Awaited<ReturnType<WhiteboardQuestionNarrationService['synthesize']>>;
  try { result = await service.synthesize(req.user, kind, board, id, sceneId, input, req.authSession, abort.signal); }
  finally { req.res?.off('close', disconnect); }
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Access-Control-Expose-Headers', 'X-Whiteboard-Presentation, X-Whiteboard-Fingerprint, X-Whiteboard-Unit');
  response.setHeader('X-Whiteboard-Presentation', result.identity.version); response.setHeader('X-Whiteboard-Fingerprint', result.identity.fingerprint);
  response.setHeader('X-Whiteboard-Unit', result.identity.unitId); return result.file;
}

@UseGuards(AuthGuard)
@Controller('learning/studio/whiteboards/:boardId/questions')
export class GuidanceWhiteboardQuestionController {
  constructor(private readonly turns: WhiteboardQuestionService, private readonly narration: WhiteboardQuestionNarrationService) {}
  @Get('context') context(@Req() r: AuthenticatedRequest, @Param('boardId') id: string, @Query() q: unknown) { return this.turns.context(r.user, 'guidance', id, q, r.authSession); }
  @Get('requests/:key') receipt(@Req() r: AuthenticatedRequest, @Param('boardId') id: string, @Param('key') key: string) { return this.turns.receipt(r.user, 'guidance', id, key, r.authSession); }
  @Get('notes') notes(@Req() r: AuthenticatedRequest, @Param('boardId') id: string) { return this.turns.notes(r.user, 'guidance', id, r.authSession); }
  @Get('notes/identity') notesIdentity(@Req() r: AuthenticatedRequest, @Param('boardId') id: string) { return this.turns.notesIdentity(r.user, 'guidance', id, r.authSession); }
  @Get(':id/board') board(@Req() r: AuthenticatedRequest, @Param('boardId') board: string, @Param('id') id: string, @Query('teachingVersionId') version?: string) { return this.turns.board(r.user, 'guidance', board, id, r.authSession, version); }
  @Post(':id/board/narration/:sceneId') speak(@Req() r: AuthenticatedRequest, @Param('boardId') board: string, @Param('id') id: string, @Param('sceneId') scene: string,
    @Body() input: unknown, @Res({ passthrough: true }) response: Response) { return narrate(this.narration, r, response, 'guidance', board, id, scene, input); }
  @Get() list(@Req() r: AuthenticatedRequest, @Param('boardId') id: string, @Query() q: unknown) { return this.turns.list(r.user, 'guidance', id, q, r.authSession); }
  @Get(':id') get(@Req() r: AuthenticatedRequest, @Param('boardId') board: string, @Param('id') id: string) { return this.turns.get(r.user, 'guidance', board, id, r.authSession); }
  @Post() create(@Req() r: AuthenticatedRequest, @Param('boardId') id: string, @Body() input: unknown) { return this.turns.create(r.user, 'guidance', id, input, r.authSession); }
  @Post(':id/cancel') cancel(@Req() r: AuthenticatedRequest, @Param('boardId') board: string, @Param('id') id: string, @Body() input: unknown) { return this.turns.control(r.user, 'guidance', board, id, 'cancel', input, r.authSession); }
  @Post(':id/retry') retry(@Req() r: AuthenticatedRequest, @Param('boardId') board: string, @Param('id') id: string, @Body() input: unknown) { return this.turns.control(r.user, 'guidance', board, id, 'retry', input, r.authSession); }
}

@UseGuards(AuthGuard)
@Controller('learning/studio/topic-whiteboards/:boardId/questions')
export class TopicWhiteboardQuestionController {
  constructor(private readonly turns: WhiteboardQuestionService, private readonly narration: WhiteboardQuestionNarrationService) {}
  @Get('context') context(@Req() r: AuthenticatedRequest, @Param('boardId') id: string, @Query() q: unknown) { return this.turns.context(r.user, 'topic', id, q, r.authSession); }
  @Get('requests/:key') receipt(@Req() r: AuthenticatedRequest, @Param('boardId') id: string, @Param('key') key: string) { return this.turns.receipt(r.user, 'topic', id, key, r.authSession); }
  @Get('notes') notes(@Req() r: AuthenticatedRequest, @Param('boardId') id: string) { return this.turns.notes(r.user, 'topic', id, r.authSession); }
  @Get('notes/identity') notesIdentity(@Req() r: AuthenticatedRequest, @Param('boardId') id: string) { return this.turns.notesIdentity(r.user, 'topic', id, r.authSession); }
  @Get(':id/board') board(@Req() r: AuthenticatedRequest, @Param('boardId') board: string, @Param('id') id: string, @Query('teachingVersionId') version?: string) { return this.turns.board(r.user, 'topic', board, id, r.authSession, version); }
  @Post(':id/board/narration/:sceneId') speak(@Req() r: AuthenticatedRequest, @Param('boardId') board: string, @Param('id') id: string, @Param('sceneId') scene: string,
    @Body() input: unknown, @Res({ passthrough: true }) response: Response) { return narrate(this.narration, r, response, 'topic', board, id, scene, input); }
  @Get() list(@Req() r: AuthenticatedRequest, @Param('boardId') id: string, @Query() q: unknown) { return this.turns.list(r.user, 'topic', id, q, r.authSession); }
  @Get(':id') get(@Req() r: AuthenticatedRequest, @Param('boardId') board: string, @Param('id') id: string) { return this.turns.get(r.user, 'topic', board, id, r.authSession); }
  @Post() create(@Req() r: AuthenticatedRequest, @Param('boardId') id: string, @Body() input: unknown) { return this.turns.create(r.user, 'topic', id, input, r.authSession); }
  @Post(':id/cancel') cancel(@Req() r: AuthenticatedRequest, @Param('boardId') board: string, @Param('id') id: string, @Body() input: unknown) { return this.turns.control(r.user, 'topic', board, id, 'cancel', input, r.authSession); }
  @Post(':id/retry') retry(@Req() r: AuthenticatedRequest, @Param('boardId') board: string, @Param('id') id: string, @Body() input: unknown) { return this.turns.control(r.user, 'topic', board, id, 'retry', input, r.authSession); }
}
