import express from "express";
import { adminLogin, adminLogout, getAdminData, getAllChats, getAllMessages, getAllUsers, getDashboardStats } from "../controllers/admin.controller.js";
import { adminOnly } from "../middlewares/auth.js";
const app = express.Router();

app.post("/verify", adminLogin);

app.get("/logout", adminLogout);

app.use(adminOnly);

app.get("/", getAdminData);

app.get("/users", getAllUsers);

app.get("/chats", getAllChats);

app.get("/messages", getAllMessages);

app.get("/stats", getDashboardStats);

export default app;