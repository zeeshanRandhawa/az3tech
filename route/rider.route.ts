import multer, { Multer } from "multer";
import { Router, Request, Response } from "express";
import { RiderController } from "../controller/rider.controller";
import { RiderDriverForm } from "../util/interface.utility";

export class RiderRouter {

    private router: Router;
    private riderController: RiderController;

    private upload: Multer;

    constructor() {
        this.upload = multer({ storage: multer.memoryStorage() });

        this.riderController = new RiderController();
        this.router = Router();
        this.initializeRoutes();
    }

    public getRiderRouter(): Router {
        return this.router;
    }

    private initializeRoutes() {

        /**
         * @swagger
         * /api/rider:
         *   get:
         *     summary: Get a list of riders
         *     parameters:
         *       - name: pageNumber
         *         in: query
         *         description: The page number to retrieve
         *         required: true
         *         schema:
         *           type: integer
         *     responses:
         *       200:
         *         description: Returns the list of riders
         */
        this.router.get("", (req: Request, res: Response) => {
            this.riderController.listRiders(parseInt(req.query.pageNumber as string, 10) as number).then(data => res.status(data.status).json(data.data));
        });

        /**
         * @swagger
         * /api/rider:
         *   post:
         *     summary: Create a new rider
         *     requestBody:
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               firstName:
         *                 type: string
         *               lastName:
         *                 type: string
         *               address:
         *                 type: string
         *               city:
         *                 type: string
         *               stateProvince:
         *                 type: string
         *               zipPostalCode:
         *                 type: number
         *               profilePicture:
         *                 type: string
         *               mobileNumber:
         *                 type: string
         *               countryCode:
         *                 type: string
         *               description:
         *                 type: string
         *               capacity:
         *                 type: number
         *     responses:
         *       200:
         *         description: Returns the created rider
         */
        this.router.post("", (req: Request, res: Response) => {
            this.riderController.createRider(req.body as RiderDriverForm).then(data => res.status(data.status).json(data.data));
        });

        /**
         * @swagger
         * /api/rider/{riderId}:
         *   put:
         *     summary: Update a rider
         *     parameters:
         *       - name: riderId
         *         in: path
         *         description: The ID of the rider to update
         *         required: true
         *         schema:
         *           type: integer
         *     requestBody:
         *       content:
         *         application/json:
         *           schema:
         *             type: object
         *             properties:
         *               firstName:
         *                 type: string
         *               lastName:
         *                 type: string
         *               address:
         *                 type: string
         *               city:
         *                 type: string
         *               stateProvince:
         *                 type: string
         *               zipPostalCode:
         *                 type: number
         *               profilePicture:
         *                 type: string
         *               mobileNumber:
         *                 type: string
         *               countryCode:
         *                 type: string
         *               description:
         *                 type: string
         *               capacity:
         *                 type: number
         *     responses:
         *       200:
         *         description: Returns the updated rider
         */
        this.router.patch("/:riderId", (req: Request, res: Response) => {
            this.riderController.updateRider(parseInt(req.params.riderId as string, 10) as number, req.body as RiderDriverForm).then(data => res.status(data.status).json(data.data));
        });

        /**
         * @swagger
         * /api/rider/import/batch:
         *   post:
         *     summary: Batch import riders
         *     requestBody:
         *       content:
         *         multipart/form-data:
         *           schema:
         *             type: object
         *             properties:
         *               file:
         *                 type: array
         *                 items:
         *                   type: string
         *                 description: The rider data files to import
         *     responses:
         *       200:
         *         description: Returns the result of the batch import
         */
        this.router.post("/import/batch", this.upload.single("file"), (req: Request, res: Response) => {
            this.riderController.batchImportRiders(req.file as Express.Multer.File).then(data => res.status(data.status).json(data.data));
        });

        /**
         * @swagger
         * /api/rider/listbyname:
         *   get:
         *     summary: Get a list of riders by name
         *     parameters:
         *       - name: riderName
         *         in: query
         *         description: The name of the rider to search for
         *         required: true
         *         schema:
         *           type: string
         *       - name: pageNumber
         *         in: query
         *         description: The page number to retrieve
         *         required: true
         *         schema:
         *           type: integer
         *     responses:
         *       200:
         *         description: Returns the list of riders matching the name
         */
        this.router.get("/listbyname", (req: Request, res: Response) => {
            this.riderController.listRidersByName(req.query.riderName as string, parseInt(req.query.pageNumber as string, 10) as number).then(data => res.status(data.status).json(data.data));
        });

        /**
         * @swagger
         * /api/rider/riderpagecount:
         *   get:
         *     summary: Get the page count of riders
         *     parameters:
         *       - name: riderName
         *         in: query
         *         description: The name of the rider to search for
         *         required: true
         *         schema:
         *           type: string
         *     responses:
         *       200:
         *         description: Returns the number of pages for the riders
         */
        this.router.get("/pagecount", (req: Request, res: Response) => {
            this.riderController.getRiderPageCount(req.query.riderName as string).then(data => res.status(data.status).json(data.data));
        });
    }
}

export default RiderRouter;