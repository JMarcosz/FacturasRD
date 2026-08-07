import { Module } from '@nestjs/common';
import { ReglasService } from './reglas.service';
import { ReglasController } from './reglas.controller';

@Module({
  controllers: [ReglasController],
  providers: [ReglasService],
  exports: [ReglasService],
})
export class ReglasModule {}
