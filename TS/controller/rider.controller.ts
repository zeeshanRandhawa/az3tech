import { RiderService } from "../service/rider.service"
import { CustomError, RiderDriverForm } from "../util/interface.utility"


export class RiderController {

    private riderService: RiderService;

    constructor() {
        this.riderService = new RiderService();
    }

    async listRiders(pageNumber: number): Promise<any> {
        try {
            return await this.riderService.listRiders(pageNumber);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
        }
    }

    async createRider(riderBio: RiderDriverForm): Promise<any> {

        const requiredFields: (keyof RiderDriverForm)[] = ["firstName", "lastName", "address", "city", "stateProvince", "zipPostalCode", "profilePicture", "mobileNumber", "countryCode"];
        const missingFields = requiredFields.filter(field => !(field in riderBio));

        if (missingFields.length > 0) {
            return { status: 422, data: { message: "Invalid Data" } };
        }
        if (riderBio.profilePicture && !riderBio.profilePicture.includes("data:image/")) {
            if (riderBio.profilePicture.startsWith("/9j/")) {
                riderBio.profilePicture = "data:image/jpeg;base64,".concat(riderBio.profilePicture);
            } else {
                riderBio.profilePicture = "data:image/png;base64,".concat(riderBio.profilePicture);
            }
        }
        try {
            return await this.riderService.createRider(riderBio);
        } catch (error: any) {
            return { status: 500, data: { message: error.message } };
        }
    }

    async updateRider(riderId: number, riderBio: RiderDriverForm): Promise<any> {
        const requiredFields: (keyof RiderDriverForm)[] = ["firstName", "lastName", "address", "city", "stateProvince", "zipPostalCode", "profilePicture"];
        const missingFields = requiredFields.filter(field => !(field in riderBio));

        if (missingFields.length > 0) {
            return { status: 422, data: { message: "Invalid Data" } };
        }
        if (riderBio.profilePicture && !riderBio.profilePicture.includes("data:image/")) {
            if (riderBio.profilePicture.startsWith("/9j/")) {
                riderBio.profilePicture = "data:image/jpeg;base64,".concat(riderBio.profilePicture);
            } else {
                riderBio.profilePicture = "data:image/png;base64,".concat(riderBio.profilePicture);
            }
        }
        try {
            return await this.riderService.updateRider(riderId, riderBio);
        } catch (error: any) {
            if (error instanceof (CustomError)) {
                return { status: error.statusCode, data: { message: error.message } };
            }

        }
    }

    async batchImportRiders(fileToImport: Express.Multer.File): Promise<any> {
        if (!fileToImport) {
            return { status: 400, data: { message: "No file uploaded for batch import" } }
        }
        if (!(['text/csv', 'application/vnd.ms-excel'].includes(fileToImport.mimetype))) {
            return { status: 422, data: { message: "Unsupported file type" } }
        }
        try {
            return await this.riderService.batchImportRiders(fileToImport);
        } catch (error: any) {
            if (error instanceof (CustomError)) {
                return { status: error.statusCode, data: { message: error.message } };
            }
        }
    }

    async listRidersByName(riderName: string, pageNumber: number): Promise<any> {
        if (!riderName) {
            return { status: 400, data: { messafe: "Invalid search parameters" } };
        }
        try {
            return await this.riderService.listRidersByName(riderName, pageNumber);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
        }
    }

    async getRiderPageCount(riderName: string): Promise<any> {
        try {
            return await this.riderService.getRiderPageCount(riderName);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
        }
    }
}