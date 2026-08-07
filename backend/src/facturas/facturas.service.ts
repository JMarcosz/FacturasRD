import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { Factura, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ProcesadorService } from '../extraccion/procesador.service';
import { eliminarArchivo } from '../documentos/storage.util';
import {
  ContextoValidacion,
  FacturaDgii606,
  FacturaDgii607,
  describirTipoNcf,
  distribuirFormaVenta607,
  limpiarIdentificacion,
  traducirCampo,
  traducirCampos,
  validarFactura606,
  validarFactura607,
} from '../dgii';
import { UpdateFacturaDto } from './dto/update-factura.dto';
import { ClasificarFacturaDto } from './dto/clasificar-factura.dto';
import { ListarFacturasQueryDto } from './dto/listar-facturas-query.dto';
import { LoteCamposDto } from './dto/lote-campos.dto';
import { construirWhereFacturas } from './where-facturas';

/** Forma con la que se cargan las facturas para editar/serializar. */
type FacturaCruda = Prisma.FacturaGetPayload<{
  include: {
    validaciones: true;
    lineas: true;
    documento: { select: { id: true; filename: true; mimeType: true; paginas: true } };
    cliente: { select: { id: true; nombre: true; rnc: true } };
  };
}>;

/** Clave `rnc:ncf` de una factura ya declarada, con su id para poder excluirse a sí misma. */
interface ClaveNcf {
  id: string;
  clave: string;
}

export interface FalloLote {
  id: string;
  motivo: string;
}

/**
 * Respuesta de las operaciones en lote. Siempre 200: si la fila 37 de 200
 * falla, el contador quiere las otras 199 aplicadas y la lista de lo que
 * falló, no un rollback silencioso de todo.
 */
export interface ResultadoLote {
  solicitadas: number;
  procesadas: number;
  fallidas: FalloLote[];
}

function motivoDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function aDecimal(valor: Prisma.Decimal | number | null | undefined): Decimal {
  if (valor === null || valor === undefined) return new Decimal(0);
  return new Decimal(valor.toString());
}

/**
 * Deja la factura lista para el cliente: añade el tipo de NCF descrito y
 * traduce a nombres de columna las claves de `confidences` y el `campo` de
 * cada validación, que se guardan con los nombres del extractor (ver
 * `dgii/campos.ts`). La traducción ocurre en lectura, así que las filas ya
 * guardadas siguen funcionando sin migrar datos.
 */
function serializarFactura<
  T extends { ncf: string; confidences: Prisma.JsonValue; validaciones: Array<{ campo: string | null }> },
>(f: T) {
  return {
    ...f,
    tipoNcf: describirTipoNcf(f.ncf),
    confidences: traducirCampos(f.confidences),
    validaciones: f.validaciones.map((v) => ({ ...v, campo: traducirCampo(v.campo) })),
  };
}

function num(valor: number | undefined, fallback: Decimal): Decimal {
  return valor === undefined ? fallback : new Decimal(valor.toString());
}

function str(valor: string | undefined, fallback: string): string {
  return valor === undefined ? fallback : valor;
}

function strOrNull(valor: string | null | undefined, fallback: string | null): string | null {
  return valor === undefined ? fallback : valor;
}

function fecha(valor: string | null | undefined, fallback: Date | null): Date | null {
  if (valor === undefined) return fallback;
  return valor === null ? null : new Date(valor);
}

