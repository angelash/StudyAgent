import { Module } from '@nestjs/common';
import { LibraryController } from './library.controller';
import { LibraryRepository } from './library.repository';
import { LibraryService } from './library.service';
@Module({ controllers: [LibraryController], providers: [LibraryRepository, LibraryService], exports: [LibraryRepository, LibraryService] })
export class LibraryModule {}
