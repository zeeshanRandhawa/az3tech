import { RiderRouteService } from "../service/rroute.service"
import { CustomError, FilterForm } from "../util/interface.utility";


export class RiderRouteController {

    private riderRouteService: RiderRouteService;

    constructor() {
        this.riderRouteService = new RiderRouteService();
    }

    async listRiderRoutes(tagListStr: string | undefined, pageNumber: number): Promise<any> {
        try {
            return await this.riderRouteService.listRiderRoutes(tagListStr, pageNumber);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async listRiderRoutesByRiderId(riderId: number, pageNumber: number): Promise<any> {
        if (!riderId) {
            return { status: 422, data: { message: "Invalid data" } };
        }
        try {
            return await this.riderRouteService.listRiderRoutesByRiderId(riderId, pageNumber);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async deleteRiderRouteById(rrouteId: number): Promise<any> {
        try {
            return await this.riderRouteService.deleteRiderRouteById(rrouteId);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async batchImportRiderRoutes(fileToImport: Express.Multer.File): Promise<any> {
        try {
            if (!fileToImport) {
                throw new CustomError("No file uploaded for batch import", 422)
            }
            if (!(["text/csv", "application/vnd.ms-excel"].includes(fileToImport.mimetype))) {
                throw new CustomError("Unsupported file type", 422)
            }
            return await this.riderRouteService.batchImportRiderRoutes(fileToImport);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async bulkImportRiderRoutes(fileToImport: Express.Multer.File): Promise<any> {
        if (!fileToImport) {
            return { status: 400, data: { message: "No file uploaded for batch import" } }
        }
        if (!(["text/csv", "application/vnd.ms-excel"].includes(fileToImport.mimetype))) {
            return { status: 422, data: { message: "Unsupported file type" } }
        }
        try {
            return await this.riderRouteService.bulkImportRiderRoutes(fileToImport);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async getRiderRouteDistinctTagList(): Promise<any> {
        try {
            return await this.riderRouteService.getRiderRouteDistinctTagList();
        } catch (error: any) {

        }
    }

    async deleteRiderRouteByTags(tagListStr: string | undefined): Promise<any> {
        if (!tagListStr) {
            return { status: 400, data: { message: "Invalid tag list" } }
        }
        try {
            return await this.riderRouteService.deleteRiderRouteByTags(tagListStr);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async getRiderRoutePageCount(tagListStr: string | undefined, riderId: string | undefined): Promise<any> {
        try {
            return await this.riderRouteService.getRiderRoutePageCount(tagListStr, riderId);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async deleteRiderRoutesByFilters(filterFormData: FilterForm, rrouteId: number): Promise<any> {
        const requiredFilters: (keyof FilterForm)[] = ["status", "departureTime",];
        const missingFilters: (keyof FilterForm)[] = requiredFilters.filter((filter) => !(filter in filterFormData));
        if (missingFilters.length > 0) {
            return { status: 422, data: { message: "Invalid Data: Missing filters" } };
        }

        const requiredDepartureTimeProps: (keyof FilterForm["departureTime"])[] = ["start", "end"];
        const missingDepartureTimeProps: (keyof FilterForm["departureTime"])[] = requiredDepartureTimeProps.filter((prop) => !(prop in filterFormData.departureTime));
        if (missingDepartureTimeProps.length > 0) {
            return { status: 422, data: { message: "Invalid Data: Missing departureTime properties" } };
        }
        try {
            return await this.riderRouteService.deleteRiderRoutesByFilters(filterFormData, rrouteId);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async displayRiderRoutesOriginatingFromNodeBetweenTimeFrame(nodeId: number, startOriginDateTime: string | undefined, endOrigindateTime: string | undefined, sessionToken: string | undefined): Promise<any> {

        if (!nodeId || !startOriginDateTime || !endOrigindateTime || (new Date(startOriginDateTime)) > (new Date(endOrigindateTime)) || !sessionToken) {
            return { status: 422, data: { message: "Invalid data" } };
        }
        try {
            return await this.riderRouteService.displayRiderRoutesOriginatingFromNodeBetweenTimeFrame(nodeId, startOriginDateTime, endOrigindateTime, sessionToken);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }
}