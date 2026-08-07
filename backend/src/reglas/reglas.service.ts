import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { normalizarIdentificacion } from '../dgii';
import { CreateReglaDto } from './dto/create-regla.dto';
import { UpdateReglaDto } from './dto/update-regla.dto';

@Injectable()
export class ReglasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateReglaDto) {
    const rncNorm = normalizarIdentificacion(dto.rnc);
    try {
      return await this.prisma.reglaComercio.create({
        data: {
          rnc: rncNorm,
          nombre: dto.nombre,
          clienteId: dto.clienteId,
          formato: dto.formato,
          tipoIngreso: dto.tipoIngreso,
          formaVenta: dto.formaVenta,
          tipoBienesServicios: dto.tipoBienesServicios,
          formaPago: dto.formaPago,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Ya existe una regla para el RNC "${rncNorm}".`);
      }
      throw e;
    }
  }

  async findAll() {
    return this.prisma.reglaComercio.findMany({
      orderBy: { nombre: 'asc' },
      include: {
        cliente: { select: { nombre: true, rnc: true } },
      }
    });
  }

  async findOne(id: string) {
    const regla = await this.prisma.reglaComercio.findUnique({
      where: { id },
      include: { cliente: true }
    });
    if (!regla) throw new NotFoundException(`Regla ${id} no encontrada.`);
    return regla;
  }

  async update(id: string, dto: UpdateReglaDto) {
    await this.findOne(id);
    const rncNorm = dto.rnc ? normalizarIdentificacion(dto.rnc) : undefined;
    try {
      return await this.prisma.reglaComercio.update({
        where: { id },
        data: {
          ...(rncNorm ? { rnc: rncNorm } : {}),
          ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
          ...(dto.clienteId !== undefined ? { clienteId: dto.clienteId } : {}),
          ...(dto.formato !== undefined ? { formato: dto.formato } : {}),
          ...(dto.tipoIngreso !== undefined ? { tipoIngreso: dto.tipoIngreso } : {}),
          ...(dto.formaVenta !== undefined ? { formaVenta: dto.formaVenta } : {}),
          ...(dto.tipoBienesServicios !== undefined ? { tipoBienesServicios: dto.tipoBienesServicios } : {}),
          ...(dto.formaPago !== undefined ? { formaPago: dto.formaPago } : {}),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Ya existe una regla para el RNC "${rncNorm}".`);
      }
      throw e;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.reglaComercio.delete({ where: { id } });
  }

  async buscarRegla(rncEmisor: string, rncReceptor: string) {
    const normEmisor = normalizarIdentificacion(rncEmisor);
    const normReceptor = normalizarIdentificacion(rncReceptor);

    // Intentar buscar regla por el emisor o receptor (el que tenga regla en la BD)
    if (normEmisor) {
      const reglaEmisor = await this.prisma.reglaComercio.findUnique({
        where: { rnc: normEmisor },
      });
      if (reglaEmisor && reglaEmisor.clienteId && reglaEmisor.formato) {
        return reglaEmisor;
      }
    }

    if (normReceptor) {
      const reglaReceptor = await this.prisma.reglaComercio.findUnique({
        where: { rnc: normReceptor },
      });
      if (reglaReceptor && reglaReceptor.clienteId && reglaReceptor.formato) {
        return reglaReceptor;
      }
    }

    return null;
  }
}
