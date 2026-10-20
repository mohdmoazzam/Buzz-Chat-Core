// Adds the authenticated user's id to Express requests (set by isAuthenticated)
declare global {
    namespace Express {
        interface Request {
            user?: string;
        }
    }
}

export {};
