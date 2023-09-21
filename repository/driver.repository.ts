import { Driver } from "../util/db.config"
import { DriverAttributes } from "../util/interface.utility";

export class DriverRepository {
    constructor() {
    }

    async createDriver(driverToCreate: Record<string, any>, associations: Record<string, any>): Promise<DriverAttributes> {
        const createdDriver: Driver | null = await Driver.create(driverToCreate, associations);
        return createdDriver?.toJSON() as DriverAttributes;
    }

    async findDrivers(whereConditionPaginatedAttributed: Record<string, any>): Promise<Array<DriverAttributes>> {
        const driverList: Array<Driver> = await Driver.findAll(whereConditionPaginatedAttributed);
        const plainDriverList: Array<DriverAttributes> = driverList.map((driver: Driver) => driver.toJSON());
        return plainDriverList;
    }

    async findDriverByPK(driverId: number): Promise<DriverAttributes | null> {
        const driver: Driver | null = await Driver.findByPk(driverId);

        return driver?.toJSON() as DriverAttributes ?? driver;
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