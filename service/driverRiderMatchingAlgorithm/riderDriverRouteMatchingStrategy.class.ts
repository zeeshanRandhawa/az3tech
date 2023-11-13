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
    async getRiderDriverRoutes(departureDateTime: string, riderTimeFlexibility: number, originNode: NodeDto, destinationNode: NodeDto, riderRouteDirectDistance: number, riderRouteDirectDuration: number): Promise<Array<ClassifiedRouteDto>> {
        let outputLog: string = "";

        // console.log("Origin:           ", originNode.address)
        outputLog = outputLog.concat(`Origin:          ${originNode.address}\n`);
        // console.log("Destination:     ", destinationNode.address)
        outputLog = outputLog.concat(`Destination:     ${destinationNode.address}\n`);
        // console.log("Departure Time    ", departureDateTime);
        outputLog = outputLog.concat(`Departure Time    ${departureDateTime}\n`);
        // console.log("Flexibility:      ", riderTimeFlexibility)
        outputLog = outputLog.concat(`Flexibility:      ${riderTimeFlexibility}\n\n`);



        // console.log("Origin Node:      ", originNode.nodeId);
        outputLog = outputLog.concat(`Origin Node:      ${originNode.nodeId}\n`);
        // console.log("Destination Node: ", destinationNode.nodeId);
        outputLog = outputLog.concat(`Destination Node: ${destinationNode.nodeId}\n\n\n`)


        // console.log("\n\n")

        const defaultStrategy: DefaultRouteClassifierStrategy = new DefaultRouteClassifierStrategy();

        // console.log(`*${RouteClassification[0]} search through Norig=${originNode.nodeId}, AT=${departureDateTime}`);
        outputLog = outputLog.concat(`*${RouteClassification[0]} search through Norig=${originNode.nodeId}, AT=${departureDateTime}\n`)


        // Find primary routes first
        let data: any = await defaultStrategy.findRoutesPassingAtNode(departureDateTime, riderTimeFlexibility, originNode.nodeId, originNode.transitTime ?? 0, destinationNode.nodeId, RouteClassification.Primary, []);

        this.classifiedRoutes = data.data;

        outputLog = outputLog.concat(`${data.output}\n`);


        // console.log("\n\n");
        outputLog = outputLog.concat(`\n\n\n`);


        // Get list of primary route Ids. Willl need to exclude those secondary routes that are in primary list already. Ssame for tertiary
        let routeIdList: Array<number> = Array.from(new Set<number>(await defaultStrategy.getPrimaryRouteIdList(this.classifiedRoutes)));

        // Find secondary routes exclude first node as it was point of entry
        for (let primaryClassifiedRoute of this.classifiedRoutes) {
            // this.classifiedRoutes.forEach(async (primaryClassifiedRoute: ClassifiedRoute) => {

            // console.log(`Seraching route ${primaryClassifiedRoute.driverRoute.drouteId} for ${RouteClassification[1]}`);
            outputLog = outputLog.concat(`Seraching route ${primaryClassifiedRoute.driverRoute.drouteId} for ${RouteClassification[1]}\n`);

            for (let drouteNode of primaryClassifiedRoute.driverRoute.drouteNodes!.slice(1)) {
                // primaryClassifiedRoute.driverRoute.drouteNodes!.slice(1).forEach(async (drouteNode: DriverRouteNodeAssocitedDto) => {

                if (drouteNode.rank! > primaryClassifiedRoute.riderOriginRank) {
                    // console.log(`  **${RouteClassification[1]} search through Norig=${drouteNode.nodeId}, AT ${drouteNode.arrivalTime! as string}`);
                    outputLog = outputLog.concat(`  **${RouteClassification[1]} search through Norig=${drouteNode.nodeId}, AT ${drouteNode.arrivalTime! as string}\n`);

                    // let classifiedRouteList: Array<ClassifiedRoute>
                    let data: any = await defaultStrategy.findRoutesPassingAtNode(drouteNode.arrivalTime! as string, riderTimeFlexibility, drouteNode.nodeId, drouteNode.node?.transitTime ?? 0, destinationNode.nodeId, RouteClassification.Secondary, routeIdList)

                    outputLog = outputLog.concat(`${data.output}\n`);
                    primaryClassifiedRoute.intersectigRoutes.push(...data.data
                        // ...classifiedRouteList
                    );
                }

                // });
            }
            // console.log("\n");
            outputLog = outputLog.concat(`\n`);

            // });
        }

        // Now get Id list of secondary routes which are unique
        routeIdList.push(...await defaultStrategy.getSecondaryRouteIdList(this.classifiedRoutes));
        routeIdList = Array.from(new Set<number>(routeIdList));

        // console.log("\n\n");
        outputLog = outputLog.concat(`\n\n\n`);

        // Now iterate through primary and its associted secondary routes to get tertiary route list
        // await Promise.all(this.classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRoute) => {
        for (let primaryClassifiedRoute of this.classifiedRoutes) {
            // await Promise.all(primaryClassifiedRoute.intersectigRoutes.map(async (secondaryClassifiedRoute: ClassifiedRoute) => {
            for (let secondaryClassifiedRoute of primaryClassifiedRoute.intersectigRoutes) {
                // console.log(`Seraching route ${secondaryClassifiedRoute.driverRoute.drouteId} for ${RouteClassification[2]}`);
                outputLog = outputLog.concat(`Seraching route ${secondaryClassifiedRoute.driverRoute.drouteId} for ${RouteClassification[2]}\n`);

                // await Promise.all(secondaryClassifiedRoute.driverRoute.drouteNodes!.slice(1).map(async (drouteNode: DriverRouteNodeAssocitedDto) => {
                for (let drouteNode of secondaryClassifiedRoute.driverRoute.drouteNodes!.slice(1)) {


                    if (drouteNode.rank! > secondaryClassifiedRoute.riderOriginRank) {
                        // console.log(`  ***${RouteClassification[2]} search through Norig=${drouteNode.nodeId}, AT ${drouteNode.arrivalTime! as string}`);
                        outputLog = outputLog.concat(`  ***${RouteClassification[2]} search through Norig=${drouteNode.nodeId}, AT ${drouteNode.arrivalTime! as string}\n`);

                        // let classifiedRouteList: Array<ClassifiedRoute> =
                        let data: any = await defaultStrategy.findRoutesPassingAtNode(
                            drouteNode.arrivalTime! as string, riderTimeFlexibility, drouteNode.nodeId, drouteNode.node?.transitTime ?? 0,
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
                // console.log("\n");
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


        // console.log("Routes found with 1-stop and 2-stop");
        // console.log("Filtering out routes having no destination");

        // filter those routes that do not hav any destination at all. It is recursive
        this.classifiedRoutes = defaultStrategy.filterRoutesWithDestination(this.classifiedRoutes);

        // Now make sepertae group of each route. As earlier routes were nested
        this.finalClassifiedRoutes = await defaultStrategy.seperateClassifiedRoutes(this.classifiedRoutes);

        // clean memory.
        this.classifiedRoutes = [];

        // Once classified routes are seperated now get rank of last node of route that connects first node of connecting route
        this.finalClassifiedRoutes = await defaultStrategy.calculateConnectingRouteNodesRank(this.finalClassifiedRoutes);


        // console.log("\nRetime route(s) by destination rank");
        outputLog = outputLog.concat(`\nRetime route(s) by destination rank\n`);


        // Retime route based on destination node rank it was not done earlier as we had to traverse all subsequent nodes to rider origin node 
        // this.finalClassifiedRoutes = 
        data = await defaultStrategy.retimeDriverRouteByDestinationRank(this.finalClassifiedRoutes);

        this.finalClassifiedRoutes = data.data;
        outputLog = outputLog.concat(`${data.output}\n`);

        // now calculate individual cumulative time and distance
        this.finalClassifiedRoutes = await defaultStrategy.calculateCumulativeDistanceDuration(this.finalClassifiedRoutes);

        // calculate nested distances nad durations of routes. If route has nested routes then nested one will have cumulative distance and duration
        // let directDistanceDuration: Record<string, any> = await getDistanceDurationBetweenNodes({ longitude: originNode.long, latitude: originNode.lat }, { longitude: destinationNode.long, latitude: destinationNode.lat })

        // // get direct osrm distance duration to get qulaity metrics
        // directDistanceDuration.distance = parseFloat((directDistanceDuration.distance / 1609.34).toFixed(2));
        // directDistanceDuration.duration = parseFloat((directDistanceDuration.duration / 60).toFixed(2));

        // console.log("\nCheck QOS metrics");
        outputLog = outputLog.concat(`\nCheck QOS metrics\n`);

        // loop through each route to get quality metrics
        // this.finalClassifiedRoutes = 
        data = await defaultStrategy.checkQOSMetrics(this.finalClassifiedRoutes, riderRouteDirectDistance, riderRouteDirectDuration, riderTimeFlexibility);

        this.finalClassifiedRoutes = data.data;

        outputLog = outputLog.concat(`${data.output}`);

        try {
            await fs.writeFile(`./util/logs/${new Date().toLocaleString().replace(/[/.,\s:]/g, "_")}_new_request.log`, outputLog);
        } catch (error: any) { }

        return this.finalClassifiedRoutes;
    }
}