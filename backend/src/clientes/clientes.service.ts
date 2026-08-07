import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrigenCliente, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { esTipoIngresoValido, normalizarIdentificacion, validarRnc } from '../dgii';
import { ProcesadorService } from '../extraccion/procesador.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { ImportarClienteRowDto } from './dto/importar-clientes.dto';

/** Dos RNC difieren en exactamente un dígito (error típico de OCR). */
function sonCasiIguales(a: string, b: string): boolean {
  const normA = normalizarIdentificacion(a);
  const normB = normalizarIdentificacion(b);
  if (normA.length !== normB.length || normA === normB) return false;
  let diferencias = 0;
  for (let i = 0; i < normA.length; i++) {
    if (normA[i] !== normB[i]) diferencias++;
    if (diferencias > 1) return false;
  }
  return diferencias === 1;
}

@Injectable()
export class ClientesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly procesador: ProcesadorService,
  ) {}

  private validarCamposFiscales(rnc: string, tipoIngresoDefault?: string | null, tolerarRncInvalido = false) {
    if (!tolerarRncInvalido && !validarRnc(rnc)) {
      throw new BadRequestException(`El RNC "${rnc}" no pasa el dígito verificador de la DGII.`);
    }
    if (tipoIngresoDefault && !esTipoIngresoValido(tipoIngresoDefault)) {
      throw new BadRequestException(`"${tipoIngresoDefault}" no es un Tipo de Ingreso válido.`);
    }
  }

  /**
   * El dígito verificador no bloquea el alta: falla a menudo en RNC recién
   * OCR-eados y el alta desde el flujo (dar de alta el comercio detectado en
   * una factura) es justo donde más se usa. Se crea igual, marcado con
   * `rncVerificado: false` para que la pantalla lo señale y el contador lo
   * corrija — rechazarlo dejaba sin salida al caso que esto viene a resolver.
   * El Tipo de Ingreso sí se valida: ese sí es un catálogo cerrado.
   */
  async create(dto: CreateClienteDto) {
    const rnc = normalizarIdentificacion(dto.rnc);
    this.validarCamposFiscales(rnc, dto.tipoIngresoDefault, true);

    try {
      return await this.prisma.cliente.create({
        data: {
          rnc,
          nombre: dto.nombre,
          tipoIngresoDefault: dto.tipoIngresoDefault ?? null,
          tasaItbis: dto.tasaItbis ?? 0.18,
          aplicaProporcionalidad: dto.aplicaProporcionalidad ?? false,
          rncVerificado: validarRnc(rnc),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Ya existe un cliente con el RNC "${rnc}".`);
      }
      throw e;
    }
  }

  async findAll(incluirInactivos = false) {
    return this.prisma.cliente.findMany({
      where: incluirInactivos ? undefined : { activo: true },
      orderBy: [{ confirmado: 'asc' }, { nombre: 'asc' }],
    });
  }

  async findOne(id: string) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id } });
    if (!cliente) throw new NotFoundException(`Cliente ${id} no encontrado.`);
    return cliente;
  }

  async update(id: string, dto: UpdateClienteDto) {
    await this.findOne(id);

    const rnc = dto.rnc ? normalizarIdentificacion(dto.rnc) : undefined;
    // Misma tolerancia que en `create`: corregir a mano un RNC mal leído es
    // precisamente cómo se sale de un `rncVerificado: false`, así que el
    // dígito verificador no puede impedir la edición — solo se re-evalúa.
    if (rnc) this.validarCamposFiscales(rnc, dto.tipoIngresoDefault, true);
    else if (dto.tipoIngresoDefault && !esTipoIngresoValido(dto.tipoIngresoDefault)) {
      throw new BadRequestException(`"${dto.tipoIngresoDefault}" no es un Tipo de Ingreso válido.`);
    }

    try {
      return await this.prisma.cliente.update({
        where: { id },
        data: {
          ...(rnc ? { rnc, rncVerificado: validarRnc(rnc) } : {}),
          ...(dto.nombre !== undefined ? { nombre: dto.nombre } : {}),
          ...(dto.tipoIngresoDefault !== undefined ? { tipoIngresoDefault: dto.tipoIngresoDefault } : {}),
          ...(dto.tasaItbis !== undefined ? { tasaItbis: dto.tasaItbis } : {}),
          ...(dto.aplicaProporcionalidad !== undefined ? { aplicaProporcionalidad: dto.aplicaProporcionalidad } : {}),
          ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Ya existe un cliente con el RNC "${rnc}".`);
      }
      throw e;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.cliente.update({ where: { id }, data: { activo: false } });
  }

  /** Confirma un cliente auto-detectado como contribuyente real. */
  async confirmar(id: string, tipoIngresoDefault?: string) {
    const cliente = await this.findOne(id);
    if (cliente.confirmado) return cliente;

    if (tipoIngresoDefault && !esTipoIngresoValido(tipoIngresoDefault)) {
      throw new BadRequestException(`"${tipoIngresoDefault}" no es un Tipo de Ingreso válido.`);
    }

    return this.prisma.cliente.update({
      where: { id },
      data: {
        confirmado: true,
        ...(tipoIngresoDefault ? { tipoIngresoDefault } : {}),
      },
    });
  }

  /** Descarta un cliente auto-detectado (lo desactiva). */
  async descartar(id: string) {
    const cliente = await this.findOne(id);
    if (cliente.origen !== 'AUTO') {
      throw new BadRequestException('Solo se pueden descartar clientes auto-detectados.');
    }
    return this.prisma.cliente.update({
      where: { id },
      data: { activo: false },
    });
  }

  /**
   * Devuelve grupos de RNC «casi duplicados» — diferencia de un solo dígito,
   * mismo nombre. Útil para detectar errores de OCR.
   */
  async detectarDuplicados(): Promise<Array<{ rncs: string[]; nombre: string; ids: string[] }>> {
    const clientes = await this.prisma.cliente.findMany({
      where: { activo: true },
      select: { id: true, rnc: true, nombre: true },
      orderBy: { nombre: 'asc' },
    });

    const grupos: Array<{ rncs: string[]; nombre: string; ids: string[] }> = [];
    const yaPareados = new Set<string>();

    for (let i = 0; i < clientes.length; i++) {
      if (yaPareados.has(clientes[i].id)) continue;
      const grupo = [clientes[i]];

      for (let j = i + 1; j < clientes.length; j++) {
        if (yaPareados.has(clientes[j].id)) continue;
        if (
          sonCasiIguales(clientes[i].rnc, clientes[j].rnc) ||
          (clientes[i].nombre.toLowerCase() === clientes[j].nombre.toLowerCase() &&
            clientes[i].rnc !== clientes[j].rnc)
        ) {
          grupo.push(clientes[j]);
          yaPareados.add(clientes[j].id);
        }
      }

      if (grupo.length > 1) {
        yaPareados.add(clientes[i].id);
        grupos.push({
          rncs: grupo.map((c) => c.rnc),
          nombre: grupo[0].nombre,
          ids: grupo.map((c) => c.id),
        });
      }
    }

    return grupos;
  }

  /**
   * Fusiona dos o más clientes en uno solo: el primero se queda, los demás
   * transfieren sus facturas y períodos al primero y se desactivan.
   *
   * Además reclasifica las facturas sueltas que traían el RNC de los
   * secundarios. Sin ese paso la fusión dejaba un agujero permanente: al
   * desactivarse el cliente secundario ya nadie tiene ese RNC, así que sus
   * facturas sin clasificar no podían volver a engancharse con ningún
   * contribuyente — justo el 607 partido en dos que la fusión viene a evitar.
   */
  async fusionar(idPrincipal: string, idsSecundarios: string[]) {
    const principal = await this.findOne(idPrincipal);
    if (idsSecundarios.includes(idPrincipal)) {
      throw new BadRequestException('El cliente principal no puede estar también entre los secundarios.');
    }

    const rncsSecundarios: string[] = [];
    for (const id of idsSecundarios) {
      const secundario = await this.findOne(id);
      rncsSecundarios.push(secundario.rnc);
      await this.prisma.$transaction([
        this.prisma.factura.updateMany({ where: { clienteId: id }, data: { clienteId: idPrincipal } }),
        this.prisma.periodo.updateMany({ where: { clienteId: id }, data: { clienteId: idPrincipal } }),
        this.prisma.cliente.update({ where: { id }, data: { activo: false } }),
        // El RNC absorbido queda como alias del sobreviviente: así la próxima
        // factura que el OCR vuelva a leer con ese dígito equivocado se
        // clasifica sola, en vez de quedar huérfana porque su cliente ya no
        // existe. La fusión no solo repara el pasado, enseña para el futuro.
        this.prisma.clienteRncAlias.upsert({
          where: { rnc: secundario.rnc },
          update: { clienteId: idPrincipal },
          create: { rnc: secundario.rnc, clienteId: idPrincipal, motivo: 'fusión de duplicados' },
        }),
      ]);
    }

    let absorbidas = 0;
    for (const rnc of rncsSecundarios) {
      const resultado = await this.reclasificarPorRncs(idPrincipal, [rnc]);
      absorbidas += resultado.reclasificadas;
    }

    return { ...principal, absorbidas };
  }

  /**
   * Reclasifica todas las facturas no clasificadas cuyos RNC (emisor o receptor)
   * coincidan con el RNC de este cliente. Es lo que desbloquea el atasco:
   * confirmar un cliente y ejecutar esto clasifica todas sus facturas de golpe.
   */
  async reclasificarFacturas(clienteId: string) {
    const cliente = await this.findOne(clienteId);
    if (!cliente.activo) {
      throw new BadRequestException('El cliente está desactivado: reactívalo antes de reclasificar.');
    }
    // Ya no se exige `confirmado`: el clasificador tampoco lo exige, y pedirlo
    // aquí impedía reenganchar las facturas de un contribuyente recién
    // detectado, que es cuando más falta hace.
    const alias = await this.prisma.clienteRncAlias.findMany({ where: { clienteId }, select: { rnc: true } });
    return this.reclasificarPorRncs(clienteId, [cliente.rnc, ...alias.map((a) => a.rnc)]);
  }

  /**
   * Engancha al cliente indicado toda factura sin clasificar cuyo emisor o
   * receptor esté en `rncs`. Emisor → 607 (se la vendió él); receptor → 606
   * (se la compró él).
   *
   * Toma varios RNC porque tras una fusión el mismo contribuyente responde por
   * el RNC bueno y por el mal leído.
   */
  private async reclasificarPorRncs(clienteId: string, rncs: string[]) {
    const objetivo = new Set(rncs.map((r) => normalizarIdentificacion(r)).filter(Boolean));

    const todasSinClasificar = await this.prisma.factura.findMany({
      where: { clienteId: null },
      select: { id: true, identificacionEmisor: true, identificacionReceptor: true },
    });

    const facturasAProcesar = todasSinClasificar.filter(
      (f) =>
        objetivo.has(normalizarIdentificacion(f.identificacionEmisor ?? '')) ||
        objetivo.has(normalizarIdentificacion(f.identificacionReceptor ?? '')),
    );

    let reclasificadas = 0;
    const fallidas: Array<{ id: string; motivo: string }> = [];

    for (const factura of facturasAProcesar) {
      try {
        const rncEmisorNorm = normalizarIdentificacion(factura.identificacionEmisor ?? '');
        const rncReceptorNorm = normalizarIdentificacion(factura.identificacionReceptor ?? '');
        let formato: 'F606' | 'F607';
        if (objetivo.has(rncEmisorNorm)) {
          formato = 'F607';
        } else if (objetivo.has(rncReceptorNorm)) {
          formato = 'F606';
        } else {
          continue;
        }

        // `false`: la deduce el RNC, no una persona — queda como sugerencia
        // hasta que alguien la confirme (y hasta entonces bloquea el TXT).
        await this.procesador.clasificarManualmente(factura.id, clienteId, formato, false);
        reclasificadas++;
      } catch (e) {
        fallidas.push({ id: factura.id, motivo: e instanceof Error ? e.message : String(e) });
      }
    }

    return { reclasificadas, total: facturasAProcesar.length, fallidas };
  }

  async importarClientes(filas: ImportarClienteRowDto[]) {
    let procesados = 0;
    const fallidos: Array<{ rnc: string; motivo: string }> = [];

    for (const fila of filas) {
      try {
        const rnc = normalizarIdentificacion(fila.rnc);
        if (!rnc) {
          throw new BadRequestException('El RNC está vacío o es inválido.');
        }

        this.validarCamposFiscales(rnc, fila.tipoIngresoDefault, true);

        const data = {
          nombre: fila.nombre,
          tipoIngresoDefault: fila.tipoIngresoDefault ?? null,
          rncVerificado: validarRnc(rnc),
          ...(fila.tasaItbis !== undefined ? { tasaItbis: fila.tasaItbis } : {}),
          ...(fila.aplicaProporcionalidad !== undefined ? { aplicaProporcionalidad: fila.aplicaProporcionalidad } : {}),
          activo: true,
          confirmado: true,
          origen: OrigenCliente.MANUAL,
        };

        await this.prisma.cliente.upsert({
          where: { rnc },
          update: data,
          create: {
            rnc,
            ...data,
            tasaItbis: fila.tasaItbis ?? 0.18,
            aplicaProporcionalidad: fila.aplicaProporcionalidad ?? false,
          },
        });

        procesados++;
      } catch (e) {
        fallidos.push({
          rnc: fila.rnc,
          motivo: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { procesados, total: filas.length, fallidos };
  }
}
