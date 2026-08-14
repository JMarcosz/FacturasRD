import { ClasificadorService } from './clasificador.service';
import { ClasificacionOperacion, RolFactura } from '@prisma/client';
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
  nombre: string;
  rnc: string;
  activo?: boolean;
  confirmado?: boolean;
}

function prismaFalso(
  clientes: ClienteFalso[],
  aliasPorRnc: Record<string, string> = {},
) {
  const buscarCliente = async ({ where }: any) => {
    if (where.rnc) {
      const c = clientes.find((cli) => cli.rnc === where.rnc);
      if (!c) return null;
      if (where.activo !== undefined && where.activo !== (c.activo ?? true)) return null;
      return { id: c.id, nombre: c.nombre, rnc: c.rnc };
    }
    if (where.nombre) {
      const busqueda = (where.nombre.equals || where.nombre).toUpperCase();
      const c = clientes.find((cli) => cli.nombre.toUpperCase() === busqueda);
      if (!c) return null;
      if (where.activo !== undefined && where.activo !== (c.activo ?? true)) return null;
      return { id: c.id, nombre: c.nombre, rnc: c.rnc };
    }
    return null;
  };

  const buscarAlias = async ({ where }: any) => {
    const clienteId = aliasPorRnc[where.rnc];
    if (!clienteId) return null;
    const c = clientes.find((cli) => cli.id === clienteId);
    if (!c) return null;
    if (where.cliente?.activo !== undefined && where.cliente.activo !== (c.activo ?? true)) return null;
    return { cliente: { id: c.id, nombre: c.nombre, rnc: c.rnc } };
  };

  const listarClientes = async ({ where }: any) => {
    return clientes
      .filter((cli) => where?.activo === undefined || where.activo === (cli.activo ?? true))
      .map((c) => ({ id: c.id, nombre: c.nombre, rnc: c.rnc }));
  };

  return {
    cliente: { findFirst: buscarCliente, findUnique: buscarCliente, findMany: listarClientes },
    clienteRncAlias: { findFirst: buscarAlias },
  } as any;
}

const mockCostoGastoIa = {
  determinarIngreso: jest.fn().mockResolvedValue({
    tipoIngreso: '01',
    confianza: 0.95,
    justificacion: 'Ingresos por operaciones comerciales ordinarias',
  }),
  determinarCostoOGasto: jest.fn().mockResolvedValue({
    clasificacion: 'GASTO',
    tipoBienesServicios: '02',
    formaPago: '01',
    confianza: 0.92,
    justificacion: 'Gasto operativo de servicios',
  }),
};

const mockSugerencias = {
  registrarSugerencia: jest.fn().mockResolvedValue(undefined),
};

