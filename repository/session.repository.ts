import { Session } from "../util/db.config"
import { SessionDto } from "../util/interface.utility";

export class SessionRepository {
    constructor() {
    }

    async findSession(whereCondition: Record<string, any>): Promise<SessionDto | null> {

        const session: Session | null = await Session.findOne(whereCondition);

        return session?.toJSON() as SessionDto ?? null;
    }

    async createSession(sessionToCreate: Record<string, any>, associations: Record<string, any>): Promise<SessionDto> {
        const createdSession: Session | null = await Session.create(sessionToCreate, associations);
        return createdSession?.toJSON() as SessionDto ?? null;
    }

    async deleteSession(destroyCondition: Record<string, any>): Promise<number> {
        return await Session.destroy(destroyCondition);
    }
}