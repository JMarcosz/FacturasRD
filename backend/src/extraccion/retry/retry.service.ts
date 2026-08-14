import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  PROMPT_RETRY_ENTIDADES,
  PROMPT_RETRY_FECHA,
  PROMPT_RETRY_NCF,
  PROMPT_RETRY_RNC,
} from '../prompts/prompts';
import { isValidDate, isValidNcf, isValidRncOrCedula } from '../validation/extraction.validator';

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  private getApiKey(): string {
    return process.env.OPENROUTER_API_KEY || this.config.get<string>('OPENROUTER_API_KEY', '') || '';
  }

  private getModelName(): string {
    return (
      process.env.OPENROUTER_MODEL ||
      this.config.get<string>('OPENROUTER_MODEL', 'google/gemini-2.5-flash') ||
      'google/gemini-2.5-flash'
    );
  }

  private async ejecutarPromptVision<T>(prompt: string, buffer: Buffer, mimeType: string): Promise<T | null> {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;

    const base64 = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            model: this.getModelName(),
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  { type: 'image_url', image_url: { url: dataUrl } },
                ],
              },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.0,
          },
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'HTTP-Referer': 'https://facturasrd.local',
              'X-Title': 'FacturasRD - Targeted Micro Retry',
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          },
        ),
      );

      const content = response.data?.choices?.[0]?.message?.content || '{}';
      try {
        return JSON.parse(content) as T;
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        return match ? (JSON.parse(match[0]) as T) : null;
      }
    } catch (e: any) {
      this.logger.warn(`Micro-retry falló: ${e.message}`);
      return null;
    }
  }

  /**
   * Retry quirúrgico de fecha de emisión (Sección 9 del Plan Maestro).
   */
  async retryFecha(buffer: Buffer, mimeType: string): Promise<string | null> {
    this.logger.log('Ejecutando micro-retry quirúrgico de FECHA...');
    const res = await this.ejecutarPromptVision<{ fechaEmision: string | null }>(
      PROMPT_RETRY_FECHA,
      buffer,
      mimeType,
    );
    if (res?.fechaEmision && isValidDate(res.fechaEmision)) {
      return res.fechaEmision;
    }
    return null;
  }

  /**
   * Retry quirúrgico de NCF (Sección 11 del Plan Maestro).
   */
  async retryNcf(
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ ncf: string | null; ncfModificado: string | null } | null> {
    this.logger.log('Ejecutando micro-retry quirúrgico de NCF...');
    const res = await this.ejecutarPromptVision<{ ncf: string | null; ncfModificado: string | null }>(
      PROMPT_RETRY_NCF,
      buffer,
      mimeType,
    );
    if (res?.ncf && isValidNcf(res.ncf)) {
      return {
        ncf: res.ncf.trim().toUpperCase(),
        ncfModificado: res.ncfModificado ? res.ncfModificado.trim().toUpperCase() : null,
      };
    }
    return null;
  }

  /**
   * Retry quirúrgico de RNC/Cédula (Sección 10 del Plan Maestro).
   */
  async retryIdentificadores(
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ rncEmisor: string | null; rncReceptor: string | null } | null> {
    this.logger.log('Ejecutando micro-retry quirúrgico de RNC/Cédula...');
    const res = await this.ejecutarPromptVision<{ rncEmisor: string | null; rncReceptor: string | null }>(
      PROMPT_RETRY_RNC,
      buffer,
      mimeType,
    );
    if (!res) return null;

    const rncEmisorLimpio = res.rncEmisor ? res.rncEmisor.replace(/\D/g, '') : null;
    const rncReceptorLimpio = res.rncReceptor ? res.rncReceptor.replace(/\D/g, '') : null;

    return {
      rncEmisor: isValidRncOrCedula(rncEmisorLimpio) ? rncEmisorLimpio : null,
      rncReceptor: isValidRncOrCedula(rncReceptorLimpio) ? rncReceptorLimpio : null,
    };
  }

  /**
   * Retry quirúrgico de Entidades Emisor / Receptor (Sección 12 del Plan Maestro).
   */
  async retryEntidades(
    buffer: Buffer,
    mimeType: string,
  ): Promise<{
    nombreEmisor: string | null;
    rncEmisor: string | null;
    nombreReceptor: string | null;
    rncReceptor: string | null;
  } | null> {
    this.logger.log('Ejecutando micro-retry quirúrgico de Entidades (Emisor/Receptor)...');
    const res = await this.ejecutarPromptVision<{
      nombreEmisor: string | null;
      rncEmisor: string | null;
      nombreReceptor: string | null;
      rncReceptor: string | null;
    }>(PROMPT_RETRY_ENTIDADES, buffer, mimeType);
    if (!res) return null;

    const rncEmisorLimpio = res.rncEmisor ? res.rncEmisor.replace(/\D/g, '') : null;
    const rncReceptorLimpio = res.rncReceptor ? res.rncReceptor.replace(/\D/g, '') : null;

    return {
      nombreEmisor: res.nombreEmisor || null,
      rncEmisor: isValidRncOrCedula(rncEmisorLimpio) ? rncEmisorLimpio : null,
      nombreReceptor: res.nombreReceptor || null,
      rncReceptor: isValidRncOrCedula(rncReceptorLimpio) ? rncReceptorLimpio : null,
    };
  }
}
