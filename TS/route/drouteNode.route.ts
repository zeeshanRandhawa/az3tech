import { Router, Request, Response } from "express";
import { DriverRouteNodeController } from "../controller/drouteNode.controller";

export class DriverRouteNodeRouter {

    private router: Router;
    private driverRouteNodeController: DriverRouteNodeController;


    constructor() {
        this.driverRouteNodeController = new DriverRouteNodeController();
        this.router = Router();
        this.initializeRoutes();
    }

    public getDriverRouteNodeRouter(): Router {
        return this.router;
    }

    private initializeRoutes() {
        this.router.get("/list/:id", (req: Request, res: Response) => {
            this.driverRouteNodeController.listDriverRouteNodesByDriverRouteId(parseInt(req.params.id as string, 10) as number, parseInt(req.query.pageNumber as string, 10) as number).then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/pagecount", (req: Request, res: Response) => {
            this.driverRouteNodeController.getDriverRouteNodePageCount(parseInt(req.query.driverRouteId as string, 10) as number).then(data => res.status(data.status).json(data.data));
        });
    }
}

export default DriverRouteNodeRouter;