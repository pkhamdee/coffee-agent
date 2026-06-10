import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ChatService } from './chats.service';
import { SendChatDto } from './dtos/send-chat.dto';

@Controller('chats')
export class ChatsController {
  constructor(private readonly chatService: ChatService) {}

  @Get('orders')
  getOrders() {
    return this.chatService.getOrders();
  }

  @Patch('orders/:id/deliver')
  deliverOrder(@Param('id') id: string) {
    return this.chatService.deliverOrder(id);
  }

  @Post('message/:thread')
  chatWithAgent(
    @Param('thread') threadId: string,
    @Body() { query }: SendChatDto,
  ) {
    if (!threadId) throw new BadRequestException();
    return this.chatService.chatWithAgent({ query, thread_id: threadId });
  }
}
