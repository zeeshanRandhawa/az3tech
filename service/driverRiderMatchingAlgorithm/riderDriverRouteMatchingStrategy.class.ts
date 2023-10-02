import { findNearestNode, getDriverRoutesBetweenTimeFrame } from "../../util/helper.utility";
import { CoordinateAttribute, DriverRouteAssociatedNodeAttributes, NodeAttributes } from "../../util/interface.utility"
import { DefaultRouteClassifierStrategy } from "./defaultRouteClassifierStrategy";
import { RouteClassifierStrategy } from "./routeClassifierStarategy.class";
import { ClassifiedRoute } from "./util.class";

export class RiderDriverRouteMatchingStrategy {


    private originNode!: NodeAttributes;
    private destnationNode!: NodeAttributes;
    private primaryRoutes: Array<ClassifiedRoute>;
    private secondaryRoutes: Array<ClassifiedRoute>;
    private tertiaryRoutes: Array<ClassifiedRoute>;
    constructor() {
        this.primaryRoutes = [];
        this.secondaryRoutes = [];
        this.tertiaryRoutes = [];
    }

    async getRiderDriverRoutes(startDateTimeWindow: string, endDateTimeWindow: string, originCoordinates: CoordinateAttribute, destinationCoordinates: CoordinateAttribute): Promise<any> {
        const defaultStrategy: DefaultRouteClassifierStrategy = new DefaultRouteClassifierStrategy();

        this.destnationNode = await defaultStrategy.findNearestDestinationNode(destinationCoordinates);
        this.originNode = await defaultStrategy.findNearestOriginNode(originCoordinates);

        this.primaryRoutes = await defaultStrategy.findRoutesPassingAtNode(startDateTimeWindow, endDateTimeWindow, this.originNode.nodeId);

    }
}