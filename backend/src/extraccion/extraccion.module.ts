import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DocumentosModule } from '../documentos/documentos.module';
import { ReglasModule } from '../reglas/reglas.module';
import { SugerenciasModule } from '../sugerencias/sugerencias.module';
import { ClasificadorService } from './clasificador.service';
import { ClasificadorCostoGastoService } from './clasificador-costo-gasto.service';
import { OpenRouterExtractorService } from './openrouter.service';
import { INVOICE_EXTRACTOR } from './invoice-extractor.interface';
import { ProcesadorService } from './procesador.service';
import { RetryService } from './retry/retry.service';

@Module({
  imports: [
    DocumentosModule,
    ReglasModule,
    SugerenciasModule,
    HttpModule.register({
      timeout: 60000,
    }),
  ],
  providers: [
    RetryService,
    OpenRouterExtractorService,
    { provide: INVOICE_EXTRACTOR, useExisting: OpenRouterExtractorService },
    ClasificadorCostoGastoService,
    ClasificadorService,
    ProcesadorService,
  ],
  exports: [ProcesadorService, ClasificadorService, ClasificadorCostoGastoService, RetryService],
})
export class ExtraccionModule {}

