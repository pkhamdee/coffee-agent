import { Module } from '@nestjs/common';
import { WeatherClientService } from './weather-client.service';

/** Shares one WeatherClientService (config + cache) between the agent and settings. */
@Module({
  providers: [WeatherClientService],
  exports: [WeatherClientService],
})
export class WeatherModule {}
