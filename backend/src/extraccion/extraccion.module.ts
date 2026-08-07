import { Module } from '@nestjs/common';
import { DocumentosModule } from '../documentos/documentos.module';
import { ReglasModule } from '../reglas/reglas.module';
import { ClasificadorService } from './clasificador.service';
import { GeminiExtractorService } from './gemini.service';
import { INVOICE_EXTRACTOR } from './invoice-extractor.interface';
import { ProcesadorService } from './procesador.service';

@Module({
  imports: [DocumentosModule, ReglasModule],
  providers: [
    GeminiExtractorService,
    { provide: INVOICE_EXTRACTOR, useExisting: GeminiExtractorService },
    ClasificadorService,
    ProcesadorService,
  ],
  exports: [ProcesadorService],
})
export class ExtraccionModule {}
