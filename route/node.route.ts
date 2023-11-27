import multer, { Multer } from "multer";
import { Router, Request, Response } from "express";
import { NodeController } from "../controller/node.controller";
import { NodeForm, NodeTypeForm } from "../util/interface.utility";

export class NodeRouter {

    private router: Router;
    private nodeController: NodeController;

    private upload: Multer;

    constructor() {
        this.upload = multer({ storage: multer.memoryStorage() });

        this.nodeController = new NodeController();
        this.router = Router();
        this.initializeRoutes();
    }

    public getNodeRouter(): Router {
        return this.router;
    }

    private initializeRoutes() {
        this.router.get("", (req: Request, res: Response) => {
            this.nodeController.listNodes(parseInt(req.query.pageNumber as string, 10) as number).then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/listbyaddress", (req: Request, res: Response) => {
            this.nodeController.listNodesByAddress(req.query.addressToSearch as string | undefined, parseInt(req.query.pageNumber as string, 10) as number).then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/export/csv", (req: Request, res: Response) => {
            this.nodeController.exportNodesToCSV().then((data) => {
                res.setHeader("Content-Type", "text/csv");
                res.setHeader("Content-Disposition", "attachment; filename='Nodes List.csv'");
                res.send(data.data.content);
            });
        });

        this.router.post("", (req: Request, res: Response) => {
            this.nodeController.createNode(req.body as NodeForm).then(data => res.status(data.status).json(data.data));
        });

        this.router.patch("/:nodeId", (req: Request, res: Response) => {
            this.nodeController.updateNode(parseInt(req.params.nodeId as string, 10) as number, req.body as NodeForm).then(data => res.status(data.status).json(data.data));
        });

        this.router.delete("/:nodeId", (req: Request, res: Response) => {
            this.nodeController.deleteNode(parseInt(req.params.nodeId as string, 10) as number).then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/import/batch/log/name/list", (req: Request, res: Response) => {
            this.nodeController.listLogFileNames().then(data => res.status(data.status).json(data.data));
        });

        this.router.delete("/import/batch/log", (req: Request, res: Response) => {
            this.nodeController.deleteLogByName(req.query.fileName as string | undefined).then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/import/batch/log/download", (req: Request, res: Response) => {
            this.nodeController.downloadLogFiles(req.query.fileName as string | undefined).then((data) => {
                if (data.status === 200) {
                    res.setHeader("Content-Type", "application/zip");
                    res.setHeader("Content-Disposition", "attachment; filename='logfiles.zip'");
                    data.data.zip.pipe(res);
                    data.data.zip.finalize();
                } else {
                    res.status(data.status).json(data.data);
                }
            });
        });

        this.router.get("/statistics/states", (req: Request, res: Response) => {
            this.nodeController.listDistictStates().then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/statistics/city", (req: Request, res: Response) => {
            this.nodeController.getNodeCountByCityForStateProvince(req.query.stateProvince as string | undefined).then(data => res.status(data.status).json(data.data));
        });

        this.router.post("/import/batch", this.upload.single("file"), (req: Request, res: Response) => {
            this.nodeController.batchImportNodes(req.file as Express.Multer.File, req.headers.cookies as string).then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/pagecount", (req: Request, res: Response) => {
            this.nodeController.getNodeCount(req.query.addressToSearch as string | undefined).then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/nodetype/pagecount", (req: Request, res: Response) => {
            this.nodeController.getNodeTypeCount().then(data => res.status(data.status).json(data.data));
        });

        this.router.get("/nodetype/list", (req: Request, res: Response) => {
            this.nodeController.getNodeTypeList(parseInt(req.query.pageNumber as string, 10) as number).then(data => res.status(data.status).json(data.data));
        });

        this.router.post("/nodetype", (req: Request, res: Response) => {
            this.nodeController.createNodeType(req.body as NodeTypeForm).then(data => res.status(data.status).json(data.data));
        });
    }
}

export default NodeRouter;