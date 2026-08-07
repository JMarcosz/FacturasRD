import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { EstadoDocumento, EstadoPeriodo, FormatoDgii, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ListarFacturasQueryDto } from '../facturas/dto/listar-facturas-query.dto';
import { construirWhereFacturas } from '../facturas/where-facturas';
import { ResumenQueryDto } from './dto/resumen-query.dto';

/**
 * Agregados para el Dashboard, la tira de KPIs de Facturas y las tarjetas de
 * Clientes.
 *
 * Regla del módulo: **se devuelven conteos crudos, nunca porcentajes ni
 * deltas.** El frontend recibe los dos meses y decide qué pintar cuando el
 * denominador es 0 (un "—" en vez de un "+∞").
 *
 * Supuestos (documentados porque cambian qué significa cada cifra):
 *  1. El mes se determina por `fechaComprobante`, no por `createdAt` — es la
 *     única opción que funciona para las facturas sin clasificar, que no
 *     tienen período. Una factura de junio subida en julio cuenta en junio.
 *  2. "Escaneadas" = filas `Factura`. Un documento cuya extracción falló nunca
 *     llega a crear una, por eso existe el bloque aparte `colaDocumentos`.
 *  3. "Exportadas" = facturas cuyo `Periodo.estado` es EXPORTADO; no hay marca
 *     de exportación por factura.
 *  4. El embudo no está estrictamente anidado: `marcarRevisada` no exige
 *     cliente, así que `revisadas` puede superar a `clasificadas`.
 */

export interface Totales {
  escaneadas: number;
  clasificadas: number;
  sinClasificar: number;
  revisadas: number;
  exportadas: number;
  conErrorValidacion: number;
  /** Decimal serializado como string: nunca se pasa dinero por un float de JS. */
  montoFacturado: string;
  itbisFacturado: string;
}

export interface TotalesMes extends Totales {
  yyyymm: string;
}

export interface TotalesFormato {
  formato: FormatoDgii;
  escaneadas: number;
  revisadas: number;
  conErrorValidacion: number;
  montoFacturado: string;
  itbisFacturado: string;
  periodo: { id: string; estado: EstadoPeriodo } | null;
}

export interface RollupCliente {
  clienteId: string;
  nombre: string;
  rnc: string;
  escaneadas: number;
  revisadas: number;
  conErrorValidacion: number;
  montoFacturado: string;
  itbisFacturado: string;
  porFormato: TotalesFormato[];
}

export interface ErrorBloqueante {
  codigo: string;
  /** Validaciones con severidad ERROR, no facturas: una factura puede aportar varias. */
  cantidad: number;
}

export interface ColaDocumentos {
  pendientes: number;
  procesando: number;
  error: number;
  total: number;
}

/** Forma de una fila del groupBy principal, para poder totalizar sin arrastrar genéricos de Prisma. */
interface FilaGrupo {
  clienteId: string | null;
  formato: FormatoDgii | null;
  revisada: boolean;
  _count: { _all: number };
  _sum: { montoFacturado: Prisma.Decimal | null; itbisFacturado: Prisma.Decimal | null };
}

interface Acumulado {
  escaneadas: number;
  revisadas: number;
  montoFacturado: Decimal;
  itbisFacturado: Decimal;
}

/**
 * Argumentos del groupBy principal. Se construyen con una función y no con una
 * constante `as const` porque Prisma exige que `by` sea un array mutable: con
 * uno readonly su tipo condicional se cae y pasa a pedir `orderBy`.
 */
function argsGrupo(where: Prisma.FacturaWhereInput) {
  return {
    by: ['clienteId', 'formato', 'revisada'] as Prisma.FacturaScalarFieldEnum[],
    where,
    _count: { _all: true },
    _sum: { montoFacturado: true, itbisFacturado: true },
  };
}

/** Rango [inicio de mes, inicio del siguiente) en UTC. `lt` y no `lte` para no pisar el día 1 del mes que viene. */
function rangoMes(yyyymm: string): { gte: Date; lt: Date } {
  const anio = Number(yyyymm.slice(0, 4));
  const mes = Number(yyyymm.slice(4, 6));
  return { gte: new Date(Date.UTC(anio, mes - 1, 1)), lt: new Date(Date.UTC(anio, mes, 1)) };
}

