import { BadRequestException, ConflictException, forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ClasificacionOperacion, OrigenCliente, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { esTipoIngresoValido, normalizarIdentificacion, sonNombresComercialesEquivalentes, validarRnc } from '../dgii';
import { ProcesadorService } from '../extraccion/procesador.service';
import { ClasificadorCostoGastoService } from '../extraccion/clasificador-costo-gasto.service';
import { SugerenciasService } from '../sugerencias/sugerencias.service';
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
  private readonly logger = new Logger(ClientesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ProcesadorService))
    private readonly procesador: ProcesadorService,
    private readonly costoGastoIa: ClasificadorCostoGastoService,
    private readonly sugerenciasService: SugerenciasService,
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
   * Crea un nuevo cliente en el Maestro de Clientes.
   * - El nombre se almacena SIEMPRE normalizado en MAYÚSCULAS.
   * - El RNC se almacena normalizado en dígitos.
   * - Marca sugerencias coincidentes como CREADO.
   * - Dispara la reclasificación automática de facturas pendientes compatibles sin reprocesar imágenes.
   */
  async create(dto: CreateClienteDto) {
    const rnc = normalizarIdentificacion(dto.rnc);
    const nombre = dto.nombre.trim().toUpperCase();
    this.validarCamposFiscales(rnc, dto.tipoIngresoDefault, true);

    try {
      const existente = await this.prisma.cliente.findUnique({
        where: { rnc },
      });

      let cliente;
      if (existente) {
        if (existente.activo) {
          throw new ConflictException(`Ya existe un cliente con el RNC "${rnc}" (${existente.nombre}).`);
        }
        // Si existía pero estaba inactivo/descartado, reactivarlo y actualizarlo con los nuevos datos
        cliente = await this.prisma.cliente.update({
          where: { id: existente.id },
          data: {
            nombre,
            tipoIngresoDefault: dto.tipoIngresoDefault ?? null,
            tasaItbis: dto.tasaItbis ?? 0.18,
            aplicaProporcionalidad: dto.aplicaProporcionalidad ?? false,
            rncVerificado: validarRnc(rnc),
            activo: true,
            confirmado: true,
            origen: OrigenCliente.MANUAL,
          },
        });
      } else {
        cliente = await this.prisma.cliente.create({
          data: {
            rnc,
            nombre,
            tipoIngresoDefault: dto.tipoIngresoDefault ?? null,
            tasaItbis: dto.tasaItbis ?? 0.18,
            aplicaProporcionalidad: dto.aplicaProporcionalidad ?? false,
            rncVerificado: validarRnc(rnc),
            activo: true,
            confirmado: true,
            origen: OrigenCliente.MANUAL,
          },
        });
      }

      // Actualizar sugerencias persistentes a estado CREADO
      await this.sugerenciasService.marcarComoCreado(rnc, nombre);

      // Reclasificación automática retroactiva de facturas sin cliente / pendientes
      this.reclasificarFacturas(cliente.id).catch((err) => {
        this.logger.error(`Error en reclasificación automática para cliente ${cliente.id}: ${err.message}`);
      });

      return cliente;
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
    const nombre = dto.nombre !== undefined ? dto.nombre.trim().toUpperCase() : undefined;

    if (rnc) this.validarCamposFiscales(rnc, dto.tipoIngresoDefault, true);
    else if (dto.tipoIngresoDefault && !esTipoIngresoValido(dto.tipoIngresoDefault)) {
      throw new BadRequestException(`"${dto.tipoIngresoDefault}" no es un Tipo de Ingreso válido.`);
    }

    try {
      const actualizado = await this.prisma.cliente.update({
        where: { id },
        data: {
          ...(rnc ? { rnc, rncVerificado: validarRnc(rnc) } : {}),
          ...(nombre !== undefined ? { nombre } : {}),
          ...(dto.tipoIngresoDefault !== undefined ? { tipoIngresoDefault: dto.tipoIngresoDefault } : {}),
          ...(dto.tasaItbis !== undefined ? { tasaItbis: dto.tasaItbis } : {}),
          ...(dto.aplicaProporcionalidad !== undefined ? { aplicaProporcionalidad: dto.aplicaProporcionalidad } : {}),
          ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
        },
      });

      if (rnc || nombre) {
        await this.sugerenciasService.marcarComoCreado(actualizado.rnc, actualizado.nombre);
        this.reclasificarFacturas(actualizado.id).catch((err) => {
          this.logger.error(`Error en reclasificación tras update para cliente ${id}: ${err.message}`);
        });
      }

      return actualizado;
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

    const confirmado = await this.prisma.cliente.update({
      where: { id },
      data: {
        confirmado: true,
        nombre: cliente.nombre.trim().toUpperCase(),
        ...(tipoIngresoDefault !== undefined ? { tipoIngresoDefault } : {}),
      },
    });

    await this.sugerenciasService.marcarComoCreado(confirmado.rnc, confirmado.nombre);
    await this.reclasificarFacturas(id);

    return confirmado;
  }

  /** Desactiva un cliente */
  async descartar(id: string) {
    await this.findOne(id);
    return this.prisma.cliente.update({ where: { id }, data: { activo: false } });
  }

  /**
   * Busca clientes que podrían ser el mismo pero quedaron separados.
   */
  async detectarDuplicados() {
    const clientes = await this.prisma.cliente.findMany({
      where: { activo: true },
      orderBy: { createdAt: 'asc' },
    });

    const grupos: Array<{
      principal: (typeof clientes)[0];
      duplicados: (typeof clientes)[0];
      motivo: string;
    }> = [];

    const yaAgrupados = new Set<string>();

    for (let i = 0; i < clientes.length; i++) {
      const a = clientes[i];
      if (yaAgrupados.has(a.id)) continue;

      for (let j = i + 1; j < clientes.length; j++) {
        const b = clientes[j];
        if (yaAgrupados.has(b.id)) continue;

        let motivo = '';
        if (sonCasiIguales(a.rnc, b.rnc)) {
          motivo = `RNC casi idéntico: ${a.rnc} vs ${b.rnc}`;
        } else if (
          a.nombre.length >= 4 &&
          b.nombre.length >= 4 &&
          a.nombre.trim().toUpperCase() === b.nombre.trim().toUpperCase()
        ) {
          motivo = `Mismo nombre: "${a.nombre}" con distinto RNC (${a.rnc} vs ${b.rnc})`;
        }

        if (motivo) {
          const principal = a.confirmado && !b.confirmado ? a : !a.confirmado && b.confirmado ? b : a;
          const duplicado = principal.id === a.id ? b : a;
          grupos.push({ principal, duplicados: duplicado, motivo });
          yaAgrupados.add(duplicado.id);
        }
      }
    }

    return grupos;
  }

  /**
   * Fusiona `duplicados` dentro de `principalId`.
   */
  async fusionar(principalId: string, duplicados: string | string[]) {
    const ids = Array.isArray(duplicados) ? duplicados : [duplicados];
    for (const dupId of ids) {
      if (principalId === dupId) {
        throw new BadRequestException('No puedes fusionar un cliente consigo mismo.');
      }
      const [principal, duplicado] = await Promise.all([
        this.findOne(principalId),
        this.findOne(dupId),
      ]);

      await this.prisma.$transaction(async (tx) => {
        await tx.clienteRncAlias.upsert({
          where: { rnc: duplicado.rnc },
          update: { clienteId: principal.id },
          create: { rnc: duplicado.rnc, clienteId: principal.id },
        });

        await tx.factura.updateMany({
          where: { clienteId: duplicado.id },
          data: { clienteId: principal.id },
        });

        await tx.periodo.updateMany({
          where: { clienteId: duplicado.id },
          data: { clienteId: principal.id },
        });

        await tx.cliente.update({
          where: { id: duplicado.id },
          data: { activo: false },
        });
      });
    }

    return this.reclasificarFacturas(principalId);
  }

  /**
   * Reclasificación Automática Retroactiva de Facturas:
   * Busca todas las facturas sin clasificar (o en estado PENDIENTE) cuyo emisor o receptor
   * coincida con el RNC o el Nombre en MAYÚSCULAS de este cliente.
   * - Emisor coincide -> INGRESO (F607, tipoIngreso='01')
   * - Receptor coincide -> COSTO o GASTO (F606, evaluado con IA sobre las líneas)
   * Reutiliza los datos ya extraídos sin volver a llamar al OCR de imágenes.
   */
  async reclasificarFacturas(clienteId: string) {
    const cliente = await this.findOne(clienteId);
    if (!cliente.activo) {
      throw new BadRequestException('El cliente está desactivado: reactívalo antes de reclasificar.');
    }

    const alias = await this.prisma.clienteRncAlias.findMany({
      where: { clienteId },
      select: { rnc: true },
    });

    const rncsObjetivo = new Set([cliente.rnc, ...alias.map((a) => a.rnc)].map((r) => normalizarIdentificacion(r)).filter(Boolean));
    const nombreObjetivo = cliente.nombre.trim().toUpperCase();

    // Buscar facturas sin cliente asignado o con clasificación PENDIENTE
    const facturasPendientes = await this.prisma.factura.findMany({
      where: {
        OR: [
          { clienteId: null },
          { clasificacionOperacion: ClasificacionOperacion.PENDIENTE },
        ],
      },
      include: {
        lineas: true,
      },
    });

    let reclasificadas = 0;
    const fallidas: Array<{ id: string; motivo: string }> = [];

    for (const factura of facturasPendientes) {
      try {
        const rncEmisor = normalizarIdentificacion(factura.identificacionEmisor ?? '');
        const nombreEmisor = (factura.nombreEmisor ?? '').trim().toUpperCase();

        const rncReceptor = normalizarIdentificacion(factura.identificacionReceptor ?? '');
        const nombreReceptor = (factura.nombreReceptor ?? '').trim().toUpperCase();

        const esEmisor = (rncEmisor && rncsObjetivo.has(rncEmisor)) || sonNombresComercialesEquivalentes(nombreEmisor, nombreObjetivo);
        const esReceptor = (rncReceptor && rncsObjetivo.has(rncReceptor)) || sonNombresComercialesEquivalentes(nombreReceptor, nombreObjetivo);

        if (esEmisor && esReceptor) {
          await this.prisma.factura.update({
            where: { id: factura.id },
            data: {
              clasificacionOperacion: ClasificacionOperacion.CLASIFICACION_AMBIGUA,
              justificacionIa: `Ambas partes coinciden con el cliente ${cliente.nombre}`,
            },
          });
          continue;
        }

        if (esEmisor) {
          const resIngreso = await this.costoGastoIa.determinarIngreso(
            factura.nombreReceptor,
            factura.lineas.map((l) => ({
              descripcion: l.descripcion,
              cantidad: l.cantidad.toString(),
              precioUnitario: l.precioUnitario.toString(),
              importe: l.importe.toString(),
            })),
            factura.montoFacturado.toString(),
          );

          // Asignar nombre oficial del maestro de clientes y tipo de ingreso al emisor
          await this.prisma.factura.update({
            where: { id: factura.id },
            data: {
              nombreEmisor: cliente.nombre,
              identificacionEmisor: cliente.rnc,
              tipoIngreso: resIngreso.tipoIngreso,
              justificacionIa: `Venta / Ingreso [Tipo ${resIngreso.tipoIngreso}]: ${resIngreso.justificacion}`,
              confianzaIa: new Prisma.Decimal(resIngreso.confianza.toString()),
            },
          });

          // Clasificación como INGRESO
          await this.procesador.clasificarManualmente(
            factura.id,
            clienteId,
            'F607',
            false,
            ClasificacionOperacion.INGRESO,
          );
          reclasificadas++;
        } else if (esReceptor) {
          // Clasificación como COSTO o GASTO evaluando con IA
          const { clasificacion, tipoBienesServicios, formaPago, confianza, justificacion } = await this.costoGastoIa.determinarCostoOGasto(
            factura.nombreEmisor,
            factura.lineas.map((l) => ({
              descripcion: l.descripcion,
              cantidad: l.cantidad.toString(),
              precioUnitario: l.precioUnitario.toString(),
              importe: l.importe.toString(),
            })),
            factura.montoFacturado.toString(),
          );

          const operacion = clasificacion === 'COSTO' ? ClasificacionOperacion.COSTO : ClasificacionOperacion.GASTO;

          // Asignar nombre oficial, tipo de bienes/servicios y forma de pago
          await this.prisma.factura.update({
            where: { id: factura.id },
            data: {
              nombreReceptor: cliente.nombre,
              identificacionReceptor: cliente.rnc,
              tipoBienesServicios,
              formaPago,
              justificacionIa: justificacion,
              confianzaIa: new Prisma.Decimal(confianza.toString()),
            },
          });

          await this.procesador.clasificarManualmente(
            factura.id,
            clienteId,
            'F606',
            false,
            operacion,
          );
          reclasificadas++;
        }
      } catch (e) {
        fallidas.push({ id: factura.id, motivo: e instanceof Error ? e.message : String(e) });
      }
    }

    return { reclasificadas, total: facturasPendientes.length, fallidas };
  }

  async importarClientes(filas: ImportarClienteRowDto[]) {
    let procesados = 0;
    const fallidos: Array<{ rnc: string; motivo: string }> = [];

    for (const fila of filas) {
      try {
        const rnc = normalizarIdentificacion(fila.rnc);
        const nombre = fila.nombre.trim().toUpperCase();

        if (!rnc) {
          throw new BadRequestException('El RNC está vacío o es inválido.');
        }

        this.validarCamposFiscales(rnc, fila.tipoIngresoDefault, true);

        const data = {
          nombre,
          tipoIngresoDefault: fila.tipoIngresoDefault ?? null,
          rncVerificado: validarRnc(rnc),
          ...(fila.tasaItbis !== undefined ? { tasaItbis: fila.tasaItbis } : {}),
          ...(fila.aplicaProporcionalidad !== undefined ? { aplicaProporcionalidad: fila.aplicaProporcionalidad } : {}),
          activo: true,
          confirmado: true,
          origen: OrigenCliente.MANUAL,
        };

        const cliente = await this.prisma.cliente.upsert({
          where: { rnc },
          update: data,
          create: {
            rnc,
            ...data,
            tasaItbis: fila.tasaItbis ?? 0.18,
            aplicaProporcionalidad: fila.aplicaProporcionalidad ?? false,
          },
        });

        await this.sugerenciasService.marcarComoCreado(rnc, nombre);
        this.reclasificarFacturas(cliente.id).catch(() => {});

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