describe('ClasificadorService (Nuevo Modelo Maestro de Clientes e IA)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Caso 1: clasifica como INGRESO (607) cuando el RNC del emisor coincide con un Cliente', async () => {
    const servicio = new ClasificadorService(
      prismaFalso([{ id: 'c-1', rnc: '130123454', nombre: 'MI EMPRESA SRL' }]),
      mockCostoGastoIa as any,
      mockSugerencias as any,
    );
    const resultado = await servicio.clasificar(hechosBase({ rncEmisor: '130123454' }));
    expect(resultado.clasificacionOperacion).toBe(ClasificacionOperacion.INGRESO);
    expect(resultado.clienteId).toBe('c-1');
    expect(resultado.formato).toBe('F607');
  });

  it('Caso 2 y 3: clasifica como COSTO o GASTO (606) vía IA cuando el receptor coincide con un Cliente', async () => {
    mockCostoGastoIa.determinarCostoOGasto.mockResolvedValueOnce({
      clasificacion: 'COSTO',
      confianza: 0.95,
      justificacion: 'Insumos de producción',
    });

    const servicio = new ClasificadorService(
      prismaFalso([{ id: 'c-2', rnc: '101929933', nombre: 'EMPRESA COMPRADORA' }]),
      mockCostoGastoIa as any,
      mockSugerencias as any,
    );

    const resultado = await servicio.clasificar(
      hechosBase({
        rncReceptor: '101929933',
        nombreEmisor: 'PROVEEDOR INDUSTRIAL',
        lineas: [{ descripcion: 'Materia prima A', cantidad: '10', precioUnitario: '100', importe: '1000' }],
      }),
    );

    expect(resultado.clasificacionOperacion).toBe(ClasificacionOperacion.COSTO);
    expect(resultado.clienteId).toBe('c-2');
    expect(resultado.formato).toBe('F606');
    expect(resultado.justificacionIa).toBe('Insumos de producción');
  });

  it('Caso 4: marca como PENDIENTE y genera sugerencias cuando ningún participante es cliente', async () => {
    const servicio = new ClasificadorService(
      prismaFalso([]),
      mockCostoGastoIa as any,
      mockSugerencias as any,
    );

    const resultado = await servicio.clasificar(
      hechosBase({ rncEmisor: '130615578', nombreEmisor: 'FARMATRIX', rncReceptor: '40200000001' }),
      'factura-123',
    );

    expect(resultado.clasificacionOperacion).toBe(ClasificacionOperacion.PENDIENTE);
    expect(resultado.clienteId).toBeNull();
    expect(resultado.formato).toBeNull();
    expect(mockSugerencias.registrarSugerencia).toHaveBeenCalledWith('130615578', 'FARMATRIX', RolFactura.EMISOR, 'factura-123');
    expect(mockSugerencias.registrarSugerencia).toHaveBeenCalledWith('40200000001', '', RolFactura.RECEPTOR, 'factura-123');
  });

  it('Caso 14: asigna CLASIFICACION_AMBIGUA cuando ambos (emisor y receptor) son clientes distintos', async () => {
    const servicio = new ClasificadorService(
      prismaFalso([
        { id: 'c-emisor', rnc: '130123454', nombre: 'CLIENTE VENDEDOR' },
        { id: 'c-receptor', rnc: '101929933', nombre: 'CLIENTE COMPRADOR' },
      ]),
      mockCostoGastoIa as any,
      mockSugerencias as any,
    );

    const resultado = await servicio.clasificar(
      hechosBase({ rncEmisor: '130123454', rncReceptor: '101929933' }),
    );

    expect(resultado.clasificacionOperacion).toBe(ClasificacionOperacion.CLASIFICACION_AMBIGUA);
    expect(resultado.clienteId).toBeNull();
    expect(resultado.formato).toBeNull();
  });

  it('Caso 7: coincide por Nombre case-insensitive cuando no hay RNC', async () => {
    const servicio = new ClasificadorService(
      prismaFalso([{ id: 'c-1', rnc: '130123454', nombre: 'FARMATRIX' }]),
      mockCostoGastoIa as any,
      mockSugerencias as any,
    );

    const resultado = await servicio.clasificar(
      hechosBase({ nombreEmisor: 'farmatrix' }),
    );

    expect(resultado.clasificacionOperacion).toBe(ClasificacionOperacion.INGRESO);
    expect(resultado.clienteId).toBe('c-1');
  });

  it('Caso 8: coincide por RNC aunque el nombre del emisor varíe', async () => {
    const servicio = new ClasificadorService(
      prismaFalso([{ id: 'c-1', rnc: '130615578', nombre: 'FARMATRIX DOMINICANA SAS' }]),
      mockCostoGastoIa as any,
      mockSugerencias as any,
    );

    const resultado = await servicio.clasificar(
      hechosBase({ rncEmisor: '1-30-61557-8', nombreEmisor: 'FARMATRIX SUCURSAL 2' }),
    );

    expect(resultado.clasificacionOperacion).toBe(ClasificacionOperacion.INGRESO);
    expect(resultado.clienteId).toBe('c-1');
  });

  it('ignora un cliente desactivado', async () => {
    const servicio = new ClasificadorService(
      prismaFalso([{ id: 'c-1', rnc: '130123454', nombre: 'CLIENTE VIEJO', activo: false }]),
      mockCostoGastoIa as any,
      mockSugerencias as any,
    );

    const resultado = await servicio.clasificar(hechosBase({ rncEmisor: '130123454' }));
    expect(resultado.clasificacionOperacion).toBe(ClasificacionOperacion.PENDIENTE);
  });
});
