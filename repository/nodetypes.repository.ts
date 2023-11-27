import { NodeType, sequelize } from "../util/db.config"
import { NodeTypeDto } from "../util/interface.utility";

export class NodeTypeRepository {
    constructor() {
    }

    async findNodeTypes(whereConditionPaginated: Record<string, any>): Promise<NodeTypeDto[]> {
        const nodeTypeList: NodeType[] = await NodeType.findAll(whereConditionPaginated);
        const plainNodeTypeList: NodeTypeDto[] = nodeTypeList.map(nodeType => nodeType.toJSON());
        return plainNodeTypeList;
    }

    async countNodeTypes(whereCondition: Record<string, any>): Promise<number> {
        const nodeTypesCount: number = await NodeType.count(whereCondition);
        return nodeTypesCount;
    }

    async createNodeType(nodeTypeToCreate: Record<string, any>, associations: Record<string, any>): Promise<NodeTypeDto> {
        const createdNodeType: NodeType | null = await NodeType.create(nodeTypeToCreate, associations);
        return createdNodeType as unknown as NodeTypeDto;
    }
}