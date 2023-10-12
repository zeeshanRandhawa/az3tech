import { SessionRepository } from "../repository/session.repository";
import { Op, fn } from "sequelize";
import { CustomError, SessionDto } from "../util/interface.utility";

export class SessionService {

    private sessionRepository: SessionRepository;

    constructor() {
        this.sessionRepository = new SessionRepository();
    }

    async createSession(sessionToCreate: Record<string, any>, associations: Record<string, any>): Promise<void> {
        await this.sessionRepository.createSession(sessionToCreate, associations);

    }

    async destroyExpiredSessions(): Promise<void> {
        const destroyCondition: Record<string, any> = {
            where: {
                sessionExpireTimestamp: {
                    [Op.lt]: new Date()
                }
            }
        };

        await this.sessionRepository.deleteSession(destroyCondition);
    }

    async getRoleByToken(sessionToken?: string): Promise<Record<string, any>> {
        const session: SessionDto | null = await this.sessionRepository.findSession({
            where: {
                sessionToken: sessionToken
            },
            include: [{
                association: "user",
                include: [{
                    association: "role"
                }]
            }]
        });
        if (session && session.user?.role) {
            return { status: 200, data: { currentRole: session?.user?.role?.roleType.trim() } };
        }
        throw new CustomError("Session not found", 401);
    }

    async isAuthenticated(sessionToken?: string): Promise<Record<string, any>> {
        const session: SessionDto | null = await this.sessionRepository.findSession({
            where: {
                sessionToken: sessionToken
            }
        });
        if (session) {
            return { status: 200, data: { isAuthenticated: true } };
        }
        return { status: 403, data: { isAuthenticated: false } };
    }

    async getEmailByToken(sessionToken: string): Promise<Record<string, any>> {
        const session: SessionDto | null = await this.sessionRepository.findSession({
            where: {
                sessionToken: sessionToken
            },
            include: [{
                association: "user"
            }]
        });
        if (session) {
            return { status: 200, data: { email: session?.user?.email.trim() } };
        }
        throw new CustomError("Session not found", 401);
    }
}