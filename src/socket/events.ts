// Socket event names shared with the frontend
export const ALERT = "ALERT";
export const REFETCH_CHATS = "REFETCH_CHATS";

export const NEW_ATTACHMENT = "NEW_ATTACHMENT";
export const NEW_MESSAGE_ALERT = "NEW_MESSAGE_ALERT";

// Client -> server: "I've seen this chat"; server -> members: { chat_id, user_id, read_at }
export const CHAT_READ = "CHAT_READ";
export const MESSAGES_READ = "MESSAGES_READ";

export const NEW_REQUEST = "NEW_REQUEST";
export const NEW_NOTIFICATION = "NEW_NOTIFICATION";
export const NEW_MESSAGE = "NEW_MESSAGE";
export const MESSAGE_UPDATED = "MESSAGE_UPDATED";
export const MESSAGE_DELETED = "MESSAGE_DELETED";
// Disappearing messages: { chat_id, message_ids } removed by the cleanup job; { chat_id, seconds } when the timer changes
export const MESSAGES_EXPIRED = "MESSAGES_EXPIRED";
export const DISAPPEARING_UPDATED = "DISAPPEARING_UPDATED";

export const START_TYPING = "START_TYPING";
export const STOP_TYPING = "STOP_TYPING";

export const CHAT_JOINED = "CHAT_JOINED";
export const CHAT_LEAVED = "CHAT_LEAVED";

export const ONLINE_USERS = "ONLINE_USERS";

// Server -> client: this device was logged out (from another device, or by a password reset)
export const SESSION_REVOKED = "SESSION_REVOKED";