function comoYyyymm(fecha: Date): string {
  return `${fecha.getUTCFullYear()}${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

function mesAnteriorDe(yyyymm: string): string {
  const anio = Number(yyyymm.slice(0, 4));
  const mes = Number(yyyymm.slice(4, 6));
  return comoYyyymm(new Date(Date.UTC(anio, mes - 2, 1)));
}

function nuevoAcumulado(): Acumulado {
  return { escaneadas: 0, revisadas: 0, montoFacturado: new Decimal(0), itbisFacturado: new Decimal(0) };
}

/** `_sum` devuelve null cuando el conjunto está vacío — se coerce a 0, no a NaN. */
function sumarEn(acumulado: Acumulado, fila: FilaGrupo): void {
  acumulado.escaneadas += fila._count._all;
  if (fila.revisada) acumulado.revisadas += fila._count._all;
  acumulado.montoFacturado = acumulado.montoFacturado.plus(fila._sum.montoFacturado?.toString() ?? '0');
  acumulado.itbisFacturado = acumulado.itbisFacturado.plus(fila._sum.itbisFacturado?.toString() ?? '0');
}

function acumularEn(mapa: Map<string, Acumulado>, clave: string, fila: FilaGrupo): void {
  const acumulado = mapa.get(clave) ?? nuevoAcumulado();
  sumarEn(acumulado, fila);
  mapa.set(clave, acumulado);
}

function totalizar(grupos: FilaGrupo[], exportadas: number, conErrorValidacion: number): Totales {
  const total = nuevoAcumulado();
  let clasificadas = 0;
  for (const fila of grupos) {
    sumarEn(total, fila);
    if (fila.clienteId !== null) clasificadas += fila._count._all;
  }
  return {
    escaneadas: total.escaneadas,
    clasificadas,
    sinClasificar: total.escaneadas - clasificadas,
    revisadas: total.revisadas,
    exportadas,
    conErrorValidacion,
    montoFacturado: total.montoFacturado.toFixed(2),
    itbisFacturado: total.itbisFacturado.toFixed(2),
  };
}

@Injectable()
export class EstadisticasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resumen mensual: alimenta el Dashboard, la tarjeta "Período abierto" del
   * sidebar y las métricas de la rejilla de Clientes.
   *
   * Todas las consultas van en un `$transaction` en forma de array. No es por
   * rendimiento sino por consistencia: el worker de extracción escribe cada 3
   * segundos y, sin transacción, es perfectamente alcanzable devolver un
   * "clasificadas > escaneadas".
   */
  async resumen(query: ResumenQueryDto) {
    const yyyymm = query.yyyymm ?? comoYyyymm(new Date());
    const yyyymmAnterior = mesAnteriorDe(yyyymm);

    const filtroCliente: Prisma.FacturaWhereInput = query.clienteId ? { clienteId: query.clienteId } : {};
    const whereMes: Prisma.FacturaWhereInput = { ...filtroCliente, fechaComprobante: rangoMes(yyyymm) };
    const whereAnterior: Prisma.FacturaWhereInput = { ...filtroCliente, fechaComprobante: rangoMes(yyyymmAnterior) };
    const conError: Prisma.FacturaWhereInput = { validaciones: { some: { severidad: 'ERROR' } } };

    const [
      grupos,
      gruposAnterior,
      erroresPorGrupo,
      conErrorAnterior,
      exportadasMes,
      exportadasAnterior,
      bloqueantes,
      cola,
      sinFecha,
      clientes,
      periodos,
    ] = (await this.prisma.$transaction([
      this.prisma.factura.groupBy(argsGrupo(whereMes)),
      this.prisma.factura.groupBy(argsGrupo(whereAnterior)),
      this.prisma.factura.groupBy({
        by: ['clienteId', 'formato'] as Prisma.FacturaScalarFieldEnum[],
        where: { ...whereMes, ...conError },
        _count: { _all: true },
      }),
      this.prisma.factura.count({ where: { ...whereAnterior, ...conError } }),
      this.prisma.factura.count({ where: { ...whereMes, periodo: { estado: 'EXPORTADO' } } }),
      this.prisma.factura.count({ where: { ...whereAnterior, periodo: { estado: 'EXPORTADO' } } }),
      this.prisma.validacion.groupBy({
        by: ['codigo'] as Prisma.ValidacionScalarFieldEnum[],
        where: { severidad: 'ERROR', factura: whereMes },
        _count: { _all: true },
      }),
      this.prisma.documento.groupBy({
        by: ['estado'] as Prisma.DocumentoScalarFieldEnum[],
        where: { estado: { in: ['PENDIENTE', 'PROCESANDO', 'ERROR'] } },
        _count: { _all: true },
      }),
      // Sin fecha de comprobante no caen en ningún mes: se reportan aparte
      // para que no desaparezcan del embudo en silencio.
      this.prisma.factura.count({ where: { ...filtroCliente, fechaComprobante: null } }),
      this.prisma.cliente.findMany({
        where: query.clienteId ? { id: query.clienteId } : {},
        select: { id: true, nombre: true, rnc: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.periodo.findMany({
        where: { yyyymm, ...(query.clienteId ? { clienteId: query.clienteId } : {}) },
        select: { id: true, estado: true, clienteId: true, formato: true },
      }),
      // El `by` dinámico impide que Prisma infiera la forma exacta de cada
      // groupBy, así que se afirma la tupla del transaction en un solo sitio.
    ])) as [
      FilaGrupo[],
      FilaGrupo[],
      Array<{ clienteId: string | null; formato: FormatoDgii | null; _count: { _all: number } }>,
      number,
      number,
      number,
      Array<{ codigo: string; _count: { _all: number } }>,
      Array<{ estado: EstadoDocumento; _count: { _all: number } }>,
      number,
      Array<{ id: string; nombre: string; rnc: string }>,
      Array<{ id: string; estado: EstadoPeriodo; clienteId: string; formato: FormatoDgii }>,
    ];

    const conErrorMes = erroresPorGrupo.reduce((acc, g) => acc + g._count._all, 0);

    return {
      mes: { yyyymm, ...totalizar(grupos, exportadasMes, conErrorMes) } satisfies TotalesMes,
      mesAnterior: {
        yyyymm: yyyymmAnterior,
        ...totalizar(gruposAnterior, exportadasAnterior, conErrorAnterior),
      } satisfies TotalesMes,
      porCliente: this.armarRollupClientes(clientes, grupos, erroresPorGrupo, periodos),
      erroresBloqueantes: bloqueantes
        .map((b) => ({ codigo: b.codigo, cantidad: b._count._all }) satisfies ErrorBloqueante)
        .sort((a, b) => b.cantidad - a.cantidad),
      colaDocumentos: {
        pendientes: cola.find((c) => c.estado === 'PENDIENTE')?._count._all ?? 0,
        procesando: cola.find((c) => c.estado === 'PROCESANDO')?._count._all ?? 0,
        error: cola.find((c) => c.estado === 'ERROR')?._count._all ?? 0,
        total: cola.reduce((acc, c) => acc + c._count._all, 0),
      } satisfies ColaDocumentos,
      sinFecha,
    };
  }

  /**
   * Totales del conjunto de facturas que hoy muestra la tabla, con los mismos
   * filtros que `GET /facturas`. Existe aparte de `resumen` porque si los KPIs
   * solo aceptaran `yyyymm` contradirían las filas visibles en cuanto hay
   * cualquier filtro activo.
   */
  async porFiltro(query: ListarFacturasQueryDto) {
    const where = construirWhereFacturas(query);
    const conError: Prisma.FacturaWhereInput = { validaciones: { some: { severidad: 'ERROR' } } };

    const [grupos, exportadas, conErrorValidacion, bloqueantes] = (await this.prisma.$transaction([
      this.prisma.factura.groupBy(argsGrupo(where)),
      this.prisma.factura.count({ where: { ...where, periodo: { estado: 'EXPORTADO' } } }),
      this.prisma.factura.count({ where: { ...where, ...conError } }),
      this.prisma.validacion.groupBy({
        by: ['codigo'] as Prisma.ValidacionScalarFieldEnum[],
        where: { severidad: 'ERROR', factura: where },
        _count: { _all: true },
      }),
    ])) as [FilaGrupo[], number, number, Array<{ codigo: string; _count: { _all: number } }>];

    return {
      totales: totalizar(grupos, exportadas, conErrorValidacion),
      erroresBloqueantes: bloqueantes
        .map((b) => ({ codigo: b.codigo, cantidad: b._count._all }) satisfies ErrorBloqueante)
        .sort((a, b) => b.cantidad - a.cantidad),
    };
  }

  /**
   * Cruza el groupBy con la lista de clientes y los períodos del mes. Se
   * devuelve una fila por cliente aunque no tenga facturas en el mes: la
   * rejilla de Clientes las quiere todas, con ceros.
   */
  private armarRollupClientes(
    clientes: Array<{ id: string; nombre: string; rnc: string }>,
    grupos: FilaGrupo[],
    erroresPorGrupo: Array<{ clienteId: string | null; formato: FormatoDgii | null; _count: { _all: number } }>,
    periodos: Array<{ id: string; estado: EstadoPeriodo; clienteId: string; formato: FormatoDgii }>,
  ): RollupCliente[] {
    const porCliente = new Map<string, Acumulado>();
    const porClienteFormato = new Map<string, Acumulado>();
    for (const fila of grupos) {
      if (fila.clienteId === null) continue; // sin clasificar: van a `sinClasificar`, no a un cliente
      acumularEn(porCliente, fila.clienteId, fila);
      if (fila.formato) acumularEn(porClienteFormato, `${fila.clienteId}|${fila.formato}`, fila);
    }

    const erroresCliente = new Map<string, number>();
    const erroresClienteFormato = new Map<string, number>();
    for (const fila of erroresPorGrupo) {
      if (fila.clienteId === null) continue;
      erroresCliente.set(fila.clienteId, (erroresCliente.get(fila.clienteId) ?? 0) + fila._count._all);
      if (fila.formato) {
        const clave = `${fila.clienteId}|${fila.formato}`;
        erroresClienteFormato.set(clave, (erroresClienteFormato.get(clave) ?? 0) + fila._count._all);
      }
    }

    const periodoDe = new Map(periodos.map((p) => [`${p.clienteId}|${p.formato}`, { id: p.id, estado: p.estado }]));

    return clientes.map((cliente) => {
      const total = porCliente.get(cliente.id) ?? nuevoAcumulado();

      // Un formato entra si tiene facturas o si ya existe su período (para que
      // la tarjeta "Período abierto" aparezca aunque todavía no haya cargado
      // ninguna factura).
      const formatos = new Set<FormatoDgii>();
      for (const fila of grupos) if (fila.clienteId === cliente.id && fila.formato) formatos.add(fila.formato);
      for (const p of periodos) if (p.clienteId === cliente.id) formatos.add(p.formato);

      const porFormato = [...formatos]
        .sort()
        .map((formato): TotalesFormato => {
          const clave = `${cliente.id}|${formato}`;
          const acumulado = porClienteFormato.get(clave) ?? nuevoAcumulado();
          return {
            formato,
            escaneadas: acumulado.escaneadas,
            revisadas: acumulado.revisadas,
            conErrorValidacion: erroresClienteFormato.get(clave) ?? 0,
            montoFacturado: acumulado.montoFacturado.toFixed(2),
            itbisFacturado: acumulado.itbisFacturado.toFixed(2),
            periodo: periodoDe.get(clave) ?? null,
          };
        });

      return {
        clienteId: cliente.id,
        nombre: cliente.nombre,
        rnc: cliente.rnc,
        escaneadas: total.escaneadas,
        revisadas: total.revisadas,
        conErrorValidacion: erroresCliente.get(cliente.id) ?? 0,
        montoFacturado: total.montoFacturado.toFixed(2),
        itbisFacturado: total.itbisFacturado.toFixed(2),
        porFormato,
      };
    });
  }
}
