import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, type Schema } from '@google/genai';
import type { FacturaExtraida } from '../dgii';
import { PROMPT_FACTURA_RD, PROMPT_LOTE_FACTURAS_RD } from './prompt-gemini';
import { ESQUEMA_LOTE_GEMINI, ESQUEMA_RESPUESTA_GEMINI } from './schema-gemini';
import { reforzarConPatrones } from './reforzar-hechos';
import { analizarErrorGemini } from './error-gemini';
import { LimitadorTasa } from './limitador-tasa';
import type { DocumentoParaExtraer, IInvoiceExtractor, ResultadoExtraccion } from './invoice-extractor.interface';

type ParteContenido = { text: string } | { inlineData: { mimeType: string; data: string } };

interface HechosConTexto {
  hechos: FacturaExtraida;
  confidences: Array<{ campo: string; confianza: number }>;
  textoCompleto: string;
}

type RespuestaGemini = HechosConTexto;

interface RespuestaLoteGemini {
  resultados: Array<HechosConTexto & { indiceImagen: number }>;
}

/**
 * Distingue "el modelo cortó por presupuesto" de cualquier otro fallo. Solo
 * este caso amerita partir el lote en dos y reintentar — un fallo de red o de
 * parseo no se arregla con menos facturas por request.
 */
class RespuestaTruncadaError extends Error {}

const MAX_REINTENTOS_RATE_LIMIT = 5;
/**
 * Presupuesto de salida por documento. Medido sobre un lote real de 10
 * facturas dominicanas: la respuesta completa gastó 7724 tokens, ~772 por
 * factura (hechos + confidences + textoCompleto, que se lleva un tercio).
 *
 * Se reserva casi el doble a propósito: `maxOutputTokens` es un TECHO, no una
 * reserva facturable — solo se paga lo que el modelo genera de verdad, así que
 * quedarse corto cuesta el lote entero y pasarse no cuesta nada.
 */
const MAX_OUTPUT_TOKENS_POR_DOCUMENTO = 1500;
/**
 * Techo duro, no un objetivo. Antes valía 4000, lo que dejaba 400 tokens por
 * factura en un lote de 10 — la mitad de lo que necesita una. El modelo cortaba
 * en la séptima con finishReason=MAX_TOKENS y devolvía JSON partido, así que
 * `parsearJson` reventaba y se perdía el lote ENTERO. Si al subir
 * GEMINI_TAMANO_LOTE el presupuesto choca contra este techo, se avisa por log.
 */
const MAX_OUTPUT_TOKENS_TECHO = 32000;

