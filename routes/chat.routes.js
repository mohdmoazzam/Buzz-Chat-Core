import express from "express";
import { addMembers, deletChat, getChatDetails, getMessages, getMyChats, getMyGroups, leaveGroup, newGroupChat, removeMember, renameGroup, sendAttachments } from "../controllers/chat.controller.js";
import { isAuthenticated } from "../middlewares/auth.js";
import { attachmentsMulter } from "../middlewares/multer.js";
import { newGroupValidator, validateHandler } from "../utils/validators.js";
const app = express.Router();

app.use(isAuthenticated);

app.post("/new", newGroupValidator(), validateHandler, newGroupChat);

app.get("/my", getMyChats);

app.get("/my/groups", getMyGroups);

app.put("/addMembers", addMembers);

app.put("/removeMember", removeMember);

app.delete("/leave/:id", leaveGroup);

//Send Attachments
app.post("/message", attachmentsMulter, sendAttachments);

//Get Messages
app.get("/message/:id", getMessages);

//Get Chat Details
app.route("/:id").get(getChatDetails).put(renameGroup).delete(deletChat);
export default app;