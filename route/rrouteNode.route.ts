import { Router, Request, Response } from "express";
import { RiderRouteNodeController } from "../controller/rrouteNode.controller";

export class RiderRouteNodeRouter {

    private router: Router;
    private riderRouteNodeController: RiderRouteNodeController;


    constructor() {
        this.riderRouteNodeController = new RiderRouteNodeController();
        this.router = Router();
        this.initializeRoutes();
    }

    public getRiderRouteNodeRouter(): Router {
        return this.router;
    }

    private initializeRoutes() {
        this.router.get("/list/:id", (req: Request, res: Response) => {
            this.riderRouteNodeController.listRiderRouteNodesByRiderRouteId(parseInt(req.params.id as string, 10) as number, parseInt(req.query.pageNumber as string, 10) as number).then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/pagecount", (req: Request, res: Response) => {
            this.riderRouteNodeController.getRiderRouteNodePageCount(parseInt(req.query.riderRouteId as string, 10) as number).then(data => res.status(data.status).json(data.data));
        });
    }
}

export default RiderRouteNodeRouter;