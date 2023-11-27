import dotenv from "dotenv";
dotenv.config();
import express, { Application, Request, Response } from "express";
import cors from "cors";
import path from "path";
import compression from "compression";
import cookieParser from "cookie-parser";
import { createServer, Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import UserRouter from "./route/user.route";
import SessionRouter from "./route/session.route";
import DBSummaryRouter from "./route/dbsummary.route";
import RiderRouter from "./route/rider.route"
import DriverRouter from "./route/driver.route"
import RiderRouteRouter from "./route/rroute.route"
import DriverRouteRouter from "./route/droute.route"
import { setupSwagger } from "./util/swagger.documentation";
import NodeRouter from "./route/node.route";
import ProcessSocket from "./util/socketProcess.utility";
import RiderRouteNodeRouter from "./route/rrouteNode.route";
import DriverRouteNodeRouter from "./route/drouteNode.route";
import MapRouter from "./route/map.route";
import { AuthMiddleware } from "./middleware/auth.middleware";
import { existsSync, mkdirSync } from "fs";
import { fork } from "child_process";

class App {
    private express: Application;
    private server: Server;
    private io: SocketIOServer;
    private userRouter: UserRouter;
    private sessionRouter: SessionRouter;
    private dbSummaryRouter: DBSummaryRouter;
    private riderRouter: RiderRouter;
    private driverRouter: DriverRouter;
    private riderRouteRouter: RiderRouteRouter;
    private riderRouteNodeRouter: RiderRouteNodeRouter;
    private driverRouteRouter: DriverRouteRouter;
    private driverRouteNodeRouter: DriverRouteNodeRouter;
    private nodeRouter: NodeRouter;
    private mapRouter: MapRouter;

    constructor() {
        this.express = express();
        this.server = createServer(this.express);

        this.io = new SocketIOServer(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });

        ProcessSocket.getInstance(this.io);
        this.userRouter = new UserRouter();
        this.sessionRouter = new SessionRouter();
        this.dbSummaryRouter = new DBSummaryRouter();
        this.riderRouter = new RiderRouter();
        this.driverRouter = new DriverRouter();
        this.riderRouteRouter = new RiderRouteRouter();
        this.driverRouteRouter = new DriverRouteRouter();
        this.riderRouteNodeRouter = new RiderRouteNodeRouter();
        this.driverRouteNodeRouter = new DriverRouteNodeRouter();
        this.nodeRouter = new NodeRouter();
        this.mapRouter = new MapRouter();

        this.setupMiddleWare();
        setupSwagger(this.express);
        this.setupRoutes();
        this.createDirectoryIfNotExists();

        // fork("./util/process/n2nAllCalculation.process.ts", ["create"]);

    }

    private setupMiddleWare(): void {
        this.express.use(cors());
        this.express.use(compression());
        this.express.use(cookieParser());
        this.express.use(express.json({ limit: "50mb" }));
        this.express.use(express.urlencoded({ limit: "50mb", extended: true }));
        if (process.env.IS_PROD === "true") {
            this.express.use(express.static(path.resolve(__dirname, "./public")));
        }
    }

    private setupRoutes(): void {
        this.express.use("/api/user", this.userRouter.getUserRouter());
        this.express.use("/api/session", this.sessionRouter.getSessionRouter());
        this.express.use("/api/summary", AuthMiddleware.ensureAuthenticated, this.dbSummaryRouter.getDBSummaryRouter());

        this.express.use("/api/rider", AuthMiddleware.ensureAuthenticated, this.riderRouter.getRiderRouter());
        this.express.use("/api/rroute", AuthMiddleware.ensureAuthenticated, this.riderRouteRouter.getRiderRouteRouter());
        this.express.use("/api/rroutenode", AuthMiddleware.ensureAuthenticated, this.riderRouteNodeRouter.getRiderRouteNodeRouter());

        this.express.use("/api/driver", AuthMiddleware.ensureAuthenticated, this.driverRouter.getDriverRouter());
        this.express.use("/api/droute", AuthMiddleware.ensureAuthenticated, this.driverRouteRouter.getDriverRouteRouter());
        this.express.use("/api/droutenode", AuthMiddleware.ensureAuthenticated, this.driverRouteNodeRouter.getDriverRouteNodeRouter());

        this.express.use("/api/node", AuthMiddleware.ensureAuthenticated, this.nodeRouter.getNodeRouter());
        this.express.use("/api/map", AuthMiddleware.ensureAuthenticated, this.mapRouter.getMapRouter());

        this.express.get("/api/version", AuthMiddleware.ensureAuthenticated, async (_req: Request, res: Response) => {
            try {
                const appVersion = process.env.VERSION_NUMBER;
                return res.status(200).json({ "versionNumber": appVersion });
            } catch (error) {
                return res.status(500);
            }
        });

        if (process.env.IS_PROD === "true") {
            this.express.get("*", (_req: Request, res: Response) => {
                res.sendFile(path.resolve(__dirname, "./public", "index.html"));
            });
        }
    }

    private stopServer(): void {
        if (this.server) {
            this.server.close(() => {
            });
        }
    }

    public exposeExpress(): Application {
        return this.express;
    }

    public start(): void {
        const port = parseInt(process.env.APP_PORT!);
        this.express.set("port", port);
        this.server.listen(port, () => {
            if (process.env.IS_PROD === "false") {
                const addr = this.server.address();
                const bind = typeof addr === "string" ? `pipe ${addr}` : `port ${addr?.port}`;
                console.log(`Listening on ${bind}`);
            }
        });
    }

    public stop(): void {
        this.stopServer();
    }

    private createDirectoryIfNotExists(): void {
        if (!existsSync("./util/tempFiles")) {
            mkdirSync("./util/tempFiles", { recursive: true });
        }
        if (!existsSync("./util/logs")) {
            mkdirSync("./util/logs", { recursive: true });
        }
    }
}

export default App;