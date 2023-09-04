import { RiderRoute } from "../util/db.config"
import { RiderRouteAttributes } from "../util/interface.utility";

export class RiderRouteRepository {
    constructor() {
    }

    async findRiderRoutes(whereConditionPaginatedAttributed: Record<string, any>): Promise<RiderRouteAttributes[]> {
        const riderRouteList: RiderRoute[] = await RiderRoute.findAll(whereConditionPaginatedAttributed);
        const plainRiderRouteList: RiderRouteAttributes[] = riderRouteList.map(route => route.toJSON());
        return plainRiderRouteList;
    }

    async deleteRiderRoute(destroyCondition: Record<string, any>): Promise<number> {
        return await RiderRoute.destroy(destroyCondition);
    }

    async batchImportRiderRoutes(riderRouteBatchData: Array<Record<string, any>>): Promise<void> {
        await RiderRoute.bulkCreate(riderRouteBatchData, { validate: true, fields: ["riderId", "originNode", "destinationNode", "departureTime", "timeFlexibility", "status", "rrouteDbmTag"] });
    }

    async countRiderRoutes(whereCondition: Record<string, any>): Promise<number> {
        const riderRoutesCount: number = await RiderRoute.count(whereCondition);
        return riderRoutesCount;
    }
}