import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PeriodosController } from './periodos.controller';
import { PeriodosService } from './periodos.service';

@Module({
  imports: [AuthModule],
  controllers: [PeriodosController],
  providers: [PeriodosService],
  exports: [PeriodosService],
})
export class PeriodosModule {}
