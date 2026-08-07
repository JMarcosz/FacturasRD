import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ReglasService } from './reglas.service';
import { CreateReglaDto } from './dto/create-regla.dto';
import { UpdateReglaDto } from './dto/update-regla.dto';
import { Auth } from '../auth/auth.decorator';

@Auth()
@Controller('reglas')
export class ReglasController {
  constructor(private readonly reglasService: ReglasService) {}

  @Post()
  create(@Body() createReglaDto: CreateReglaDto) {
    return this.reglasService.create(createReglaDto);
  }

  @Get()
  findAll() {
    return this.reglasService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reglasService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateReglaDto: UpdateReglaDto) {
    return this.reglasService.update(id, updateReglaDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reglasService.remove(id);
  }
}
