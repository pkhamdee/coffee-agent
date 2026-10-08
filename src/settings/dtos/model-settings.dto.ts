import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ModelSettingsDto {
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(500)
  baseUrl: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  modelName: string;

  // Omitted or empty = keep the current token.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  token?: string;

  // Like `curl -k`: accept self-signed certificates (model calls only).
  @IsOptional()
  @IsBoolean()
  skipTlsVerify?: boolean;
}
