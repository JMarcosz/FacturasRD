import { PartialType } from '@nestjs/mapped-types';
import { CreateReglaDto } from './create-regla.dto';

export class UpdateReglaDto extends PartialType(CreateReglaDto) {}
