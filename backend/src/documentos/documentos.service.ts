import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Documento, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { eliminarArchivo, guardarArchivo, leerArchivo, sha256 } from './storage.util';

interface CampoModeloCrudo {
  valueString?: string;
  valueDate?: string;
  valueCurrency?: { amount: number; currencyCode?: string };
  valueNumber?: number;
  content?: string;
  confidence?: number;
}

interface ResultadoAnalisisCrudo {
  content?: string;
  documents?: Array<{ fields?: Record<string, CampoModeloCrudo> }>;
}

const CAMPOS_DIAGNOSTICO = [
  'VendorTaxId',
  'CustomerTaxId',
  'VendorName',
  'CustomerName',
  'InvoiceId',
  'InvoiceDate',
  'SubTotal',
  'TotalTax',
  'InvoiceTotal',
  'PaymentTerm',
] as const;

function valorLegible(campo: CampoModeloCrudo | undefined): string | null {
  if (!campo) return null;
  if (campo.valueString !== undefined) return campo.valueString;
  if (campo.valueDate !== undefined) return campo.valueDate;
  if (campo.valueCurrency) return `${campo.valueCurrency.amount} ${campo.valueCurrency.currencyCode ?? ''}`.trim();
  if (campo.valueNumber !== undefined) return String(campo.valueNumber);
  return campo.content ?? null;
}

@Injectable()
export class DocumentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get uploadDir(): string {
    return this.config.get<string>('UPLOAD_DIR', './uploads');
  }

  /**
   * Sube documentos sin asignarlos a un período: el flujo principal ya no
   * exige elegir cliente/mes/formato antes de escanear — eso lo resuelve
   * la auto-clasificación (o el contador a mano) una vez extraídos los datos.
   */
  async subirGlobal(archivos: Express.Multer.File[]) {
    const resultados: Array<Documento & { duplicado: boolean }> = [];
    for (const archivo of archivos) {
      const hash = sha256(archivo.buffer);
      const existente = await this.prisma.documento.findUnique({ where: { sha256: hash } });
      if (existente) {
        resultados.push({ ...existente, duplicado: true });
        continue;
      }

      const rutaArchivo = await guardarArchivo(this.uploadDir, 'global', hash, archivo.originalname, archivo.buffer);
      const documento = await this.prisma.documento.create({
        data: {
          filename: archivo.originalname,
          sha256: hash,
          mimeType: archivo.mimetype,
          rutaArchivo,
          estado: 'PENDIENTE',
        },
      });
      resultados.push({ ...documento, duplicado: false });
    }
    return resultados;
  }

  /**
   * Documentos subidos por el flujo global que todavía no se ven como
   * Factura en la lista principal — o porque siguen en cola/procesándose,
   * o porque la extracción falló. Sin esto, un documento con error
   * desaparecería en silencio (nunca llega a crear una Factura).
   */
  async pendientesGlobales() {
    return this.prisma.documento.findMany({
      where: { periodoId: null, estado: { in: ['PENDIENTE', 'PROCESANDO', 'ERROR'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, filename: true, estado: true, intentos: true, error: true, createdAt: true },
    });
  }

  async findOne(id: string) {
    const documento = await this.prisma.documento.findUnique({ where: { id } });
    if (!documento) throw new NotFoundException(`Documento ${id} no encontrado.`);
    return documento;
  }

  async obtenerArchivo(id: string): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const documento = await this.findOne(id);
    const buffer = await leerArchivo(documento.rutaArchivo);
    return { buffer, mimeType: documento.mimeType, filename: documento.filename };
  }

  /**
   * Diagnóstico de una extracción ya hecha: lee el `rawJson` que ya se guardó
   * (no vuelve a llamar a Azure) y muestra qué campos devolvió el modelo, con
   * su confianza, más la factura ya derivada — para poder ver, sin tocar la
   * base de datos a mano, exactamente qué llegó y qué se usó.
   */
  async obtenerDiagnostico(id: string) {
    const documento = await this.prisma.documento.findUnique({
      where: { id },
      include: { facturas: { include: { validaciones: true } } },
    });
    if (!documento) throw new NotFoundException(`Documento ${id} no encontrado.`);

    const raw = documento.rawJson as unknown as ResultadoAnalisisCrudo | null;
    const fields = raw?.documents?.[0]?.fields ?? {};

    const camposModelo = CAMPOS_DIAGNOSTICO.map((nombre) => ({
      nombre,
      valor: valorLegible(fields[nombre]),
      confidence: fields[nombre]?.confidence ?? null,
    }));

    return {
      documentoId: documento.id,
      filename: documento.filename,
      estado: documento.estado,
      error: documento.error,
      ocrTexto: raw?.content ?? '',
      camposModelo,
      factura: documento.facturas[0] ?? null,
    };
  }

  async remove(id: string) {
    const documento = await this.findOne(id);
    await eliminarArchivo(documento.rutaArchivo);
    return this.prisma.documento.delete({ where: { id } });
  }

  // --- Usados por el procesador (extraccion/procesador.service.ts) ---

  /**
   * Siguiente lote de la cola. Seleccionar aquí y marcar PROCESANDO en el
   * llamador es seguro porque solo hay un lote en vuelo a la vez (ver `ciclo`)
   * y un único proceso. Si alguna vez se procesan lotes en paralelo o se corre
   * más de una réplica, esto tiene que pasar a ser una reserva atómica
   * (UPDATE ... FOR UPDATE SKIP LOCKED) o el mismo documento se extraerá dos
   * veces.
   */
  async siguientesPendientes(limite: number) {
    return this.prisma.documento.findMany({
      where: { estado: 'PENDIENTE' },
      take: limite,
      orderBy: { createdAt: 'asc' },
      include: { periodo: { include: { cliente: true } } },
    });
  }

  async marcarProcesando(id: string) {
    return this.prisma.documento.update({
      where: { id },
      data: { estado: 'PROCESANDO', intentos: { increment: 1 } },
    });
  }

  async marcarExtraido(id: string, rawJson: Prisma.InputJsonValue, paginas: number) {
    return this.prisma.documento.update({
      where: { id },
      data: { estado: 'EXTRAIDO', rawJson, paginas, error: null },
    });
  }

  async marcarError(id: string, error: string) {
    return this.prisma.documento.update({
      where: { id },
      data: { estado: 'ERROR', error },
    });
  }
}
