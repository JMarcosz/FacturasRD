import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ImportarClienteRowDto {
  @IsString()
  rnc: string;

  @IsString()
  nombre: string;

  @IsString()
  @IsOptional()
  tipoIngresoDefault?: string;

  @IsNumber()
  @IsOptional()
  tasaItbis?: number;

  @IsBoolean()
  @IsOptional()
  aplicaProporcionalidad?: boolean;
}

export class ImportarClientesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportarClienteRowDto)
  filas: ImportarClienteRowDto[];
}
