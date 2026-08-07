import { Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Auth } from '../auth/auth.decorator';
import { ExportacionService } from './exportacion.service';

@Auth()
@Controller('periodos/:periodoId/exportacion')
export class ExportacionController {
  constructor(private readonly exportacionService: ExportacionService) {}

  @Get('estado')
  estado(@Param('periodoId') periodoId: string) {
    return this.exportacionService.verificarExportable(periodoId);
  }

  @Get('historial')
  historial(@Param('periodoId') periodoId: string) {
    return this.exportacionService.findExportacionesByPeriodo(periodoId);
  }

  @Post('txt')
  async txt(@Param('periodoId') periodoId: string, @Res() res: Response) {
    const { buffer, filename } = await this.exportacionService.generarTxt(periodoId);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Post('excel')
  async excel(@Param('periodoId') periodoId: string, @Res() res: Response) {
    const { buffer, filename } = await this.exportacionService.generarExcel(periodoId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
