import { ClasificadorService } from './clasificador.service';
import type { FacturaExtraida } from '../dgii';

function hechosBase(overrides: Partial<FacturaExtraida> = {}): FacturaExtraida {
  return {
    rncEmisor: null,
    nombreEmisor: null,
    rncReceptor: null,
    nombreReceptor: null,
    ncf: null,
    ncfModificado: null,
    fechaEmision: null,
    fechaVencimientoNcf: null,
    montoGravado: null,
    montoExento: null,
    itbis: null,
    isc: null,
    propinaLegal: null,
    otrosImpuestos: null,
    montoTotal: null,
    moneda: null,
    tasaCambio: null,
    formaPagoImpresa: null,
    condicionPago: null,
    lineas: [],
    ...overrides,
  };
}

interface ClienteFalso {
  id: string;
  activo?: boolean;
  confirmado?: boolean;
}

/**
 * Aplica el `where` de verdad en vez de buscar solo por RNC. Un doble que
 * ignora los filtros no puede detectar la regresión que más importa aquí: que
 * el clasificador vuelva a considerar clientes desactivados.
 *
 * `aliasPorRnc` imita `cliente_rnc_alias`: otros RNC bajo los que se reconoce
 * al mismo contribuyente tras fusionar duplicados.
 */
function prismaFalso(clientesPorRnc: Record<string, ClienteFalso>, aliasPorRnc: Record<string, string> = {}) {
  const activoDe = (c: ClienteFalso) => c.activo ?? true;

  const buscarCliente = async ({ where }: { where: { rnc: string; activo?: boolean } }) => {
    const cliente = clientesPorRnc[where.rnc];
    if (!cliente) return null;
    if (where.activo !== undefined && where.activo !== activoDe(cliente)) return null;
    return { ...cliente, activo: activoDe(cliente) };
  };

  const buscarAlias = async ({ where }: { where: { rnc: string; cliente?: { activo?: boolean } } }) => {
    const clienteId = aliasPorRnc[where.rnc];
    if (!clienteId) return null;
    const cliente = Object.values(clientesPorRnc).find((c) => c.id === clienteId);
    if (!cliente) return null;
    if (where.cliente?.activo !== undefined && where.cliente.activo !== activoDe(cliente)) return null;
    return { clienteId };
  };

  return {
    cliente: { findUnique: buscarCliente, findFirst: buscarCliente },
    clienteRncAlias: { findFirst: buscarAlias },
  } as any;
}

describe('ClasificadorService', () => {
  it('clasifica como 607 (venta) cuando el RNC del emisor coincide con un Cliente', async () => {
    const servicio = new ClasificadorService(prismaFalso({ '130123454': { id: 'cliente-1' } }));
    const resultado = await servicio.clasificar(hechosBase({ rncEmisor: '130123454' }));
    expect(resultado).toEqual({ clienteId: 'cliente-1', formato: 'F607' });
  });

  it('clasifica como 606 (compra) cuando el RNC del receptor coincide con un Cliente', async () => {
    const servicio = new ClasificadorService(prismaFalso({ '101929933': { id: 'cliente-2' } }));
    const resultado = await servicio.clasificar(hechosBase({ rncReceptor: '101929933' }));
    expect(resultado).toEqual({ clienteId: 'cliente-2', formato: 'F606' });
  });

  it('devuelve null cuando ningún RNC coincide con un Cliente configurado', async () => {
    const servicio = new ClasificadorService(prismaFalso({}));
    const resultado = await servicio.clasificar(hechosBase({ rncEmisor: '130123454', rncReceptor: '101929933' }));
    expect(resultado).toBeNull();
  });

  it('prioriza el emisor si tanto emisor como receptor coinciden con Clientes distintos', async () => {
    const servicio = new ClasificadorService(
      prismaFalso({ '130123454': { id: 'cliente-emisor' }, '101929933': { id: 'cliente-receptor' } }),
    );
    const resultado = await servicio.clasificar(hechosBase({ rncEmisor: '130123454', rncReceptor: '101929933' }));
    expect(resultado).toEqual({ clienteId: 'cliente-emisor', formato: 'F607' });
  });

  it('normaliza el RNC (quita guiones) antes de buscar', async () => {
    const servicio = new ClasificadorService(prismaFalso({ '130123454': { id: 'cliente-1' } }));
    const resultado = await servicio.clasificar(hechosBase({ rncEmisor: '1-30-12345-4' }));
    expect(resultado).toEqual({ clienteId: 'cliente-1', formato: 'F607' });
  });

  // Un contribuyente recién detectado desde el comercio de la factura clasifica
  // ya mismo: lo que impide declararlo sin revisar es `clasificacionConfirmada`
  // en la factura, no un candado en el cliente.
  it('clasifica con un cliente auto-detectado aunque no esté confirmado', async () => {
    const servicio = new ClasificadorService(prismaFalso({ '130123454': { id: 'cliente-1', confirmado: false } }));
    expect(await servicio.clasificar(hechosBase({ rncEmisor: '130123454' }))).toEqual({
      clienteId: 'cliente-1',
      formato: 'F607',
    });
  });

  // Descartar un auto-detectado lo desactiva, y eso sí lo saca del juego.
  it('ignora un cliente desactivado', async () => {
    const servicio = new ClasificadorService(prismaFalso({ '130123454': { id: 'cliente-1', activo: false } }));
    expect(await servicio.clasificar(hechosBase({ rncEmisor: '130123454' }))).toBeNull();
  });

  it('reconoce al contribuyente por un RNC alias dejado por una fusión', async () => {
    const servicio = new ClasificadorService(
      prismaFalso({ '130123454': { id: 'cliente-1' } }, { '130123455': 'cliente-1' }),
    );
    expect(await servicio.clasificar(hechosBase({ rncEmisor: '130123455' }))).toEqual({
      clienteId: 'cliente-1',
      formato: 'F607',
    });
  });

  it('no usa el alias si el contribuyente dueño está desactivado', async () => {
    const servicio = new ClasificadorService(
      prismaFalso({ '130123454': { id: 'cliente-1', activo: false } }, { '130123455': 'cliente-1' }),
    );
    expect(await servicio.clasificar(hechosBase({ rncEmisor: '130123455' }))).toBeNull();
  });

  // El tipo de NCF manda sobre el match por RNC cuando es inequívoco: un 11
  // (Compras) lo autoemite el comprador, así que su emisor no es un vendedor.
  it('no fuerza 607 por el emisor cuando el tipo de NCF solo existe del lado 606', async () => {
    const servicio = new ClasificadorService(prismaFalso({ '130123454': { id: 'cliente-1' } }));
    const resultado = await servicio.clasificar(hechosBase({ rncEmisor: '130123454', ncf: 'B1100000001' }));
    expect(resultado).toBeNull();
  });
});
