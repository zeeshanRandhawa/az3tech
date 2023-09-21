import { Router, Request, Response } from "express";
import { UserController } from "../controller/user.controller";
import { LoginForm, RiderDriverForm, SignupForm } from "../util/interface.utility";
import { AuthMiddleware } from "../middleware/auth.middleware";

export class UserRouter {

  private router: Router;
  private userController: UserController;

  constructor() {
    this.userController = new UserController();
    this.router = Router();
    this.initializeRoutes();
  }

  public getUserRouter(): Router {
    return this.router;
  }

  private initializeRoutes() {
    this.router.post("/rider/signup", (req: Request, res: Response): void => {
      this.userController.signupRider(req.body as SignupForm).then(data => res.status(data.status).json(data.data));
    });

    this.router.post("/rider/login", (req: Request, res: Response): void => {
      this.userController.loginRider(req.body as LoginForm).then(data => res.status(data.status).json(data.data));
    });

    this.router.post("/rider/logout", AuthMiddleware.ensureAuthenticated, (req: Request, res: Response) => {
      this.userController.logoutRider(req.body.sessionToken as string).then(data => res.status(data.status).json(data.data));
    });

    this.router.post("/admin/login", (req: Request, res: Response) => {
      this.userController.loginAdmin(req.body as LoginForm, req.headers.cookies as string | undefined).then((data) => { //req.headers.sessionToken
        if (data.status == 200) {
          res.status(data.status).cookie("sessionToken", data.data.sessionToken.token, {
            expires: data.data.sessionToken.token.expireTime,
            // httpOnly: true,
            // secure: true,
          }).json(data.data);
        } else {
          res.status(data.status).json(data.data);
        }
      });
    });

    this.router.get("/admin/logout", AuthMiddleware.ensureAuthenticated, (req: Request, res: Response) => {
      this.userController.logoutAdmin(req.headers.cookies as string).then(data => res.clearCookie("sessionToken").status(data.status).json(data.data));
    });
  }
}

export default UserRouter;