@Injectable()
export class FacturasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly procesador: ProcesadorService,
  ) {}

  /**
   * Lista global de facturas — la pantalla principal de la app. Alimenta la
   * tabla de "Comercio / RNC / Cliente / fecha / monto / ITBIS" con filtros
   * simples; no depende de un período (las facturas sin clasificar todavía
   * no tienen uno).
   */
  async findAll(query: ListarFacturasQueryDto) {
    const facturas = await this.prisma.factura.findMany({
      where: construirWhereFacturas(query),
      orderBy: { createdAt: 'desc' },
      include: {
        cliente: { select: { id: true, nombre: true, rnc: true } },
        documento: { select: { id: true, filename: true, mimeType: true, estado: true } },
        validaciones: true,
      },
    });

    return facturas.map(serializarFactura);
  }

  async findAllByPeriodo(periodoId: string) {
    const facturas = await this.prisma.factura.findMany({
      where: { periodoId },
      include: {
        validaciones: true,
        lineas: true,
        documento: { select: { id: true, filename: true, mimeType: true } },
        cliente: { select: { id: true, nombre: true, rnc: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return facturas.map(serializarFactura);
  }

  /**
   * Factura tal cual está en la base, sin traducir nombres de campo. Es lo que
   * consumen las rutas de escritura: las validaciones y el AuditLog trabajan
   * con los nombres crudos del extractor.
   */
  private async cargarFacturaCruda(id: string): Promise<FacturaCruda> {
    const factura = await this.prisma.factura.findUnique({
      where: { id },
      include: {
        validaciones: true,
        lineas: true,
        documento: { select: { id: true, filename: true, mimeType: true, paginas: true } },
        cliente: { select: { id: true, nombre: true, rnc: true } },
      },
    });
    if (!factura) throw new NotFoundException(`Factura ${id} no encontrada.`);
    return factura;
  }

  async findOne(id: string) {
    return serializarFactura(await this.cargarFacturaCruda(id));
  }

  /** Claves `rnc:ncf` ya declaradas por ese cliente en ese formato, con el id de cada fila. */
  private async clavesNcfDeclaradas(clienteRnc: string, formato: 'F606' | 'F607'): Promise<ClaveNcf[]> {
    const facturas = await this.prisma.factura.findMany({
      where: { periodo: { formato, cliente: { rnc: clienteRnc } } },
      select: { id: true, rncCedula: true, ncf: true },
    });
    return facturas.map((f) => ({ id: f.id, clave: `${f.rncCedula}:${f.ncf}` }));
  }

  private construirDatos607(antes: Factura, dto: UpdateFacturaDto): Omit<FacturaDgii607, 'fechaComprobante'> & { fechaComprobante: Date | null } {
    return {
      rncCedula: str(dto.rncCedula, antes.rncCedula),
      tipoIdentificacion: str(dto.tipoIdentificacion, antes.tipoIdentificacion) as FacturaDgii607['tipoIdentificacion'],
      ncf: str(dto.ncf, antes.ncf),
      ncfModificado: strOrNull(dto.ncfModificado, antes.ncfModificado),
      fechaComprobante: fecha(dto.fechaComprobante, antes.fechaComprobante),
      fechaRetencionOPago: fecha(dto.fechaRetencionOPago, antes.fechaRetencionOPago),
      tipoIngreso: str(dto.tipoIngreso ?? undefined, antes.tipoIngreso ?? ''),
      montoFacturado: num(dto.montoFacturado, aDecimal(antes.montoFacturado)),
      itbisFacturado: num(dto.itbisFacturado, aDecimal(antes.itbisFacturado)),
      itbisRetenido: num(dto.itbisRetenido, aDecimal(antes.itbisRetenido)),
      itbisPercibido: num(dto.itbisPercibido, aDecimal(antes.itbisPercibido)),
      retencionRenta: num(dto.retencionRenta, aDecimal(antes.retencionRenta)),
      isrPercibido: num(dto.isrPercibido, aDecimal(antes.isrPercibido)),
      isc: num(dto.isc, aDecimal(antes.isc)),
      otrosImpuestos: num(dto.otrosImpuestos, aDecimal(antes.otrosImpuestos)),
      propinaLegal: num(dto.propinaLegal, aDecimal(antes.propinaLegal)),
      montoEfectivo: num(dto.montoEfectivo, aDecimal(antes.montoEfectivo)),
      montoChequeTransferencia: num(dto.montoChequeTransferencia, aDecimal(antes.montoChequeTransferencia)),
      montoTarjeta: num(dto.montoTarjeta, aDecimal(antes.montoTarjeta)),
      montoVentaCredito: num(dto.montoVentaCredito, aDecimal(antes.montoVentaCredito)),
      montoBonos: num(dto.montoBonos, aDecimal(antes.montoBonos)),
      montoPermuta: num(dto.montoPermuta, aDecimal(antes.montoPermuta)),
      montoOtrasFormas: num(dto.montoOtrasFormas, aDecimal(antes.montoOtrasFormas)),
    };
  }

  private construirDatos606(antes: Factura, dto: UpdateFacturaDto): Omit<FacturaDgii606, 'fechaComprobante'> & { fechaComprobante: Date | null } {
    return {
      rncCedula: str(dto.rncCedula, antes.rncCedula),
      tipoIdentificacion: str(dto.tipoIdentificacion, antes.tipoIdentificacion) as FacturaDgii606['tipoIdentificacion'],
      ncf: str(dto.ncf, antes.ncf),
      ncfModificado: strOrNull(dto.ncfModificado, antes.ncfModificado),
      fechaComprobante: fecha(dto.fechaComprobante, antes.fechaComprobante),
      fechaRetencionOPago: fecha(dto.fechaRetencionOPago, antes.fechaRetencionOPago),
      tipoBienesServicios: str(dto.tipoBienesServicios ?? undefined, antes.tipoBienesServicios ?? ''),
      formaPago: str(dto.formaPago ?? undefined, antes.formaPago ?? ''),
      tipoRetencionISR: strOrNull(dto.tipoRetencionISR, antes.tipoRetencionISR),
      montoFacturado: num(dto.montoFacturado, aDecimal(antes.montoFacturado)),
      itbisFacturado: num(dto.itbisFacturado, aDecimal(antes.itbisFacturado)),
      itbisRetenido: num(dto.itbisRetenido, aDecimal(antes.itbisRetenido)),
      itbisPercibido: num(dto.itbisPercibido, aDecimal(antes.itbisPercibido)),
      retencionRenta: num(dto.retencionRenta, aDecimal(antes.retencionRenta)),
      isrPercibido: num(dto.isrPercibido, aDecimal(antes.isrPercibido)),
      isc: num(dto.isc, aDecimal(antes.isc)),
      otrosImpuestos: num(dto.otrosImpuestos, aDecimal(antes.otrosImpuestos)),
      propinaLegal: num(dto.propinaLegal, aDecimal(antes.propinaLegal)),
      montoServicios: num(dto.montoServicios, aDecimal(antes.montoServicios)),
      montoBienes: num(dto.montoBienes, aDecimal(antes.montoBienes)),
      itbisSujetoProporcionalidad: num(dto.itbisSujetoProporcionalidad, aDecimal(antes.itbisSujetoProporcionalidad)),
      itbisLlevadoCosto: num(dto.itbisLlevadoCosto, aDecimal(antes.itbisLlevadoCosto)),
      itbisPorAdelantar: num(dto.itbisPorAdelantar, aDecimal(antes.itbisPorAdelantar)),
    };
  }

  private datosParaPrisma(dto: UpdateFacturaDto): Prisma.FacturaUpdateInput {
    const data: Prisma.FacturaUpdateInput = {};
    // Las identificaciones se guardan sin separadores vengan de donde vengan:
    // si al corregirlas a mano se colaran guiones, el RNC dejaría de casar con
    // el del contribuyente y la factura se «desclasificaría» sola.
    if (dto.rncCedula !== undefined) data.rncCedula = limpiarIdentificacion(dto.rncCedula);
    if (dto.tipoIdentificacion !== undefined) data.tipoIdentificacion = dto.tipoIdentificacion;
    if (dto.nombreEmisor !== undefined) data.nombreEmisor = dto.nombreEmisor;
    if (dto.identificacionEmisor !== undefined) {
      data.identificacionEmisor = limpiarIdentificacion(dto.identificacionEmisor) || null;
    }
    if (dto.nombreReceptor !== undefined) data.nombreReceptor = dto.nombreReceptor;
    if (dto.identificacionReceptor !== undefined) {
      data.identificacionReceptor = limpiarIdentificacion(dto.identificacionReceptor) || null;
    }
    if (dto.ncf !== undefined) data.ncf = dto.ncf;
    if (dto.ncfModificado !== undefined) data.ncfModificado = dto.ncfModificado;
    if (dto.fechaComprobante !== undefined) data.fechaComprobante = new Date(dto.fechaComprobante);
    if (dto.fechaRetencionOPago !== undefined) {
      data.fechaRetencionOPago = dto.fechaRetencionOPago ? new Date(dto.fechaRetencionOPago) : null;
    }
    if (dto.tipoIngreso !== undefined) data.tipoIngreso = dto.tipoIngreso;
    if (dto.tipoBienesServicios !== undefined) data.tipoBienesServicios = dto.tipoBienesServicios;
    if (dto.formaPago !== undefined) data.formaPago = dto.formaPago;
    if (dto.tipoRetencionISR !== undefined) data.tipoRetencionISR = dto.tipoRetencionISR;

    const camposDecimales: Array<keyof UpdateFacturaDto> = [
      'montoFacturado', 'itbisFacturado', 'itbisRetenido', 'itbisPercibido', 'retencionRenta',
      'isrPercibido', 'isc', 'otrosImpuestos', 'propinaLegal', 'montoServicios', 'montoBienes',
      'itbisSujetoProporcionalidad', 'itbisLlevadoCosto', 'itbisPorAdelantar', 'montoEfectivo',
      'montoChequeTransferencia', 'montoTarjeta', 'montoVentaCredito', 'montoBonos', 'montoPermuta',
      'montoOtrasFormas',
    ];
    for (const campo of camposDecimales) {
      const valor = dto[campo];
      if (valor !== undefined) {
        (data as Record<string, unknown>)[campo] = new Decimal(String(valor)).toString();
      }
    }
    return data;
  }

  /**
   * Núcleo compartido por `PATCH /facturas/:id` y `PATCH /facturas/lote/campos`:
   * revalida contra las reglas DGII del formato, reemplaza las `Validacion` y
   * deja el `AuditLog`, todo en una transacción por factura. Nunca duplicar
   * esta lógica en las rutas de lote.
   *
   * `cacheClaves` deja que el lote calcule las claves `rnc:ncf` una sola vez
   * por cliente+formato en vez de una consulta por fila (ver
   * `actualizarCamposLote`). Sin caché se consulta aquí, como siempre.
   */
  private async aplicarCambios(
    antes: FacturaCruda,
    dto: UpdateFacturaDto,
    userId: string,
    cacheClaves?: Map<string, ClaveNcf[]>,
  ): Promise<void> {
    const id = antes.id;

    if (!antes.periodoId || !antes.formato) {
      // Sin clasificar todavía: no hay cliente/formato con el que derivar ni
      // validar reglas DGII — se guardan los campos tal cual los corrigió el
      // contador, sin correr validaciones (se corren recién al clasificar).
      await this.prisma.$transaction([
        this.prisma.factura.update({
          where: { id },
          data: { ...this.datosParaPrisma(dto), origen: 'EDITADA', revisada: dto.revisada ?? antes.revisada },
        }),
        this.prisma.auditLog.create({
          data: {
            userId,
            entidad: 'Factura',
            entidadId: id,
            accion: 'EDITAR',
            antes: JSON.parse(JSON.stringify(antes)),
            despues: JSON.parse(JSON.stringify(dto)),
          },
        }),
      ]);
      return;
    }

    const periodo = await this.prisma.periodo.findUniqueOrThrow({
      where: { id: antes.periodoId },
      include: { cliente: true },
    });

    const llaveCache = `${periodo.cliente.rnc}|${periodo.formato}`;
    let claves = cacheClaves?.get(llaveCache);
    if (!claves) {
      claves = await this.clavesNcfDeclaradas(periodo.cliente.rnc, periodo.formato);
      cacheClaves?.set(llaveCache, claves);
    }
    const ncfsPrevios = new Set(claves.filter((c) => c.id !== id).map((c) => c.clave));

    const contexto: ContextoValidacion = {
      yyyymm: periodo.yyyymm,
      ncfsYaDeclarados: ncfsPrevios,
      tasaItbis: aDecimal(periodo.cliente.tasaItbis),
      confidences: (antes.confidences as Record<string, number>) ?? undefined,
    };

    const validaciones =
      periodo.formato === 'F607'
        ? validarFactura607(this.construirDatos607(antes, dto), contexto)
        : validarFactura606(this.construirDatos606(antes, dto), contexto);

    await this.prisma.$transaction([
      this.prisma.validacion.deleteMany({ where: { facturaId: id } }),
      this.prisma.factura.update({
        where: { id },
        data: {
          ...this.datosParaPrisma(dto),
          origen: 'EDITADA',
          revisada: dto.revisada ?? antes.revisada,
          validaciones: {
            create: validaciones.map((v) => ({ codigo: v.codigo, severidad: v.severidad, campo: v.campo, mensaje: v.mensaje })),
          },
        },
      }),
      this.prisma.auditLog.create({
        data: {
          userId,
          entidad: 'Factura',
          entidadId: id,
          accion: 'EDITAR',
          antes: JSON.parse(JSON.stringify(antes)),
          despues: JSON.parse(JSON.stringify(dto)),
        },
      }),
    ]);
  }

  async update(id: string, dto: UpdateFacturaDto, userId: string) {
    const antes = await this.cargarFacturaCruda(id);
    await this.aplicarCambios(antes, dto, userId);
    return this.findOne(id);
  }

  /**
   * Clasifica (o reclasifica) a mano una factura: fija su cliente y formato
   * (606/607), corre la derivación y validación DGII de ese formato, y
   * arma/encuentra el Período correspondiente. Se usa tanto para asignar una
   * factura que quedó "sin clasificar" como para corregir una
   * auto-clasificación equivocada.
   */
  async clasificar(id: string, dto: ClasificarFacturaDto, userId: string) {
    const antes = await this.cargarFacturaCruda(id);
    await this.procesador.clasificarManualmente(id, dto.clienteId, dto.formato);
    await this.prisma.auditLog.create({
      data: {
        userId,
        entidad: 'Factura',
        entidadId: id,
        accion: 'CLASIFICAR',
        antes: { clienteId: antes.clienteId, formato: antes.formato, clasificacionConfirmada: antes.clasificacionConfirmada },
        despues: { clienteId: dto.clienteId, formato: dto.formato, clasificacionConfirmada: true },
      },
    });
    return this.findOne(id);
  }

  async marcarRevisada(id: string, revisada: boolean, userId: string) {
    const antes = await this.cargarFacturaCruda(id);
    await this.prisma.$transaction([
      this.prisma.factura.update({ where: { id }, data: { revisada } }),
      this.prisma.auditLog.create({
        data: {
          userId,
          entidad: 'Factura',
          entidadId: id,
          accion: revisada ? 'MARCAR_REVISADA' : 'DESMARCAR_REVISADA',
          antes: { revisada: antes.revisada },
          despues: { revisada },
        },
      }),
    ]);
    return this.findOne(id);
  }

  /**
   * Borrado DURO, y arrastrando el Documento si esta era su única factura.
   *
   * No hay borrado lógico a propósito: un `eliminadaAt` obligaría a colar
   * `eliminadaAt: null` en ~7 consultas sin ayuda del compilador, y mientras
   * tanto `ncfsYaDeclarados` seguiría viendo la fila borrada y levantaría un
   * `NCF_DUPLICADO` falso sobre la factura de reemplazo, y
   * `verificarExportable` seguiría contándola, bloqueando la exportación para
   * siempre — justo lo que el botón de papelera intenta desbloquear.
   * El `AuditLog` hace de lápida: `antes` lleva la factura entera con sus
   * líneas y validaciones.
   *
   * Lo del Documento no es limpieza cosmética: `Documento.sha256` es único
   * global y `subirGlobal` corta en seco ante un hash repetido. Un Documento
   * huérfano queda en EXTRAIDO (nunca se reprocesa), no aparece en
   * "pendientes", y volver a subir el mismo PDF devuelve `duplicado: true` sin
   * crear nada: la factura se vuelve irrecuperable desde la UI.
   */
  async remove(id: string, userId: string) {
    const factura = await this.cargarFacturaCruda(id);

    const documento = await this.prisma.documento.findUnique({
      where: { id: factura.documentoId },
      select: { id: true, rutaArchivo: true, _count: { select: { facturas: true } } },
    });
    // El esquema admite PDFs multi-factura, así que solo se arrastra el
    // Documento cuando esta era la última que colgaba de él.
    const documentoHuerfano = documento !== null && documento._count.facturas === 1;

    await this.prisma.$transaction([
      this.prisma.auditLog.create({
        data: {
          userId,
          entidad: 'Factura',
          entidadId: id,
          accion: 'ELIMINAR',
          antes: JSON.parse(JSON.stringify(factura)),
          despues: Prisma.JsonNull,
        },
      }),
      this.prisma.factura.delete({ where: { id } }),
      ...(documentoHuerfano ? [this.prisma.documento.delete({ where: { id: factura.documentoId } })] : []),
    ]);

    // El borrado del archivo va FUERA de la transacción: `fs.rm` no participa
    // del rollback, y un archivo huérfano en disco es mucho menos grave que
    // una fila apuntando a un archivo que ya no está.
    if (documento && documentoHuerfano) await eliminarArchivo(documento.rutaArchivo);

    return { id, documentoEliminado: documentoHuerfano };
  }

  /**
   * Marcar/desmarcar revisada en lote. Se vectoriza a 2 statements porque
   * `marcarRevisada` no revalida nada — no hay reglas DGII que correr por fila.
   */
  async marcarRevisadaLote(ids: string[], revisada: boolean, userId: string): Promise<ResultadoLote> {
    const existentes = await this.prisma.factura.findMany({
      where: { id: { in: ids } },
      select: { id: true, revisada: true },
    });
    const encontradas = new Set(existentes.map((f) => f.id));
    const fallidas = ids.filter((id) => !encontradas.has(id)).map((id) => ({ id, motivo: 'Factura no encontrada.' }));

    await this.prisma.$transaction([
      this.prisma.factura.updateMany({ where: { id: { in: [...encontradas] } }, data: { revisada } }),
      this.prisma.auditLog.createMany({
        data: existentes.map((f) => ({
          userId,
          entidad: 'Factura',
          entidadId: f.id,
          accion: revisada ? 'MARCAR_REVISADA' : 'DESMARCAR_REVISADA',
          antes: { revisada: f.revisada },
          despues: { revisada },
        })),
      }),
    ]);

    return { solicitadas: ids.length, procesadas: existentes.length, fallidas };
  }

  /**
   * Edición en lote, limitada a los campos de clasificación. Esa limitación es
   * de diseño, no una optimización pendiente: ninguno de esos campos entra en
   * la clave `rncCedula:ncf`, así que las claves ya declaradas se calculan una
   * sola vez por cliente+formato (`cacheClaves`) en lugar de una por fila, que
   * es la trampa O(N²) de `update()`. NCF y montos siguen siendo edición de a
   * una.
   *
   * Bucle secuencial con transacción por fila: los fallos se recolectan y se
   * devuelven, no revientan el lote entero.
   */
  async actualizarCamposLote(dto: LoteCamposDto, userId: string): Promise<ResultadoLote> {
    // `formaVenta` no es una columna: se traduce a los 7 montos con el total de
    // cada factura, así que sale de aquí y se resuelve dentro del bucle.
    const { formaVenta, ...camposDirectos } = dto.cambios ?? {};
    const cambiosBase: UpdateFacturaDto = { ...camposDirectos };
    const reclasificar = dto.clienteId !== undefined || dto.formato !== undefined;

    if (reclasificar && !(dto.clienteId && dto.formato)) {
      throw new BadRequestException('Para reclasificar en lote hacen falta `clienteId` y `formato` juntos.');
    }
    if (!reclasificar && Object.keys(cambiosBase).length === 0 && !formaVenta) {
      throw new BadRequestException('No se indicó ningún cambio: envía `cambios`, o `clienteId` + `formato`.');
    }
    if (formaVenta && dto.formato === 'F606') {
      throw new BadRequestException('La forma de venta es exclusiva del 607; en 606 se usa `formaPago`.');
    }

    // La caché se llena con la primera fila de cada cliente+formato. Nota: si
    // dos filas del mismo lote entran a un grupo nuevo por reclasificación y
    // comparten `rnc:ncf`, el duplicado se detecta recién en la siguiente
    // edición — el lote no cambia NCF, así que el duplicado ya venía de antes.
    const cacheClaves = new Map<string, ClaveNcf[]>();
    const fallidas: FalloLote[] = [];
    let procesadas = 0;

    for (const id of dto.ids) {
      try {
        if (dto.clienteId && dto.formato) {
          await this.clasificar(id, { clienteId: dto.clienteId, formato: dto.formato }, userId);
        }
        const antes = await this.cargarFacturaCruda(id);

        let cambios = cambiosBase;
        if (formaVenta) {
          if (antes.formato === 'F606') {
            throw new BadRequestException('Es una factura 606: no admite forma de venta.');
          }
          // El total va íntegro a la columna elegida, con el importe de ESTA
          // factura — por eso se calcula por fila y no una vez por lote.
          const total = new Decimal(antes.montoFacturado.toString()).plus(antes.itbisFacturado.toString());
          const distribucion = distribuirFormaVenta607(formaVenta, total);
          cambios = {
            ...cambiosBase,
            montoEfectivo: distribucion.montoEfectivo.toNumber(),
            montoChequeTransferencia: distribucion.montoChequeTransferencia.toNumber(),
            montoTarjeta: distribucion.montoTarjeta.toNumber(),
            montoVentaCredito: distribucion.montoVentaCredito.toNumber(),
            montoBonos: distribucion.montoBonos.toNumber(),
            montoPermuta: distribucion.montoPermuta.toNumber(),
            montoOtrasFormas: distribucion.montoOtrasFormas.toNumber(),
          };
        }

        await this.aplicarCambios(antes, cambios, userId, cacheClaves);
        procesadas += 1;
      } catch (error) {
        fallidas.push({ id, motivo: motivoDe(error) });
      }
    }

    return { solicitadas: dto.ids.length, procesadas, fallidas };
  }

  /** Borrado duro en lote — misma semántica que `remove`, fila por fila. */
  async eliminarLote(ids: string[], userId: string): Promise<ResultadoLote> {
    const fallidas: FalloLote[] = [];
    let procesadas = 0;

    for (const id of ids) {
      try {
        await this.remove(id, userId);
        procesadas += 1;
      } catch (error) {
        fallidas.push({ id, motivo: motivoDe(error) });
      }
    }

    return { solicitadas: ids.length, procesadas, fallidas };
  }

  async confirmarClasificacionLote(ids: string[], userId: string): Promise<ResultadoLote> {
    const existentes = await this.prisma.factura.findMany({
      where: { id: { in: ids } },
      select: { id: true, clasificacionConfirmada: true },
    });
    const encontradas = new Set(existentes.map((f) => f.id));
    const fallidas = ids.filter((id) => !encontradas.has(id)).map((id) => ({ id, motivo: 'Factura no encontrada.' }));

    await this.prisma.$transaction([
      this.prisma.factura.updateMany({ where: { id: { in: [...encontradas] } }, data: { clasificacionConfirmada: true } }),
      this.prisma.auditLog.createMany({
        data: existentes.map((f) => ({
          userId,
          entidad: 'Factura',
          entidadId: f.id,
          accion: 'CONFIRMAR_CLASIFICACION',
          antes: { clasificacionConfirmada: f.clasificacionConfirmada },
          despues: { clasificacionConfirmada: true },
        })),
      }),
    ]);

    return { solicitadas: ids.length, procesadas: existentes.length, fallidas };
  }
}
