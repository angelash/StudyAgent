import { Controller, Get, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthGuard, AuthenticatedRequest } from '../../common/auth.guard';
import { RateLimitService } from '../../infrastructure/rate-limit.service';
import { TRANSCRIPTION_MAX_BYTES, TranscriptionService } from './transcription.service';

/** 232 §5.2: spoken classroom questions to text. Signed-in learners only; recordings stay in memory for one call. */
@UseGuards(AuthGuard)
@Controller('ai/speech/transcriptions')
export class TranscriptionController {
  constructor(private readonly transcription: TranscriptionService, private readonly limits: RateLimitService) {}
  @Get('status') status() { return this.transcription.status(); }
  @Post()
  @UseInterceptors(FileInterceptor('audio', { storage: memoryStorage(), limits: { fileSize: TRANSCRIPTION_MAX_BYTES, files: 1 } }))
  async transcribe(@Req() req: AuthenticatedRequest, @UploadedFile() file: Express.Multer.File | undefined) {
    await this.limits.assert('speech-transcription:' + req.user.id, 40, 10 * 60_000);
    const abort = new AbortController(), disconnect = () => { if (!req.res?.writableEnded) abort.abort(); };
    req.res?.once('close', disconnect);
    try { return await this.transcription.transcribe(file, abort.signal); } finally { req.res?.off('close', disconnect); }
  }
}