@Injectable()
export class GeminiExtractorService implements IInvoiceExtractor {
  private readonly logger = new Logger(GeminiExtractorService.name);
  private readonly client: GoogleGenAI;
  private readonly modelo: string;
  // Compartido entre todas las llamadas (incluso las que corren en paralelo
  // desde distintos documentos) para que el ritmo real hacia la API de
  // Gemini nunca supere 1 request cada `minIntervaloMs`.
  private readonly limitador: LimitadorTasa;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.getOrThrow<string>('GEMINI_API_KEY');
    this.client = new GoogleGenAI({ apiKey });
    // Verificar el ID vigente en https://aistudio.google.com/ antes de cambiarlo.
    this.modelo = this.config.get<string>('GEMINI_MODEL', 'gemini-2.5-flash');
    const minIntervaloMs = Number(this.config.get('GEMINI_MIN_INTERVALO_MS', 4000));
    this.limitador = new LimitadorTasa(minIntervaloMs);
  }

  async extraer(buffer: Buffer, mimeType: string): Promise<ResultadoExtraccion> {
    const contenido: ParteContenido[] = [{ inlineData: { mimeType, data: buffer.toString('base64') } }];
    this.logger.log(`Enviando a Gemini (${this.modelo}, ${mimeType}, ${buffer.length} bytes)...`);
    const response = await this.generarConReintento(
      contenido,
      PROMPT_FACTURA_RD,
      ESQUEMA_RESPUESTA_GEMINI,
      MAX_OUTPUT_TOKENS_POR_DOCUMENTO,
    );
    const parseado = this.parsearJson<RespuestaGemini>(response.text);
    return this.aResultado(parseado);
  }

  /**
   * Manda varias facturas en un solo request — agrupar así es lo que evita
   * chocar con el límite de requests/minuto al subir muchas fotos juntas.
   * Cada imagen se ancla a un índice explícito (nunca a su posición en el
   * array): si el modelo devuelve un índice repetido, faltante o fuera de
   * rango, esa posición queda `null` en vez de arriesgarse a asignarle a una
   * factura los datos de otra — el llamador reprocesa esas posiciones solas.
   */
  async extraerLote(documentos: DocumentoParaExtraer[]): Promise<Array<ResultadoExtraccion | null>> {
    if (documentos.length === 0) return [];
    if (documentos.length === 1) {
      return [await this.extraer(documentos[0].buffer, documentos[0].mimeType)];
    }

    const contenido: ParteContenido[] = [];
    documentos.forEach((doc, i) => {
      contenido.push({ text: `=== IMAGEN ${i + 1} ===` });
      contenido.push({ inlineData: { mimeType: doc.mimeType, data: doc.buffer.toString('base64') } });
    });
    this.logger.log(`Enviando lote de ${documentos.length} facturas a Gemini (${this.modelo})...`);
    const maxOutputTokens = this.presupuestoSalida(documentos.length);
    let response;
    try {
      response = await this.generarConReintento(contenido, PROMPT_LOTE_FACTURAS_RD, ESQUEMA_LOTE_GEMINI, maxOutputTokens);
    } catch (e) {
      // El modelo cortó por presupuesto: partir el lote en dos y reintentar
      // cada mitad, en vez de dejar que esto burbujee hasta `procesarLote`,
      // que ante CUALQUIER fallo del lote cae a procesar cada documento por
      // separado — con GEMINI_TAMANO_LOTE=20 serían 20 requests individuales
      // en vez de 2 (una partición sola cubre el caso normal: el techo de
      // salida da para ~21 documentos, así que un lote de 20 que trunca es la
      // excepción, no la norma).
      if (e instanceof RespuestaTruncadaError && documentos.length > 1) {
        const mitad = Math.ceil(documentos.length / 2);
        this.logger.warn(`${e.message} Partiendo el lote de ${documentos.length} en 2 (${mitad} + ${documentos.length - mitad}) y reintentando.`);
        // En serie, no en paralelo: medido en este mismo proyecto que dos
        // peticiones concurrentes a la capa gratuita no suman caudal, cada
        // una tarda más y el total empeora (ver `ciclo()` en procesador.service.ts).
        const primera = await this.extraerLote(documentos.slice(0, mitad));
        const segunda = await this.extraerLote(documentos.slice(mitad));
        return [...primera, ...segunda];
      }
      throw e;
    }
    const parseado = this.parsearJson<RespuestaLoteGemini>(response.text);

    const porPosicion = new Map<number, HechosConTexto[]>();
    for (const item of parseado.resultados ?? []) {
      const posicion = item.indiceImagen - 1; // el prompt numera las imágenes desde 1
      if (!Number.isInteger(posicion) || posicion < 0 || posicion >= documentos.length) {
        this.logger.warn(`Gemini devolvió indiceImagen=${item.indiceImagen} fuera de rango en un lote de ${documentos.length} — se descarta esa entrada.`);
        continue;
      }
      const lista = porPosicion.get(posicion) ?? [];
      lista.push(item);
      porPosicion.set(posicion, lista);
    }

    const resultados = documentos.map((_, posicion): ResultadoExtraccion | null => {
      const candidatos = porPosicion.get(posicion) ?? [];
      if (candidatos.length === 1) return this.aResultado(candidatos[0]);
      if (candidatos.length > 1) {
        this.logger.warn(
          `Gemini devolvió indiceImagen=${posicion + 1} repetido ${candidatos.length} veces — se descarta para no arriesgar mezclar datos entre facturas, se reprocesa individualmente.`,
        );
      }
      return null;
    });

    const faltantes = resultados.filter((r) => r === null).length;
    if (faltantes > 0) {
      this.logger.warn(
        `Gemini alineó ${documentos.length - faltantes}/${documentos.length} facturas del lote — las ${faltantes} restantes se reprocesan individualmente.`,
      );
    }

    return resultados;
  }

  private aResultado(parseado: HechosConTexto): ResultadoExtraccion {
    const confidences: Record<string, number> = {};
    for (const c of parseado.confidences ?? []) {
      confidences[c.campo] = c.confianza;
    }

    const hechos = reforzarConPatrones(parseado.hechos, parseado.textoCompleto ?? '');

    this.logger.log(
      `Gemini (${this.modelo}): rncEmisor=${hechos.rncEmisor ?? '—'} rncReceptor=${hechos.rncReceptor ?? '—'} ` +
        `ncf=${hechos.ncf ?? '—'} fecha=${hechos.fechaEmision ?? '—'} montoTotal=${hechos.montoTotal ?? '—'}`,
    );

    return {
      hechos,
      confidences,
      paginas: 1,
      raw: { modelo: this.modelo, hechos: parseado.hechos, confidences: parseado.confidences, textoCompleto: parseado.textoCompleto },
    };
  }

  /**
   * Tokens de salida que se reservan para N documentos. Escala con el lote: un
   * techo fijo hacía que cuanto más grande el lote, menos presupuesto tenía
   * cada factura, que es justo lo contrario de lo que hace falta.
   */
  private presupuestoSalida(documentos: number): number {
    const necesario = MAX_OUTPUT_TOKENS_POR_DOCUMENTO * documentos;
    if (necesario > MAX_OUTPUT_TOKENS_TECHO) {
      this.logger.warn(
        `Un lote de ${documentos} necesitaría ${necesario} tokens de salida y el techo es ${MAX_OUTPUT_TOKENS_TECHO} — ` +
          'baja GEMINI_TAMANO_LOTE o el modelo truncará la respuesta.',
      );
      return MAX_OUTPUT_TOKENS_TECHO;
    }
    return necesario;
  }

  private parsearJson<T>(texto: string | undefined): T {
    if (!texto) {
      throw new Error('Gemini no devolvió contenido en la respuesta.');
    }
    try {
      return JSON.parse(texto) as T;
    } catch (e) {
      throw new Error(`Gemini devolvió una respuesta que no es JSON válido: ${(e as Error).message}`);
    }
  }

  /**
   * Espaciada por el limitador de tasa compartido. Si la API devuelve "too
   * many requests" (429 / RESOURCE_EXHAUSTED), espera el `retryDelay` que la
   * propia API sugiere (o un backoff exponencial si no lo da) y reintenta,
   * en vez de fallar el documento entero por una ráfaga pasajera.
   */
  private async generarConReintento(
    contents: ParteContenido[],
    prompt: string,
    responseSchema: Schema,
    maxOutputTokens: number,
  ) {
    for (let intento = 0; ; intento++) {
      await this.limitador.esperarTurno();
      try {
        const respuesta = await this.client.models.generateContent({
          model: this.modelo,
          contents,
          config: {
            systemInstruction: prompt,
            responseMimeType: 'application/json',
            responseSchema,
            maxOutputTokens,
            // Determinístico: para extracción estructurada no queremos que
            // la misma foto dé un resultado distinto en cada corrida.
            temperature: 0,
          },
        });

        // Un corte por presupuesto devuelve JSON a medias. Sin este control el
        // fallo aparecía como "no es JSON válido", que apunta al sitio
        // equivocado.
        if (respuesta.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
          throw new RespuestaTruncadaError(
            `Gemini truncó la respuesta al agotar los ${maxOutputTokens} tokens de salida ` +
              `(usó ${respuesta.usageMetadata?.candidatesTokenCount ?? '?'}).`,
          );
        }

        const uso = respuesta.usageMetadata;
        if (uso) {
          // `thoughtsTokenCount`: tokens de "pensamiento" que el modelo genera
          // antes de la respuesta visible — no aparecen en `candidatesTokenCount`
          // pero cuestan tiempo de decodificado igual. Sin este número no hay
          // forma de saber si desactivar el thinking budget tiene algo que ganar.
          this.logger.log(
            `Gemini uso: ${uso.promptTokenCount} entrada + ${uso.candidatesTokenCount} salida + ` +
              `${uso.thoughtsTokenCount ?? 0} pensamiento = ${uso.totalTokenCount} tokens`,
          );
        }
        return respuesta;
      } catch (e) {
        const { esRateLimit, retryDelayMs } = analizarErrorGemini(e);
        if (!esRateLimit || intento >= MAX_REINTENTOS_RATE_LIMIT) throw e;
        const espera = retryDelayMs ?? Math.min(1000 * 2 ** intento, 30000);
        this.logger.warn(
          `Gemini respondió "too many requests" — reintentando en ${espera}ms (intento ${intento + 1}/${MAX_REINTENTOS_RATE_LIMIT})...`,
        );
        await new Promise((resolve) => setTimeout(resolve, espera));
      }
    }
  }
}
