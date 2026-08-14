import { SugerenciasService } from './sugerencias.service';
import { EstadoSugerencia, RolFactura } from '@prisma/client';

describe('SugerenciasService', () => {
  let service: SugerenciasService;
  let sugerenciasDb: any[] = [];
  let clientesDb: any[] = [];

  const mockPrisma = {
    cliente: {
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        if (where.rnc) return clientesDb.find((c) => c.rnc === where.rnc && c.activo) || null;
        if (where.nombre) return clientesDb.find((c) => c.nombre === where.nombre && c.activo) || null;
        return null;
      }),
      findMany: jest.fn().mockImplementation(({ where }: any) => {
        return clientesDb.filter((c) => where?.activo === undefined || where.activo === c.activo);
      }),
    },
    sugerenciaCliente: {
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        if (where.rnc) return sugerenciasDb.find((s) => s.rnc === where.rnc) || null;
        if (where.nombre) return sugerenciasDb.find((s) => s.nombre === where.nombre) || null;
        return null;
      }),
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        return sugerenciasDb.find((s) => s.id === where.id) || null;
      }),
      findMany: jest.fn().mockImplementation(({ where }: any) => {
        if (!where) return sugerenciasDb;
        return sugerenciasDb.filter((s) => s.estado === where.estado);
      }),
      create: jest.fn().mockImplementation(({ data }: any) => {
        const item = { id: `sug-${sugerenciasDb.length + 1}`, ...data };
        sugerenciasDb.push(item);
        return item;
      }),
      update: jest.fn().mockImplementation(({ where, data }: any) => {
        const item = sugerenciasDb.find((s) => s.id === where.id);
        if (item) {
          if (data.vecesDetectado?.increment) item.vecesDetectado += data.vecesDetectado.increment;
          if (data.estado) item.estado = data.estado;
          if (data.rnc) item.rnc = data.rnc;
        }
        return item;
      }),
      updateMany: jest.fn().mockImplementation(({ where, data }: any) => {
        let count = 0;
        for (const s of sugerenciasDb) {
          if (where.rnc && s.rnc === where.rnc) {
            s.estado = data.estado;
            count++;
          }
          if (where.nombre && s.nombre === where.nombre) {
            s.estado = data.estado;
            count++;
          }
        }
        return { count };
      }),
    },
  };

  beforeEach(() => {
    sugerenciasDb = [];
    clientesDb = [];
    service = new SugerenciasService(mockPrisma as any);
  });

  it('crea una sugerencia con nombre en MAYÚSCULAS para un nuevo comercio', async () => {
    await service.registrarSugerencia('1-30-61557-8', 'Farmatrix SAS', RolFactura.EMISOR, 'fact-1');
    expect(sugerenciasDb.length).toBe(1);
    expect(sugerenciasDb[0].nombre).toBe('FARMATRIX SAS');
    expect(sugerenciasDb[0].rnc).toBe('130615578');
    expect(sugerenciasDb[0].estado).toBe(EstadoSugerencia.SUGERIDO);
    expect(sugerenciasDb[0].vecesDetectado).toBe(1);
  });

  it('deduplica sugerencias incrementando vecesDetectado sin crear duplicados', async () => {
    await service.registrarSugerencia('130615578', 'FARMATRIX', RolFactura.EMISOR, 'fact-1');
    await service.registrarSugerencia('130615578', 'FARMATRIX', RolFactura.EMISOR, 'fact-2');
    await service.registrarSugerencia('130615578', 'FARMATRIX', RolFactura.EMISOR, 'fact-3');

    expect(sugerenciasDb.length).toBe(1);
    expect(sugerenciasDb[0].vecesDetectado).toBe(3);
  });

  it('Caso 5: Descarte Persistente — NO vuelve a sugerir un comercio si fue descartado', async () => {
    await service.registrarSugerencia('130615578', 'FARMATRIX', RolFactura.EMISOR, 'fact-1');
    const sugId = sugerenciasDb[0].id;

    // Usuario descarta la sugerencia
    await service.descartar(sugId);
    expect(sugerenciasDb[0].estado).toBe(EstadoSugerencia.DESCARTADO);

    // Llegan 5 nuevas facturas con exactamente el mismo comercio
    await service.registrarSugerencia('130615578', 'FARMATRIX', RolFactura.EMISOR, 'fact-2');
    await service.registrarSugerencia('130615578', 'FARMATRIX', RolFactura.EMISOR, 'fact-3');

    // Sigue habiendo 1 solo registro, descartado, y no se añade a la lista de activas
    expect(sugerenciasDb.length).toBe(1);
    expect(sugerenciasDb[0].estado).toBe(EstadoSugerencia.DESCARTADO);

    const activas = await service.findAll(false);
    expect(activas.length).toBe(0);
  });

  it('marca como CREADO cuando se registra un cliente', async () => {
    await service.registrarSugerencia('130615578', 'FARMATRIX', RolFactura.EMISOR, 'fact-1');
    await service.marcarComoCreado('130615578', 'FARMATRIX');

    expect(sugerenciasDb[0].estado).toBe(EstadoSugerencia.CREADO);

    // Si llega otra factura después de creado, no lo vuelve a sugerir
    await service.registrarSugerencia('130615578', 'FARMATRIX', RolFactura.EMISOR, 'fact-2');
    const activas = await service.findAll(false);
    expect(activas.length).toBe(0);
  });
});
