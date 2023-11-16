import { NodeToNode, sequelize } from "../util/db.config"
import { NodeToNodeDto } from "../util/interface.utility";

export class NodeToNodeRepository {
    constructor() {
    }


    async findNodes(whereConditionAttributed: Record<string, any>): Promise<NodeToNodeDto[]> {
        const nodeList: NodeToNode[] = await NodeToNode.findAll(whereConditionAttributed);
        const plainNodeToNodeList: NodeToNodeDto[] = nodeList.map(nodeToNode => nodeToNode.toJSON());
        return plainNodeToNodeList;
    }

    async batchImportNodesToNodes(n2nBatchData: Array<Record<string, any>>): Promise<boolean> {
        const transaction = await sequelize.transaction();
        try {
            await NodeToNode.bulkCreate(n2nBatchData, { ignoreDuplicates: true, validate: true, fields: ["origNodeId", "destNodeId", "distance", "duration"], transaction });
            await transaction.commit();
            return true;
        } catch (error: any) {
            await transaction.rollback();
            return false;
        }
    }
}