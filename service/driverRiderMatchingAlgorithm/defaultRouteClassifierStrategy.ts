import { findNearestNode, getDriverRoutesBetweenTimeFrame } from "../../util/helper.utility";
import { CoordinateAttribute, DriverRouteAssociatedNodeAttributes, DriverRouteNodeAssocitedAttributes, NodeAttributes } from "../../util/interface.utility";
import { RouteClassifierStrategy } from "./routeClassifierStarategy.class";

export class DefaultRouteClassifierStrategy extends RouteClassifierStrategy {
    constructor() {
        super();
    }

    async findNearestDestinationNode(coordinateData: CoordinateAttribute): Promise<NodeAttributes> {
        return (await findNearestNode(coordinateData)).smallestDistanceNode;
    }

    async findNearestOriginNode(coordinateData: CoordinateAttribute): Promise<NodeAttributes> {
        return (await findNearestNode(coordinateData)).smallestDistanceNode;
    }

    async findRoutesPassingAtNode(startDateTimeWindow: string, endDateTimeWindow: string, nodeId: number): Promise<any> {
        const passingRoutesAtNode: Array<DriverRouteAssociatedNodeAttributes> = await getDriverRoutesBetweenTimeFrame(startDateTimeWindow, endDateTimeWindow, [nodeId]);

        await Promise.all(passingRoutesAtNode.map(async (passingRoute: DriverRouteAssociatedNodeAttributes) => {
            let rank: number = Infinity;
            await Promise.all(passingRoute.drouteNodes!.map(async (drouteNode: DriverRouteNodeAssocitedAttributes) => {
                if (drouteNode.nodeId === nodeId) {
                    rank = drouteNode.rank ?? Infinity;
                }
            }));
            if (rank !== Infinity) {
                passingRoute.drouteNodes = passingRoute.drouteNodes?.filter((dRouteNode: DriverRouteNodeAssocitedAttributes) => {
                    dRouteNode.rank! > rank;
                });
            }
        }))
        console.log(passingRoutesAtNode);

    }
}