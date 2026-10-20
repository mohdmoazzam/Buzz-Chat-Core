import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedController } from '../../common/base.controller';
import { PaginationQuery } from '../../common/swagger';
import type { AuthUser } from '../user/user.serializer';
import { ChatService } from './chat.service';
import { CreateGroupDto, type AddMembersBody, type UpdateGroupBody } from './group.dto';
import { GroupService } from './group.service';

@ApiTags('Chats')
@Controller('chat')
export class ChatController extends AuthenticatedController {
    constructor(
        private readonly chats: ChatService,
        private readonly groups: GroupService,
    ) {
        super();
    }

    @Get()
    @ApiOperation({ summary: 'List my chats (paginated)' })
    @PaginationQuery(['updated_at', 'created_at'])
    async getMyChats(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
        return { success: true, ...(await this.chats.getMyChats(user.id, query)) };
    }

    // Groups

    // JSON body; the picture is uploaded first with POST /assets and sent as avatar_id
    @Post('groups')
    @ApiOperation({ summary: 'Create a group' })
    async createGroup(@CurrentUser() user: AuthUser, @Body() dto: CreateGroupDto) {
        const chatId = await this.groups.createGroup(user.id, dto);
        return { success: true, message: 'Group created', chat_id: chatId };
    }

    @Get('groups')
    @ApiOperation({ summary: 'List groups I created' })
    async getMyGroups(@CurrentUser() user: AuthUser) {
        return { success: true, groups: await this.groups.getMyGroups(user.id) };
    }

    // Must stay after the static paths above: "/:id" would otherwise match them

    @Get(':id')
    @ApiOperation({ summary: 'Get a chat' })
    @ApiQuery({ name: 'populate', required: false, type: Boolean, description: 'Include member profiles' })
    async getChatDetails(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('populate') populate?: string) {
        return { success: true, chat: await this.chats.getChatDetails(user.id, id, populate === 'true') };
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update a group (creator only)' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                avatar_id: { type: 'string', format: 'uuid', description: 'New picture, uploaded first via POST /assets' },
            },
        },
    })
    async updateGroup(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateGroupBody) {
        const chat = await this.groups.updateGroup(user.id, id, body);
        return { success: true, message: 'Group updated', chat };
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a chat (unfriend for direct chats, creator only for groups)' })
    async deleteChat(@CurrentUser() user: AuthUser, @Param('id') id: string) {
        return { success: true, message: await this.chats.deleteChat(user.id, id) };
    }

    // Group members

    @Post(':id/members')
    @ApiOperation({ summary: 'Add members to a group (creator only)' })
    @ApiBody({
        schema: {
            type: 'object',
            required: ['members'],
            properties: { members: { type: 'array', items: { type: 'string', format: 'uuid' } } },
        },
    })
    async addMembers(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: AddMembersBody) {
        await this.groups.addMembers(user.id, { members: body.members, chat_id: id });
        return { success: true, message: 'Members added successfully' };
    }

    // Must stay before ":id/members/:userId"
    @Delete(':id/members/me')
    @ApiOperation({ summary: 'Leave a group' })
    async leaveGroup(@CurrentUser() user: AuthUser, @Param('id') id: string) {
        await this.groups.leaveGroup(user.id, id);
        return { success: true, message: 'You left the group' };
    }

    @Delete(':id/members/:userId')
    @ApiOperation({ summary: 'Remove a member from a group (creator only)' })
    @ApiParam({ name: 'userId', format: 'uuid' })
    async removeMember(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('userId') userId: string) {
        await this.groups.removeMember(user.id, { chat_id: id, user_id: userId });
        return { success: true, message: 'Member removed successfully' };
    }
}
