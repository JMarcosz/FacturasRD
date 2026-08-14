import { Injectable, Logger } from '@nestjs/common';
import { ClasificacionOperacion, FormatoDgii, RolFactura } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { normalizarIdentificacion, sonNombresComercialesEquivalentes } from '../dgii';
import type { FacturaExtraida, Formato } from '../dgii';
import { ClasificadorCostoGastoService } from './clasificador-costo-gasto.service';
import { SugerenciasService } from '../sugerencias/sugerencias.service';

export interface ResultadoClasificacion {
  clienteId: string | null;
  formato: Formato | null;
  clasificacionOperacion: ClasificacionOperacion;
  tipoIngreso?: string;
  tipoBienesServicios?: string;
  formaPago?: string;
  justificacionIa?: string;
  confianzaIa?: number;
  clasificacionConfirmada?: boolean;
}

@Injectable()
export class ClasificadorService {
  private readonly logger = new Logger(ClasificadorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly costoGastoIa: ClasificadorCostoGastoService,
    private readonly sugerenciasService: SugerenciasService,
  ) {}

  /**
   * Clasifica una factura según el Maestro de Clientes y la posición de las entidades:
   * - Emisor en Maestro y Receptor no -> INGRESO (607) + Inferencia IA de Tipo de Ingreso (01..06)
   * - Receptor en Maestro y Emisor no -> COSTO o GASTO (606) + Inferencia IA de Tipo Bienes (01..11) y Forma Pago (01..07)
   * - Ninguno en Maestro -> PENDIENTE + Sugerencias de clientes
   * - Ambos en Maestro -> CLASIFICACION_AMBIGUA (resolución manual)
   */
  async clasificar(hechos: FacturaExtraida, facturaId?: string): Promise<ResultadoClasificacion> {
    const rncEmisor = normalizarIdentificacion(hechos.rncEmisor ?? '');
    const nombreEmisor = hechos.nombreEmisor?.trim() || '';

    const rncReceptor = normalizarIdentificacion(hechos.rncReceptor ?? '');
    const nombreReceptor = hechos.nombreReceptor?.trim() || '';

    const clienteEmisor = await this.buscarEnMaestro(rncEmisor, nombreEmisor);
    const clienteReceptor = await this.buscarEnMaestro(rncReceptor, nombreReceptor);

    // Caso D: Ambos están registrados como clientes -> Estado explícito CLASIFICACION_AMBIGUA
    if (clienteEmisor && clienteReceptor && clienteEmisor.id !== clienteReceptor.id) {
      this.logger.warn(`Clasificación ambigua para factura ${facturaId || 'nueva'}: Emisor (${clienteEmisor.nombre}) y Receptor (${clienteReceptor.nombre}) son clientes.`);
      return {
        clienteId: null,
        formato: null,
        clasificacionOperacion: ClasificacionOperacion.CLASIFICACION_AMBIGUA,
        justificacionIa: `Ambos comercios (Emisor: ${clienteEmisor.nombre}, Receptor: ${clienteReceptor.nombre}) están registrados en el maestro de clientes.`,
        confianzaIa: 0.5,
        clasificacionConfirmada: false,
      };
    }

    // Caso A: Emisor registrado en el maestro de clientes -> INGRESO (607) con Tipo de Ingreso IA
    if (clienteEmisor) {
      const resIngreso = await this.costoGastoIa.determinarIngreso(
        hechos.nombreReceptor,
        hechos.lineas || [],
        hechos.montoTotal,
      );

      return {
        clienteId: clienteEmisor.id,
        formato: 'F607',
        clasificacionOperacion: ClasificacionOperacion.INGRESO,
        tipoIngreso: resIngreso.tipoIngreso,
        justificacionIa: `Venta / Ingreso [Tipo ${resIngreso.tipoIngreso}]: ${resIngreso.justificacion}`,
        confianzaIa: resIngreso.confianza,
        clasificacionConfirmada: false,
      };
    }

    // Caso B: Receptor registrado en el maestro de clientes -> COSTO o GASTO (606) con Tipo de Bienes y Forma Pago IA
    if (clienteReceptor) {
      const resCostoGasto = await this.costoGastoIa.determinarCostoOGasto(
        hechos.nombreEmisor,
        hechos.lineas || [],
        hechos.montoTotal,
        hechos.formaPagoImpresa,
      );

      return {
        clienteId: clienteReceptor.id,
        formato: 'F606',
        clasificacionOperacion: resCostoGasto.clasificacion === 'COSTO' ? ClasificacionOperacion.COSTO : ClasificacionOperacion.GASTO,
        tipoBienesServicios: resCostoGasto.tipoBienesServicios,
        formaPago: resCostoGasto.formaPago,
        justificacionIa: resCostoGasto.justificacion,
        confianzaIa: resCostoGasto.confianza,
        clasificacionConfirmada: false,
      };
    }

    // Caso C: Ninguno está registrado en el maestro -> PENDIENTE + Generación de Sugerencias
    if (rncEmisor || nombreEmisor) {
      await this.sugerenciasService.registrarSugerencia(rncEmisor, nombreEmisor, RolFactura.EMISOR, facturaId);
    }
    if (rncReceptor || nombreReceptor) {
      await this.sugerenciasService.registrarSugerencia(rncReceptor, nombreReceptor, RolFactura.RECEPTOR, facturaId);
    }

    return {
      clienteId: null,
      formato: null,
      clasificacionOperacion: ClasificacionOperacion.PENDIENTE,
      justificacionIa: 'Ningún participante está registrado en el maestro de clientes.',
      confianzaIa: 0.0,
      clasificacionConfirmada: false,
    };
  }

  /**
   * Busca un contribuyente en el maestro de clientes activos:
   * 1. Prioridad principal: Coincidencia por RNC/Cédula o sus alias.
   * 2. Prioridad secundaria: Coincidencia por Nombre (exacto o equivalente ignorando signos de puntuación).
   */
  async buscarEnMaestro(rncRaw?: string | null, nombreRaw?: string | null): Promise<{ id: string; nombre: string; rnc: string } | null> {
    const rnc = rncRaw ? normalizarIdentificacion(rncRaw) : '';
    const nombre = nombreRaw ? nombreRaw.trim().toUpperCase() : '';

    // 1. Búsqueda por RNC directo o Alias (Máxima prioridad)
    if (rnc) {
      const directo = await this.prisma.cliente.findFirst({
        where: { rnc, activo: true },
        select: { id: true, nombre: true, rnc: true },
      });
      if (directo) return directo;

      const alias = await this.prisma.clienteRncAlias.findFirst({
        where: { rnc, cliente: { activo: true } },
        select: { cliente: { select: { id: true, nombre: true, rnc: true } } },
      });
      if (alias?.cliente) return alias.cliente;
    }

    // 2. Búsqueda secundaria por Nombre
    if (nombre) {
      // Coincidencia directa exacta
      const porNombre = await this.prisma.cliente.findFirst({
        where: {
          nombre: { equals: nombre, mode: 'insensitive' },
          activo: true,
        },
        select: { id: true, nombre: true, rnc: true },
      });
      if (porNombre) return porNombre;

      // Coincidencia normalizada insensible a comas, puntos y sufijos societarios
      const todosLosClientes = await this.prisma.cliente.findMany({
        where: { activo: true },
        select: { id: true, nombre: true, rnc: true },
      });

      const equivalente = todosLosClientes.find((c) => sonNombresComercialesEquivalentes(nombre, c.nombre));
      if (equivalente) return equivalente;
    }

    return null;
  }
}
