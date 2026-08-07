import { IsBoolean, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class CreateClienteDto {
  @Matches(/^[0-9-]{9,13}$/, { message: 'El RNC debe tener sólo dígitos y guiones.' })
  rnc!: string;

  @IsString()
  nombre!: string;

  @IsOptional()
  @IsString()
  tipoIngresoDefault?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  tasaItbis?: number;

  @IsOptional()
  @IsBoolean()
  aplicaProporcionalidad?: boolean;
}
