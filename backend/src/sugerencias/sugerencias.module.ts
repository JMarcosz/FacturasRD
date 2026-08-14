import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { SugerenciasService } from './sugerencias.service';
import { SugerenciasController } from './sugerencias.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SugerenciasController],
  providers: [SugerenciasService],
  exports: [SugerenciasService],
})
export class SugerenciasModule {}
