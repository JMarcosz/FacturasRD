import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Auth } from '../auth/auth.decorator';
import { DocumentosService } from './documentos.service';
import { MIME_TYPES_PERMITIDOS, TAMANO_MAXIMO_BYTES } from './storage.util';

@Auth()
@Controller()
export class DocumentosController {
  constructor(private readonly documentosService: DocumentosService) {}

  @Post('documentos')
  @UseInterceptors(
    FilesInterceptor('archivos', 50, {
      limits: { fileSize: TAMANO_MAXIMO_BYTES },
      fileFilter: (_req, file, callback) => {
        if (!MIME_TYPES_PERMITIDOS.has(file.mimetype)) {
          callback(new BadRequestException(`Tipo de archivo no soportado: ${file.mimetype}`), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  subirGlobal(@UploadedFiles() archivos: Express.Multer.File[]) {
    if (!archivos || archivos.length === 0) {
      throw new BadRequestException('No se recibió ningún archivo.');
    }
    return this.documentosService.subirGlobal(archivos);
  }

  @Get('documentos/pendientes')
  pendientesGlobales() {
    return this.documentosService.pendientesGlobales();
  }

  @Get('documentos/:id')
  findOne(@Param('id') id: string) {
    return this.documentosService.findOne(id);
  }

  @Get('documentos/:id/diagnostico')
  obtenerDiagnostico(@Param('id') id: string) {
    return this.documentosService.obtenerDiagnostico(id);
  }

  @Get('documentos/:id/archivo')
  async descargarArchivo(@Param('id') id: string, @Res() res: Response) {
    const { buffer, mimeType, filename } = await this.documentosService.obtenerArchivo(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  }

  @Delete('documentos/:id')
  remove(@Param('id') id: string) {
    return this.documentosService.remove(id);
  }
}
