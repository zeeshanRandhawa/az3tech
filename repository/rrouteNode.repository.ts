import { RiderRouteNode } from "../util/db.config"
import { RiderRouteNodeAttributes } from "../util/interface.utility";

export class RiderRouteNodeRepository {
    constructor() {
    }

    async findRiderRouteNodes(whereConditionPaginatedAttributed: Record<string, any>): Promise<Array<RiderRouteNodeAttributes>> {
        const riderRouteNodeList: RiderRouteNode[] = await RiderRouteNode.findAll(whereConditionPaginatedAttributed);
        const plainRiderRouteNodeList: RiderRouteNodeAttributes[] = riderRouteNodeList.map(riderRouteNode => riderRouteNode.toJSON());
        return plainRiderRouteNodeList;
    }

    async deleteRiderRouteNode(destroyCondition: Record<string, any>): Promise<number> {
        return await RiderRouteNode.destroy(destroyCondition);
    }

    async countRiderRouteNodes(whereCondition: Record<string, any>): Promise<number> {
        const riderRouteNodesCount: number = await RiderRouteNode.count(whereCondition);
        return riderRouteNodesCount;
    }
}