import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentosController } from './documentos.controller';
import { DocumentosService } from './documentos.service';
import { DocumentosEventosService } from './documentos-eventos.service';

@Module({
  imports: [AuthModule],
  controllers: [DocumentosController],
  providers: [DocumentosService, DocumentosEventosService],
  exports: [DocumentosService, DocumentosEventosService],
})
export class DocumentosModule {}
