import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ChatService } from './chats.service';
import sendChatDto from './dtos/send-chat.dto';

@Controller('chats')
export class ChatsController {
  constructor(private readonly chatService: ChatService) {}
  @Get('orders')
  getOrders() {
    return this.chatService.getOrders();
  }

  @Delete('orders/:id')
  deliverOrder(@Param('id') id: string) {
    return this.chatService.deliverOrder(id);
  }

  @Post('message/:thread')
  chatWithAgent(
    @Param('thread') threadId: string,
    @Body() { query }: sendChatDto,
  ) {
    if (!threadId) throw new BadRequestException();
    return this.chatService.chatWithAgent({ query, thread_id: threadId });
  }
}
