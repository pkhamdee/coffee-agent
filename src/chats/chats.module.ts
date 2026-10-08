import { Module } from '@nestjs/common';
import { ChatService } from './chats.service';
import { ChatsController } from './chats.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from './schemas/order.schema';
import { SettingsModule } from 'src/settings/settings.module';
import { WeatherModule } from 'src/mcp/weather/weather.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    SettingsModule,
    WeatherModule,
  ],
  providers: [ChatService],
  controllers: [ChatsController],
})
export class ChatsModule {}
