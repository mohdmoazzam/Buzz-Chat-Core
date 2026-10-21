import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedController } from '../../common/base.controller';
import { PaginationQuery } from '../../common/swagger';
import type { AuthUser } from '../user/user.serializer';
import { FriendService } from './friend.service';

// Shares the /user prefix with the auth and user routes to keep the existing client URLs
@ApiTags('Friends')
@Controller('user')
export class FriendController extends AuthenticatedController {
    constructor(private readonly friends: FriendService) {
        super();
    }

    @Get('search')
    @PaginationQuery(['name', 'username', 'created_at'])
    async searchUsers(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
        return { success: true, ...(await this.friends.searchUsers(user.id, query)) };
    }

    @Get('friends')
    @ApiQuery({ name: 'chat_id', required: false, description: 'Leave out friends already in this group' })
    async getFriends(@CurrentUser() user: AuthUser, @Query('chat_id') chatId: unknown) {
        return { success: true, data: await this.friends.getFriends(user.id, chatId) };
    }

    // Friend requests

    @Get('friend-requests')
    async getNotifications(@CurrentUser() user: AuthUser) {
        return { success: true, data: await this.friends.getNotifications(user.id) };
    }

    @Post('friend-requests')
    async sendRequest(@CurrentUser() user: AuthUser, @Body('user_id') userId: unknown) {
        await this.friends.sendRequest(user.id, userId);
        return { success: true, message: 'Friend request sent' };
    }

    @Put('friend-requests/:id')
    async respondToRequest(@CurrentUser() user: AuthUser, @Param('id') requestId: string, @Body('accept') accept: unknown) {
        const senderId = await this.friends.respondToRequest(user.id, requestId, accept === true || accept === 'true');
        return senderId
            ? { success: true, message: 'Request accepted', sender_id: senderId }
            : { success: true, message: 'Friend request declined' };
    }
}
