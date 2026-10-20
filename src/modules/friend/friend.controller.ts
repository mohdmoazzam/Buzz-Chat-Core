import { Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../user/user.serializer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { FriendService } from './friend.service';

// Shares the /user prefix with the auth and user routes to keep the existing client URLs
@Controller('user')
@UseGuards(JwtAuthGuard)
export class FriendController {
    constructor(private readonly friends: FriendService) {}

    @Get('search')
    async searchUsers(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
        return { success: true, ...(await this.friends.searchUsers(user.id, query)) };
    }

    @Post('sendRequest')
    async sendRequest(@CurrentUser() user: AuthUser, @Body('user_id') userId: unknown) {
        await this.friends.sendRequest(user.id, userId);
        return { success: true, message: 'Friend request sent' };
    }

    @Put('acceptRequest')
    async respondToRequest(@CurrentUser() user: AuthUser, @Body('request_id') requestId: unknown, @Body('accept') accept: unknown) {
        const senderId = await this.friends.respondToRequest(user.id, requestId, accept === true || accept === 'true');
        return senderId
            ? { success: true, message: 'Request accepted', sender_id: senderId }
            : { success: true, message: 'Friend request declined' };
    }

    @Get('myNotifications')
    async getNotifications(@CurrentUser() user: AuthUser) {
        return { success: true, data: await this.friends.getNotifications(user.id) };
    }

    @Get('myFriends')
    async getFriends(@CurrentUser() user: AuthUser, @Query('chat_id') chatId: unknown) {
        return { success: true, data: await this.friends.getFriends(user.id, chatId) };
    }
}
