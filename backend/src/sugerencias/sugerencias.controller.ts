import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { Auth } from '../auth/auth.decorator';
import { SugerenciasService } from './sugerencias.service';

@Auth()
@Controller('sugerencias')
export class SugerenciasController {
  constructor(private readonly sugerenciasService: SugerenciasService) {}

  @Get()
  findAll(@Query('incluirDescartados') incluirDescartados?: string) {
    return this.sugerenciasService.findAll(incluirDescartados === 'true');
  }

  @Patch(':id/descartar')
  descartar(@Param('id') id: string) {
    return this.sugerenciasService.descartar(id);
  }
}
