import { Session } from "../util/db.config"
import { SessionAttributes } from "../util/interface.utility";

export class SessionRepository {
    constructor() {
    }

    async findSession(whereCondition: Record<string, any>): Promise<SessionAttributes | null> {

        const session: Session | null = await Session.findOne(whereCondition);

        return session?.toJSON() as SessionAttributes ?? null;
    }

    async createSession(sessionToCreate: Record<string, any>, associations: Record<string, any>): Promise<SessionAttributes> {
        const createdSession: Session | null = await Session.create(sessionToCreate, associations);
        return createdSession?.toJSON() as SessionAttributes ?? null;
    }

    async deleteSession(destroyCondition: Record<string, any>): Promise<number> {
        return await Session.destroy(destroyCondition);
    }
}