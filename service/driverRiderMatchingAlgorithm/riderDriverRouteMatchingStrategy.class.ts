import { CoordinateAttribute, DriverRouteNodeAssocitedAttributes, NodeAttributes } from "../../util/interface.utility"
import { DefaultRouteClassifierStrategy } from "./defaultRouteClassifierStrategy";
import { ClassifiedRoute, RouteClassification } from "./util.class";

export class RiderDriverRouteMatchingStrategy {


    private originNode!: NodeAttributes;
    private destnationNode!: NodeAttributes;
    private classifiedRoutes: Array<ClassifiedRoute>;
    constructor() {
        this.classifiedRoutes = [];
    }

    async getRiderDriverRoutes(startDateTimeWindow: string, endDateTimeWindow: string, originCoordinates: CoordinateAttribute, destinationCoordinates: CoordinateAttribute): Promise<any> {
        const defaultStrategy: DefaultRouteClassifierStrategy = new DefaultRouteClassifierStrategy();

        this.destnationNode = await defaultStrategy.findNearestDestinationNode(destinationCoordinates);
        this.originNode = await defaultStrategy.findNearestOriginNode(originCoordinates);

        this.classifiedRoutes = await defaultStrategy.findRoutesPassingAtNode(startDateTimeWindow, endDateTimeWindow, this.originNode.nodeId, RouteClassification.Primary);
        await Promise.all(this.classifiedRoutes.map(async (primaryRoute: ClassifiedRoute) => {
            await Promise.all(primaryRoute.driverRoute.drouteNodes!.map(async (drouteNode: DriverRouteNodeAssocitedAttributes) => {
                // this.secondaryRoutes.concat(await defaultStrategy.findRoutesPassingAtNode(startDateTimeWindow, endDateTimeWindow, this.originNode.nodeId, RouteClassification.Secondary))
            }));
        }));
    }
}