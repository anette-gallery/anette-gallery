import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
} from 'class-validator';

export class SyncCustomerDto {
  @IsString()
  @MaxLength(255)
  fullName!: string;

  @IsPhoneNumber('RU')
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  loyaltyCardNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
}
