import express from "express";
import { acceptFriendRequest, getMyFriends, getMyNotifications, getUserProfile, login, logout, registerUser, searchUser, sendFriendRequest } from "../controllers/user.controller.js";
import { isAuthenticated } from "../middlewares/auth.js";
import { singleAvatar } from "../middlewares/multer.js";
import { loginvalidator, registervalidator, validateHandler } from "../utils/validators.js";
const app = express.Router();

app.post("/register", singleAvatar, registervalidator(), validateHandler, registerUser);
app.post("/login", loginvalidator(), validateHandler, login);

//Protected routes
app.use(isAuthenticated);

app.get("/me", getUserProfile);

app.get("/logout", logout);

app.get("/search", searchUser);

app.post("/sendRequest", sendFriendRequest);

app.put("/acceptRequest", acceptFriendRequest);

app.get("/myNotifications", getMyNotifications);

app.get("/myFriends", getMyFriends);

export default app;