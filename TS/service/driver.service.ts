import { Op, literal } from "sequelize";
import { DriverRepository } from "../repository/driver.repository";
import { isValidFileHeader, prepareBatchBulkImportData } from "../util/helper.utility";
import { CustomError, DriverAttributes, RiderDriverForm } from "../util/interface.utility";

export class DriverService {

    private driverRepository: DriverRepository;
    constructor() {
        this.driverRepository = new DriverRepository();
    }

    async listDrivers(pageNumber: number): Promise<any> {
        const driverList: DriverAttributes[] = await this.driverRepository.findDrivers(
            {
                order: [["driverId", "ASC"]],
                limit: 10,
                offset: (pageNumber - 1) * 10,
            });

        if (driverList.length < 1) {
            throw new CustomError("No Driver Found", 404);
        }
        return { status: 200, data: { drivers: driverList } };
    }

    async createDriver(driverBio: RiderDriverForm): Promise<Record<string, any>> {
        await this.driverRepository.createDriver({
            firstName: driverBio.firstName,
            lastName: driverBio.lastName,
            description: driverBio.description,
            address: driverBio.address,
            city: driverBio.city,
            stateProvince: driverBio.stateProvince,
            zipPostalCode: driverBio.zipPostalCode,
            capacity: driverBio.capacity,
            profilePicture: driverBio.profilePicture,
            phoneNumber: driverBio.countryCode && driverBio.mobileNumber ? driverBio.countryCode.trim().concat(driverBio.mobileNumber.trim()) : null
        }, {
            fields: ["firstName", "lastName", "description", "address", "city", "stateProvince", "zipPostalCode", "capacity", "profilePicture", "phoneNumber"]
        });

        return { status: 201, data: { message: "Driver Created Successfully" } }
    }

    async updateDriver(driverId: number, driverBio: RiderDriverForm): Promise<any> {
        const driver: DriverAttributes | null = await this.driverRepository.findDriverByPK(driverId);

        if (!driver) {
            throw new CustomError("Driver does not exist", 404);
        }

        await this.driverRepository.updateDriver({
            firstName: driverBio.firstName,
            lastName: driverBio.lastName,
            address: driverBio.address,
            city: driverBio.city,
            stateProvince: driverBio.stateProvince,
            zipPostalCode: driverBio.zipPostalCode,
            profilePicture: driverBio.profilePicture,
            capacity: driverBio.capacity,
            description: driverBio.description
        }, {
            driverId: driverId
        });

        return { status: 200, data: { message: "Driver Updated Successfully" } }
    }

    async batchImportDrivers(fileToImport: Express.Multer.File): Promise<Record<string, any>> {

        if (!isValidFileHeader(fileToImport.buffer, ["First Name", "Last Name", "Description", "Address", "City", "State Province", "Zip Postal Code", "Capacity"])) {
            throw new CustomError("Invalid columns or column length", 422);
        }
        const driverBatchData: Array<Record<string, any>> = prepareBatchBulkImportData(fileToImport.buffer, ["firstName", "lastName", "description", "address", "city", "stateProvince", "zipPostalCode", "capacity"]);

        await this.driverRepository.batchImportDrivers(driverBatchData);

        return { status: 200, data: { message: "Drivers data successfully imported" } };
    }

    async listDriversByName(driverName: string, pageNumber: number): Promise<Record<string, any>> {
        const driverList: DriverAttributes[] = await this.driverRepository.findDrivers({
            where: {
                [Op.or]: [
                    { firstName: { [Op.iLike]: `%${driverName}%` } },
                    { lastName: { [Op.iLike]: `%${driverName}%` } },
                    literal(`CONCAT(first_name, ' ', last_name) ILIKE '%${driverName}%'`)
                ]
            },
            order: [["driverId", "ASC"]],
            limit: 10,
            offset: (pageNumber - 1) * 10,
        });

        if (driverList.length < 1) {
            throw new CustomError("No Driver Found", 404);
        }
        return { status: 200, data: { drivers: driverList } };
    }

    async getDriverPageCount(driverName: string): Promise<Record<string, any>> {
        let driversCount: number;

        if (!driverName) {
            driversCount = await this.driverRepository.countDrivers({});
        } else {
            driversCount = await this.driverRepository.countDrivers({
                where: {
                    [Op.or]: [
                        { firstName: { [Op.iLike]: `%${driverName}%` } },
                        { lastName: { [Op.iLike]: `%${driverName}%` } },
                        literal(`CONCAT(first_name, ' ', last_name) ILIKE '%${driverName}%'`)
                    ]
                }
            });
        }
        return { status: 200, data: { driversCount: Math.ceil(driversCount) } };
    }
}