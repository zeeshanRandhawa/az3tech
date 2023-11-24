import { getDistanceDurationBetweenNodes } from "../../util/helper.utility";
import { ClassifiedRouteDto, DriverRouteNodeAssocitedDto, NodeDto, RouteClassification } from "../../util/interface.utility"
import { DefaultRouteClassifierStrategy } from "./defaultRouteClassifierStrategy";
import { ClassifiedRoute, } from "./util.class";
import * as fs from 'fs/promises';


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
    async getRiderDriverRoutes(departureDateTime: string, riderTimeFlexibility: number, originNode: NodeDto, destinationNode: NodeDto, riderRouteDirectDistance: number, riderRouteDirectDuration: number, riderOriginAddress: string, riderDestinationAddress: string): Promise<Array<ClassifiedRouteDto>> {
        let outputLog: string = "";

        outputLog = outputLog.concat(`Origin:          ${riderOriginAddress}\n`);
        outputLog = outputLog.concat(`Destination:     ${riderDestinationAddress}\n`);

        outputLog = outputLog.concat(`Rider direct route distance     ${riderRouteDirectDistance} mile(s)\n`);
        outputLog = outputLog.concat(`Rider direct route time         ${riderRouteDirectDuration} minute (s)\n`);

        outputLog = outputLog.concat(`Departure Time:           ${departureDateTime}\n`);
        outputLog = outputLog.concat(`Flexibility:              ${riderTimeFlexibility} minute(s)\n\n`);

        outputLog = outputLog.concat(`Journey Start Node:      ${originNode.description} (${originNode.nodeId}) ${originNode.location}\n`);
        outputLog = outputLog.concat(`Journey End Node:        ${destinationNode.description} (${destinationNode.nodeId}) ${destinationNode.location}\n\n\n`)

        const defaultStrategy: DefaultRouteClassifierStrategy = new DefaultRouteClassifierStrategy();

        outputLog = outputLog.concat(`*${RouteClassification[0]} search through Norig=${originNode.nodeId}, AT=${departureDateTime}\n`)


        // Find primary routes first
        let data: any = await defaultStrategy.findRoutesPassingAtNode(departureDateTime, riderTimeFlexibility, originNode.nodeId, originNode.riderTransitTime ?? 0, destinationNode.nodeId, RouteClassification.Primary, []);

        this.classifiedRoutes = data.data;

        outputLog = outputLog.concat(`${data.output}\n`);
        outputLog = outputLog.concat(`\n\n\n`);

        // Get list of primary route Ids. Willl need to exclude those secondary routes that are in primary list already. Ssame for tertiary
        let routeIdList: Array<number> = Array.from(new Set<number>(await defaultStrategy.getPrimaryRouteIdList(this.classifiedRoutes)));

        // Find secondary routes exclude first node as it was point of entry
        for (let [index, primaryClassifiedRoute] of this.classifiedRoutes.entries()) {
            // this.classifiedRoutes.forEach(async (primaryClassifiedRoute: ClassifiedRoute) => {

            outputLog = outputLog.concat(`Seraching route ${primaryClassifiedRoute.driverRoute.drouteId} for ${RouteClassification[1]}\n`);

            for (let [indx, drouteNode] of primaryClassifiedRoute.driverRoute.drouteNodes!.slice(1).entries()) {
                // primaryClassifiedRoute.driverRoute.drouteNodes!.slice(1).forEach(async (drouteNode: DriverRouteNodeAssocitedDto) => {

                if (drouteNode.rank! > primaryClassifiedRoute.riderOriginRank) {
                    outputLog = outputLog.concat(`  **${RouteClassification[1]} search through Np=${drouteNode.nodeId}, AT ${drouteNode.arrivalTime! as string}\n`);

                    // let classifiedRouteList: Array<ClassifiedRoute>
                    let data: any = await defaultStrategy.findRoutesPassingAtNode(drouteNode.arrivalTime! as string, riderTimeFlexibility, drouteNode.nodeId, drouteNode.node?.riderTransitTime ?? 0, destinationNode.nodeId, RouteClassification.Secondary, routeIdList)

                    outputLog = outputLog.concat(`${data.output}\n`);
                    primaryClassifiedRoute.intersectigRoutes.push(...data.data
                        // ...classifiedRouteList
                    );
                }
                // });
            }
            outputLog = outputLog.concat(`\n`);
            // });
        }

        // Now get Id list of secondary routes which are unique
        routeIdList.push(...await defaultStrategy.getSecondaryRouteIdList(this.classifiedRoutes));
        routeIdList = Array.from(new Set<number>(routeIdList));

        outputLog = outputLog.concat(`\n\n\n`);

        // Now iterate through primary and its associted secondary routes to get tertiary route list
        // await Promise.all(this.classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRoute) => {
        for (let [index, primaryClassifiedRoute] of this.classifiedRoutes.entries()) {
            // await Promise.all(primaryClassifiedRoute.intersectigRoutes.map(async (secondaryClassifiedRoute: ClassifiedRoute) => {
            for (let [indx, secondaryClassifiedRoute] of primaryClassifiedRoute.intersectigRoutes.entries()) {
                outputLog = outputLog.concat(`Seraching route ${secondaryClassifiedRoute.driverRoute.drouteId} for ${RouteClassification[2]}\n`);

                // await Promise.all(secondaryClassifiedRoute.driverRoute.drouteNodes!.slice(1).map(async (drouteNode: DriverRouteNodeAssocitedDto) => {
                for (let [idx, drouteNode] of secondaryClassifiedRoute.driverRoute.drouteNodes!.slice(1).entries()) {

                    if (drouteNode.rank! > secondaryClassifiedRoute.riderOriginRank) {
                        outputLog = outputLog.concat(`  ***${RouteClassification[2]} search through Ns=${drouteNode.nodeId}, AT ${drouteNode.arrivalTime! as string}\n`);

                        // let classifiedRouteList: Array<ClassifiedRoute> =
                        let data: any = await defaultStrategy.findRoutesPassingAtNode(
                            drouteNode.arrivalTime! as string, riderTimeFlexibility, drouteNode.nodeId, drouteNode.node?.riderTransitTime ?? 0,
                            destinationNode.nodeId, RouteClassification.Tertiary, routeIdList
                        )
                        outputLog = outputLog.concat(`${data.output}\n`)
                        secondaryClassifiedRoute.intersectigRoutes.push(
                            // ...classifiedRouteList
                            ...data.data
                        );
                    }

                    // }));
                }
                // }));
                // }));
                outputLog = outputLog.concat(`\n\n`);
            }

        }

        // calculate direct driver route distance duration
        await Promise.all(this.classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRoute) => {

            let driverOriginNode: DriverRouteNodeAssocitedDto;
            let driverDestinationNode: DriverRouteNodeAssocitedDto;
            let directDistanceDuration: Record<string, any>;

            if (!primaryClassifiedRoute.driverRoute.fixedRoute) {
                driverOriginNode = primaryClassifiedRoute.driverRoute.drouteNodes!.slice(0, 1)[0];
                driverDestinationNode = primaryClassifiedRoute.driverRoute.drouteNodes!.slice(-1)[0];

                directDistanceDuration = await getDistanceDurationBetweenNodes(
                    { longitude: driverOriginNode.node?.long, latitude: driverOriginNode.node?.lat },
                    { longitude: driverDestinationNode.node?.long, latitude: driverDestinationNode.node?.lat }
                );

                primaryClassifiedRoute.driverRouteDirectDistance = parseFloat((directDistanceDuration.distance / 1609.34).toFixed(2));
                primaryClassifiedRoute.driverRouteDirectDuration = parseFloat((directDistanceDuration.duration / 60).toFixed(2));
            }

            await Promise.all(primaryClassifiedRoute.intersectigRoutes.map(async (secondaryClassifiedRoute: ClassifiedRoute) => {
                if (!secondaryClassifiedRoute.driverRoute.fixedRoute) {

                    driverOriginNode = secondaryClassifiedRoute.driverRoute.drouteNodes!.slice(0, 1)[0];
                    driverDestinationNode = secondaryClassifiedRoute.driverRoute.drouteNodes!.slice(-1)[0];

                    directDistanceDuration = await getDistanceDurationBetweenNodes(
                        { longitude: driverOriginNode.node?.long, latitude: driverOriginNode.node?.lat },
                        { longitude: driverDestinationNode.node?.long, latitude: driverDestinationNode.node?.lat }
                    );

                    secondaryClassifiedRoute.driverRouteDirectDistance = parseFloat((directDistanceDuration.distance / 1609.34).toFixed(2));
                    secondaryClassifiedRoute.driverRouteDirectDuration = parseFloat((directDistanceDuration.duration / 60).toFixed(2))

                }
                await Promise.all(secondaryClassifiedRoute.intersectigRoutes.map(async (tertiaryClassifiedRoute: ClassifiedRoute) => {
                    if (!tertiaryClassifiedRoute.driverRoute.fixedRoute) {

                        driverOriginNode = tertiaryClassifiedRoute.driverRoute.drouteNodes!.slice(0, 1)[0];
                        driverDestinationNode = tertiaryClassifiedRoute.driverRoute.drouteNodes!.slice(-1)[0];

                        directDistanceDuration = await getDistanceDurationBetweenNodes(
                            { longitude: driverOriginNode.node?.long, latitude: driverOriginNode.node?.lat },
                            { longitude: driverDestinationNode.node?.long, latitude: driverDestinationNode.node?.lat }
                        );

                        tertiaryClassifiedRoute.driverRouteDirectDistance = parseFloat((directDistanceDuration.distance / 1609.34).toFixed(2));
                        tertiaryClassifiedRoute.driverRouteDirectDuration = parseFloat((directDistanceDuration.duration / 60).toFixed(2))
                    }
                }));
            }));
        }));

        // filter those routes that do not hav any destination at all. It is recursive
        this.classifiedRoutes = defaultStrategy.filterRoutesWithDestination(this.classifiedRoutes);

        // Now make sepertae group of each route. As earlier routes were nested
        this.finalClassifiedRoutes = await defaultStrategy.seperateClassifiedRoutes(this.classifiedRoutes);

        // clean memory.
        this.classifiedRoutes = [];

        // Once classified routes are seperated now get rank of last node of route that connects first node of connecting route
        this.finalClassifiedRoutes = await defaultStrategy.calculateConnectingRouteNodesRank(this.finalClassifiedRoutes);


        outputLog = outputLog.concat(`\nRetime route(s) by destination rank\n`);


        // Retime route based on destination node rank it was not done earlier as we had to traverse all subsequent nodes to rider origin node 
        // this.finalClassifiedRoutes = 
        data = await defaultStrategy.retimeDriverRouteByDestinationRank(this.finalClassifiedRoutes);

        this.finalClassifiedRoutes = data.data;
        outputLog = outputLog.concat(`${data.output}\n`);

        // now calculate individual cumulative time and distance
        this.finalClassifiedRoutes = await defaultStrategy.calculateCumulativeDistanceDuration(this.finalClassifiedRoutes);


        outputLog = outputLog.concat(`\nCheck QOS metrics\n`);

        // loop through each route to get quality metrics
        // this.finalClassifiedRoutes = 
        data = await defaultStrategy.checkQOSMetrics(this.finalClassifiedRoutes, riderRouteDirectDistance, riderRouteDirectDuration, riderTimeFlexibility);

        this.finalClassifiedRoutes = data.data;

        outputLog = outputLog.concat(`${data.output}`);

        outputLog = outputLog.concat(`\nSupurious route elimination\n`);

        data = await defaultStrategy.supuriousRouteElimination(this.finalClassifiedRoutes);

        this.finalClassifiedRoutes = data.data;

        outputLog = outputLog.concat(`${data.output}`);

        try {
            await fs.writeFile(`./util/logs/${new Date().toLocaleString().replace(/[/.,\s:]/g, "_")}_new_request.log`, outputLog);
        } catch (error: any) { }

        return this.finalClassifiedRoutes;
    }
}