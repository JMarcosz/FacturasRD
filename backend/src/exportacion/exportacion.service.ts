import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import Decimal from 'decimal.js';
import { Factura, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  FacturaDgii606,
  FacturaDgii607,
  generarExcel606,
  generarExcel606Multicliente,
  generarExcel607,
  generarExcel607Multicliente,
  generarTxt606,
  generarTxt607,
} from '../dgii';

const MIME_EXCEL = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function aDecimal(valor: Prisma.Decimal | number | null | undefined): Decimal {
  if (valor === null || valor === undefined) return new Decimal(0);
  return new Decimal(valor.toString());
}

function a607(f: Factura): FacturaDgii607 {
  return {
    rncCedula: f.rncCedula,
    tipoIdentificacion: f.tipoIdentificacion as FacturaDgii607['tipoIdentificacion'],
    ncf: f.ncf,
    ncfModificado: f.ncfModificado,
    fechaComprobante: f.fechaComprobante as Date,
    fechaRetencionOPago: f.fechaRetencionOPago,
    tipoIngreso: f.tipoIngreso ?? '',
    montoFacturado: aDecimal(f.montoFacturado),
    itbisFacturado: aDecimal(f.itbisFacturado),
    itbisRetenido: aDecimal(f.itbisRetenido),
    itbisPercibido: aDecimal(f.itbisPercibido),
    retencionRenta: aDecimal(f.retencionRenta),
    isrPercibido: aDecimal(f.isrPercibido),
    isc: aDecimal(f.isc),
    otrosImpuestos: aDecimal(f.otrosImpuestos),
    propinaLegal: aDecimal(f.propinaLegal),
    montoEfectivo: aDecimal(f.montoEfectivo),
    montoChequeTransferencia: aDecimal(f.montoChequeTransferencia),
    montoTarjeta: aDecimal(f.montoTarjeta),
    montoVentaCredito: aDecimal(f.montoVentaCredito),
    montoBonos: aDecimal(f.montoBonos),
    montoPermuta: aDecimal(f.montoPermuta),
    montoOtrasFormas: aDecimal(f.montoOtrasFormas),
  };
}

function a606(f: Factura): FacturaDgii606 {
  return {
    rncCedula: f.rncCedula,
    tipoIdentificacion: f.tipoIdentificacion as FacturaDgii606['tipoIdentificacion'],
    ncf: f.ncf,
    ncfModificado: f.ncfModificado,
    fechaComprobante: f.fechaComprobante as Date,
    fechaRetencionOPago: f.fechaRetencionOPago,
    tipoBienesServicios: f.tipoBienesServicios ?? '',
    formaPago: f.formaPago ?? '',
    tipoRetencionISR: f.tipoRetencionISR,
    montoFacturado: aDecimal(f.montoFacturado),
    itbisFacturado: aDecimal(f.itbisFacturado),
    itbisRetenido: aDecimal(f.itbisRetenido),
    itbisPercibido: aDecimal(f.itbisPercibido),
    retencionRenta: aDecimal(f.retencionRenta),
    isrPercibido: aDecimal(f.isrPercibido),
    isc: aDecimal(f.isc),
    otrosImpuestos: aDecimal(f.otrosImpuestos),
    propinaLegal: aDecimal(f.propinaLegal),
    montoServicios: aDecimal(f.montoServicios),
    montoBienes: aDecimal(f.montoBienes),
    itbisSujetoProporcionalidad: aDecimal(f.itbisSujetoProporcionalidad),
    itbisLlevadoCosto: aDecimal(f.itbisLlevadoCosto),
    itbisPorAdelantar: aDecimal(f.itbisPorAdelantar),
  };
}

export interface EstadoExportable {
  puedeExportar: boolean;
  totalFacturas: number;
  errores: Array<{ facturaId: string; codigo: string; mensaje: string }>;
  advertencias: number;
  sinConfirmar: number;
}

