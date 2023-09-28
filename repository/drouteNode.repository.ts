import { DriverRouteNode, sequelize } from "../util/db.config"
import { DriverRouteNodeAssocitedAttributes } from "../util/interface.utility";
import { Transaction } from "sequelize"

export class DriverRouteNodeRepository {
    constructor() {
    }

    async createDriverRouteNode(driverRouteNodeToCreate: Record<string, any>, associations: Record<string, any>): Promise<DriverRouteNodeAssocitedAttributes> {
        const createdDriverRouteNode: DriverRouteNode | null = await DriverRouteNode.create(driverRouteNodeToCreate, associations);
        return createdDriverRouteNode?.toJSON() as DriverRouteNodeAssocitedAttributes ?? null;
    }

    async findDriverRouteNodes(whereConditionPaginatedAttributed: Record<string, any>): Promise<DriverRouteNodeAssocitedAttributes[]> {
        const driverRouteNodeList: DriverRouteNode[] = await DriverRouteNode.findAll(whereConditionPaginatedAttributed);

        const plainDriverRouteNodeList: DriverRouteNodeAssocitedAttributes[] = driverRouteNodeList.map(routeNode => routeNode.toJSON());
        return plainDriverRouteNodeList;
    }

    async deleteDriverRouteNode(destroyCondition: Record<string, any>): Promise<number> {
        return await DriverRouteNode.destroy(destroyCondition);
    }

    async countDriverRouteNodes(whereCondition: Record<string, any>): Promise<number> {
        const driverRouteNodesCount: number = await DriverRouteNode.count(whereCondition);
        return driverRouteNodesCount;
    }

    async batchImportDriverRouteNodes(driverRouteNodeBatchData: Array<Record<string, any>>, transaction: Transaction): Promise<Array<any>> {
        try {
            const createdDriverRouteNodesIds: Array<any> = await DriverRouteNode.bulkCreate(driverRouteNodeBatchData, {
                // validate: true, fields: ["drouteId", "outbDriverId", "nodeId", "arrivalTime", "departureTime", "maxWait", "rank", "capacity", "capacityUsed", "cumDistance", "cumTime", "status"],
                transaction,
                returning: ["drouteId"]
            });
            return createdDriverRouteNodesIds.map(driverRouteNode => driverRouteNode.drouteId);
        } catch (error: any) {
            return [];
        }
    }
}