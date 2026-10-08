import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
} from '@nestjs/common';
import { ModelConfigService } from './model-config.service';
import { ModelSettingsDto } from './dtos/model-settings.dto';
import { McpSettingsDto } from './dtos/mcp-settings.dto';
import { WeatherClientService } from 'src/mcp/weather/weather-client.service';
import { tlsErrorCode } from 'src/lib/http/insecure-fetch';

const tlsHint = (e: unknown) =>
  tlsErrorCode(e)
    ? ` (TLS certificate error: ${tlsErrorCode(e)} — if this is a trusted internal gateway, tick "Skip TLS certificate verification")`
    : '';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly modelConfig: ModelConfigService,
    private readonly weatherClient: WeatherClientService,
  ) {}

  @Get('model')
  getModel() {
    return this.modelConfig.getPublicConfig();
  }

  @Put('model')
  updateModel(@Body() dto: ModelSettingsDto) {
    this.modelConfig.setConfig(this.modelConfig.resolve(dto));
    return this.modelConfig.getPublicConfig();
  }

  /** Sends one tiny request with the given config without applying it. */
  @Post('model/test')
  async testModel(@Body() dto: ModelSettingsDto) {
    const llm = ModelConfigService.createLlm(this.modelConfig.resolve(dto), {
      maxRetries: 0,
    });
    try {
      await llm.invoke('Reply with the JSON object {"ok": true}');
      return { ok: true };
    } catch (e) {
      throw new BadRequestException(
        `Model call failed: ${e instanceof Error ? e.message : String(e)}${tlsHint(e)}`,
      );
    }
  }

  @Get('mcp')
  getMcp() {
    return this.weatherClient.getPublicConfig();
  }

  @Put('mcp')
  updateMcp(@Body() dto: McpSettingsDto) {
    this.weatherClient.setConfig(this.weatherClient.resolve(dto));
    return this.weatherClient.getPublicConfig();
  }

  /** Calls the weather tool with the given config without applying it. */
  @Post('mcp/test')
  async testMcp(@Body() dto: McpSettingsDto) {
    try {
      const weather = await WeatherClientService.callWeatherTool(
        this.weatherClient.resolve(dto),
      );
      return { ok: true, weather };
    } catch (e) {
      throw new BadRequestException(
        `MCP call failed: ${e instanceof Error ? e.message : String(e)}${tlsHint(e)}`,
      );
    }
  }
}
