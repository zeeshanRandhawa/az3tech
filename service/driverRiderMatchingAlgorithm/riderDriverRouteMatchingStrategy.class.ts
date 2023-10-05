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

    async getRiderDriverRoutes(departureDateTime: string, departureFlexibility: number, originCoordinates: CoordinateAttribute, destinationCoordinates: CoordinateAttribute): Promise<any> {
        const defaultStrategy: DefaultRouteClassifierStrategy = new DefaultRouteClassifierStrategy();

        this.destnationNode = await defaultStrategy.findNearestDestinationNode(destinationCoordinates);
        this.originNode = await defaultStrategy.findNearestOriginNode(originCoordinates);

        this.classifiedRoutes = await defaultStrategy.findRoutesPassingAtNode(departureDateTime, departureFlexibility, this.originNode.nodeId, RouteClassification.Primary, this.destnationNode.nodeId);

        await Promise.all(this.classifiedRoutes.map(async (primaryclassifiedRoute: ClassifiedRoute) => {
            await Promise.all(primaryclassifiedRoute.driverRoute.drouteNodes!.slice(1).map(async (drouteNode: DriverRouteNodeAssocitedAttributes) => {

                primaryclassifiedRoute.intersectigRoutes.push(...(await defaultStrategy.findRoutesPassingAtNode(drouteNode.arrivalTime! as string, drouteNode.node?.transitTime!, drouteNode.nodeId, RouteClassification.Secondary, this.destnationNode.nodeId)));

            }));
        }));

        await Promise.all(this.classifiedRoutes.map(async (primaryclassifiedRoute: ClassifiedRoute) => {
            await Promise.all(primaryclassifiedRoute.intersectigRoutes.map(async (secondaryclassifiedRoute: ClassifiedRoute) => {
                await Promise.all(secondaryclassifiedRoute.driverRoute.drouteNodes!.slice(1).map(async (drouteNode: DriverRouteNodeAssocitedAttributes) => {

                    secondaryclassifiedRoute.intersectigRoutes.push(...(await defaultStrategy.findRoutesPassingAtNode(drouteNode.arrivalTime! as string, drouteNode.node?.transitTime!, drouteNode.nodeId, RouteClassification.Tertiary, this.destnationNode.nodeId)));

                }));
            }));
        }));

        return this.classifiedRoutes;
    }
}