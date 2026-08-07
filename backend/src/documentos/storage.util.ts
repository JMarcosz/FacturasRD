import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function guardarArchivo(
  baseDir: string,
  periodoId: string,
  sha: string,
  filenameOriginal: string,
  buffer: Buffer,
): Promise<string> {
  const ext = path.extname(filenameOriginal) || '';
  const dir = path.join(baseDir, periodoId);
  await fs.mkdir(dir, { recursive: true });
  const rutaAbsoluta = path.join(dir, `${sha}${ext}`);
  await fs.writeFile(rutaAbsoluta, buffer);
  return rutaAbsoluta;
}

export async function eliminarArchivo(rutaAbsoluta: string): Promise<void> {
  await fs.rm(rutaAbsoluta, { force: true });
}

export async function leerArchivo(rutaAbsoluta: string): Promise<Buffer> {
  return fs.readFile(rutaAbsoluta);
}

// Formatos que acepta el modelo prebuilt-invoice de Document Intelligence.
export const MIME_TYPES_PERMITIDOS = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/bmp',
  'image/tiff',
]);

export const TAMANO_MAXIMO_BYTES = 25 * 1024 * 1024;
