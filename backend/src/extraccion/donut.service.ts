import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { FacturaExtraida } from '../dgii';
import type { DocumentoParaExtraer, IInvoiceExtractor, ResultadoExtraccion } from './invoice-extractor.interface';
import { reforzarConPatrones } from './reforzar-hechos';

@Injectable()
export class DonutExtractorService implements IInvoiceExtractor {
  private readonly logger = new Logger(DonutExtractorService.name);
  private readonly apiUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apiUrl = this.config.get<string>('AI_SERVICE_URL', 'http://127.0.0.1:8000');
  }

  async extraer(buffer: Buffer, mimeType: string): Promise<ResultadoExtraccion> {
    this.logger.log(`Enviando a Donut AI Service (${mimeType}, ${buffer.length} bytes)...`);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    formData.append('file', blob, 'invoice' + (mimeType === 'application/pdf' ? '.pdf' : '.jpg'));

    let attempt = 0;
    while (true) {
      attempt++;
      try {
        const response = await firstValueFrom(
          this.httpService.post(`${this.apiUrl}/extract-invoice`, formData, {
            timeout: 60000,
          })
        );
        
        const responseData = response.data;
        if (!responseData || !responseData.success) {
          throw new Error('La API de Donut devolvió error o success=false');
        }

        const rawData = responseData.data as FacturaExtraida;
        const textoCompleto = responseData.raw?.text ?? '';
        
        const hechos = reforzarConPatrones(rawData, textoCompleto);
        
        return {
          hechos,
          confidences: {},
          paginas: 1,
          raw: responseData.raw,
        };
      } catch (error) {
        if (attempt >= 3) {
          this.logger.error(`Error tras 3 intentos con Donut: ${error.message}`);
          throw error;
        }
        this.logger.warn(`Intento ${attempt} falló, reintentando Donut: ${error.message}`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  async extraerLote(documentos: DocumentoParaExtraer[]): Promise<Array<ResultadoExtraccion | null>> {
    this.logger.log(`Procesando lote de ${documentos.length} facturas secuencialmente con Donut...`);
    const resultados: Array<ResultadoExtraccion | null> = [];
    for (const doc of documentos) {
      try {
        const result = await this.extraer(doc.buffer, doc.mimeType);
        resultados.push(result);
      } catch (error) {
        this.logger.error(`Falló extracción de documento en lote: ${error.message}`);
        resultados.push(null);
      }
    }
    return resultados;
  }
}
