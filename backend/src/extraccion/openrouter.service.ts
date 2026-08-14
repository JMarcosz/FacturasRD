import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import sharp from 'sharp';
import type { FacturaExtraida } from '../dgii';
import type { DocumentoParaExtraer, IInvoiceExtractor, ResultadoExtraccion } from './invoice-extractor.interface';
import { reforzarConPatrones } from './reforzar-hechos';
import { RetryService } from './retry/retry.service';
import { isValidDate, isValidNcf, isValidRncOrCedula, validateExtraction } from './validation/extraction.validator';

@Injectable()
export class OpenRouterExtractorService implements IInvoiceExtractor {
  private readonly logger = new Logger(OpenRouterExtractorService.name);
  private readonly apiKey: string;
  private readonly modelName: string;

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
    private readonly retryService: RetryService,
  ) {}

  private getApiKey(): string {
    return process.env.OPENROUTER_API_KEY || this.config.get<string>('OPENROUTER_API_KEY', '') || '';
  }

  private getModelName(): string {
    return process.env.OPENROUTER_MODEL || this.config.get<string>('OPENROUTER_MODEL', 'google/gemini-2.5-flash') || 'google/gemini-2.5-flash';
  }

  private async optimizarImagen(buffer: Buffer, mimeType: string): Promise<{ buffer: Buffer; mimeType: string }> {
    if (mimeType === 'application/pdf') {
      return { buffer, mimeType };
    }

    try {
      const optimizado = await sharp(buffer)
        .rotate()
        .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();

      return { buffer: optimizado, mimeType: 'image/jpeg' };
    } catch (err: any) {
      this.logger.warn(`No se pudo optimizar la imagen con sharp: ${err.message}. Se enviará original.`);
      return { buffer, mimeType };
    }
  }

  async extraer(buffer: Buffer, mimeType: string): Promise<ResultadoExtraccion> {
    const apiKey = this.getApiKey();
    const modelName = this.getModelName();

    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY no está configurada en .env');
    }

    const { buffer: imgBuffer, mimeType: imgMime } = await this.optimizarImagen(buffer, mimeType);

    this.logger.log(`Enviando factura a OpenRouter [${modelName}] (${imgMime}, ${imgBuffer.length} bytes / orig: ${buffer.length} bytes)...`);

    const base64Image = imgBuffer.toString('base64');
    const dataUrl = `data:${imgMime};base64,${base64Image}`;

    const promptText = `Eres un extractor OCR experto en comprobantes fiscales de República Dominicana (DGII).

Analiza la imagen de la factura y extrae la información con máxima precisión respetando estas REGLAS FUNDAMENTALES:

1. DISTINCIÓN ENTRE EMISOR Y RECEPTOR (CRÍTICO):
   - EMISOR (Quien vende o presta el servicio): Es la empresa o negocio que emite la factura, ubicada en el encabezado, logotipo o membrete superior (ej: Distribuidora de Electricidad del Este / EDEESTE, EDESUR, EDENORTE, ALTICE, CLARO, CAASD, comercios, distribuidores). Su RNC va en "rncEmisor" y su nombre en "nombreEmisor".
   - RECEPTOR (Quien compra o recibe el servicio): Es el cliente, comprador o abonado a cuyo nombre se factura, ubicado en secciones como "Facturado a:", "Cliente:", "Nombre / Razón Social:", "Abonado:", "Titular:". Su RNC/Cédula va en "rncReceptor" y su nombre en "nombreReceptor".
   - En facturas de servicios públicos, telecomunicaciones, energía eléctrica, agua o suministros, la empresa de servicios es SIEMPRE el EMISOR y el cliente/abonado es SIEMPRE el RECEPTOR. NUNCA los inviertas.

2. FORMATO Y CAMPOS:
   - RNC/Cédula: Solo dígitos limpios, sin guiones ni espacios (ej: si en la factura dice "1-31-04484-2" extrae "131044842"; si dice "001-0192993-1" extrae "00101929931"). NUNCA coloques el NCF en el campo de RNC.
   - Fecha de emisión: Formato YYYY-MM-DD. Si la fecha principal de la factura es borrosa, ilegible o no está clara en Facturas Electrónicas (e-CF), extrae la fecha del sello de Firma Digital / Certificación ("Fecha y hora de firma", "Fecha firma digital", "Fecha certificación").
   - NCF: Extrae el comprobante completo exactamente como aparece (ej: E310000604671, B0100000137, B0200000045).
   - Montos: Extrae números limpios en formato decimal con punto (ej: "7450.57", "0.00").
   - Líneas de detalle: Extrae todas las filas del desglose (descripción, cantidad, precio unitario, importe).

Devuelve ÚNICAMENTE un objeto JSON estrictamente válido con la siguiente estructura:
{
  "rncEmisor": string | null,
  "nombreEmisor": string | null,
  "rncReceptor": string | null,
  "nombreReceptor": string | null,
  "ncf": string | null,
  "ncfModificado": string | null,
  "fechaEmision": string | null (formato YYYY-MM-DD),
  "fechaVencimientoNcf": string | null (formato YYYY-MM-DD),
  "montoGravado": string | null,
  "montoExento": string | null,
  "itbis": string | null,
  "isc": string | null,
  "propinaLegal": string | null,
  "otrosImpuestos": string | null,
  "montoTotal": string | null,
  "formaPagoImpresa": string | null,
  "condicionPago": string | null,
  "lineas": [
    {
      "descripcion": string,
      "cantidad": string | null,
      "precioUnitario": string | null,
      "importe": string | null
    }
  ]
}
No inventes datos. Si un campo no es visible o legible, devuelve null. Si no hay líneas desglosadas, devuelve un arreglo vacío.`;

    const payload = {
      model: modelName,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    };

    let attempt = 0;
    while (true) {
      attempt++;
      try {
        const response = await firstValueFrom(
          this.httpService.post('https://openrouter.ai/api/v1/chat/completions', payload, {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'HTTP-Referer': 'https://facturasrd.local',
              'X-Title': 'FacturasRD',
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          }),
        );

        const choice = response.data?.choices?.[0];
        const contentStr = choice?.message?.content || '{}';
        
        let rawData: FacturaExtraida;
        try {
          rawData = JSON.parse(contentStr);
        } catch {
          // Si el JSON viene rodeado de bloques markdown ```json ... ```
          const match = contentStr.match(/\{[\s\S]*\}/);
          rawData = match ? JSON.parse(match[0]) : ({} as FacturaExtraida);
        }

        const hechos = reforzarConPatrones(rawData, contentStr);

        // Quality Gate & Micro-Retries Especializados (Plan Maestro Secciones 7 y 8)
        const quality = validateExtraction(hechos);
        if (!quality.valid) {
          for (const issue of quality.issues) {
            if (issue.field === 'fechaEmision' && !isValidDate(hechos.fechaEmision)) {
              const fechaRecuperada = await this.retryService.retryFecha(imgBuffer, imgMime);
              if (fechaRecuperada) hechos.fechaEmision = fechaRecuperada;
            } else if (issue.field === 'ncf' && !isValidNcf(hechos.ncf)) {
              const ncfRecuperado = await this.retryService.retryNcf(imgBuffer, imgMime);
              if (ncfRecuperado?.ncf) {
                hechos.ncf = ncfRecuperado.ncf;
                if (ncfRecuperado.ncfModificado) hechos.ncfModificado = ncfRecuperado.ncfModificado;
              }
            } else if (issue.field === 'rncEmisor' || issue.field === 'rncReceptor') {
              const idsRecuperados = await this.retryService.retryIdentificadores(imgBuffer, imgMime);
              if (idsRecuperados) {
                if (!isValidRncOrCedula(hechos.rncEmisor) && idsRecuperados.rncEmisor) {
                  hechos.rncEmisor = idsRecuperados.rncEmisor;
                }
                if (!isValidRncOrCedula(hechos.rncReceptor) && idsRecuperados.rncReceptor) {
                  hechos.rncReceptor = idsRecuperados.rncReceptor;
                }
              }
            }
          }
        }

        return {
          hechos,
          confidences: {},
          paginas: 1,
          raw: response.data,
        };
      } catch (error: any) {
        const errDetail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
        if (attempt >= 3) {
          this.logger.error(`Error tras 3 intentos con OpenRouter: ${errDetail}`);
          throw new Error(`OpenRouter Error: ${errDetail}`);
        }
        this.logger.warn(`Intento ${attempt} falló con OpenRouter: ${errDetail}. Reintentando...`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  async extraerLote(documentos: DocumentoParaExtraer[]): Promise<Array<ResultadoExtraccion | null>> {
    this.logger.log(`Procesando lote de ${documentos.length} facturas en ráfaga paralela con OpenRouter...`);
    
    // Procesamiento en paralelo de alta concurrencia
    const promises = documentos.map((doc) =>
      this.extraer(doc.buffer, doc.mimeType).catch((err) => {
        this.logger.error(`Error procesando documento en lote: ${err.message}`);
        return null;
      }),
    );

    return await Promise.all(promises);
  }
}
