import { DriverService } from "../service/driver.service"
import { CustomError, RiderDriverForm } from "../util/interface.utility"


export class DriverController {

    private driverService: DriverService;

    constructor() {
        this.driverService = new DriverService();
    }

    async listDrivers(pageNumber: number): Promise<any> {
        try {
            return await this.driverService.listDrivers(pageNumber);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
        }
    }

    async createDriver(driverBio: RiderDriverForm): Promise<any> {

        const requiredFields: (keyof RiderDriverForm)[] = ["firstName", "lastName", "description", "address", "city", "stateProvince", "zipPostalCode", "capacity", "profilePicture", "mobileNumber", "countryCode"];
        const missingFields = requiredFields.filter(field => !(field in driverBio));

        if (missingFields.length > 0) {
            return { status: 422, data: { message: "Invalid Data" } };
        }
        if (driverBio.profilePicture && !driverBio.profilePicture.includes("data:image/")) {
            if (driverBio.profilePicture.startsWith("/9j/")) {
                driverBio.profilePicture = "data:image/jpeg;base64,".concat(driverBio.profilePicture);
            } else {
                driverBio.profilePicture = "data:image/png;base64,".concat(driverBio.profilePicture);
            }
        }
        try {
            return await this.driverService.createDriver(driverBio);
        } catch (error: any) {
            return { status: 500, data: { message: error.message } };
        }
    }

    async updateDriver(driverId: number, driverBio: RiderDriverForm): Promise<any> {
        const requiredFields: (keyof RiderDriverForm)[] = ["firstName", "lastName", "description", "address", "city", "stateProvince", "zipPostalCode", "capacity", "profilePicture"];
        const missingFields = requiredFields.filter(field => !(field in driverBio));

        if (missingFields.length > 0) {
            return { status: 422, data: { message: "Invalid Data" } };
        }
        if (driverBio.profilePicture && !driverBio.profilePicture.includes("data:image/")) {
            if (driverBio.profilePicture.startsWith("/9j/")) {
                driverBio.profilePicture = "data:image/jpeg;base64,".concat(driverBio.profilePicture);
            } else {
                driverBio.profilePicture = "data:image/png;base64,".concat(driverBio.profilePicture);
            }
        }
        try {
            return await this.driverService.updateDriver(driverId, driverBio);
        } catch (error: any) {
            if (error instanceof (CustomError)) {
                return { status: error.statusCode, data: { message: error.message } };
            }

        }
    }

    async batchImportDrivers(fileToImport: Express.Multer.File): Promise<any> {
        if (!fileToImport) {
            return { status: 400, data: { message: "No file uploaded for batch import" } }
        }
        if (!(['text/csv', 'application/vnd.ms-excel'].includes(fileToImport.mimetype))) {
            return { status: 422, data: { message: "Unsupported file type" } }
        }
        try {
            return await this.driverService.batchImportDrivers(fileToImport);
        } catch (error: any) {
            if (error instanceof (CustomError)) {
                return { status: error.statusCode, data: { message: error.message } };
            }
        }
    }

    async listDriversByName(driverName: string, pageNumber: number): Promise<any> {
        if (!driverName) {
            return { status: 400, data: { messafe: "Invalid search parameters" } };
        }
        try {
            return await this.driverService.listDriversByName(driverName, pageNumber);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
        }
    }

    async getDriverPageCount(driverName: string): Promise<any> {
        try {
            return await this.driverService.getDriverPageCount(driverName);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
        }
    }
}