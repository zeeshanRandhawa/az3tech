import { Node, sequelize } from "../util/db.config"
import { NodeAttributes } from "../util/interface.utility";

export class NodeRepository {
    constructor() {
    }

    async createNode(nodeToCreate: Record<string, any>, associations: Record<string, any>): Promise<NodeAttributes> {
        const createdNode: Node | null = await Node.create(nodeToCreate, associations);
        return createdNode as unknown as NodeAttributes;
    }

    async findNodes(whereConditionPaginatedAttributed: Record<string, any>): Promise<NodeAttributes[]> {
        const nodeList: Node[] = await Node.findAll(whereConditionPaginatedAttributed);
        const plainNodeList: NodeAttributes[] = nodeList.map(node => node.toJSON());
        return plainNodeList;
    }

    async findNodeByPK(nodeId: number): Promise<NodeAttributes | null> {
        const node: Node | null = await Node.findByPk(nodeId);
        return node?.toJSON() as NodeAttributes ?? null;
    }

    async updateNode(nodeToUpdate: Record<string, any>, whereCondition: Record<string, any>): Promise<void> {
        await Node.update(nodeToUpdate, { where: whereCondition });
    }

    async countNodes(whereCondition: Record<string, any>): Promise<number> {
        const nodesCount: number = await Node.count(whereCondition);
        return nodesCount;
    }

    async deleteNode(destroyCondition: Record<string, any>): Promise<number> {
        return await Node.destroy(destroyCondition);
    }

    async findDistinctGroupByAttributed(distinctGroupByConditionAttributed: Record<string, any>): Promise<Array<NodeAttributes>> {
        const distinctList: Array<Node> = await Node.findAll(distinctGroupByConditionAttributed);
        const plainNodeDistinctList: NodeAttributes[] = distinctList.map(distinctNode => distinctNode.toJSON());
        return plainNodeDistinctList;
    }

    async batchImportNodes(nodeBatchData: Array<Record<string, any>>): Promise<boolean> {
        const transaction = await sequelize.transaction();
        try {
            await Node.bulkCreate(nodeBatchData, { validate: true, fields: ["location", "description", "address", "city", "stateProvince", "zipPostalCode", "transitTime", "lat", "long"], transaction });
            await transaction.commit();
            return true;
        } catch (error: any) {
            await transaction.rollback();
            return false;
        }
    }
}