import { Rider } from "../util/db.config"
import { RiderDto } from "../util/interface.utility";

export class RiderRepository {
    constructor() {
    }

    async createRider(riderToCreate: Record<string, any>, associations: Record<string, any>): Promise<RiderDto> {
        const createdRider: Rider | null = await Rider.create(riderToCreate, associations);
        return createdRider?.toJSON() as RiderDto ?? null;
    }

    async findRiders(whereConditionPaginatedDtod: Record<string, any>): Promise<Array<RiderDto>> {
        const riderList: Rider[] = await Rider.findAll(whereConditionPaginatedDtod);
        const plainNodeList: RiderDto[] = riderList.map(rider => rider.toJSON());
        return plainNodeList;
    }

    async findRiderByPK(riderId: number): Promise<RiderDto | null> {
        const rider: Rider | null = await Rider.findByPk(riderId);
        return rider?.toJSON() as RiderDto ?? null;
    }

    async updateRider(riderToUpdate: Record<string, any>, whereCondition: Record<string, any>): Promise<void> {
        await Rider.update(riderToUpdate, { where: whereCondition });
    }

    async batchImportRiders(riderBatchData: Array<Record<string, any>>): Promise<void> {
        await Rider.bulkCreate(riderBatchData, { validate: true, fields: ["firstName", "lastName", "address", "city", "stateProvince", "zipPostalCode"] });
    }

    async countRiders(whereCondition: Record<string, any>): Promise<number> {
        const ridersCount: number = await Rider.count(whereCondition);
        return ridersCount;
    }
}