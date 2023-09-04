import { Router, Request, Response } from "express";
import { DBSummaryController } from "../controller/dbsummary.controller";

export class DBSummaryRouter {

    private router: Router;
    private dbSummaryController: DBSummaryController;

    constructor() {
        this.dbSummaryController = new DBSummaryController();
        this.router = Router();
        this.initializeRoutes();
    }

    public getDBSummaryRouter(): Router {
        return this.router;
    }

    private initializeRoutes() {
        this.router.get("/database/statistics", (req: Request, res: Response) => {
            this.dbSummaryController.listDBTableStatistics().then(data => res.status(data.status).json(data.data));
        });

        this.router.delete("/database/:tableName", (req: Request, res: Response) => {
            this.dbSummaryController.purgeTable(req.params.tableName as string).then(data => res.status(data.status).json(data.data));
        });
    }
}

export default DBSummaryRouter;