import moment from "moment";
import { findNearestNode, getDriverRoutesBetweenTimeFrame } from "../../util/helper.utility";
import { CoordinateAttribute, DriverRouteAssociatedNodeAttributes, DriverRouteNodeAssocitedAttributes, NodeAttributes } from "../../util/interface.utility";
import { RouteClassifierStrategy } from "./routeClassifierStarategy.class";
import { ClassifiedRoute, RouteClassification } from "./util.class";

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

    async findRoutesPassingAtNode(arrivalDepartureDateTime: string, departureFlexibility: number, nodeId: number, routeClassification: RouteClassification, destnationNodeId: number): Promise<Array<ClassifiedRoute>> {

        let dateTimeStartWindow: string = moment(arrivalDepartureDateTime, "YYYY-MM-DD HH:mm").clone().subtract(departureFlexibility, "minutes").utcOffset(0, true).format("YYYY-MM-DD HH:mm:ss[Z]");
        let dateTimeEndWindow: string = moment(arrivalDepartureDateTime, "YYYY-MM-DD HH:mm").clone().add(departureFlexibility, "minutes").utcOffset(0, true).format("YYYY-MM-DD HH:mm:ss[Z]");


        const passingRoutesAtNode: Array<DriverRouteAssociatedNodeAttributes> = await getDriverRoutesBetweenTimeFrame(dateTimeStartWindow, dateTimeEndWindow, [nodeId]);

        const passingRoutesAtNodeClassified: Array<ClassifiedRoute> = await Promise.all(passingRoutesAtNode.map(async (passingRoute: DriverRouteAssociatedNodeAttributes) => {
            let hasDestination: boolean = false
            let rank: number = Infinity;
            await Promise.all(passingRoute.drouteNodes!.map(async (drouteNode: DriverRouteNodeAssocitedAttributes) => {
                if (drouteNode.nodeId === nodeId) {
                    rank = drouteNode.rank ?? Infinity;
                }
            }));
            if (rank !== Infinity) {
                passingRoute.drouteNodes = passingRoute.drouteNodes?.filter((dRouteNode: DriverRouteNodeAssocitedAttributes) => {
                    if (dRouteNode.rank! > rank && dRouteNode.nodeId === destnationNodeId) {
                        hasDestination = true;
                    }
                    return dRouteNode.rank! >= rank;
                });
            }
            return new ClassifiedRoute(passingRoute, routeClassification, hasDestination);
        }));

        return passingRoutesAtNodeClassified;
    }
}