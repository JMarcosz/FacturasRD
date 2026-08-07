import { Prisma } from '@prisma/client';
import { ListarFacturasQueryDto } from './dto/listar-facturas-query.dto';

/**
 * Filtro compartido por `GET /facturas` y `GET /estadisticas/facturas`. Vive
 * aparte a propósito: si los KPIs de la pantalla se calcularan con un `where`
 * distinto al de la tabla, contradirían las filas visibles en cuanto hay
 * filtros activos.
 */
export function construirWhereFacturas(query: ListarFacturasQueryDto): Prisma.FacturaWhereInput {
  const where: Prisma.FacturaWhereInput = {};
  if (query.estado === 'sin_clasificar') where.clienteId = null;
  else if (query.estado === 'clasificada') where.clienteId = { not: null };
  if (query.clienteId) where.clienteId = query.clienteId;
  if (query.formato) where.formato = query.formato;
  if (query.desde || query.hasta) {
    // Sin el `OR ... IS NULL`, una factura sin fecha (la IA no pudo leerla)
    // desaparece bajo CUALQUIER filtro de rango: en SQL `NULL >= x` nunca es
    // verdadero. Son justo las que más necesitan intervención humana — se
    // dejan siempre visibles en vez de esconderlas.
    where.OR = [
      {
        fechaComprobante: {
          ...(query.desde ? { gte: new Date(query.desde) } : {}),
          ...(query.hasta ? { lte: new Date(query.hasta) } : {}),
        },
      },
      { fechaComprobante: null },
    ];
  }
  return where;
}
