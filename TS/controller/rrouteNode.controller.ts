import { RiderRouteNodeService } from "../service/rrouteNode.service"
import { CustomError } from "../util/interface.utility";


export class RiderRouteNodeController {

    private riderRouteNodeService: RiderRouteNodeService;

    constructor() {
        this.riderRouteNodeService = new RiderRouteNodeService();
    }

    async listRiderRouteNodesByRiderRouteId(riderRouteId: number, pageNumber: number): Promise<any> {
        if (!riderRouteId) {
            return { status: 422, data: { message: "Invalid data" } };
        }
        try {
            return await this.riderRouteNodeService.listRiderRouteNodesByRiderRouteId(riderRouteId, pageNumber);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
        }
    }

    async getRiderRouteNodePageCount(riderRouteId: number): Promise<any> {
        try {
            return await this.riderRouteNodeService.getRiderRouteNodePageCount(riderRouteId);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
        }
    }
}