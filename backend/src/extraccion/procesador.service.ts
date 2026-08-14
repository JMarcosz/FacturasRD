import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ClasificacionOperacion, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma.service';
import { DocumentosService } from '../documentos/documentos.service';
import { leerArchivo } from '../documentos/storage.util';
import {
  calcularMontoFacturado,
  dec,
  derivarFactura606,
  derivarFactura607,
  identificacionDeclarada,
  limpiarIdentificacion,
  normalizarIdentificacion,
  validarFactura606,
  validarFactura607,
  validarRnc,
} from '../dgii';
import type { ConfiguracionCliente, FacturaExtraida, Formato } from '../dgii';
import { ClasificadorService } from './clasificador.service';
import { ReglasService } from '../reglas/reglas.service';
import { INVOICE_EXTRACTOR } from './invoice-extractor.interface';
import type { IInvoiceExtractor, ResultadoExtraccion } from './invoice-extractor.interface';

const MAXIMO_INTENTOS = 3;

/** Marcador para un contribuyente detectado por RNC en una factura que no traía nombre. */
const SIN_NOMBRE = 'Sin nombre';

type DocumentoPendiente = Awaited<ReturnType<DocumentosService['siguientesPendientes']>>[number];

function d(valor: Decimal): string {
  return valor.toString();
}

function vacioComoNull(valor: string): string | null {
  return valor === '' ? null : valor;
}

