import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { normalizarIdentificacion, formatoPorTipoNcf } from '../dgii';
import type { FacturaExtraida, Formato } from '../dgii';

export interface ResultadoClasificacion {
  clienteId: string;
  formato: Formato;
  clasificacionConfirmada?: boolean;
}

@Injectable()
export class ClasificadorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Decide a qué Cliente y en qué formato pertenece una factura, comparando
   * el RNC del emisor y del receptor contra los `Cliente` ya configurados:
   * - RNC del emisor coincide con un Cliente → es una venta de ese cliente (607).
   * - RNC del receptor coincide con un Cliente → es una compra de ese cliente (606).
   * - Ninguno coincide → sin clasificar (null), queda pendiente de asignación manual.
   *
   * Si ambos coinciden (con clientes distintos, dos contribuyentes propios
   * transando entre sí), gana el emisor — es el caso menos ambiguo de los dos.
   */
  async clasificar(hechos: FacturaExtraida): Promise<ResultadoClasificacion | null> {
    const rncEmisor = normalizarIdentificacion(hechos.rncEmisor ?? '');
    const rncReceptor = normalizarIdentificacion(hechos.rncReceptor ?? '');

    const formatoDGII = formatoPorTipoNcf(hechos.ncf ?? '', hechos.ncfModificado ?? undefined);

    if (rncEmisor) {
      const clienteEmisor = await this.buscarContribuyente(rncEmisor);
      if (clienteEmisor && (formatoDGII === 'F607' || formatoDGII === null)) {
        return { clienteId: clienteEmisor.id, formato: 'F607' };
      }
    }

    if (rncReceptor) {
      const clienteReceptor = await this.buscarContribuyente(rncReceptor);
      if (clienteReceptor && (formatoDGII === 'F606' || formatoDGII === null)) {
        return { clienteId: clienteReceptor.id, formato: 'F606' };
      }
    }

    return null;
  }

  /**
   * Busca el contribuyente por su RNC y, si no aparece, por sus alias — los
   * otros RNC bajo los que se le reconoce, típicamente un dígito mal leído que
   * ya se resolvió fusionando duplicados.
   *
   * Cuenta cualquier cliente activo, confirmado o no. Un contribuyente recién
   * detectado desde el comercio de la factura clasifica sus facturas de
   * inmediato: exigirle además `confirmado` dejaba todo el lote sin clasificar
   * hasta ir cliente por cliente, que es justo el trabajo manual que esto
   * ahorra. Lo que protege la declaración no es este filtro sino
   * `clasificacionConfirmada` en la factura, que sigue en false y bloquea el
   * TXT hasta que una persona la revise.
   *
   * Descartar un auto-detectado lo desactiva, y `activo: true` lo deja fuera.
   */
  private async buscarContribuyente(rnc: string): Promise<{ id: string } | null> {
    const directo = await this.prisma.cliente.findFirst({
      where: { rnc, activo: true },
      select: { id: true },
    });
    if (directo) return directo;

    const alias = await this.prisma.clienteRncAlias.findFirst({
      where: { rnc, cliente: { activo: true } },
      select: { clienteId: true },
    });
    return alias ? { id: alias.clienteId } : null;
  }
}
