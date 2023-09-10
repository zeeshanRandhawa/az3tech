import { Router, Request, Response } from "express";
import { MapController } from "../controller/map.controller";

export class MapRouter {

    private router: Router;
    private nodeController: MapController;


    constructor() {
        this.nodeController = new MapController();
        this.router = Router();
        this.initializeRoutes();
    }

    public getMapRouter(): Router {
        return this.router;
    }

    private initializeRoutes() {
        this.router.patch("/waypointdistance", (req: Request, res: Response) => {
            this.nodeController.setWaypointDistance(parseFloat(req.body.waypointDistance as string) as number, req.headers.cookies as string | undefined).then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/node/nearest", (req: Request, res: Response) => {
            this.nodeController.displayMapNearestNode(parseFloat(req.query.longitude as string) as number, parseFloat(req.query.latitude as string) as number).then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/node/all/display", (req: Request, res: Response) => {
            this.nodeController.displayMapNodesInAreaOfInterest(req.query.upperLeftCorner as string, req.query.lowerLeftCorner as string, req.query.upperRightCorner as string, req.query.lowerRightCorner as string, req.query.descriptionFilterListStr as string | undefined).then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/route", (req: Request, res: Response) => {
            this.nodeController.displayMapRouteWithIntermediateNodesBetweenPoints(req.query.originPoint as string | undefined, req.query.destinationPoint as string | undefined, req.headers.cookies as string | undefined).then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/waypointdistance", (req: Request, res: Response) => {
            this.nodeController.getWaypointDistance(req.headers.cookies as string | undefined).then(data => res.status(data.status).json(data.data));
        });
    }
}

export default MapRouter;