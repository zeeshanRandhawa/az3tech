import moment from "moment-timezone";
import { DriverRouteService } from "../service/droute.service"
import { CustomError, FilterForm } from "../util/interface.utility";


export class DriverRouteController {

    private driverRouteService: DriverRouteService;

    constructor() {
        this.driverRouteService = new DriverRouteService();
    }

    async listDriverRoutes(tagListStr: string | undefined, pageNumber: number): Promise<any> {
        try {
            return await this.driverRouteService.listDriverRoutes(tagListStr, pageNumber);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async listDriverRoutesByDriverId(driverId: number, pageNumber: number): Promise<any> {
        if (!driverId) {
            return { status: 422, data: { message: "Invalid data" } };
        }
        try {
            return await this.driverRouteService.listDriverRoutesByDriverId(driverId, pageNumber);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async deleteDriverRouteById(drouteId: number): Promise<any> {
        try {
            return await this.driverRouteService.deleteDriverRouteById(drouteId);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async batchImportDriverRoutes(fileToImport: Express.Multer.File, sessionToken: string): Promise<any> {
        if (!fileToImport) {
            return { status: 400, data: { message: "No file uploaded for batch import" } }
        }
        if (!(["text/csv", "application/vnd.ms-excel"].includes(fileToImport.mimetype))) {
            return { status: 422, data: { message: "Unsupported file type" } }
        }
        try {
            return await this.driverRouteService.batchImportDriverRoutes(fileToImport, sessionToken);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async transitImportDriverRoutes(fileToImport: Express.Multer.File, scheduledWeekdays: string | undefined, scheduledStartDate: string | undefined, scheduledEndDate: string | undefined, sessionToken: string): Promise<any> {
        if (!scheduledWeekdays && (!scheduledStartDate && !scheduledEndDate)) {
            return { status: 422, data: { message: "Invalid data" } }
        }
        if (!fileToImport) {
            return { status: 400, data: { message: "No file uploaded for batch import" } }
        }
        if (!(["text/csv", "application/vnd.ms-excel"].includes(fileToImport.mimetype))) {
            return { status: 422, data: { message: "Unsupported file type" } }
        }
        try {
            return await this.driverRouteService.transitImportDriverRoutes(fileToImport, scheduledWeekdays!, scheduledStartDate!, scheduledEndDate!, sessionToken);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async getDriverRouteDistinctTagList(): Promise<any> {
        try {
            return await this.driverRouteService.getDriverRouteDistinctTagList();
        } catch (error: any) {

        }
    }

    async deleteDriverRouteByTags(tagListStr: string | undefined): Promise<any> {
        if (!tagListStr) {
            return { status: 400, data: { message: "Invalid tag list" } }
        }
        try {
            return await this.driverRouteService.deleteDriverRouteByTags(tagListStr);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async getDriverRoutePageCount(tagListStr: string | undefined, driverId: string | undefined): Promise<any> {
        try {
            return await this.driverRouteService.getDriverRoutePageCount(tagListStr, driverId);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async deleteDriverRoutesByFilters(filterFormData: FilterForm, driverId: number): Promise<any> {

        const requiredFilters: (keyof FilterForm)[] = ["status", "fixedRoute", "maxWait", "capacity", "departureTime",];
        const missingFilters: (keyof FilterForm)[] = requiredFilters.filter((prop) => !(prop in filterFormData));
        if (missingFilters.length > 0) {
            return { status: 422, data: { message: "Invalid Data: Missing filters" } };
        }

        const requiredDepartureTimeProps: (keyof FilterForm["departureTime"])[] = ["start", "end"];
        const missingDepartureTimeProps: (keyof FilterForm["departureTime"])[] = requiredDepartureTimeProps.filter((prop) => !(prop in filterFormData.departureTime));
        if (missingDepartureTimeProps.length > 0) {
            return { status: 422, data: { message: "Invalid Data: Missing departureTime properties" } };
        }
        try {
            return await this.driverRouteService.deleteDriverRoutesByFilters(filterFormData, driverId);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async listLogFileNames(): Promise<any> {
        try {
            return await this.driverRouteService.listLogFileNames();
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async deleteLogByName(fileName: string | undefined): Promise<any> {
        if (!fileName) {
            return { status: 422, data: { message: "Invalid file name" } };
        }
        try {
            return await this.driverRouteService.deleteLogByName(fileName);

        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async downloadLogFiles(fileName: string | undefined): Promise<any> {
        if (!fileName) {
            return { status: 422, data: { message: "Invalid file name" } };
        }
        try {
            return await this.driverRouteService.downloadLogFiles(fileName);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };

            }
        }
    }

    async displayDriverRoutesAtNodeBetweenTimeFrame(nodeId: number, departureDateTimeWindow: string | undefined, departureFlexibility: number, sessionToken: string | undefined): Promise<any> {

        if (!nodeId || !departureDateTimeWindow || !departureFlexibility
        ) {
            return { status: 422, data: { message: "Invalid data" } };
        }
        try {
            return await this.driverRouteService.displayDriverRoutesAtNodeBetweenTimeFrame(nodeId, departureDateTimeWindow, departureFlexibility, sessionToken!);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async displayDriverRouteById(drouteId: number): Promise<any> {
        if (!drouteId) {
            return { status: 422, data: { message: "Invalid data" } };
        }
        try {
            return await this.driverRouteService.displayDriverRouteById(drouteId);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async findMatchingDriverRoutes(originLatitude: number, originLongitude: number, destinationLatitude: number, destinationLongitude: number, departureTime: string, departureFlexibility: number, sessionToken: string | undefined, requestType: string): Promise<any> {
        try {
            return await this.driverRouteService.findMatchingDriverRoutes(
                { latitude: originLatitude, longitude: originLongitude },
                { latitude: destinationLatitude, longitude: destinationLongitude },
                departureTime, departureFlexibility, sessionToken, requestType
            );
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }


}