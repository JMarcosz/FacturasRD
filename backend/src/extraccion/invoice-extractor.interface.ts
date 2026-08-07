import type { FacturaExtraida } from '../dgii';

export interface ResultadoExtraccion {
  hechos: FacturaExtraida;
  confidences: Record<string, number>;
  paginas: number;
  raw: unknown;
}

export interface DocumentoParaExtraer {
  buffer: Buffer;
  mimeType: string;
}

/** Token de inyección — permite sustituir el extractor (ej. e-CF XML, Fase 7) sin tocar el procesador. */
export const INVOICE_EXTRACTOR = Symbol('INVOICE_EXTRACTOR');

export interface IInvoiceExtractor {
  extraer(buffer: Buffer, mimeType: string): Promise<ResultadoExtraccion>;
  /**
   * Extrae varios documentos en un solo request para no chocar con el límite
   * de requests/minuto del proveedor. Paralelo al array de entrada: la
   * posición `i` del resultado es `null` cuando esa imagen puntual no se
   * pudo extraer con confianza (el llamador la reprocesa con `extraer`).
   */
  extraerLote(documentos: DocumentoParaExtraer[]): Promise<Array<ResultadoExtraccion | null>>;
}
