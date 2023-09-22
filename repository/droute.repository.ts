import { Transaction } from "sequelize";
import { DriverRoute, sequelize } from "../util/db.config"
import { DriverRouteAttributes } from "../util/interface.utility";

export class DriverRouteRepository {
    constructor() {
    }

    async findDriverRoutes(whereConditionPaginatedAttributed: Record<string, any>): Promise<Array<DriverRouteAttributes>> {
        const driverRouteList: Array<DriverRoute> = await DriverRoute.findAll(whereConditionPaginatedAttributed);
        const plainDriverRouteList: Array<DriverRouteAttributes> = driverRouteList.map(route => route.toJSON());
        return plainDriverRouteList;
    }

    async deleteDriverRoute(destroyCondition: Record<string, any>): Promise<number> {
        return await DriverRoute.destroy(destroyCondition)
    }

    async countDriverRoutes(whereCondition: Record<string, any>): Promise<number> {
        const driverRoutesCount: number = await DriverRoute.count(whereCondition);
        return driverRoutesCount;
    }

    async batchImportDriverRoutes(driverRouteBatchData: Array<Record<string, any>>, transaction: Transaction): Promise<Array<any>> {
        try {
            const createdDriverRouteIds: Array<any> = await DriverRoute.bulkCreate(driverRouteBatchData, {
                // validate: true, fields: ["originNode", "destinationNode", "departureTime", "capacity", "maxWait", "status", "driverId", "drouteDbmTag", "drouteName", "departureFlexibility", "fixedRoute"],
                transaction,
                returning: ["drouteId"]
            });
            return createdDriverRouteIds.map(driverRoute => driverRoute.drouteId);
        } catch (error: any) {
            return [];
        }
    }
}