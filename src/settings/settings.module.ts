import { Module } from '@nestjs/common';
import { ModelConfigService } from './model-config.service';
import { SettingsController } from './settings.controller';
import { WeatherModule } from 'src/mcp/weather/weather.module';

@Module({
  imports: [WeatherModule],
  providers: [ModelConfigService],
  controllers: [SettingsController],
  exports: [ModelConfigService],
})
export class SettingsModule {}
