import { Router, Request, Response, NextFunction } from "express";
import { SessionController } from "../controller/session.controller";
import { AuthMiddleware } from "../middleware/auth.middleware";

export class SessionRouter {

    private router: Router;
    private sessionController: SessionController;

    constructor() {
        this.sessionController = new SessionController();
        this.router = Router();
        this.initializeRoutes();
    }

    public getSessionRouter(): Router {
        return this.router;
    }

    private initializeRoutes() {
        this.router.get("/role", AuthMiddleware.ensureAuthenticated, (req: Request, res: Response) => {
            this.sessionController.getRoleByToken(req.headers.cookies as string | undefined).then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/isauthenticated", (req: Request, res: Response) => {
            this.sessionController.isAuthenticated(req.headers.cookies as string | undefined).then(data => res.status(data.status).json(data.data));
        });
    }
}

export default SessionRouter;