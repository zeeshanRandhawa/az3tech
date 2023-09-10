import { DriverRouteNodeService } from "../service/drouteNode.service"
import { CustomError } from "../util/interface.utility";


export class DriverRouteNodeController {

    private driverRouteNodeService: DriverRouteNodeService;

    constructor() {
        this.driverRouteNodeService = new DriverRouteNodeService();
    }

    async listDriverRouteNodesByDriverRouteId(driverRouteId: number, pageNumber: number): Promise<any> {
        if (!driverRouteId) {
            return { status: 422, data: { message: "Invalid data" } };
        }
        try {
            return await this.driverRouteNodeService.listDriverRouteNodesByDriverRouteId(driverRouteId, pageNumber);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async getDriverRouteNodePageCount(driverRouteId: number): Promise<any> {
        try {
            return await this.driverRouteNodeService.getDriverRouteNodePageCount(driverRouteId);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }
}