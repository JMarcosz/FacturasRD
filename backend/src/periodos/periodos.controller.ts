import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Auth } from '../auth/auth.decorator';
import { PeriodosService } from './periodos.service';
import { CreatePeriodoDto } from './dto/create-periodo.dto';
import { UpdatePeriodoEstadoDto } from './dto/update-periodo-estado.dto';

@Auth()
@Controller('periodos')
export class PeriodosController {
  constructor(private readonly periodosService: PeriodosService) {}

  @Post()
  create(@Body() dto: CreatePeriodoDto) {
    return this.periodosService.create(dto);
  }

  @Get()
  findAll(
    @Query('clienteId') clienteId?: string,
    @Query('formato') formato?: 'F606' | 'F607',
    @Query('yyyymm') yyyymm?: string,
  ) {
    return this.periodosService.findAll(clienteId, formato, yyyymm);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.periodosService.findOne(id);
  }

  @Patch(':id/estado')
  actualizarEstado(@Param('id') id: string, @Body() dto: UpdatePeriodoEstadoDto) {
    return this.periodosService.actualizarEstado(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.periodosService.remove(id);
  }
}
