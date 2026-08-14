import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  Sse,
  MessageEvent,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { map, Observable } from 'rxjs';
import { Auth } from '../auth/auth.decorator';
import { DocumentosService } from './documentos.service';
import { DocumentosEventosService } from './documentos-eventos.service';
import { MIME_TYPES_PERMITIDOS, TAMANO_MAXIMO_BYTES } from './storage.util';

@Controller()
export class DocumentosController {
  constructor(
    private readonly documentosService: DocumentosService,
    private readonly eventosService: DocumentosEventosService,
  ) {}

  @Sse('documentos/stream')
  stream(): Observable<MessageEvent> {
    return this.eventosService.obtenerObservable().pipe(
      map((data) => ({ data: JSON.stringify(data) } as MessageEvent)),
    );
  }

  @Auth()
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

  @Auth()
  @Get('documentos/pendientes')
  pendientesGlobales() {
    return this.documentosService.pendientesGlobales();
  }

  @Auth()
  @Get('documentos/:id')
  findOne(@Param('id') id: string) {
    return this.documentosService.findOne(id);
  }

  @Auth()
  @Get('documentos/:id/diagnostico')
  obtenerDiagnostico(@Param('id') id: string) {
    return this.documentosService.obtenerDiagnostico(id);
  }

  @Auth()
  @Get('documentos/:id/archivo')
  async descargarArchivo(@Param('id') id: string, @Res() res: Response) {
    const { buffer, mimeType, filename } = await this.documentosService.obtenerArchivo(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  }

  @Auth()
  @Delete('documentos/:id')
  remove(@Param('id') id: string) {
    return this.documentosService.remove(id);
  }
}
