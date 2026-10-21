import { Logger } from "@nestjs/common";
import {
    ConnectedSocket,
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
    type OnGatewayConnection,
    type OnGatewayDisconnect,
    type OnGatewayInit,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { config } from "../config/env";
import { AUTH_COOKIE, MESSAGE_MAX } from "../common/constants";
import { parseBearer } from "../common/utils/bearer";
import { RealtimeService, sessionRoom, userRoom } from "../core/realtime.service";
import { SessionService } from "../core/session.service";
import { TokenService } from "../core/token.service";
import { ChatAccess, memberIdsOf } from "../modules/chat/chat.access";
import { ReadStateService } from "../modules/chat/read-state.service";
import type { MessageSender } from "../modules/message/message.serializer";
import { MessageService } from "../modules/message/message.service";
import { CHAT_JOINED, CHAT_LEAVED, CHAT_READ, NEW_MESSAGE, START_TYPING, STOP_TYPING } from "./events";
import { PresenceService } from "./presence.service";

type SocketUser = MessageSender;

type Ack = { ok: boolean; error?: string; message_id?: string };

const readCookie = (cookieHeader: string | undefined, name: string): string | undefined =>
    cookieHeader
        ?.split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${name}=`))
        ?.slice(name.length + 1);

const userOf = (socket: Socket): SocketUser => socket.data.user as SocketUser;

@WebSocketGateway({
    cors: { origin: config.corsOrigins, credentials: true },
    maxHttpBufferSize: 1e6,
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    private readonly logger = new Logger(ChatGateway.name);

    constructor(
        private readonly tokens: TokenService,
        private readonly sessions: SessionService,
        private readonly realtime: RealtimeService,
        private readonly presence: PresenceService,
        private readonly access: ChatAccess,
        private readonly messages: MessageService,
        private readonly readState: ReadStateService,
    ) {}

    afterInit(server: Server): void {
        this.realtime.attach(server);
        server.use((socket, next) => {
            this.authenticate(socket).then(
                () => next(),
                () => next(new Error("Authentication error")),
            );
        });
    }

    async handleConnection(socket: Socket): Promise<void> {
        const { id: userId } = userOf(socket);
        await socket.join([userRoom(userId), sessionRoom(socket.data.sessionId as string)]);
        await this.safely(() => this.presence.userConnected(userId));
    }

    async handleDisconnect(socket: Socket): Promise<void> {
        const user = socket.data.user as SocketUser | undefined;
        if (user) await this.safely(() => this.presence.userDisconnected(user.id));
    }

    @SubscribeMessage(NEW_MESSAGE)
    async onNewMessage(@ConnectedSocket() socket: Socket, @MessageBody() body?: { chat_id?: unknown; message?: unknown }): Promise<Ack> {
        const user = userOf(socket);
        const content = typeof body?.message === "string" ? body.message.trim() : "";
        if (!content) return { ok: false, error: "Message is empty" };
        if (content.length > MESSAGE_MAX) {
            return { ok: false, error: `Messages can be at most ${MESSAGE_MAX} characters` };
        }

        try {
            // Server-side membership check: never trust chat_id/members sent by the client
            const chat = await this.access.loadForMember(body?.chat_id, user.id);
            if (!chat) return { ok: false, error: "Chat not found" };

            const saved = await this.messages.createAndDeliver({
                chatId: chat.id,
                memberIds: memberIdsOf(chat),
                sender: user,
                content,
            });
            return { ok: true, message_id: saved.id };
        } catch (error) {
            this.logger.error(`Failed to send message: ${(error as Error).message}`);
            return { ok: false, error: "Something went wrong. Please try again." };
        }
    }

    @SubscribeMessage(START_TYPING)
    async onStartTyping(@ConnectedSocket() socket: Socket, @MessageBody() body?: { chat_id?: unknown }): Promise<void> {
        await this.safely(() => this.relayTyping(socket, START_TYPING, body?.chat_id));
    }

    @SubscribeMessage(STOP_TYPING)
    async onStopTyping(@ConnectedSocket() socket: Socket, @MessageBody() body?: { chat_id?: unknown }): Promise<void> {
        await this.safely(() => this.relayTyping(socket, STOP_TYPING, body?.chat_id));
    }

    // Kept for client compatibility: presence is driven by connections, so
    // joining a chat just refreshes this user's view of who is online.
    @SubscribeMessage(CHAT_JOINED)
    async onChatJoined(@ConnectedSocket() socket: Socket): Promise<void> {
        await this.safely(() => this.presence.sendPresenceTo(userOf(socket).id));
    }

    @SubscribeMessage(CHAT_LEAVED)
    onChatLeaved(): void {}

    @SubscribeMessage(CHAT_READ)
    async onChatRead(@ConnectedSocket() socket: Socket, @MessageBody() body?: { chat_id?: unknown }): Promise<void> {
        await this.safely(async () => {
            const { id: userId } = userOf(socket);
            const chat = await this.access.loadForMember(body?.chat_id, userId);
            if (chat) {
                await this.readState.markRead(chat.id, userId, memberIdsOf(chat));
            }
        });
    }

    /** Accepts the token from the handshake auth payload or the session cookie. */
    private async authenticate(socket: Socket): Promise<void> {
        const token = parseBearer(socket.handshake.auth?.token) || parseBearer(readCookie(socket.handshake.headers?.cookie, AUTH_COOKIE));
        const claims = this.tokens.sessionFrom(token);
        if (!claims) throw new Error("invalid token");

        // The device must still be logged in (its sessions row exists), not just hold a signed token
        const user = await this.sessions.nameFor(claims);
        if (!user) throw new Error("session not found");

        socket.data.user = user satisfies SocketUser;
        socket.data.sessionId = claims.sessionId;
    }

    // Carries who is typing, so group chats can show "Ravi is typing…"
    private async relayTyping(socket: Socket, event: string, chatId: unknown): Promise<void> {
        const { id: userId, first_name } = userOf(socket);
        const chat = await this.access.loadForMember(chatId, userId);
        if (!chat) return;
        this.realtime.emitToUsers(
            memberIdsOf(chat).filter((id) => id !== userId),
            event,
            { chat_id: chat.id, user_id: userId, first_name },
        );
    }

    // Socket handlers must never crash the process
    private async safely(task: () => Promise<unknown>): Promise<void> {
        try {
            await task();
        } catch (error) {
            this.logger.error(`Socket handler error: ${(error as Error).message}`);
        }
    }
}
