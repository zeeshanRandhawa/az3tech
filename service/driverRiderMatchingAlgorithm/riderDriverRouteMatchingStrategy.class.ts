import { getDistanceDurationBetweenNodes } from "../../util/helper.utility";
import { ClassifiedRouteDto, DriverRouteNodeAssocitedDto, NodeDto, QualityMetrics, RouteClassification } from "../../util/interface.utility"
import { DefaultRouteClassifierStrategy } from "./defaultRouteClassifierStrategy";
import { ClassifiedRoute, } from "./util.class";

export class RiderDriverRouteMatchingStrategy {

    private classifiedRoutes: Array<ClassifiedRoute>;
    private finalClassifiedRoutes: Array<ClassifiedRouteDto>;

    constructor() {
        this.classifiedRoutes = [];
        this.finalClassifiedRoutes = [];
    }

    // departureTime from rider
    // riderTimeFlexibility howmuch rider can wait
    // originNode nearest point where rider can get rider
    // destinationNode nearest node to rider dropoff
    async getRiderDriverRoutes(departureDateTime: string, riderTimeFlexibility: number, originNode: NodeDto, destinationNode: NodeDto): Promise<Record<string, any>> {

        const defaultStrategy: DefaultRouteClassifierStrategy = new DefaultRouteClassifierStrategy();

        // Find primary routes first
        this.classifiedRoutes = await defaultStrategy.findRoutesPassingAtNode(departureDateTime, riderTimeFlexibility, originNode.nodeId, originNode.transitTime ?? 1, destinationNode.nodeId, RouteClassification.Primary);

        // Get list of primary route Ids. Willl need to exclude those secondary routes that are in primary list already. Ssame for tertiary
        let routeIdList: Array<number> = Array.from(new Set<number>(await defaultStrategy.getPrimaryRouteIdList(this.classifiedRoutes)));

        // Find secondary routes exclude first node as it was point of entry
        await Promise.all(this.classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRoute) => {
            await Promise.all(primaryClassifiedRoute.driverRoute.drouteNodes!.slice(1).map(async (drouteNode: DriverRouteNodeAssocitedDto) => {
                primaryClassifiedRoute.intersectigRoutes.push(...await defaultStrategy.findRoutesPassingAtNode(drouteNode.arrivalTime! as string, riderTimeFlexibility, drouteNode.nodeId, drouteNode.node?.transitTime ?? 1, destinationNode.nodeId, RouteClassification.Secondary));
            }));
        }));

        // Exluding all routes that are secondary but already in primary.
        await Promise.all(this.classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRoute) => {
            primaryClassifiedRoute.intersectigRoutes = primaryClassifiedRoute.intersectigRoutes.filter((secondaryClassifiedRoute: ClassifiedRoute) => {
                return !routeIdList.includes(secondaryClassifiedRoute.driverRoute.drouteId);
            });
        }));

        // Now get Id list of secondary routes which are unique
        routeIdList.push(...await defaultStrategy.getSecondaryRouteIdList(this.classifiedRoutes));
        routeIdList = Array.from(new Set<number>(routeIdList));

        // Nowiterate through primary and its associted secondary routes to get tertiary route list
        await Promise.all(this.classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRoute) => {
            await Promise.all(primaryClassifiedRoute.intersectigRoutes.map(async (secondaryClassifiedRoute: ClassifiedRoute) => {
                await Promise.all(secondaryClassifiedRoute.driverRoute.drouteNodes!.slice(1).map(async (drouteNode: DriverRouteNodeAssocitedDto) => {

                    secondaryClassifiedRoute.intersectigRoutes.push(...await defaultStrategy.findRoutesPassingAtNode(
                        drouteNode.arrivalTime! as string, riderTimeFlexibility, drouteNode.nodeId, drouteNode.node?.transitTime ?? 1,
                        destinationNode.nodeId, RouteClassification.Tertiary
                    ));

                }));
            }));
        }));

        // filter those tertiary routes that are either in secondary or primary already
        await Promise.all(this.classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRoute) => {
            await Promise.all(primaryClassifiedRoute.intersectigRoutes.map(async (secondaryClassifiedRoute: ClassifiedRoute) => {
                secondaryClassifiedRoute.intersectigRoutes = secondaryClassifiedRoute.intersectigRoutes.filter((tertiaryClassifiedRoute: ClassifiedRoute) => {
                    return !routeIdList.includes(tertiaryClassifiedRoute.driverRoute.drouteId);
                });
            }));
        }));

        // filter those routes that do not hav any destination at all. It is recursive
        this.classifiedRoutes = defaultStrategy.filterRoutesWithDestination(this.classifiedRoutes);

        // Now make sepertae group of each route. As earlier routes were nested
        this.finalClassifiedRoutes = await defaultStrategy.seperateClassifiedRoutes(this.classifiedRoutes);

        // clean memory.
        this.classifiedRoutes = [];

        // Once classified routes are seperated now remove unnecessary nodes from parent routes to match last node wih child route first node
        this.finalClassifiedRoutes = await defaultStrategy.removeUnnecessaryNodes(this.finalClassifiedRoutes);

        // now calculate individual cummulative time and distance
        this.finalClassifiedRoutes = await defaultStrategy.calculateCummulativeDistanceDuration(this.finalClassifiedRoutes);

        // calculate nested distances nad durations of routes. If route has nested routes then nested one will have cummulative distance and duration
        let directDistanceDuration: Record<string, any> = await getDistanceDurationBetweenNodes({ longitude: originNode.long, latitude: originNode.lat }, { longitude: destinationNode.long, latitude: destinationNode.lat })

        // get direct osrm distance duration to get qulaity metrics
        directDistanceDuration.distance = parseFloat((directDistanceDuration.distance / 1609.34).toFixed(2));
        directDistanceDuration.duration = parseFloat((directDistanceDuration.duration / 60).toFixed(2));

        // loop through each route to get quality metrics
        const filteredRoutesWithMetrics: Record<string, any> = await defaultStrategy.checkQOSMetrics(this.finalClassifiedRoutes, directDistanceDuration.distance, directDistanceDuration.duration);

        // clean old route data
        this.finalClassifiedRoutes = [];

        return filteredRoutesWithMetrics;
    }
}