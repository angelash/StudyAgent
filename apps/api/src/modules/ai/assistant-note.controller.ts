import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../../common/auth.guard';
import { AssistantNoteService } from './assistant-note.service';

@UseGuards(AuthGuard)
@Controller('ai/assistant/sessions/:sessionId/artifacts/notes')
export class AssistantNoteController {
  constructor(private readonly notes: AssistantNoteService) {}
  @Post() create(@Req() r: AuthenticatedRequest, @Param('sessionId') s: string, @Body() body: unknown) { return this.notes.create(r.user, s, body, r.authSession); }
  @Get() list(@Req() r: AuthenticatedRequest, @Param('sessionId') s: string, @Query() query: unknown) { return this.notes.list(r.user, s, query, r.authSession); }
  @Get('requests/:key') creationReceipt(@Req() r: AuthenticatedRequest, @Param('sessionId') s: string, @Param('key') key: string) { return this.notes.creationReceipt(r.user, s, key, r.authSession); }
  @Get(':id/requests/:key') receipt(@Req() r: AuthenticatedRequest, @Param('sessionId') s: string, @Param('id') id: string, @Param('key') key: string) { return this.notes.receipt(r.user, s, id, key, r.authSession); }
  @Get(':id/export') export(@Req() r: AuthenticatedRequest, @Param('sessionId') s: string, @Param('id') id: string, @Query() query: unknown) { return this.notes.export(r.user, s, id, query, r.authSession); }
  @Get(':id') get(@Req() r: AuthenticatedRequest, @Param('sessionId') s: string, @Param('id') id: string) { return this.notes.get(r.user, s, id, r.authSession); }
  @Patch(':id/content') edit(@Req() r: AuthenticatedRequest, @Param('sessionId') s: string, @Param('id') id: string, @Body() body: unknown) { return this.notes.edit(r.user, s, id, body, r.authSession); }
  @Post(':id/confirm') confirm(@Req() r: AuthenticatedRequest, @Param('sessionId') s: string, @Param('id') id: string, @Body() body: unknown) { return this.notes.confirm(r.user, s, id, body, r.authSession); }
}
