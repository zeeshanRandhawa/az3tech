import { Request, Response, NextFunction } from "express";
import { SessionService } from "../service/session.service";
import { CustomError, SessionAttributes } from "../util/interface.utility";
import { SessionRepository } from "../repository/session.repository";

// req.headers.cookies
// req.cookies.admin_cookie

export class AuthMiddleware {

    /**
     * Middleware to check if the user is currently authenticated.
     * It receives the cookie from the user and checks it in the database.
     * If the user is not authenticated, it returns a 403 Forbidden response.
     * If an error occurs, it logs the error and returns a 500 Internal Server Error response.
     *
     * @param req - The Express request object
     * @param res - The Express response object
     * @param next - The next function to pass control to the next middleware
     */
    static async ensureAuthenticated(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            if (!req.headers.cookies) {
                res.status(403).json({ message: "Access denied" });
            } else {
                const session: SessionAttributes | null = await new SessionRepository().findSession({
                    "where": {
                        sessionToken: req.headers.cookies
                    }
                });
                if (session) {
                    next()
                } else {
                    res.status(403).json({ message: "Access denied" });
                }
            }
        } catch (error: any) {
            if (error instanceof CustomError) {
                res.status(error.statusCode).json({ message: error.message });
            }
            res.status(500).json({ message: error.message });
        }
    }

    /**
     * Middleware to check if the user"s role is admin or super admin.
     * If the role is not super admin, it returns a 403 Forbidden response.
     * If an error occurs, it logs the error and returns a 500 Internal Server Error response.
     *
     * @param req - The Express request object
     * @param res - The Express response object
     * @param next - The next function to pass control to the next middleware
     */
    static async ensureSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const roleType: Record<string, any> = await new SessionService().getRoleByToken(req.headers.cookies as string);
            if (["SuperAdmin"].includes(roleType.data.role)) {
                next();
            } else {
                res.status(403).json({ message: "Only Super Admin can perform this operation" });
            }
        } catch (error: any) {
            if (error instanceof CustomError) {
                if (error instanceof CustomError) {
                    res.status(error.statusCode).json({ message: error.message });
                }
                res.status(500).json({ message: error.message });
            }
        }
    };
}