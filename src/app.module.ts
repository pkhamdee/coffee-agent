import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { ChatsModule } from './chats/chats.module';

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  throw new Error(
    'MONGO_URI is not set. Create a .env file in the project root (see README "Configure environment variables").',
  );
}

@Module({
  imports: [MongooseModule.forRoot(mongoUri), ChatsModule],
  controllers: [AppController],
})
export class AppModule {}
