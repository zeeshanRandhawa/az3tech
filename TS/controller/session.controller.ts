import { SessionService } from "../service/session.service"
import { CustomError } from "../util/interface.utility"


export class SessionController {

    private sessionService: SessionService;

    constructor() {
        this.sessionService = new SessionService();
    }

    async getRoleByToken(sessionToken?: string | undefined): Promise<any> {
        if (!sessionToken || sessionToken.length == 0) {
            return { status: 422, data: { message: "Invalid Data" } };
        }
        try {

            return await this.sessionService.getRoleByToken(sessionToken);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
        }
    }

    async isAuthenticated(sessionToken?: string | undefined): Promise<any> {
        if (!sessionToken || sessionToken.length == 0) {
            return { status: 422, data: { message: "Invalid Data" } };
        }
        try {
            return await this.sessionService.isAuthenticated(sessionToken);
        } catch (error: any) {

            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
        }
    }
}