function yyyymmDe(fecha: Date): string {
  return `${fecha.getUTCFullYear()}${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

import { DocumentosEventosService } from '../documentos/documentos-eventos.service';

const NOMBRE_INTERVALO = 'procesador-documentos';

@Injectable()
export class ProcesadorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProcesadorService.name);
  private procesando = false;
  private readonly tamanoLote: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentosService: DocumentosService,
    private readonly eventosService: DocumentosEventosService,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly clasificador: ClasificadorService,
    private readonly reglas: ReglasService,
    @Inject(INVOICE_EXTRACTOR) private readonly extractor: IInvoiceExtractor,
  ) {
    this.tamanoLote = Number(this.config.get('GEMINI_TAMANO_LOTE', 100));
  }

  onModuleInit(): void {
    const ms = Number(this.config.get('PROCESADOR_INTERVALO_MS', 3000));
    const interval = setInterval(() => {
      this.ciclo().catch((e) => this.logger.error(e));
    }, ms);
    this.schedulerRegistry.addInterval(NOMBRE_INTERVALO, interval);
  }

  onModuleDestroy(): void {
    if (this.schedulerRegistry.doesExist('interval', NOMBRE_INTERVALO)) {
      this.schedulerRegistry.deleteInterval(NOMBRE_INTERVALO);
    }
  }

  /**
   * Vacía toda la cola de PENDIENTE en una sola activación, de a lotes de
   * `tamanoLote` — subir 30 facturas son 3 requests a Gemini en vez de 30,
   * en vez de ir de a pocas cada `PROCESADOR_INTERVALO_MS`.
   *
   * Los lotes van de a uno, en serie, a propósito. Se probó mandarlos en
   * paralelo y se midió lo contrario de lo esperado: sobre las mismas 18
   * facturas, 84 s en serie contra 100 s con 3 lotes en vuelo, y cada petición
   * pasando de ~20 s a ~55 s sin un solo 429. La cuota gratuita atiende con
   * concurrencia limitada, así que solapar peticiones no suma caudal — lo
   * reparte y encima agrega espera.
   */
  async ciclo(): Promise<void> {
    if (this.procesando) return; // evita solaparse si un ciclo tarda más que el intervalo
    this.procesando = true;
    try {
      for (;;) {
        const pendientes = await this.documentosService.siguientesPendientes(this.tamanoLote);
        if (pendientes.length === 0) break;
        await this.procesarLote(pendientes);
      }
    } finally {
      this.procesando = false;
    }
  }

  private async procesarLote(documentos: DocumentoPendiente[]): Promise<void> {
    for (const documento of documentos) {
      await this.documentosService.marcarProcesando(documento.id);
      this.eventosService.emitir({ tipo: 'PROCESANDO', documentoId: documento.id });
    }

    this.logger.log(`Enviando lote de ${documentos.length} documentos en ráfaga paralela con guardado en tiempo real...`);

    // Procesamiento y persistencia en paralelo independiente por documento
    await Promise.allSettled(
      documentos.map(async (doc) => {
        try {
          const buffer = await leerArchivo(doc.rutaArchivo);
          const resultado = await this.extractor.extraer(buffer, doc.mimeType);
          await this.persistirResultado(doc, resultado);
        } catch (e) {
          this.logger.warn(`Falló extracción individual de "${doc.filename}": ${(e as Error).message}`);
          await this.manejarError(doc, e);
        }
      }),
    );
  }

  /** Camino individual: se usa para lotes de 1, y como respaldo cuando el lote no pudo alinear una imagen puntual. */
  private async procesarIndividual(documento: DocumentoPendiente): Promise<void> {
    this.logger.log(`Enviando "${documento.filename}" (${documento.mimeType}) a Gemini...`);
    try {
      const buffer = await leerArchivo(documento.rutaArchivo);
      const resultado = await this.extractor.extraer(buffer, documento.mimeType);
      await this.persistirResultado(documento, resultado);
    } catch (e) {
      await this.manejarError(documento, e);
    }
  }

  private async persistirResultado(documento: DocumentoPendiente, resultado: ResultadoExtraccion): Promise<void> {
    try {
      const rawJson = JSON.parse(JSON.stringify(resultado.raw));
      await this.documentosService.marcarExtraido(documento.id, rawJson, resultado.paginas);

      const h = resultado.hechos;
      this.logger.log(
        `"${documento.filename}" analizado (${resultado.paginas}p): ` +
          `rncEmisor=${h.rncEmisor ?? '—'} rncReceptor=${h.rncReceptor ?? '—'} ncf=${h.ncf ?? '—'} ` +
          `fecha=${h.fechaEmision ?? '—'} montoTotal=${h.montoTotal ?? '—'} lineas=${h.lineas?.length ?? 0}`,
      );

      // 1) Guardar los hechos comunes y las líneas de la factura
      const facturaId = await this.guardarComun(documento.id, resultado);

      // 2) Clasificar según Maestro de Clientes (Ingreso / Costo / Gasto / Pendiente / Ambigua)
      const clasificacion = await this.clasificador.clasificar(h, facturaId);

      await this.prisma.factura.update({
        where: { id: facturaId },
        data: {
          clasificacionOperacion: clasificacion.clasificacionOperacion,
          justificacionIa: clasificacion.justificacionIa,
          confianzaIa: clasificacion.confianzaIa !== undefined ? new Decimal(clasificacion.confianzaIa.toString()) : null,
        },
      });

      if (clasificacion.clienteId && clasificacion.formato) {
        await this.clasificarYDerivar(facturaId, resultado, {
          clienteId: clasificacion.clienteId,
          formato: clasificacion.formato,
          clasificacionConfirmada: clasificacion.clasificacionConfirmada,
          tipoIngreso: clasificacion.tipoIngreso,
          tipoBienesServicios: clasificacion.tipoBienesServicios,
          formaPago: clasificacion.formaPago,
        });
      }

      // Notificación reactiva inmediata SSE
      this.eventosService.emitir({ tipo: 'EXTRAIDO', documentoId: documento.id, facturaId });
    } catch (e) {
      await this.manejarError(documento, e);
    }
  }

  private async manejarError(documento: DocumentoPendiente, e: unknown): Promise<void> {
    const mensaje = e instanceof Error ? e.message : String(e);
    this.logger.error(`Error procesando documento ${documento.id}: ${mensaje}`);
    if (documento.intentos + 1 >= MAXIMO_INTENTOS) {
      await this.documentosService.marcarError(documento.id, mensaje);
    } else {
      await this.prisma.documento.update({ where: { id: documento.id }, data: { estado: 'PENDIENTE', error: mensaje } });
    }
    this.eventosService.emitir({ tipo: 'ERROR', documentoId: documento.id });
  }

  /** Guarda los campos comunes y las líneas extraídas de la factura. */
  private async guardarComun(documentoId: string, resultado: ResultadoExtraccion): Promise<string> {
    const h = resultado.hechos;
    const fechaComprobante = h.fechaEmision ? new Date(h.fechaEmision) : null;
    const montoFacturado = calcularMontoFacturado(h);

    const factura = await this.prisma.factura.create({
      data: {
        documentoId,
        tipoIdentificacion: '3',
        nombreEmisor: h.nombreEmisor,
        identificacionEmisor: limpiarIdentificacion(h.rncEmisor) || null,
        nombreReceptor: h.nombreReceptor,
        identificacionReceptor: limpiarIdentificacion(h.rncReceptor) || null,
        ncf: (h.ncf ?? '').trim().toUpperCase(),
        ncfModificado: h.ncfModificado ? h.ncfModificado.trim().toUpperCase() : null,
        fechaComprobante,
        montoFacturado: d(montoFacturado),
        itbisFacturado: d(dec(h.itbis)),
        isc: d(dec(h.isc)),
        otrosImpuestos: d(dec(h.otrosImpuestos)),
        propinaLegal: d(dec(h.propinaLegal)),
        confidences: resultado.confidences,
        origen: 'IA',
        revisada: false,
        lineas: {
          create: (h.lineas || []).map((l) => ({
            descripcion: l.descripcion || 'Artículo / Servicio',
            cantidad: dec(l.cantidad || '1'),
            precioUnitario: dec(l.precioUnitario || '0'),
            importe: dec(l.importe || '0'),
          })),
        },
      },
    });
    return factura.id;
  }

  /**
   * find-or-create del Período, a prueba de la carrera que aparece al
   * procesar varias facturas del mismo cliente+mes+formato en paralelo (el
   * lote las procesa así — ver `procesarLote`): si dos upserts concurrentes
   * intentan crear la misma fila a la vez, uno gana y el otro recibe una
   * violación de constraint único (P2002) en vez de que Postgres resuelva el
   * conflicto — en ese caso se busca la fila que el otro proceso ya creó en
   * vez de burbujear el error y gastar un reintento completo (con su propia
   * llamada a Gemini) por una carrera, no por un fallo real.
   */
  private async obtenerOCrearPeriodo(clienteId: string, yyyymm: string, formato: Formato): Promise<string> {
    const clave = { clienteId_yyyymm_formato: { clienteId, yyyymm, formato } };
    try {
      const periodo = await this.prisma.periodo.upsert({ where: clave, update: {}, create: { clienteId, yyyymm, formato } });
      return periodo.id;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const periodo = await this.prisma.periodo.findUniqueOrThrow({ where: clave });
        return periodo.id;
      }
      throw e;
    }
  }

  private async ncfsYaDeclarados(clienteRnc: string, formato: Formato, excluirFacturaId: string): Promise<Set<string>> {
    const facturas = await this.prisma.factura.findMany({
      where: { formato, cliente: { rnc: clienteRnc }, id: { not: excluirFacturaId } },
      select: { identificacionEmisor: true, identificacionReceptor: true, ncf: true },
    });
    return new Set(facturas.map((f) => `${identificacionDeclarada(formato, f)}:${f.ncf}`));
  }

  /**
   * Aplica una clasificación (cliente + formato) a una factura ya guardada:
   * corre la derivación y validación DGII de ese formato, y — si la factura
   * tiene fecha de comprobante — arma (find-or-create) el Período correspondiente.
   * La usan tanto el auto-clasificador como la reclasificación manual (Fase 3).
   */
  async clasificarYDerivar(
    facturaId: string,
    resultado: Pick<ResultadoExtraccion, 'hechos' | 'confidences'>,
    clasificacion: {
      clienteId: string;
      formato: Formato;
      clasificacionConfirmada?: boolean;
      tipoIngreso?: string;
      tipoBienesServicios?: string;
      formaPago?: string;
    },
  ): Promise<void> {
    const clienteRow = await this.prisma.cliente.findUniqueOrThrow({ where: { id: clasificacion.clienteId } });
    const cliente: ConfiguracionCliente = {
      rnc: clienteRow.rnc,
      tipoIngresoDefault: clasificacion.tipoIngreso || clienteRow.tipoIngresoDefault,
      tasaItbis: new Decimal(clienteRow.tasaItbis.toString()),
      aplicaProporcionalidad: clienteRow.aplicaProporcionalidad,
    };

    const fechaComprobante = resultado.hechos.fechaEmision ? new Date(resultado.hechos.fechaEmision) : null;
    let periodoId: string | null = null;
    let yyyymm = 'sin-fecha';
    if (fechaComprobante) {
      yyyymm = yyyymmDe(fechaComprobante);
      periodoId = await this.obtenerOCrearPeriodo(clasificacion.clienteId, yyyymm, clasificacion.formato);
    }

    const ncfsPrevios = await this.ncfsYaDeclarados(cliente.rnc, clasificacion.formato, facturaId);
    const contexto = {
      yyyymm,
      ncfsYaDeclarados: ncfsPrevios,
      tasaItbis: cliente.tasaItbis,
      confidences: resultado.confidences,
      umbralConfianza: Number(this.config.get('UMBRAL_CONFIANZA', 0.85)),
    };

    if (clasificacion.formato === 'F607') {
      const { factura } = derivarFactura607(resultado.hechos, cliente);
      const validaciones = validarFactura607(factura, contexto);
      await this.prisma.$transaction([
        this.prisma.validacion.deleteMany({ where: { facturaId } }),
        this.prisma.factura.update({
          where: { id: facturaId },
          data: {
            clienteId: clasificacion.clienteId,
            formato: 'F607',
            nombreEmisor: clienteRow.nombre,
            identificacionEmisor: clienteRow.rnc,
            clasificacionConfirmada: clasificacion.clasificacionConfirmada ?? false,
            periodoId,
            tipoIdentificacion: factura.tipoIdentificacion,
            ncf: factura.ncf,
            ncfModificado: factura.ncfModificado,
            fechaComprobante: factura.fechaComprobante,
            fechaRetencionOPago: factura.fechaRetencionOPago,
            tipoIngreso: vacioComoNull(clasificacion.tipoIngreso || factura.tipoIngreso || cliente.tipoIngresoDefault || '01'),
            montoFacturado: d(factura.montoFacturado),
            itbisFacturado: d(factura.itbisFacturado),
            itbisRetenido: d(factura.itbisRetenido),
            itbisPercibido: d(factura.itbisPercibido),
            retencionRenta: d(factura.retencionRenta),
            isrPercibido: d(factura.isrPercibido),
            isc: d(factura.isc),
            otrosImpuestos: d(factura.otrosImpuestos),
            propinaLegal: d(factura.propinaLegal),
            montoEfectivo: d(factura.montoEfectivo),
            montoChequeTransferencia: d(factura.montoChequeTransferencia),
            montoTarjeta: d(factura.montoTarjeta),
            montoVentaCredito: d(factura.montoVentaCredito),
            montoBonos: d(factura.montoBonos),
            montoPermuta: d(factura.montoPermuta),
            montoOtrasFormas: d(factura.montoOtrasFormas),
            validaciones: {
              create: validaciones.map((v) => ({ codigo: v.codigo, severidad: v.severidad, campo: v.campo, mensaje: v.mensaje })),
            },
          },
        }),
      ]);
    } else {
      const { factura } = derivarFactura606(resultado.hechos, cliente);
      const tipoBienesElegido = clasificacion.tipoBienesServicios || factura.tipoBienesServicios || '02';
      const formaPagoElegida = clasificacion.formaPago || factura.formaPago || '01';

      const facturaParaValidar = {
        ...factura,
        tipoBienesServicios: tipoBienesElegido,
        formaPago: formaPagoElegida,
      };
      const validaciones = validarFactura606(facturaParaValidar, contexto);

      await this.prisma.$transaction([
        this.prisma.validacion.deleteMany({ where: { facturaId } }),
        this.prisma.factura.update({
          where: { id: facturaId },
          data: {
            clienteId: clasificacion.clienteId,
            formato: 'F606',
            nombreReceptor: clienteRow.nombre,
            identificacionReceptor: clienteRow.rnc,
            clasificacionConfirmada: clasificacion.clasificacionConfirmada ?? false,
            periodoId,
            tipoIdentificacion: factura.tipoIdentificacion,
            ncf: factura.ncf,
            ncfModificado: factura.ncfModificado,
            fechaComprobante: factura.fechaComprobante,
            fechaRetencionOPago: factura.fechaRetencionOPago,
            tipoBienesServicios: vacioComoNull(tipoBienesElegido),
            formaPago: vacioComoNull(formaPagoElegida),
            tipoRetencionISR: factura.tipoRetencionISR,
            montoFacturado: d(factura.montoFacturado),
            itbisFacturado: d(factura.itbisFacturado),
            itbisRetenido: d(factura.itbisRetenido),
            itbisPercibido: d(factura.itbisPercibido),
            retencionRenta: d(factura.retencionRenta),
            isrPercibido: d(factura.isrPercibido),
            isc: d(factura.isc),
            otrosImpuestos: d(factura.otrosImpuestos),
            propinaLegal: d(factura.propinaLegal),
            montoServicios: d(factura.montoServicios),
            montoBienes: d(factura.montoBienes),
            itbisSujetoProporcionalidad: d(factura.itbisSujetoProporcionalidad),
            itbisLlevadoCosto: d(factura.itbisLlevadoCosto),
            itbisPorAdelantar: d(factura.itbisPorAdelantar),
            validaciones: {
              create: validaciones.map((v) => ({ codigo: v.codigo, severidad: v.severidad, campo: v.campo, mensaje: v.mensaje })),
            },
          },
        }),
      ]);
    }
  }

  /**
   * Clasifica (o reclasifica) una factura a mano, elegida por el contador
   * desde la pantalla de revisión. A diferencia de la auto-clasificación
   * (que corre justo después de extraer), esta parte de los campos YA
   * guardados en la Factura — que pueden haber sido corregidos a mano —
   * en vez de los hechos originales que devolvió Gemini.
   *
   * `confirmada` distingue quién decidió: una persona eligiendo cliente y
   * formato en pantalla la fija (true), mientras que la reclasificación
   * retroactiva al confirmar un contribuyente la deduce sola del RNC y entra
   * como sugerencia (false) — nadie miró esas facturas todavía, y una
   * sugerencia sin confirmar bloquea la exportación a propósito.
   */
  async clasificarManualmente(
    facturaId: string,
    clienteId: string,
    formato: Formato,
    confirmada = true,
    clasificacionOperacion?: ClasificacionOperacion,
  ): Promise<void> {
    const factura = await this.prisma.factura.findUniqueOrThrow({ where: { id: facturaId } });
    const montoTotal = new Decimal(factura.montoFacturado.toString())
      .plus(factura.itbisFacturado.toString())
      .plus(factura.isc.toString())
      .plus(factura.otrosImpuestos.toString())
      .plus(factura.propinaLegal.toString());

    const hechos: FacturaExtraida = {
      rncEmisor: factura.identificacionEmisor,
      nombreEmisor: factura.nombreEmisor,
      rncReceptor: factura.identificacionReceptor,
      nombreReceptor: factura.nombreReceptor,
      ncf: factura.ncf,
      ncfModificado: factura.ncfModificado,
      fechaEmision: factura.fechaComprobante ? factura.fechaComprobante.toISOString().slice(0, 10) : null,
      fechaVencimientoNcf: null,
      montoGravado: factura.montoFacturado.toString(),
      montoExento: '0',
      itbis: factura.itbisFacturado.toString(),
      isc: factura.isc.toString(),
      propinaLegal: factura.propinaLegal.toString(),
      otrosImpuestos: factura.otrosImpuestos.toString(),
      montoTotal: montoTotal.toString(),
      moneda: null,
      tasaCambio: null,
      formaPagoImpresa: null,
      condicionPago: null,
      lineas: [],
    };
    const confidences = (factura.confidences as Record<string, number> | null) ?? {};

    // Si no se pasó explícitamente clasificacionOperacion, inferirla del formato
    const operacion = clasificacionOperacion || (formato === 'F607' ? ClasificacionOperacion.INGRESO : ClasificacionOperacion.GASTO);

    await this.prisma.factura.update({
      where: { id: facturaId },
      data: { clasificacionOperacion: operacion },
    });

    await this.clasificarYDerivar(facturaId, { hechos, confidences }, { clienteId, formato, clasificacionConfirmada: confirmada });
  }
}
