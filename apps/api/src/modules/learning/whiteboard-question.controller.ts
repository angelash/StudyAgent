import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { WhiteboardQuestionService } from './whiteboard-question.service';

@UseGuards(AuthGuard)
@Controller('learning/studio/whiteboards/:boardId/questions')
export class GuidanceWhiteboardQuestionController {
  constructor(private readonly turns: WhiteboardQuestionService) {}
  @Get('context') context(@Req() r: AuthenticatedRequest, @Param('boardId') id: string, @Query() q: unknown) { return this.turns.context(r.user, 'guidance', id, q, r.authSession); }
  @Get('requests/:key') receipt(@Req() r: AuthenticatedRequest, @Param('boardId') id: string, @Param('key') key: string) { return this.turns.receipt(r.user, 'guidance', id, key, r.authSession); }
  @Get() list(@Req() r: AuthenticatedRequest, @Param('boardId') id: string, @Query() q: unknown) { return this.turns.list(r.user, 'guidance', id, q, r.authSession); }
  @Get(':id') get(@Req() r: AuthenticatedRequest, @Param('boardId') board: string, @Param('id') id: string) { return this.turns.get(r.user, 'guidance', board, id, r.authSession); }
  @Post() create(@Req() r: AuthenticatedRequest, @Param('boardId') id: string, @Body() input: unknown) { return this.turns.create(r.user, 'guidance', id, input, r.authSession); }
  @Post(':id/cancel') cancel(@Req() r: AuthenticatedRequest, @Param('boardId') board: string, @Param('id') id: string, @Body() input: unknown) { return this.turns.control(r.user, 'guidance', board, id, 'cancel', input, r.authSession); }
  @Post(':id/retry') retry(@Req() r: AuthenticatedRequest, @Param('boardId') board: string, @Param('id') id: string, @Body() input: unknown) { return this.turns.control(r.user, 'guidance', board, id, 'retry', input, r.authSession); }
}

@UseGuards(AuthGuard)
@Controller('learning/studio/topic-whiteboards/:boardId/questions')
export class TopicWhiteboardQuestionController {
  constructor(private readonly turns: WhiteboardQuestionService) {}
  @Get('context') context(@Req() r: AuthenticatedRequest, @Param('boardId') id: string, @Query() q: unknown) { return this.turns.context(r.user, 'topic', id, q, r.authSession); }
  @Get('requests/:key') receipt(@Req() r: AuthenticatedRequest, @Param('boardId') id: string, @Param('key') key: string) { return this.turns.receipt(r.user, 'topic', id, key, r.authSession); }
  @Get() list(@Req() r: AuthenticatedRequest, @Param('boardId') id: string, @Query() q: unknown) { return this.turns.list(r.user, 'topic', id, q, r.authSession); }
  @Get(':id') get(@Req() r: AuthenticatedRequest, @Param('boardId') board: string, @Param('id') id: string) { return this.turns.get(r.user, 'topic', board, id, r.authSession); }
  @Post() create(@Req() r: AuthenticatedRequest, @Param('boardId') id: string, @Body() input: unknown) { return this.turns.create(r.user, 'topic', id, input, r.authSession); }
  @Post(':id/cancel') cancel(@Req() r: AuthenticatedRequest, @Param('boardId') board: string, @Param('id') id: string, @Body() input: unknown) { return this.turns.control(r.user, 'topic', board, id, 'cancel', input, r.authSession); }
  @Post(':id/retry') retry(@Req() r: AuthenticatedRequest, @Param('boardId') board: string, @Param('id') id: string, @Body() input: unknown) { return this.turns.control(r.user, 'topic', board, id, 'retry', input, r.authSession); }
}
