import { Driver } from "../util/db.config"
import { DriverDto } from "../util/interface.utility";

export class DriverRepository {
    constructor() {
    }

    async createDriver(driverToCreate: Record<string, any>, associations: Record<string, any>): Promise<DriverDto> {
        const createdDriver: Driver | null = await Driver.create(driverToCreate, associations);
        return createdDriver?.toJSON() as DriverDto;
    }

    async findDrivers(whereConditionPaginatedDtod: Record<string, any>): Promise<Array<DriverDto>> {
        const driverList: Array<Driver> = await Driver.findAll(whereConditionPaginatedDtod);
        const plainDriverList: Array<DriverDto> = driverList.map((driver: Driver) => driver.toJSON());
        return plainDriverList;
    }

    async findDriverByPK(driverId: number): Promise<DriverDto | null> {
        const driver: Driver | null = await Driver.findByPk(driverId);

        return driver?.toJSON() as DriverDto ?? driver;
    }

    async updateDriver(driverToUpdate: Record<string, any>, whereCondition: Record<string, any>): Promise<void> {
        await Driver.update(driverToUpdate, { where: whereCondition });
    }

    async batchImportDrivers(driverBatchData: Array<Record<string, any>>): Promise<void> {
        await Driver.bulkCreate(driverBatchData, { validate: true, fields: ["firstName", "lastName", "description", "address", "city", "stateProvince", "zipPostalCode", "capacity"] });
    }

    async countDrivers(whereCondition: Record<string, any>): Promise<number> {
        const driversCount: number = await Driver.count(whereCondition);
        return driversCount;
    }
}