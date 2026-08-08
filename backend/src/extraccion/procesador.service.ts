import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
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

const NOMBRE_INTERVALO = 'procesador-documentos';

@Injectable()
export class ProcesadorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProcesadorService.name);
  private procesando = false;
  private readonly tamanoLote: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentosService: DocumentosService,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly clasificador: ClasificadorService,
    private readonly reglas: ReglasService,
    @Inject(INVOICE_EXTRACTOR) private readonly extractor: IInvoiceExtractor,
  ) {
    this.tamanoLote = Number(this.config.get('GEMINI_TAMANO_LOTE', 10));
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
    }

    if (documentos.length === 1) {
      await this.procesarIndividual(documentos[0]);
      return;
    }

    this.logger.log(`Enviando lote de ${documentos.length} documentos a Gemini...`);
    let resultados: Array<ResultadoExtraccion | null>;
    try {
      const entradas = await Promise.all(
        documentos.map(async (doc) => ({ buffer: await leerArchivo(doc.rutaArchivo), mimeType: doc.mimeType })),
      );
      resultados = await this.extractor.extraerLote(entradas);
    } catch (e) {
      // Fallo del lote entero (red, error de la API no ligado a un solo
      // documento) — se cae a reprocesar cada uno individualmente en vez de
      // perder el lote completo.
      this.logger.error(`Extracción en lote falló, se reprocesa cada documento individualmente: ${(e as Error).message}`);
      resultados = documentos.map(() => null);
    }

    await Promise.allSettled(
      documentos.map((documento, i) => {
        const resultado = resultados[i];
        return resultado ? this.persistirResultado(documento, resultado) : this.procesarIndividual(documento);
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
          `fecha=${h.fechaEmision ?? '—'} montoTotal=${h.montoTotal ?? '—'} itbis=${h.itbis ?? '—'}`,
      );

      // 1) Guardar siempre los hechos comunes — la factura ya es visible en la
      //    lista principal aunque todavía no se sepa a qué cliente/formato
      //    pertenece.
      const facturaId = await this.guardarComun(documento.id, resultado);

      // 1.5) Detectar RNCs y crear clientes automáticos (no confirmados)
      await this.autoDetectarClientes(resultado.hechos);

      // 2) Si el documento ya viene de un período conocido (flujo anterior, o
      //    una reclasificación manual que ya fijó el período), usar ese
      //    cliente/formato directamente sin volver a adivinar.
      if (documento.periodo) {
        await this.clasificarYDerivar(facturaId, resultado, {
          clienteId: documento.periodo.clienteId,
          formato: documento.periodo.formato,
        });
        return;
      }

      //    contra los Cliente configurados. Sin coincidencia, la factura queda
      //    guardada "sin clasificar" — ya visible, pendiente de asignación manual.
      let clasificacion = await this.clasificador.clasificar(h);
      
      if (!clasificacion) {
        const rncEmisor = h.rncEmisor ?? '';
        const rncReceptor = h.rncReceptor ?? '';
        const regla = await this.reglas.buscarRegla(rncEmisor, rncReceptor);
        if (regla && regla.clienteId && regla.formato) {
          clasificacion = { clienteId: regla.clienteId, formato: regla.formato as Formato, clasificacionConfirmada: false };
        }
      }

      if (clasificacion) {
        await this.clasificarYDerivar(facturaId, resultado, clasificacion);
      }
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
      // Vuelve a PENDIENTE para reintentar en un ciclo posterior.
      await this.prisma.documento.update({ where: { id: documento.id }, data: { estado: 'PENDIENTE', error: mensaje } });
    }
  }

  /** Guarda los campos comunes a 606/607 (identificación de ambas partes, NCF, fecha, montos). Sin período ni clasificación todavía. */
  private async guardarComun(documentoId: string, resultado: ResultadoExtraccion): Promise<string> {
    const h = resultado.hechos;
    const fechaComprobante = h.fechaEmision ? new Date(h.fechaEmision) : null;
    const montoFacturado = calcularMontoFacturado(h);

    const factura = await this.prisma.factura.create({
      data: {
        documentoId,
        // Sin clasificar todavía no hay lado declarante (para 607 declara el
        // receptor, para 606 el emisor — no se sabe cuál hasta clasificar), así
        // que no hay heurística de dígitos que aplicar. La derivación calcula
        // el tipo correcto al clasificar.
        tipoIdentificacion: '3',
        nombreEmisor: h.nombreEmisor,
        // Se guardan sin guiones ni puntos: el OCR los arrastra del papel y el
        // mismo RNC acababa almacenado de dos formas distintas.
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
      },
    });
    return factura.id;
  }

  /**
   * Detecta RNCs de emisor y receptor y crea Clientes automáticos
   * (origen: AUTO, confirmado: false) para los que no existan todavía.
   * No participa en la clasificación hasta que el usuario los confirme.
   */
  private async autoDetectarClientes(hechos: FacturaExtraida): Promise<void> {
    const pares: Array<{ rnc: string; nombre: string }> = [];

    const rncEmisor = normalizarIdentificacion(hechos.rncEmisor ?? '');
    if (rncEmisor) pares.push({ rnc: rncEmisor, nombre: hechos.nombreEmisor?.trim() || SIN_NOMBRE });

    const rncReceptor = normalizarIdentificacion(hechos.rncReceptor ?? '');
    if (rncReceptor && rncReceptor !== rncEmisor) {
      pares.push({ rnc: rncReceptor, nombre: hechos.nombreReceptor?.trim() || SIN_NOMBRE });
    }

    for (const { rnc, nombre } of pares) {
      const existe = await this.prisma.cliente.findUnique({ where: { rnc } });
      if (existe) {
        // Si el cliente se creó desde una factura que no traía nombre, quedó
        // como SIN_NOMBRE y así se mostraba para siempre. En cuanto otra
        // factura del mismo RNC sí lo trae, se adopta — pero solo mientras
        // siga sin confirmar, para no pisar un nombre que alguien ya revisó.
        if (existe.nombre === SIN_NOMBRE && nombre !== SIN_NOMBRE && !existe.confirmado) {
          await this.prisma.cliente.update({ where: { id: existe.id }, data: { nombre } });
          this.logger.log(`Cliente ${rnc} pasa a llamarse "${nombre}"`);
        }
        continue;
      }

      try {
        await this.prisma.cliente.create({
          data: {
            rnc,
            nombre,
            origen: 'AUTO',
            confirmado: false,
            rncVerificado: validarRnc(rnc),
          },
        });
        this.logger.log(`Cliente auto-detectado: ${nombre} (${rnc})`);
      } catch (e) {
        // Colisión de constraint único: otro proceso lo creó primero — no pasa nada.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
    }
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
    clasificacion: { clienteId: string; formato: Formato; clasificacionConfirmada?: boolean },
  ): Promise<void> {
    const clienteRow = await this.prisma.cliente.findUniqueOrThrow({ where: { id: clasificacion.clienteId } });
    const cliente: ConfiguracionCliente = {
      rnc: clienteRow.rnc,
      tipoIngresoDefault: clienteRow.tipoIngresoDefault,
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
            clasificacionConfirmada: clasificacion.clasificacionConfirmada ?? false,
            periodoId,
            tipoIdentificacion: factura.tipoIdentificacion,
            ncf: factura.ncf,
            ncfModificado: factura.ncfModificado,
            fechaComprobante: factura.fechaComprobante,
            fechaRetencionOPago: factura.fechaRetencionOPago,
            tipoIngreso: vacioComoNull(factura.tipoIngreso),
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
      const validaciones = validarFactura606(factura, contexto);
      await this.prisma.$transaction([
        this.prisma.validacion.deleteMany({ where: { facturaId } }),
        this.prisma.factura.update({
          where: { id: facturaId },
          data: {
            clienteId: clasificacion.clienteId,
            formato: 'F606',
            clasificacionConfirmada: clasificacion.clasificacionConfirmada ?? false,
            periodoId,
            tipoIdentificacion: factura.tipoIdentificacion,
            ncf: factura.ncf,
            ncfModificado: factura.ncfModificado,
            fechaComprobante: factura.fechaComprobante,
            fechaRetencionOPago: factura.fechaRetencionOPago,
            tipoBienesServicios: vacioComoNull(factura.tipoBienesServicios),
            formaPago: vacioComoNull(factura.formaPago),
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

    await this.clasificarYDerivar(facturaId, { hechos, confidences }, { clienteId, formato, clasificacionConfirmada: confirmada });
  }
}
