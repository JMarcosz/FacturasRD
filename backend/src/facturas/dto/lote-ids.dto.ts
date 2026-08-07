import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

/**
 * Cuerpo de las acciones en lote que no llevan más dato que la selección
 * (eliminar, confirmar clasificación).
 *
 * Existe como tipo propio para que no se reutilice un DTO de otra acción: al
 * usar `LoteRevisarDto` para confirmar, el `revisada` obligatorio de ese DTO
 * hacía que toda confirmación en lote muriera con un 400 antes de entrar al
 * servicio.
 */
export class LoteIdsDto {
  // 500 es el tope de una selección razonable en la tabla; por encima de eso
  // el `IN (...)` deja de ser barato y conviene filtrar mejor.
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  ids!: string[];
}
