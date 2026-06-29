import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SyncCatalogItemDto {
  @IsString()
  @MaxLength(64)
  sku!: string;

  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  size?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  dimensions?: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  images?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  manualOverrideFields?: string[];

  @IsOptional()
  @IsBoolean()
  preserveTildaOverrides?: boolean;

  @IsOptional()
  @IsBoolean()
  missingInOneC?: boolean;

  @IsOptional()
  @IsDateString()
  sourceUpdatedAt?: string;

  @IsOptional()
  @IsDateString()
  tildaUpdatedAt?: string;
}

export class SyncCatalogBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SyncCatalogItemDto)
  items!: SyncCatalogItemDto[];
}
