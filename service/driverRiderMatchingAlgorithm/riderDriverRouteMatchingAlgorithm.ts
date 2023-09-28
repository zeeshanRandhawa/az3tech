// import { findNearestNode, getDriverRoutesBetweenTimeFrame } from "../../util/helper.utility";
// import { CoordinateAttribute, DriverRouteAssociatedNodeAttributes, NodeAttributes } from "../../util/interface.utility"
// import { PrimaryRoute } from "./util.class";

// export class RiderDriverRouteMatchingAlgorithmDefault {


//     private originNode!: NodeAttributes;
//     private destnationNode!: NodeAttributes;
//     private connectingRoutes: Array<PrimaryRoute>;
//     constructor() {
//         this.connectingRoutes = [];
//     }

//     private async findNearestOriginNode(coordinateData: CoordinateAttribute): Promise<void> {
//         this.originNode = (await findNearestNode(coordinateData)).smallestDistanceNode
//     }

//     private async findNearestDestinationNode(coordinateData: CoordinateAttribute): Promise<void> {
//         this.destnationNode = (await findNearestNode(coordinateData)).smallestDistanceNode
//     }

//     async calculatePrimaryRoutesAtDepth0(startDateTimeWindow: string, endDateTimeWindow: string, originCoordinates: CoordinateAttribute, destinationCoordinates: CoordinateAttribute): Promise<any> {

//         await this.findNearestOriginNode(originCoordinates);
//         await this.findNearestDestinationNode(destinationCoordinates);

//         const primaryDriverRoutesUnconfirmedDestination: Array<DriverRouteAssociatedNodeAttributes> = await getDriverRoutesBetweenTimeFrame(startDateTimeWindow, endDateTimeWindow, [this.originNode.nodeId]);

//         // await Promise.all(primaryDriverRoutesUnconfirmedDestination.map(async (primaryDriverRoutesUnconfirmedDestination: DriverRouteAssociatedNodeAttributes) => {
//         //     let tmpPrimaryDriverRoutesUnconfirmedDestination: PrimaryRoute = { ...(primaryDriverRoutesUnconfirmedDestination as any as PrimaryRoute), hasDestination: false, routeNodes: [] };
//         //     this.connectingRoutes.push(tmpPrimaryDriverRoutesUnconfirmedDestination);
//         // }));

//         // console.log(this.connectingRoutes);
//     }
// }