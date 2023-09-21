import multer, { Multer } from "multer";
import { Router, Request, Response, NextFunction } from "express";
import { DriverController } from "../controller/driver.controller";
import { RiderDriverForm } from "../util/interface.utility";

export class SessionRouter {

    private router: Router;
    private driverController: DriverController;

    private upload: Multer;

    constructor() {
        this.upload = multer({ storage: multer.memoryStorage() });

        this.driverController = new DriverController();
        this.router = Router();
        this.initializeRoutes();
    }

    public getDriverRouter(): Router {
        return this.router;
    }

    private initializeRoutes() {

        /**
         * @swagger
         * /api/driver:
         *   get:
         *     summary: Get a list of drivers
         *     parameters:
         *       - name: pageNumber
         *         in: query
         *         description: The page number to retrieve
         *         required: true
         *         schema:
         *           type: integer
         *     responses:
         *       200:
         *         description: Returns the list of drivers
         */
        this.router.get("", (req: Request, res: Response) => {
            this.driverController.listDrivers(parseInt(req.query.pageNumber as string, 10) as number).then(data => res.status(data.status).json(data.data));
        });

        /**
         * @swagger
         * /api/driver:
         *   post:
         *     summary: Create a new driver
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
         *         description: Returns the created driver
         */
        this.router.post("", (req: Request, res: Response) => {
            this.driverController.createDriver(req.body as RiderDriverForm).then(data => res.status(data.status).json(data.data));
        });

        /**
         * @swagger
         * /api/driver/{driverId}:
         *   put:
         *     summary: Update a driver
         *     parameters:
         *       - name: driverId
         *         in: path
         *         description: The ID of the driver to update
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
         *         description: Returns the updated driver
         */
        this.router.patch("/:driverId", (req: Request, res: Response) => {
            this.driverController.updateDriver(parseInt(req.params.driverId as string, 10) as number, req.body as RiderDriverForm).then(data => res.status(data.status).json(data.data));
        });

        /**
         * @swagger
         * /api/driver/import/batch:
         *   post:
         *     summary: Batch import drivers
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
         *                 description: The driver data files to import
         *     responses:
         *       200:
         *         description: Returns the result of the batch import
         */
        this.router.post("/import/batch", this.upload.single("file"), (req: Request, res: Response) => {
            this.driverController.batchImportDrivers(req.file as Express.Multer.File).then(data => res.status(data.status).json(data.data));
        });

        /**
         * @swagger
         * /api/driver/listbyname:
         *   get:
         *     summary: Get a list of drivers by name
         *     parameters:
         *       - name: driverName
         *         in: query
         *         description: The name of the driver to search for
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
         *         description: Returns the list of drivers matching the name
         */
        this.router.get("/listbyname", (req: Request, res: Response) => {
            this.driverController.listDriversByName(req.query.driverName as string, parseInt(req.query.pageNumber as string, 10) as number).then(data => res.status(data.status).json(data.data));
        });

        /**
         * @swagger
         * /api/driver/driverpagecount:
         *   get:
         *     summary: Get the page count of drivers
         *     parameters:
         *       - name: driverName
         *         in: query
         *         description: The name of the driver to search for
         *         required: true
         *         schema:
         *           type: string
         *     responses:
         *       200:
         *         description: Returns the number of pages for the drivers
         */
        this.router.get("/pagecount", (req: Request, res: Response) => {
            this.driverController.getDriverPageCount(req.query.driverName as string).then(data => res.status(data.status).json(data.data));
        });

    }
}

export default SessionRouter;