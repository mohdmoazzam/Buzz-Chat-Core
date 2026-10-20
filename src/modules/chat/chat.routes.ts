import { Router } from "express";
import { isAuthenticated } from "../../common/middlewares/auth.js";
import { singleAvatar } from "../../common/middlewares/upload.js";
import { validate } from "../../common/middlewares/validate.js";
import messageRoutes from "../message/message.routes.js";
import { deleteChat, getChatDetails, getMyChats } from "./chat.controller.js";
import { newGroupRules } from "./chat.validators.js";
import { addMembers, createGroup, getMyGroups, leaveGroup, removeMember, updateGroup } from "./group.controller.js";

const router = Router();

router.use(isAuthenticated);

router.get("/my", getMyChats);

// Groups
router.post("/new", singleAvatar, newGroupRules, validate, createGroup);
router.get("/my/groups", getMyGroups);
router.put("/addMembers", addMembers);
router.put("/removeMember", removeMember);
router.delete("/leave/:id", leaveGroup);

// Messages (history + attachments)
router.use("/message", messageRoutes);

// Must stay last: "/:id" would otherwise match the paths above
router.route("/:id").get(getChatDetails).put(singleAvatar, updateGroup).delete(deleteChat);

export default router;
