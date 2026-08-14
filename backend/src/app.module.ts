import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from './prisma.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { ClientesModule } from './clientes/clientes.module';
import { PeriodosModule } from './periodos/periodos.module';
import { DocumentosModule } from './documentos/documentos.module';
import { ExtraccionModule } from './extraccion/extraccion.module';
import { FacturasModule } from './facturas/facturas.module';
import { ExportacionModule } from './exportacion/exportacion.module';
import { CatalogosModule } from './catalogos/catalogos.module';
import { EstadisticasModule } from './estadisticas/estadisticas.module';
import { ReglasModule } from './reglas/reglas.module';
import { SugerenciasModule } from './sugerencias/sugerencias.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    // El build de Vue (frontend/dist) se sirve desde este mismo proceso — un solo
    // contenedor en producción. La API vive bajo /api (ver setGlobalPrefix en main.ts).
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'frontend', 'dist'),
      exclude: ['/api/{*any}'],
    }),
    AuthModule,
    ClientesModule,
    PeriodosModule,
    DocumentosModule,
    ExtraccionModule,
    FacturasModule,
    ExportacionModule,
    CatalogosModule,
    EstadisticasModule,
    ReglasModule,
    SugerenciasModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
