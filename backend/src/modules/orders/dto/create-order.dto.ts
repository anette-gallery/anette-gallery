import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class OrderCustomerDto {
  @IsString()
  @MaxLength(255)
  fullName!: string;

  @IsPhoneNumber('RU')
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

class OrderItemDto {
  @IsString()
  @MaxLength(64)
  sku!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;
}

export class CreateOrderDto {
  @ValidateNested()
  @Type(() => OrderCustomerDto)
  customer!: OrderCustomerDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  promoCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  giftCardNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  loyaltyCardNumber?: string;
}
