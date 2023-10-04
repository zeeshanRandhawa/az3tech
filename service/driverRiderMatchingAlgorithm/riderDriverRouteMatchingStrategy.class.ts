import moment from "moment-timezone";
import { CoordinateAttribute, DriverRouteNodeAssocitedAttributes, NodeAttributes } from "../../util/interface.utility"
import { DefaultRouteClassifierStrategy } from "./defaultRouteClassifierStrategy";
import { ClassifiedRoute, RouteClassification } from "./util.class";
import { ClassificationType } from "typescript";

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

        await Promise.all(this.classifiedRoutes.map(async (classifiedRoute: ClassifiedRoute) => {
            await Promise.all(classifiedRoute.driverRoute.drouteNodes!.slice(1).map(async (drouteNode: DriverRouteNodeAssocitedAttributes) => {
                classifiedRoute.intersectigRoutes.push(...(await defaultStrategy.findRoutesPassingAtNode(moment(drouteNode.arrivalTime!).clone().subtract(drouteNode.node?.transitTime, "minutes").format("YYYY-MM-DD HH:mm:ss[Z]"), moment(drouteNode.arrivalTime!).clone().add(drouteNode.node?.transitTime, "minutes").format("YYYY-MM-DD HH:mm:ss[Z]"), drouteNode.nodeId, RouteClassification.Secondary)));
            }));
        }));

        await Promise.all(this.classifiedRoutes.map(async (classifiedRoute: ClassifiedRoute) => {
            if (classifiedRoute.classification === RouteClassification.Secondary) {
                await Promise.all(classifiedRoute.driverRoute.drouteNodes!.slice(1).map(async (drouteNode: DriverRouteNodeAssocitedAttributes) => {
                    classifiedRoute.intersectigRoutes.push(...(await defaultStrategy.findRoutesPassingAtNode(moment(drouteNode.arrivalTime!).clone().subtract(drouteNode.node?.transitTime, "minutes").format("YYYY-MM-DD HH:mm:ss[Z]"), moment(drouteNode.arrivalTime!).clone().add(drouteNode.node?.transitTime, "minutes").format("YYYY-MM-DD HH:mm:ss[Z]"), drouteNode.nodeId, RouteClassification.Tertiary)));
                }));
            }
        }));

    }
}