@Injectable()
export class ExportacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get exportDir(): string {
    return path.join(this.config.get<string>('UPLOAD_DIR', './uploads'), 'exportaciones');
  }

  async verificarExportable(periodoId: string): Promise<EstadoExportable> {
    const facturas = await this.prisma.factura.findMany({
      where: { periodoId },
      include: { validaciones: true },
    });

    const errores = facturas.flatMap((f) =>
      f.validaciones
        .filter((v) => v.severidad === 'ERROR')
        .map((v) => ({ facturaId: f.id, codigo: v.codigo, mensaje: v.mensaje })),
    );
    const advertencias = facturas.reduce(
      (acc, f) => acc + f.validaciones.filter((v) => v.severidad === 'WARNING').length,
      0,
    );
    const sinConfirmar = facturas.filter((f) => f.clienteId && !f.clasificacionConfirmada).length;

    return {
      puedeExportar: facturas.length > 0 && errores.length === 0 && sinConfirmar === 0,
      totalFacturas: facturas.length,
      errores,
      advertencias,
      sinConfirmar,
    };
  }

  private async guardarYRegistrar(
    periodoId: string,
    tipo: 'TXT' | 'EXCEL',
    filename: string,
    buffer: Buffer,
    cantidadRegistros: number,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const dir = path.join(this.exportDir, periodoId);
    await fs.mkdir(dir, { recursive: true });
    const rutaArchivo = path.join(dir, filename);
    await fs.writeFile(rutaArchivo, buffer);

    await this.prisma.exportacion.create({
      data: {
        periodoId,
        tipo,
        rutaArchivo,
        sha256: createHash('sha256').update(buffer).digest('hex'),
        cantidadRegistros,
      },
    });

    return { buffer, filename };
  }

  private async cargarPeriodoYFacturas(periodoId: string) {
    const periodo = await this.prisma.periodo.findUnique({ where: { id: periodoId }, include: { cliente: true } });
    if (!periodo) throw new NotFoundException(`Período ${periodoId} no encontrado.`);

    const estado = await this.verificarExportable(periodoId);
    if (!estado.puedeExportar) {
      throw new ConflictException({
        message: 'El período tiene facturas con errores pendientes o no tiene facturas. No se puede exportar.',
        ...estado,
      });
    }

    const facturas = await this.prisma.factura.findMany({ where: { periodoId }, orderBy: { fechaComprobante: 'asc' } });
    return { periodo, facturas };
  }

  async generarTxt(periodoId: string): Promise<{ buffer: Buffer; filename: string }> {
    const { periodo, facturas } = await this.cargarPeriodoYFacturas(periodoId);

    const contenido =
      periodo.formato === 'F607'
        ? generarTxt607(periodo.cliente.rnc, periodo.yyyymm, facturas.map(a607))
        : generarTxt606(periodo.cliente.rnc, periodo.yyyymm, facturas.map(a606));

    const buffer = Buffer.from(contenido, 'utf-8');
    const filename = `${periodo.formato.replace('F', '')}_${periodo.cliente.rnc}_${periodo.yyyymm}.txt`;
    return this.guardarYRegistrar(periodoId, 'TXT', filename, buffer, facturas.length);
  }

  async generarExcel(periodoId: string): Promise<{ buffer: Buffer; filename: string }> {
    const { periodo, facturas } = await this.cargarPeriodoYFacturas(periodoId);

    const buffer =
      periodo.formato === 'F607'
        ? await generarExcel607(facturas.map(a607))
        : await generarExcel606(facturas.map(a606));

    const filename = `${periodo.formato.replace('F', '')}_${periodo.cliente.rnc}_${periodo.yyyymm}.xlsx`;
    return this.guardarYRegistrar(periodoId, 'EXCEL', filename, buffer, facturas.length);
  }

  /**
   * Excel de consulta interna por rango de fechas libre — no es un archivo de
   * la DGII (esos son siempre mensuales, ver generarExcel/generarTxt), así
   * que no se registra en `Exportacion` ni exige que las facturas estén sin
   * errores: es para que el contador revise, no para declarar.
   */
  async generarExcelPorRango(
    clienteId: string | undefined,
    formato: 'F606' | 'F607',
    desde: string,
    hasta: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const cliente = clienteId ? await this.prisma.cliente.findUnique({ where: { id: clienteId } }) : null;
    if (clienteId && !cliente) throw new NotFoundException(`Cliente ${clienteId} no encontrado.`);

    const facturas = await this.prisma.factura.findMany({
      where: {
        // `clienteId: undefined` en Prisma significa "sin filtro", NO "cualquier
        // cliente", y la columna es nullable: sin el `{ not: null }` se colarían
        // como filas basura todas las facturas SIN CLASIFICAR (rncCedula '').
        clienteId: clienteId ?? { not: null },
        formato,
        fechaComprobante: { gte: new Date(desde), lte: new Date(hasta) },
      },
      orderBy: [{ clienteId: 'asc' }, { fechaComprobante: 'asc' }],
      include: { cliente: { select: { nombre: true, rnc: true } } },
    });

    if (cliente) {
      const buffer =
        formato === 'F607' ? await generarExcel607(facturas.map(a607)) : await generarExcel606(facturas.map(a606));
      return { buffer, filename: `${formato.replace('F', '')}_${cliente.rnc}_${desde}_a_${hasta}.xlsx` };
    }

    // Multicliente: con varios contribuyentes mezclados las filas serían
    // indistinguibles, así que se usan los generadores hermanos que añaden
    // Cliente/RNC. Los de la DGII quedan intactos.
    const filename = `${formato.replace('F', '')}_todos_${desde}_a_${hasta}.xlsx`;
    const datosCliente = (f: (typeof facturas)[number]) => ({
      clienteNombre: f.cliente?.nombre ?? '',
      clienteRnc: f.cliente?.rnc ?? '',
    });

    if (formato === 'F607') {
      const buffer = await generarExcel607Multicliente(facturas.map((f) => ({ ...datosCliente(f), ...a607(f) })));
      return { buffer, filename };
    }
    const buffer = await generarExcel606Multicliente(facturas.map((f) => ({ ...datosCliente(f), ...a606(f) })));
    return { buffer, filename };
  }

  async findExportacionesByPeriodo(periodoId: string) {
    return this.prisma.exportacion.findMany({ where: { periodoId }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Historial global de exportaciones, con el contexto de período y cliente
   * que la fila necesita para ser legible.
   *
   * `select` explícito y sin `rutaArchivo`: es una ruta absoluta del servidor
   * y no tiene por qué salir al cliente. Para volver a bajar el archivo está
   * `obtenerArchivoExportacion`.
   */
  async findExportacionesGlobales(limite = 20, desplazamiento = 0) {
    const [total, items] = await this.prisma.$transaction([
      this.prisma.exportacion.count(),
      this.prisma.exportacion.findMany({
        orderBy: { createdAt: 'desc' },
        take: limite,
        skip: desplazamiento,
        select: {
          id: true,
          tipo: true,
          sha256: true,
          cantidadRegistros: true,
          createdAt: true,
          periodo: {
            select: {
              id: true,
              yyyymm: true,
              formato: true,
              estado: true,
              cliente: { select: { id: true, nombre: true, rnc: true } },
            },
          },
        },
      }),
    ]);

    return { total, limite, desplazamiento, items };
  }

  /**
   * Re-descarga de una exportación ya generada, leyendo el archivo de disco.
   * Hace falta porque los botones de descarga regeneran desde cero y fallan
   * con 409 si el período adquirió errores desde entonces — el archivo que se
   * declaró a la DGII tiene que seguir siendo recuperable tal cual.
   */
  async obtenerArchivoExportacion(id: string): Promise<{ buffer: Buffer; filename: string; mimeType: string }> {
    const exportacion = await this.prisma.exportacion.findUnique({ where: { id } });
    if (!exportacion) throw new NotFoundException(`Exportación ${id} no encontrada.`);

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(exportacion.rutaArchivo);
    } catch {
      throw new NotFoundException(`El archivo de la exportación ${id} ya no está en disco.`);
    }

    return {
      buffer,
      filename: path.basename(exportacion.rutaArchivo),
      mimeType: exportacion.tipo === 'TXT' ? 'text/plain; charset=utf-8' : MIME_EXCEL,
    };
  }
}
