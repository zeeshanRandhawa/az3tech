import multer, { Multer } from "multer";
import { Router, Request, Response } from "express";
import { RiderRouteController } from "../controller/rroute.controller";
import { FilterForm } from "../util/interface.utility";

export class RiderRouteRouter {

    private router: Router;
    private riderRouteController: RiderRouteController;

    private upload: Multer;

    constructor() {
        this.upload = multer({ storage: multer.memoryStorage() });

        this.riderRouteController = new RiderRouteController();
        this.router = Router();
        this.initializeRoutes();
    }

    public getRiderRouteRouter(): Router {
        return this.router;
    }

    private initializeRoutes() {
        this.router.get("", (req: Request, res: Response) => {
            this.riderRouteController.listRiderRoutes(req.query.tagListStr as string | undefined, parseInt(req.query.pageNumber as string, 10) as number).then(data => res.status(data.status).json(data.data));
        });

        this.router.post("/filter/purge/:id", (req: Request, res: Response) => {
            this.riderRouteController.deleteRiderRoutesByFilters(req.body as FilterForm, parseInt(req.params.id as string, 10) as number).then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/list/:id", (req: Request, res: Response) => {
            this.riderRouteController.listRiderRoutesByRiderId(parseInt(req.params.id as string, 10) as number, parseInt(req.query.pageNumber as string, 10) as number).then(data => res.status(data.status).json(data.data));
        });

        this.router.delete("/tags", (req: Request, res: Response) => {
            this.riderRouteController.deleteRiderRouteByTags(req.query.tagListStr as string | undefined).then(data => res.status(data.status).json(data.data));
        });

        this.router.delete("/:rrouteId", (req: Request, res: Response) => {
            this.riderRouteController.deleteRiderRouteById(parseInt(req.params.rrouteId as string, 10) as number).then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/tags", (req: Request, res: Response) => {
            this.riderRouteController.getRiderRouteDistinctTagList().then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/pagecount", (req: Request, res: Response) => {
            this.riderRouteController.getRiderRoutePageCount(req.query.tagListStr as string | undefined, req.query.riderId as string | undefined).then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/from-node-between", (req: Request, res: Response) => {
            this.riderRouteController.displayRiderRoutesOriginatingFromNodeBetweenTimeFrame(parseInt(req.query.nodeId as string, 10) as number, req.query.startOriginDateTime as string | undefined, req.query.endOrigindateTime as string | undefined, req.headers.cookies as string | undefined).then(data => res.status(data.status).json(data.data));
        });

        // TODO
        // this.router.post("/import/batch", this.upload.single("file"), (req: Request, res: Response) => {
        //     this.riderRouteController.batchImportRiderRoutes(req.file as Express.Multer.File).then(data => res.status(data.status).json(data.data));
        // });

        // this.router.post("/import/bulk", this.upload.single("file"), (req: Request, res: Response) => {
        //     this.riderRouteController.bulkImportRiderRoutes(req.file as Express.Multer.File).then(data => res.status(data.status).json(data.data));
        // });

    }
}

export default RiderRouteRouter;