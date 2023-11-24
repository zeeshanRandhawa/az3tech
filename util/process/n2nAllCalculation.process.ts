import { NodeToNodeRepository } from "../../repository/n2n.repository";
import { NodeRepository } from "../../repository/node.repository";
import { NodeDto } from "../interface.utility";
import { getDistanceDurationBetweenNodes } from "../helper.utility";

async function nodesToNodesCalculateDistanceDuration() {

    const operationType: string = process.argv[2];

    const nodeRepository: NodeRepository = new NodeRepository();
    const n2nRepository: NodeToNodeRepository = new NodeToNodeRepository();

    // const nodeId: number = parseInt(process.argv[2] as string, 10);
    // const nodeToCalculate: NodeDto | null = await nodeRepository.findNodeByPK(nodeId, ["nodeId", "long", "lat"]);

    const nodesListCalculteN2N: Array<NodeDto> = await nodeRepository.findNodes({
        attributes: ["nodeId", "long", "lat"],
        where: {
            n2nCalculated: false
        }
    });

    const allNodeList: Array<NodeDto> = await nodeRepository.findNodes({
        attributes: ["nodeId", "long", "lat"],
    });

    for (let [index, nodeToCalculate] of nodesListCalculteN2N.entries()) {
        try {

            let nodeDistDurPair: Array<Record<string, any>> = await calculateDistanceDurationPair(nodeToCalculate!, allNodeList);
            let check: boolean = await n2nRepository.batchImportNodesToNodes(nodeDistDurPair, operationType);

            if (check) {
                await nodeRepository.updateNode({ n2nCalculated: true }, { nodeId: nodeToCalculate.nodeId })

            }

        } catch (error: any) { }
    }
}

async function calculateDistanceDurationPair(node: NodeDto, nodesToCalculate: Array<NodeDto>): Promise<Array<Record<string, any>>> {
    let nodePairDistanceDuration: Array<Record<string, any>> = [];

    await Promise.all(nodesToCalculate.map(async (nodeToCalculate: NodeDto) => {

        let pointAB: Record<string, any> = await getDistanceDurationBetweenNodes({ longitude: node.long, latitude: node.lat }, { longitude: nodeToCalculate.long, latitude: nodeToCalculate.lat });
        nodePairDistanceDuration.push({ origNodeId: node.nodeId, destNodeId: nodeToCalculate.nodeId, distance: pointAB.distance / 1609.34, duration: pointAB.duration / 60 })

        // let pointBA: Record<string, any> = await getDistanceDurationBetweenNodes({ longitude: nodeToCalculate.long, latitude: nodeToCalculate.lat }, { longitude: node.long, latitude: node.lat });
        // nodePairDistanceDuration.push({ origNodeId: nodeToCalculate.nodeId, destNodeId: node.nodeId, distance: pointBA.distance / 1609.34, duration: pointBA.duration / 60 })
    }));

    return nodePairDistanceDuration;
}

nodesToNodesCalculateDistanceDuration()