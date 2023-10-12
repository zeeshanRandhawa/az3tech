import { ChildProcess, fork } from "child_process";
import { SessionService } from "../service/session.service";
import { ProcessListEntry, SessionDto } from "./interface.utility"
import { Server as SocketIOServer, Socket } from "socket.io";
import { SessionController } from "../controller/session.controller";
import { SessionRepository } from "../repository/session.repository";

class ProcessSocket {
    private processSocketList: { [email: string]: ProcessListEntry }
    private io: SocketIOServer;
    private sessionRepository: SessionRepository;
    private static instance: ProcessSocket | null = null;

    private constructor(io: SocketIOServer) {
        this.processSocketList = {}
        this.io = io;
        this.sessionRepository = new SessionRepository();
        this.setupSocketListenerEmitter();
    }

    private setupSocketListenerEmitter(): void {
        this.io.on("connect", (socket: Socket) => {
            socket.on("sessionTokenNode", async (message: string) => {
                const session: SessionDto | null = await this.sessionRepository.findSession({
                    where: {
                        sessionToken: message
                    },
                    include: [{
                        association: "user"
                    }]
                });
                if (session) {
                    if (session!.user!.email.trim().concat("Node") in this.processSocketList) {
                        this.processSocketList[session!.user!.email!.trim().concat("Node")].sockets.push(socket);
                    } else {
                        this.processSocketList[session!.user!.email!.trim().concat("Node")] = { message: "", childProcess: null, opType: "Node", status: "", sockets: [socket] };
                    }
                }
            });
            socket.on("poolStatusNode", async (message) => {
                const session: SessionDto | null = await this.sessionRepository.findSession({
                    where: {
                        sessionToken: message
                    },
                    include: [{
                        association: "user"
                    }]
                });
                if (session) {
                    if (session!.user!.email.trim().concat("Node") in this.processSocketList) {
                        let currentMessage: string = this.processSocketList[session!.user!.email!.trim().concat("Node")].message;
                        socket.emit("uploadStatusNode", { "message": currentMessage })
                    }
                }
            });
            socket.on("sessionTokenDriverRouteBatch", async (message: string) => {
                const session: SessionDto | null = await this.sessionRepository.findSession({
                    where: {
                        sessionToken: message
                    },
                    include: [{
                        association: "user"
                    }]
                });
                if (session) {
                    if (session!.user!.email.trim().concat("DriverRouteBatch") in this.processSocketList) {
                        this.processSocketList[session!.user!.email!.trim().concat("DriverRouteBatch")].sockets.push(socket);
                    } else {
                        this.processSocketList[session!.user!.email!.trim().concat("DriverRouteBatch")] = { message: "", childProcess: null, opType: "DriverRouteBatch", status: "", sockets: [socket] };
                    }
                }
            });
            socket.on("poolStatusDriverRouteBatch", async (message) => {
                const session: SessionDto | null = await this.sessionRepository.findSession({
                    where: {
                        sessionToken: message
                    },
                    include: [{
                        association: "user"
                    }]
                });
                if (session) {
                    if (session!.user!.email.trim().concat("DriverRouteBatch") in this.processSocketList) {
                        let currentMessage: string = this.processSocketList[session!.user!.email!.trim().concat("DriverRouteBatch")].message;
                        socket.emit("uploadStatusDriverRouteBatch", { "message": currentMessage })
                    }
                }
            });
            socket.on("disconnect", () => {
                for (let key in this.processSocketList) {
                    this.processSocketList[key].sockets = this.processSocketList[key].sockets.filter(sckt => sckt.id !== socket.id);
                }
            });
        });
    }

    public forkProcess(processFilePath: string, opType: string, userEmail: string, waypointDistance: number): void {
        try {
            const forkedProcess: ChildProcess = fork(processFilePath, [waypointDistance.toString()]);

            if (userEmail.trim().concat(opType) in this.processSocketList) {
                this.processSocketList[userEmail.trim().concat(opType)].childProcess = forkedProcess;
                this.processSocketList[userEmail.trim().concat(opType)].status = "running"
            } else {
                this.processSocketList[userEmail.trim().concat(opType)] = { message: "", childProcess: forkedProcess, opType: opType, status: "running", sockets: [] };
            }

            forkedProcess.on("close", () => {
                const currentPid: number = forkedProcess.pid!;
                let keyToDelete: string | null = null;
                for (let key in this.processSocketList) {
                    if (this.processSocketList[key].childProcess && this.processSocketList[key].childProcess!.pid === currentPid) {
                        keyToDelete = key;
                        this.processSocketList[key].sockets.forEach((sckt) => {
                            sckt.emit("uploadStatus".concat(opType), { "message": "completed" });
                        });
                    }
                }
                if (keyToDelete) {
                    delete this.processSocketList[keyToDelete];
                }
            });

            forkedProcess.on("message", (message: string) => {
                const currentPid: number = forkedProcess.pid!;
                if (message.split(":")[0] === "status") {
                    for (let key in this.processSocketList) {
                        if (this.processSocketList[key].childProcess && this.processSocketList[key].childProcess!.pid === currentPid) {
                            this.processSocketList[key].sockets.forEach((sckt: Socket) => {
                                sckt.emit("uploadStatus".concat(opType), { "message": message.split(":")[1] });
                            });
                            this.processSocketList[key].message = message.split(":")[1];
                        }
                    }
                }
            });

            forkedProcess.on("error", (err) => {
            });
        } catch (error: any) {
        }
    }

    public async isProcessRunningForToken(sessionToken: string, opType: string): Promise<boolean> {
        let flag: boolean = false;
        try {
            const session: SessionDto | null = await this.sessionRepository.findSession({
                where: {
                    sessionToken: sessionToken
                },
                include: [{
                    association: "user"
                }]
            });
            if (session) {
                for (let key in this.processSocketList) {
                    if (key === session!.user!.email.trim().concat(opType)) {
                        if (this.processSocketList[key].opType === opType && this.processSocketList[key].status !== "complete" && this.processSocketList[key].status !== "error" && this.processSocketList[key].status !== "") {
                            flag = true
                        }
                    }
                }
            }
        } catch (error: any) {
        }
        return flag;
    }

    static getInstance(io: SocketIOServer | null = null): ProcessSocket {
        if (!ProcessSocket.instance) {
            ProcessSocket.instance = new ProcessSocket(io!);
        }
        return ProcessSocket.instance;
    }
}

export default ProcessSocket;