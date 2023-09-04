import multer, { Multer } from "multer";
import { Router, Request, Response } from "express";
import { DriverRouteController } from "../controller/droute.controller";
import { FilterForm } from "../util/interface.utility";

export class DriverRouteRouter {

    private router: Router;
    private driverRouteController: DriverRouteController;

    private upload: Multer;

    constructor() {
        this.upload = multer({ storage: multer.memoryStorage() });

        this.driverRouteController = new DriverRouteController();
        this.router = Router();
        this.initializeRoutes();
    }

    public getDriverRouteRouter(): Router {
        return this.router;
    }

    private initializeRoutes() {
        this.router.get("", (req: Request, res: Response) => {
            this.driverRouteController.listDriverRoutes(req.query.tagListStr as string | undefined, parseInt(req.query.pageNumber as string, 10) as number).then(data => res.status(data.status).json(data.data));
        });

        this.router.post("/filter/purge/:id", (req: Request, res: Response) => {
            this.driverRouteController.deleteDriverRoutesByFilters(req.body as FilterForm, parseInt(req.params.id as string, 10) as number).then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/list/:id", (req: Request, res: Response) => {
            this.driverRouteController.listDriverRoutesByDriverId(parseInt(req.params.id as string, 10) as number, parseInt(req.query.pageNumber as string, 10) as number).then(data => res.status(data.status).json(data.data));
        });

        this.router.delete("/tags", (req: Request, res: Response) => {
            this.driverRouteController.deleteDriverRouteByTags(req.query.tagListStr as string | undefined).then(data => res.status(data.status).json(data.data));
        });

        this.router.delete("/:drouteId", (req: Request, res: Response) => {
            this.driverRouteController.deleteDriverRouteById(parseInt(req.params.drouteId as string, 10) as number).then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/tags", (req: Request, res: Response) => {
            this.driverRouteController.getDriverRouteDistinctTagList().then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/pagecount", (req: Request, res: Response) => {
            this.driverRouteController.getDriverRoutePageCount(req.query.tagListStr as string | undefined, req.query.driverId as string | undefined).then(data => res.status(data.status).json(data.data));
        });

        this.router.post("/import/batch", this.upload.single("file"), (req: Request, res: Response) => {
            this.driverRouteController.batchImportDriverRoutes(req.file as Express.Multer.File, req.headers.cookies as string).then(data => res.status(data.status).json(data.data));
        });

        this.router.post("/import/transit", this.upload.single("file"), (req: Request, res: Response) => {
            this.driverRouteController.transitImportDriverRoutes(req.file as Express.Multer.File, req.body.scheduledWeekdays as string | undefined, req.body.scheduledStartDate as string | undefined, req.body.scheduledEndDate as string | undefined, req.headers.cookies as string).then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/import/batch/log/name/list", (req: Request, res: Response) => {
            this.driverRouteController.listLogFileNames().then(data => res.status(data.status).json(data.data));
        });

        this.router.delete("/import/batch/log", (req: Request, res: Response) => {
            this.driverRouteController.deleteLogByName(req.query.fileName as string | undefined).then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/import/batch/log/download", (req: Request, res: Response) => {
            this.driverRouteController.downloadLogFiles(req.query.fileName as string | undefined).then((data) => {
                if (data.status === 200) {
                    res.setHeader('Content-Type', 'application/zip');
                    res.setHeader('Content-Disposition', 'attachment; filename="logfiles.zip"');
                    data.data.zip.pipe(res);
                    data.data.zip.finalize();
                } else {
                    res.status(data.status).json(data.data);
                }
            });
        });

        this.router.get("/node/betweentime", (req: Request, res: Response) => {
            this.driverRouteController.displayDriverRoutesAtNodeBetweenTimeFrame(parseInt(req.query.nodeId as string, 10) as number, req.query.startDateTimeWindow as string, req.query.endDateTimeWindow as string, req.headers.cookies as string).then(data => res.status(data.status).json(data.data));
        });
    }
}

export default DriverRouteRouter;