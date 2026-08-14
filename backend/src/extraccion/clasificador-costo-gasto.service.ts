import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface ResultadoCostoGasto {
  clasificacion: 'COSTO' | 'GASTO';
  tipoBienesServicios: string; // '01'..'11'
  formaPago: string; // '01'..'07'
  confianza: number;
  justificacion: string;
}

export interface ResultadoIngreso {
  tipoIngreso: string; // '01'..'06'
  formaPago: string; // '01'..'07'
  confianza: number;
  justificacion: string;
}

@Injectable()
export class ClasificadorCostoGastoService {
  private readonly logger = new Logger(ClasificadorCostoGastoService.name);

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

  /**
   * Determina mediante IA la clasificación de una venta/ingreso (607) según el catálogo oficial de la DGII:
   * 01 - Ingresos por operaciones (ordinarias / comerciales)
   * 02 - Ingresos financieros
   * 03 - Ingresos extraordinarios
   * 04 - Ingresos por arrendamientos
   * 05 - Ingresos por venta de activo depreciable
   * 06 - Otros ingresos
   */
  async determinarIngreso(
    nombreReceptor: string | null | undefined,
    lineas: Array<{ descripcion: string | null; cantidad?: string | null; precioUnitario?: string | null; importe?: string | null }>,
    montoTotal?: string | null,
  ): Promise<ResultadoIngreso> {
    const apiKey = this.getApiKey();
    const modelName = this.getModelName();

    const descripciones = lineas
      .map((l) => `${l.cantidad ? `${l.cantidad}x ` : ''}${l.descripcion || 'Artículo sin descripción'}${l.importe ? ` ($${l.importe})` : ''}`)
      .join('; ');

    const promptText = `Eres un auditor contable experto en legislación tributaria de República Dominicana (DGII - Formato 607).

Analiza la siguiente venta / factura de ingreso emitida al cliente: "${nombreReceptor || 'Consumidor / Cliente no especificado'}".
Conceptos / Artículos vendidos: "${descripciones || 'Sin desglose de líneas'}".
Monto total: ${montoTotal || 'No especificado'}.

Determina:
1. "tipoIngreso" según el catálogo oficial de la DGII:
- "01": Ingresos por Operaciones (Venta de productos, mercancías o servicios habituales de la actividad económica principal).
- "02": Ingresos Financieros (Intereses, rendimientos, comisiones financieras a favor).
- "03": Ingresos Extraordinarios (Ganancias fortuitas, indemnizaciones de seguros, subsidios).
- "04": Ingresos por Arrendamientos (Alquiler de locales, naves industriales, inmuebles o vehículos).
- "05": Ingresos por Venta de Activo Depreciable (Venta de maquinaria, mobiliario o vehículos usados de la empresa).
- "06": Otros Ingresos.

2. "formaPago" (Catálogo DGII 607 / 606):
01 = Efectivo
02 = Cheque / Transferencia
03 = Tarjeta de Crédito / Débito
04 = A Crédito
05 = Permuta
06 = Notas de Crédito
07 = Mixta

REGLA CRÍTICA PARA FORMA DE PAGO:
Si la factura no especifica claramente la forma de pago (efectivo, tarjeta, transferencia), ASUME SIEMPRE que es una venta "A Crédito" y asigna "formaPago": "04".

Devuelve ÚNICAMENTE un objeto JSON estrictamente válido:
{
  "tipoIngreso": "01" | "02" | "03" | "04" | "05" | "06",
  "formaPago": "01" | "02" | "03" | "04" | "05" | "06" | "07",
  "confianza": number (entre 0.0 y 1.0),
  "justificacion": string (explicación breve de 1 oración en español)
}`;

    if (!apiKey) {
      return this.fallbackIngreso(descripciones);
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            model: modelName,
            messages: [{ role: 'user', content: promptText }],
            response_format: { type: 'json_object' },
            temperature: 0.1,
          },
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'HTTP-Referer': 'https://facturasrd.local',
              'X-Title': 'FacturasRD - Income Classifier DGII 607',
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          },
        ),
      );

      const contentStr = response.data?.choices?.[0]?.message?.content || '{}';
      let parsed: any;
      try {
        parsed = JSON.parse(contentStr);
      } catch {
        const match = contentStr.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : {};
      }

      const tipoIngresoValido = ['01', '02', '03', '04', '05', '06'].includes(parsed.tipoIngreso) ? parsed.tipoIngreso : '01';
      const formaPagoValida = ['01', '02', '03', '04', '05', '06', '07'].includes(parsed.formaPago) ? parsed.formaPago : '04';
      const confianza = typeof parsed.confianza === 'number' ? Math.max(0, Math.min(1, parsed.confianza)) : 0.9;
      const justificacion = parsed.justificacion || 'Ingresos ordinarios por operaciones comerciales.';

      return { tipoIngreso: tipoIngresoValido, formaPago: formaPagoValida, confianza, justificacion };
    } catch (err: any) {
      this.logger.warn(`Fallo al clasificar Tipo de Ingreso con IA: ${err.message}. Usando fallback.`);
      return this.fallbackIngreso(descripciones);
    }
  }

  /**
   * Determina mediante IA si una adquisición (compra/gasto 606) corresponde a COSTO o GASTO,
   * su código de Tipo de Bienes y Servicios (01..11) y Forma de Pago (01..07).
   */
  async determinarCostoOGasto(
    nombreEmisor: string | null | undefined,
    lineas: Array<{ descripcion: string | null; cantidad?: string | null; precioUnitario?: string | null; importe?: string | null }>,
    montoTotal?: string | null,
    formaPagoImpresa?: string | null,
  ): Promise<ResultadoCostoGasto> {
    const apiKey = this.getApiKey();
    const modelName = this.getModelName();

    const descripciones = lineas
      .map((l) => `${l.cantidad ? `${l.cantidad}x ` : ''}${l.descripcion || 'Artículo sin descripción'}${l.importe ? ` ($${l.importe})` : ''}`)
      .join('; ');

    const promptText = `Eres un auditor contable experto en legislación tributaria de República Dominicana (DGII - Formato 606).

Analiza la siguiente adquisición realizada al proveedor/comercio: "${nombreEmisor || 'Comercio no especificado'}".
Artículos / Servicios adquiridos: "${descripciones || 'Sin desglose de líneas'}".
Monto total: ${montoTotal || 'No especificado'}.
Forma de pago impresa: ${formaPagoImpresa || 'No especificada'}.

Determina:
1. "clasificacion":
   - "COSTO": Mercancías destinadas para la reventa, materias primas o insumos de producción.
   - "GASTO": Servicios públicos, suministros, combustible, mantenimiento, alquiler, viáticos o gastos operativos.
2. "tipoBienesServicios" (Catálogo DGII 606):
   - "01": Gastos de personal (nómina, honorarios profesionales personas físicas).
   - "02": Gastos por trabajos, suministros y servicios (electricidad Edeeste/Edesur, agua, internet/teléfono Claro/Altice, limpieza, suministros de oficina, mantenimiento, seguridad).
   - "03": Arrendamientos (alquiler de inmuebles o vehículos).
   - "04": Gastos de activos fijos (mejoras o mantenimiento mayor de activos).
   - "05": Gastos de representación (restaurantes, hoteles, comidas de trabajo).
   - "06": Otras deducciones admitidas (licencias de software, suscripciones, tasas).
   - "07": Gastos financieros (intereses bancarios, comisiones de préstamos).
   - "08": Gastos extraordinarios.
   - "09": Compras y gastos que forman parte del costo de venta (mercancías para reventa, insumos de producción).
   - "10": Adquisiciones de activos (compra de laptops, servidores, maquinaria, vehículos nuevos).
   - "11": Seguros (pólizas de vehículos, responsabilidad civil, salud).
3. "formaPago" (Catálogo DGII 606):
   - "01": Efectivo
   - "02": Cheque / Transferencia / Depósito
   - "03": Tarjeta Crédito / Débito
   - "04": Compra a Crédito
   - "05": Permuta
   - "06": Nota de Crédito
   - "07": Mixto

REGLA CRÍTICA PARA FORMA DE PAGO:
Si la factura no especifica claramente la forma de pago (efectivo, tarjeta, transferencia), ASUME SIEMPRE que es una adquisición "A Crédito" y asigna "formaPago": "04".

Devuelve ÚNICAMENTE un objeto JSON estrictamente válido:
{
  "clasificacion": "COSTO" | "GASTO",
  "tipoBienesServicios": "01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11",
  "formaPago": "01" | "02" | "03" | "04" | "05" | "06" | "07",
  "confianza": number (entre 0.0 y 1.0),
  "justificacion": string (explicación breve de 1 oración en español)
}`;

    if (!apiKey) {
      return this.clasificacionFallback(nombreEmisor, descripciones, formaPagoImpresa);
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            model: modelName,
            messages: [{ role: 'user', content: promptText }],
            response_format: { type: 'json_object' },
            temperature: 0.1,
          },
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'HTTP-Referer': 'https://facturasrd.local',
              'X-Title': 'FacturasRD - Costo vs Gasto Classifier DGII 606',
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          },
        ),
      );

      const contentStr = response.data?.choices?.[0]?.message?.content || '{}';
      let parsed: any;
      try {
        parsed = JSON.parse(contentStr);
      } catch {
        const match = contentStr.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : {};
      }

      const clasificacion = parsed.clasificacion === 'COSTO' ? 'COSTO' : 'GASTO';
      const tiposValidos = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11'];
      const tipoBienesServicios = tiposValidos.includes(parsed.tipoBienesServicios)
        ? parsed.tipoBienesServicios
        : clasificacion === 'COSTO'
          ? '09'
          : '02';

      const formasValidas = ['01', '02', '03', '04', '05', '06', '07'];
      const formaPago = formasValidas.includes(parsed.formaPago)
        ? parsed.formaPago
        : this.deducirFormaPago(formaPagoImpresa);

      const confianza = typeof parsed.confianza === 'number' ? Math.max(0, Math.min(1, parsed.confianza)) : 0.9;
      const justificacion =
        parsed.justificacion ||
        (clasificacion === 'COSTO'
          ? 'Adquisición de inventario o insumos (Costo de venta 09)'
          : 'Gasto por trabajos, suministros y servicios (02)');

      return { clasificacion, tipoBienesServicios, formaPago, confianza, justificacion };
    } catch (err: any) {
      this.logger.warn(`Fallo al clasificar Costo vs Gasto con IA: ${err.message}. Usando fallback.`);
      return this.clasificacionFallback(nombreEmisor, descripciones, formaPagoImpresa);
    }
  }

  private deducirFormaPago(textoImpreso?: string | null): string {
    const t = (textoImpreso || '').toLowerCase();
    if (t.includes('efectivo') || t.includes('cash')) return '01';
    if (t.includes('tarjeta') || t.includes('card') || t.includes('visa') || t.includes('mastercard')) return '03';
    if (t.includes('transferencia') || t.includes('cheque') || t.includes('deposito') || t.includes('depósito')) return '02';
    if (t.includes('credito') || t.includes('crédito') || t.includes('dias') || t.includes('días')) return '04';
    return '04'; // A Crédito por defecto cuando no se especifica
  }

  private fallbackIngreso(descripciones?: string): ResultadoIngreso {
    const t = (descripciones || '').toLowerCase();
    if (t.includes('alquiler') || t.includes('arrendamiento') || t.includes('renta')) {
      return { tipoIngreso: '04', formaPago: '04', confianza: 0.85, justificacion: 'Ingreso por arrendamiento deducido por descripción.' };
    }
    if (t.includes('interes') || t.includes('interés') || t.includes('rendimiento') || t.includes('financiero')) {
      return { tipoIngreso: '02', formaPago: '04', confianza: 0.85, justificacion: 'Ingreso financiero deducido por descripción.' };
    }
    return { tipoIngreso: '01', formaPago: '04', confianza: 0.9, justificacion: 'Ingresos por operaciones comerciales ordinarias.' };
  }

  private clasificacionFallback(
    nombreEmisor?: string | null,
    descripciones?: string,
    formaPagoImpresa?: string | null,
  ): ResultadoCostoGasto {
    const texto = `${nombreEmisor || ''} ${descripciones || ''}`.toLowerCase();

    if (texto.includes('alquiler') || texto.includes('arrendamiento') || texto.includes('renta')) {
      return {
        clasificacion: 'GASTO',
        tipoBienesServicios: '03',
        formaPago: this.deducirFormaPago(formaPagoImpresa),
        confianza: 0.85,
        justificacion: 'Gasto por arrendamiento de inmuebles o equipos.',
      };
    }

    if (texto.includes('restaurante') || texto.includes('comida') || texto.includes('hotel') || texto.includes('cafe')) {
      return {
        clasificacion: 'GASTO',
        tipoBienesServicios: '05',
        formaPago: this.deducirFormaPago(formaPagoImpresa),
        confianza: 0.85,
        justificacion: 'Gastos de representación / consumo de alimentos.',
      };
    }

    if (texto.includes('seguro') || texto.includes('poliza') || texto.includes('póliza')) {
      return {
        clasificacion: 'GASTO',
        tipoBienesServicios: '11',
        formaPago: this.deducirFormaPago(formaPagoImpresa),
        confianza: 0.85,
        justificacion: 'Gastos de seguros.',
      };
    }

    const palabrasCosto = ['mercancia', 'mercancía', 'materia prima', 'inventario', 'insumo', 'al por mayor', 'distribuidor', 'suplidora'];
    const esCosto = palabrasCosto.some((p) => texto.includes(p));

    if (esCosto) {
      return {
        clasificacion: 'COSTO',
        tipoBienesServicios: '09',
        formaPago: this.deducirFormaPago(formaPagoImpresa),
        confianza: 0.8,
        justificacion: 'Compras que forman parte del costo de venta.',
      };
    }

    return {
      clasificacion: 'GASTO',
      tipoBienesServicios: '02',
      formaPago: this.deducirFormaPago(formaPagoImpresa),
      confianza: 0.85,
      justificacion: 'Gastos por trabajos, suministros y servicios.',
    };
  }
}
