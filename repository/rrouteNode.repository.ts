import { RiderRouteNode } from "../util/db.config"
import { RiderRouteNodeDto } from "../util/interface.utility";

export class RiderRouteNodeRepository {
    constructor() {
    }

    async findRiderRouteNodes(whereConditionPaginatedDtod: Record<string, any>): Promise<Array<RiderRouteNodeDto>> {
        const riderRouteNodeList: RiderRouteNode[] = await RiderRouteNode.findAll(whereConditionPaginatedDtod);
        const plainRiderRouteNodeList: RiderRouteNodeDto[] = riderRouteNodeList.map(riderRouteNode => riderRouteNode.toJSON());
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