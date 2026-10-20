import "dotenv/config";
import { v2 as cloudinary } from "cloudinary";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { v4 as uuid } from "uuid";
import { AppConfig } from "./constants/constants.js";
import { CHAT_JOINED, CHAT_LEAVED, NEW_MESSAGE, NEW_MESSAGE_ALERT, ONLINE_USERS, START_TYPING, STOP_TYPING } from "./constants/events.js";
import { socketAuthenticator } from "./middlewares/auth.js";
import { errorMiddleware } from "./middlewares/error.js";
import { Message } from "./models/message.model.js";
import adminRoutes from "./routes/admin.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import userRoutes from "./routes/user.routes.js";
import { connectToDb } from "./utils/features.js";
import { getSockets } from "./utils/helper.js";

// CLIENT_URL may hold several origins separated by commas; trailing slashes are ignored
const allowedOrigins = [
    'http://localhost:5173',
    'https://buzz-chat-frontend-azure.vercel.app',
    ...(process.env.CLIENT_URL ?? "").split(","),
]
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

const userSocketIds = new Map();
const onlineUsers = new Set();

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: allowedOrigins, credentials: true } });

app.set("io", io);
const PORT = AppConfig.PORT;

connectToDb();

cloudinary.config({
    cloud_name: AppConfig.CLOUDINARY_CLOUD_NAME,
    api_key: AppConfig.CLOUDINARY_API_KEY,
    api_secret: AppConfig.CLOUDINARY_SECRET_KEY
});

app.use(express.json());
app.use(cookieParser());

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

app.use("/api/v1/user", userRoutes);
app.use("/api/v1/chat", chatRoutes);
app.use("/api/v1/admin", adminRoutes);

app.get("/", (req, res) => {
    res.send("Server is running");
});

io.use(async (socket, next) => {
    await socketAuthenticator(socket, next);
});

io.on("connection", (socket) => {
    const user = socket.user;
    userSocketIds.set(user._id.toString(), socket.id);
    console.log("Client connected", socket.id);

    socket.on(NEW_MESSAGE, async ({ chatId, members, message }) => {
        const messageForRealTime = {
            content: message,
            _id: uuid(),
            sender: {
                _id: user._id,
                name: user.name
            },
            chat: chatId,
            createdAt: new Date().toISOString()
        };

        const messageForDb = {
            content: message,
            sender: user.id,
            chat: chatId
        };
        const membersSockets = getSockets(members);
        io.to(membersSockets).emit(NEW_MESSAGE, {
            chatId,
            message: messageForRealTime
        });
        io.to(membersSockets).emit(NEW_MESSAGE_ALERT, { chatId });
        await Message.create(messageForDb);
    });

    socket.on(START_TYPING, ({ members, chatId }) => {
        console.log("start - typing", chatId);
        const membersSocket = getSockets(members);
        socket.to(membersSocket).emit(START_TYPING, { chatId });
    });

    socket.on(STOP_TYPING, ({ members, chatId }) => {
        console.log("stop typing", chatId);
        const membersSocket = getSockets(members);
        socket.to(membersSocket).emit(STOP_TYPING, { chatId });
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected", socket.id);
        userSocketIds.delete(user._id.toString());
        onlineUsers.delete(user._id.toString());
        socket.broadcast.emit(ONLINE_USERS, Array.from(onlineUsers));
    });

    socket.on(CHAT_JOINED, ({ userId, members }) => {
        onlineUsers.add(userId.toString());
        const memberSocket = getSockets(members);
        io.to(memberSocket).emit(ONLINE_USERS, Array.from(onlineUsers));
    });

    socket.on(CHAT_LEAVED, ({ userId, members }) => {
        onlineUsers.delete(userId.toString());
        const memberSocket = getSockets(members);
        io.to(memberSocket).emit(ONLINE_USERS, Array.from(onlineUsers));
    });
});

app.use(errorMiddleware);

server.listen(PORT, () => {
    console.info(`*** ENV - ${process.env.NODE_ENV} ***`);
    console.info(`*** Sever is up and running on port ${PORT} ***`);
});

export { userSocketIds };
