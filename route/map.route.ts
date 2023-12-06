import { Router, Request, Response } from "express";
import { MapController } from "../controller/map.controller";
import { DriverRouteController } from "../controller/droute.controller";
import { RouteOption } from "../util/interface.utility";

export class MapRouter {

    private router: Router;
    private nodeController: MapController;
    private driverRouteController: DriverRouteController;


    constructor() {
        this.nodeController = new MapController();
        this.driverRouteController = new DriverRouteController();

        this.router = Router();
        this.initializeRoutes();
    }

    public getMapRouter(): Router {
        return this.router;
    }

    private initializeRoutes() {
        this.router.get("/droute/display/:drouteId", (req: Request, res: Response) => {
            this.driverRouteController.displayDriverRouteById(parseInt(req.params.drouteId as string, 10) as number).then(data => res.status(data.status).json(data.data));
        });

        this.router.post("/droute/display/section", (req: Request, res: Response) => {
            this.driverRouteController.getOptionOsrmRoute(req.body as RouteOption).then(data => res.status(data.status).json(data.data));
        });

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