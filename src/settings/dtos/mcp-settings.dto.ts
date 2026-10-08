import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class McpSettingsDto {
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(500)
  url: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city: string;

  // Omitted or empty = keep the current key.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  apiKey?: string;

  // Like `curl -k`: accept self-signed certificates (MCP calls only).
  @IsOptional()
  @IsBoolean()
  skipTlsVerify?: boolean;
}
