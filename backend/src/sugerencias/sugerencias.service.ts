import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EstadoSugerencia, RolFactura, SugerenciaCliente } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { normalizarIdentificacion, sonNombresComercialesEquivalentes } from '../dgii';

@Injectable()
export class SugerenciasService {
  private readonly logger = new Logger(SugerenciasService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra un comercio detectado en una factura como candidato a Cliente.
   * - Si ya fue DESCARTADO por el usuario, se ignora permanentemente.
   * - Si ya existe como SUGERIDO, se incrementa el contador de veces detectado (deduplicación).
   * - Si ya fue CREADO como cliente, no se vuelve a sugerir.
   */
  async registrarSugerencia(
    rncRaw: string | null | undefined,
    nombreRaw: string | null | undefined,
    rol: RolFactura,
    facturaId?: string,
  ): Promise<void> {
    const rnc = rncRaw ? normalizarIdentificacion(rncRaw) : null;
    const nombre = (nombreRaw || (rnc ? `COMERCIO ${rnc}` : '')).trim().toUpperCase();

    if (!rnc && !nombre) return;

    // Verificar si ya existe en el Maestro de Clientes activo (por RNC o Nombre equivalente)
    if (rnc) {
      const clienteExistente = await this.prisma.cliente.findFirst({
        where: { rnc, activo: true },
        select: { id: true },
      });
      if (clienteExistente) return;
    } else if (nombre) {
      const clientesActivos = await this.prisma.cliente.findMany({
        where: { activo: true },
        select: { nombre: true },
      });
      const clienteExistente = clientesActivos.some((c) => sonNombresComercialesEquivalentes(nombre, c.nombre));
      if (clienteExistente) return;
    }

    // Buscar en la tabla de SugerenciaCliente existente (por RNC o por Nombre)
    let sugerenciaExistente: SugerenciaCliente | null = null;
    if (rnc) {
      sugerenciaExistente = await this.prisma.sugerenciaCliente.findFirst({
        where: { rnc },
      });
    }
    if (!sugerenciaExistente && nombre) {
      sugerenciaExistente = await this.prisma.sugerenciaCliente.findFirst({
        where: { nombre },
      });
    }

    if (sugerenciaExistente) {
      // Si el usuario ya lo descartó, NO volver a sugerir jamás
      if (sugerenciaExistente.estado === EstadoSugerencia.DESCARTADO) {
        return;
      }
      if (sugerenciaExistente.estado === EstadoSugerencia.CREADO) {
        return;
      }

      // Si está como SUGERIDO, deduplicar e incrementar frecuencia
      await this.prisma.sugerenciaCliente.update({
        where: { id: sugerenciaExistente.id },
        data: {
          vecesDetectado: { increment: 1 },
          ultimaFacturaId: facturaId ?? sugerenciaExistente.ultimaFacturaId,
          ...(rnc && !sugerenciaExistente.rnc ? { rnc } : {}),
          ...(nombre && sugerenciaExistente.nombre.startsWith('COMERCIO') ? { nombre } : {}),
        },
      });
      return;
    }

    // Crear nueva sugerencia
    try {
      await this.prisma.sugerenciaCliente.create({
        data: {
          rnc: rnc || null,
          nombre,
          rol,
          estado: EstadoSugerencia.SUGERIDO,
          vecesDetectado: 1,
          ultimaFacturaId: facturaId,
        },
      });
      this.logger.log(`Sugerencia de cliente registrada: ${nombre} (${rnc || 'Sin RNC'}) [${rol}]`);
    } catch (err: any) {
      // Ignorar colisión de clave única si otro proceso concurrente lo insertó
      this.logger.debug(`Colisión de sugerencia: ${err.message}`);
    }
  }

  async findAll(incluirDescartados = false) {
    return this.prisma.sugerenciaCliente.findMany({
      where: incluirDescartados ? undefined : { estado: EstadoSugerencia.SUGERIDO },
      orderBy: [{ vecesDetectado: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const s = await this.prisma.sugerenciaCliente.findUnique({ where: { id } });
    if (!s) throw new NotFoundException(`Sugerencia ${id} no encontrada.`);
    return s;
  }

  /**
   * Descarte persistente: Marca la sugerencia como DESCARTADO para no volver
   * a sugerirla aunque entren futuras facturas con el mismo comercio.
   */
  async descartar(id: string) {
    await this.findOne(id);
    return this.prisma.sugerenciaCliente.update({
      where: { id },
      data: { estado: EstadoSugerencia.DESCARTADO },
    });
  }

  /**
   * Marca como CREADO cualquier sugerencia que coincida con el nuevo cliente registrado.
   */
  async marcarComoCreado(rnc?: string | null, nombre?: string | null): Promise<void> {
    const rncNorm = rnc ? normalizarIdentificacion(rnc) : null;
    const nombreNorm = nombre ? nombre.trim().toUpperCase() : null;

    if (rncNorm) {
      await this.prisma.sugerenciaCliente.updateMany({
        where: { rnc: rncNorm },
        data: { estado: EstadoSugerencia.CREADO },
      });
    }
    if (nombreNorm) {
      await this.prisma.sugerenciaCliente.updateMany({
        where: { nombre: nombreNorm },
        data: { estado: EstadoSugerencia.CREADO },
      });
    }
  }
}
