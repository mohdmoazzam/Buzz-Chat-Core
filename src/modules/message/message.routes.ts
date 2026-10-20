import { Router } from "express";
import { attachments } from "../../common/middlewares/upload.js";
import { getMessages, sendAttachments } from "./message.controller.js";

// Mounted at /api/v1/chat/message (auth is applied by the chat router)
const router = Router();

router.post("/", attachments, sendAttachments);
router.get("/:id", getMessages);

export default router;
