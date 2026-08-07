import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CreatePeriodoDto } from './dto/create-periodo.dto';
import { UpdatePeriodoEstadoDto } from './dto/update-periodo-estado.dto';

@Injectable()
export class PeriodosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePeriodoDto) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id: dto.clienteId } });
    if (!cliente) throw new NotFoundException(`Cliente ${dto.clienteId} no encontrado.`);

    try {
      return await this.prisma.periodo.create({
        data: { clienteId: dto.clienteId, yyyymm: dto.yyyymm, formato: dto.formato },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(
          `Ya existe un período ${dto.yyyymm} (${dto.formato}) para este cliente.`,
        );
      }
      throw e;
    }
  }

  async findAll(clienteId?: string, formato?: 'F606' | 'F607', yyyymm?: string) {
    return this.prisma.periodo.findMany({
      where: {
        ...(clienteId ? { clienteId } : {}),
        ...(formato ? { formato } : {}),
        ...(yyyymm ? { yyyymm } : {}),
      },
      include: {
        cliente: { select: { id: true, nombre: true, rnc: true } },
        _count: { select: { documentos: true, facturas: true } },
      },
      orderBy: [{ yyyymm: 'desc' }],
    });
  }

  async findOne(id: string) {
    const periodo = await this.prisma.periodo.findUnique({
      where: { id },
      include: {
        cliente: true,
        _count: { select: { documentos: true, facturas: true } },
      },
    });
    if (!periodo) throw new NotFoundException(`Período ${id} no encontrado.`);
    return periodo;
  }

  async actualizarEstado(id: string, dto: UpdatePeriodoEstadoDto) {
    await this.findOne(id);
    return this.prisma.periodo.update({ where: { id }, data: { estado: dto.estado } });
  }

  async remove(id: string) {
    const periodo = await this.findOne(id);
    if (periodo._count.documentos > 0) {
      throw new ConflictException(
        'No se puede eliminar un período con documentos cargados. Elimine los documentos primero.',
      );
    }
    return this.prisma.periodo.delete({ where: { id } });
  }
}
