import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Auth } from '../auth/auth.decorator';
import { ExportacionService } from './exportacion.service';
import { ExcelPorRangoQueryDto } from './dto/excel-por-rango-query.dto';
import { HistorialQueryDto } from './dto/historial-query.dto';

@Auth()
@Controller('exportacion')
export class ReporteriaController {
  constructor(private readonly exportacionService: ExportacionService) {}

  @Get('excel-rango')
  async excelPorRango(@Query() query: ExcelPorRangoQueryDto, @Res() res: Response) {
    const { buffer, filename } = await this.exportacionService.generarExcelPorRango(
      query.clienteId,
      query.formato,
      query.desde,
      query.hasta,
    );
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  /** Historial global (todos los períodos y clientes) — lo consume Reportería. */
  @Get('historial')
  historial(@Query() query: HistorialQueryDto) {
    return this.exportacionService.findExportacionesGlobales(query.limite, query.desplazamiento);
  }

  /**
   * Re-descarga del archivo tal como se generó. No regenera: si el período
   * adquirió errores después, regenerar respondería 409 y el contador se
   * quedaría sin el archivo que ya declaró.
   */
  @Get('historial/:id/archivo')
  async archivoHistorial(@Param('id') id: string, @Res() res: Response) {
    const { buffer, filename, mimeType } = await this.exportacionService.obtenerArchivoExportacion(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  }
}
