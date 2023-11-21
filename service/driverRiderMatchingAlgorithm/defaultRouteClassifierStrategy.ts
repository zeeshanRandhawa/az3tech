import moment from "moment";
import { getDriverRoutesBetweenTimeFrame, getNodeToNodeDistances } from "../../util/helper.utility";
import { ClassifiedRouteDto, DriverRouteAssociatedNodeDto, DriverRouteNodeAssocitedDto, RouteClassification } from "../../util/interface.utility";
import { RouteClassifierStrategy } from "./routeClassifierStarategy.class";
import { ClassifiedRoute } from "./util.class";
import { Moment } from "moment-timezone";

export class DefaultRouteClassifierStrategy extends RouteClassifierStrategy {
    constructor() {
        super();
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    // Take time at point, flexibility in minutes, node oint id , node transit time and destination node id to get all route passing at node in mention time
    async findRoutesPassingAtNode(arrivalDepartureDateTime: string, riderTimeFlexibility: number, nodeId: number, transitTime: number, destnationNodeId: number, routeClassification: RouteClassification, routesToExclude: Array<number>): Promise<Record<string, any>> {
        // Promise<Array<ClassifiedRoute>> {

        let outputLog: string = "";
        // node start and end time to search
        let dateTimeStartWindow: Moment = moment(arrivalDepartureDateTime).clone().add((routeClassification === RouteClassification.Primary ? 0 : transitTime), "minutes");
        let dateTimeEndWindow: Moment = moment(arrivalDepartureDateTime).clone().add(riderTimeFlexibility + (routeClassification === RouteClassification.Primary ? 0 : transitTime), "minutes");


        // query database layer to get routes from db
        // takes dateStart, dateEnd, nodeId, 
        const passingRoutesAtNode: Array<DriverRouteAssociatedNodeDto> = await getDriverRoutesBetweenTimeFrame(dateTimeStartWindow.utcOffset(0, true).format("YYYY-MM-DD[T]HH:mm:ss.000[Z]"), dateTimeEndWindow.utcOffset(0, true).format("YYYY-MM-DD[T]HH:mm:ss.000[Z]"), [nodeId]);

        outputLog = outputLog.concat(`    ${passingRoutesAtNode.length} routes available ${passingRoutesAtNode.map(passingRoute => passingRoute.drouteId).join(', ')}\n`);

        // iterate through all found routes and convert it into data structure
        const passingRoutesAtNodeClassified: Array<ClassifiedRoute> = [];
        await Promise.all(passingRoutesAtNode.map(async (passingRoute: DriverRouteAssociatedNodeDto) => {

            // check if we have to exclude that route. We will not use it later as it create a bug in search algo
            if (!routesToExclude.includes(passingRoute.drouteId)) {

                let riderOriginRank: number = Infinity;
                let riderDestinationRank: number = Infinity;

                // find rider origin rank
                await Promise.all(passingRoute.drouteNodes!.map(async (drouteNode: DriverRouteNodeAssocitedDto) => {
                    if (drouteNode.nodeId === nodeId) {
                        riderOriginRank = drouteNode.rank ?? Infinity;
                    }
                }));

                // find rider destination rank
                await Promise.all(passingRoute.drouteNodes!.map(async (dRouteNode: DriverRouteNodeAssocitedDto) => {
                    if (destnationNodeId === dRouteNode.nodeId && dRouteNode.rank! > riderOriginRank) {
                        riderDestinationRank = dRouteNode.rank ?? Infinity;
                    }
                }));

                if (riderDestinationRank !== Infinity) {
                    outputLog = outputLog.concat(`     ${' '.repeat(routeClassification)} ${passingRoute.drouteId}-Node ${passingRoute.drouteNodes![riderDestinationRank].nodeId} (Destination) found *****************${routeClassification === 0 ? 'Direct' : routeClassification === 1 ? '1-stop' : '2-stop'} route found\n`);
                }

                // retime if it is flex route after inserting rider origin
                if (!passingRoute.fixedRoute) {
                    if (passingRoute.drouteNodes![riderOriginRank].status === "POTENTIAL") {

                        // let nodeToNodeDistDurList: Record<string, any> = await getNodeToNodeDistances(await Promise.all(passingRoute.drouteNodes!.map(async (drouteNode: DriverRouteNodeAssocitedDto) => {
                        //     return drouteNode.nodeId;
                        // })));

                        let nodeToNodeDistDurList: Record<string, any> = await getNodeToNodeDistances(passingRoute.drouteNodes!.map((drouteNode: DriverRouteNodeAssocitedDto) => {
                            if (drouteNode.rank! >= riderOriginRank) {
                                return drouteNode.nodeId;
                            }
                            return undefined;
                        }).filter((nodeId: number | undefined) => nodeId !== undefined) as Array<number>);

                        outputLog = outputLog.concat(`     ${' '.repeat(routeClassification)}Retime flex route ${passingRoute.drouteId} at node ${passingRoute.drouteNodes![riderOriginRank].nodeId} arriving at ${passingRoute.drouteNodes![riderOriginRank].arrivalTime}\n`);

                        // initial rank of scheduled node
                        let initialScheduledNodeRank: number = riderOriginRank;

                        // change node status
                        passingRoute.drouteNodes![initialScheduledNodeRank].status = "SCHEDULED";

                        // get node departuretime chenage it
                        let passingRouteOriginNodeDepartureTime: Moment = moment.utc(passingRoute.drouteNodes![initialScheduledNodeRank].arrivalTime).clone().add(passingRoute.drouteNodes![initialScheduledNodeRank].node?.driverTransitTime ?? 0, "minutes");

                        let passingRouteOriginNodeCumulativeDistance: number = passingRoute.drouteNodes![initialScheduledNodeRank].cumDistance ?? 0;

                        passingRoute.drouteNodes![initialScheduledNodeRank].departureTime = passingRouteOriginNodeDepartureTime.clone().format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
                        passingRoute.drouteNodes![initialScheduledNodeRank].cumTime! = passingRoute.drouteNodes![initialScheduledNodeRank].cumTime! + passingRoute.drouteNodes![initialScheduledNodeRank].node?.driverTransitTime!

                        let passingRouteOriginNodeCumulativeDuration: number = passingRoute.drouteNodes![initialScheduledNodeRank].cumTime ?? 0;

                        // passingRoute.drouteNodes!.slice(riderOriginRank + 1).forEach(async (drouteNode: DriverRouteNodeAssocitedDto, index: number) => {

                        for (let [index, drouteNode] of passingRoute.drouteNodes!.slice(riderOriginRank + 1).entries()) {
                            // let calculatedDisDurBetweenNodes: Record<string, any> = await getDistanceDurationBetweenNodes(
                            //     { longitude: passingRoute.drouteNodes![initialScheduledNodeRank].node!.long, latitude: passingRoute.drouteNodes![initialScheduledNodeRank].node!.lat },
                            //     { longitude: drouteNode.node!.long, latitude: drouteNode.node!.lat }
                            // );

                            let distdur: Record<string, any> = nodeToNodeDistDurList[`${passingRoute.drouteNodes![initialScheduledNodeRank].nodeId}-${drouteNode.nodeId}`];


                            // drouteNode.arrivalTime = passingRouteOriginNodeDepartureTime.clone().add(calculatedDisDurBetweenNodes.duration, "seconds").format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
                            // drouteNode.cumDistance = parseFloat((passingRouteOriginNodeCumulativeDistance + (calculatedDisDurBetweenNodes.distance / 1609.34)).toFixed(2));
                            // drouteNode.cumTime = parseFloat((passingRouteOriginNodeCumulativeDuration + (calculatedDisDurBetweenNodes.duration / 60)).toFixed(2));
                            drouteNode.arrivalTime = passingRouteOriginNodeDepartureTime.clone().add(distdur.duration, "minutes").format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
                            drouteNode.cumDistance = parseFloat((passingRouteOriginNodeCumulativeDistance + distdur.distance).toFixed(2));
                            drouteNode.cumTime = parseFloat((passingRouteOriginNodeCumulativeDuration + distdur.duration).toFixed(2));

                            if (drouteNode.status === "SCHEDULED") {

                                passingRouteOriginNodeDepartureTime = moment.utc(drouteNode.arrivalTime).clone().add(drouteNode.node?.driverTransitTime ?? 0, "minutes");

                                passingRouteOriginNodeCumulativeDistance = drouteNode.cumTime + (drouteNode.node?.driverTransitTime ?? 0);

                                drouteNode.departureTime = passingRouteOriginNodeDepartureTime.clone().format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
                                drouteNode.cumTime = drouteNode.cumTime + passingRouteOriginNodeCumulativeDistance;

                                passingRouteOriginNodeCumulativeDuration = drouteNode.cumTime;
                                initialScheduledNodeRank = initialScheduledNodeRank + index + 1;
                            }

                        }
                        // );

                    } else if (passingRoute.drouteNodes![riderOriginRank].status === "ORIGIN" || passingRoute.drouteNodes![riderOriginRank].status === "DESTINATION") {
                        passingRoute.drouteNodes![riderOriginRank].status = "SCHEDULED";
                    }
                }

                passingRoutesAtNodeClassified.push(new ClassifiedRoute(passingRoute, routeClassification, riderOriginRank, riderDestinationRank));

            } else {
                outputLog = outputLog.concat(`     ${' '.repeat(routeClassification)}${passingRoute.drouteId} already found in ${RouteClassification[routeClassification - 1]} route(s) rejecting...\n`);

            }
        }));

        return { output: outputLog, data: passingRoutesAtNodeClassified };
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    public filterRoutesWithDestination(classifiedRoutes: Array<ClassifiedRoute>): Array<ClassifiedRoute> {
        const filteredRoutesWithDestination: Array<ClassifiedRoute> = this.filterRoutes(classifiedRoutes);
        return filteredRoutesWithDestination;
    }
    private filterRoutes(primaryClassifiedRoutes: Array<ClassifiedRoute>) {
        return primaryClassifiedRoutes.filter(primaryClassifiedRoute => {
            primaryClassifiedRoute.intersectigRoutes = this.filterSecondaryRoutes(primaryClassifiedRoute.intersectigRoutes);
            return primaryClassifiedRoute.riedrDestinationRank !== Infinity || primaryClassifiedRoute.intersectigRoutes.length > 0;
        });
    }
    private filterSecondaryRoutes(secondaryClassifiedRoutes: Array<ClassifiedRoute>) {
        return secondaryClassifiedRoutes.filter(secondaryClassifiedRoute => {
            secondaryClassifiedRoute.intersectigRoutes = this.filterTertiaryRoutes(secondaryClassifiedRoute.intersectigRoutes);
            return secondaryClassifiedRoute.riedrDestinationRank !== Infinity || secondaryClassifiedRoute.intersectigRoutes.length > 0;
        });
    }
    private filterTertiaryRoutes(tertiaryClassifiedRoutes: Array<ClassifiedRoute>) {
        return tertiaryClassifiedRoutes.filter(tertiaryClassifiedRoute => {
            return tertiaryClassifiedRoute.riedrDestinationRank !== Infinity
        });
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    async seperateClassifiedRoutes(classifiedRoutes: Array<ClassifiedRoute>): Promise<Array<ClassifiedRouteDto>> {
        const finalClassifiedRoutes: Array<ClassifiedRouteDto> = [];

        await Promise.all(classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRoute) => {
            if (primaryClassifiedRoute.riedrDestinationRank !== Infinity) {
                let primaryRouteDto: ClassifiedRouteDto = {
                    classification: primaryClassifiedRoute.classification, riderOriginRank: primaryClassifiedRoute.riderOriginRank,
                    riderDestinationRank: primaryClassifiedRoute.riedrDestinationRank, driverRoute: JSON.parse(JSON.stringify(primaryClassifiedRoute.driverRoute)),
                    driverRouteDirectDistance: primaryClassifiedRoute.driverRouteDirectDistance,
                    driverRouteDirectDuration: primaryClassifiedRoute.driverRouteDirectDuration
                }
                finalClassifiedRoutes.push(primaryRouteDto);
            }
            await Promise.all(primaryClassifiedRoute.intersectigRoutes.map(async (secondaryClassifiedRoute: ClassifiedRoute) => {
                if (secondaryClassifiedRoute.riedrDestinationRank !== Infinity) {
                    let secondaryRouteDto: ClassifiedRouteDto = {
                        classification: secondaryClassifiedRoute.classification, riderOriginRank: secondaryClassifiedRoute.riderOriginRank,
                        riderDestinationRank: secondaryClassifiedRoute.riedrDestinationRank, driverRoute: JSON.parse(JSON.stringify(secondaryClassifiedRoute.driverRoute)),
                        driverRouteDirectDistance: secondaryClassifiedRoute.driverRouteDirectDistance,
                        driverRouteDirectDuration: secondaryClassifiedRoute.driverRouteDirectDuration
                    }
                    let primaryRouteDto: ClassifiedRouteDto = {
                        classification: primaryClassifiedRoute.classification, riderOriginRank: primaryClassifiedRoute.riderOriginRank,
                        riderDestinationRank: primaryClassifiedRoute.riedrDestinationRank, intersectingRoute: JSON.parse(JSON.stringify(secondaryRouteDto)),
                        driverRoute: JSON.parse(JSON.stringify(primaryClassifiedRoute.driverRoute)),
                        driverRouteDirectDistance: primaryClassifiedRoute.driverRouteDirectDistance,
                        driverRouteDirectDuration: primaryClassifiedRoute.driverRouteDirectDuration
                    }
                    finalClassifiedRoutes.push(primaryRouteDto);
                }
                await Promise.all(secondaryClassifiedRoute.intersectigRoutes.map(async (tertiaryClassifiedRoute: ClassifiedRoute) => {
                    if (tertiaryClassifiedRoute.riedrDestinationRank !== Infinity) {
                        let tertiaryRouteDto: ClassifiedRouteDto = {
                            classification: tertiaryClassifiedRoute.classification, riderOriginRank: tertiaryClassifiedRoute.riderOriginRank,
                            riderDestinationRank: tertiaryClassifiedRoute.riedrDestinationRank, driverRoute: JSON.parse(JSON.stringify(tertiaryClassifiedRoute.driverRoute)),
                            driverRouteDirectDistance: tertiaryClassifiedRoute.driverRouteDirectDistance,
                            driverRouteDirectDuration: tertiaryClassifiedRoute.driverRouteDirectDuration
                        }
                        let secondaryRouteDto: ClassifiedRouteDto = {
                            classification: secondaryClassifiedRoute.classification, riderOriginRank: secondaryClassifiedRoute.riderOriginRank,
                            riderDestinationRank: secondaryClassifiedRoute.riedrDestinationRank, intersectingRoute: JSON.parse(JSON.stringify(tertiaryRouteDto)),
                            driverRoute: JSON.parse(JSON.stringify(secondaryClassifiedRoute.driverRoute)),
                            driverRouteDirectDistance: secondaryClassifiedRoute.driverRouteDirectDistance,
                            driverRouteDirectDuration: secondaryClassifiedRoute.driverRouteDirectDuration
                        }
                        let primaryRouteDto: ClassifiedRouteDto = {
                            classification: primaryClassifiedRoute.classification, riderOriginRank: primaryClassifiedRoute.riderOriginRank,
                            riderDestinationRank: primaryClassifiedRoute.riedrDestinationRank, intersectingRoute: JSON.parse(JSON.stringify(secondaryRouteDto)),
                            driverRoute: JSON.parse(JSON.stringify(primaryClassifiedRoute.driverRoute)),
                            driverRouteDirectDistance: primaryClassifiedRoute.driverRouteDirectDistance,
                            driverRouteDirectDuration: primaryClassifiedRoute.driverRouteDirectDuration
                        }
                        finalClassifiedRoutes.push(primaryRouteDto);
                    }
                }));
            }));
        }));

        return finalClassifiedRoutes
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    async getPrimaryRouteIdList(classifiedRoutes: Array<ClassifiedRoute>): Promise<Array<number>> {
        let primaryRouteIdList: Array<number> = await Promise.all(classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRoute) => {
            return primaryClassifiedRoute.driverRoute.drouteId;
        }));

        return primaryRouteIdList;
    }
    async getSecondaryRouteIdList(classifiedRoutes: Array<ClassifiedRoute>): Promise<Array<number>> {
        let secondaryRouteIdList: Array<number> = [];
        await Promise.all(classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRoute) => {
            await Promise.all(primaryClassifiedRoute.intersectigRoutes.map(async (secondaryClassifiedRoute: ClassifiedRoute) => {
                secondaryRouteIdList.push(secondaryClassifiedRoute.driverRoute.drouteId);
            }));
        }));
        return secondaryRouteIdList;
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    async calculateConnectingRouteNodesRank(classifiedRoutes: Array<ClassifiedRouteDto>): Promise<Array<ClassifiedRouteDto>> {

        await Promise.all(classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRouteDto) => {

            // Primary has secondary (1st stop)
            if (primaryClassifiedRoute.intersectingRoute) {
                //secondary
                let primaryNodeRank: number = Infinity;
                await Promise.all(primaryClassifiedRoute.driverRoute.drouteNodes!.map((dRouteNode: DriverRouteNodeAssocitedDto) => {
                    if (dRouteNode.nodeId === primaryClassifiedRoute.intersectingRoute!.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute?.riderOriginRank!].nodeId) {
                        primaryNodeRank = dRouteNode.rank!;
                    }
                }));
                primaryClassifiedRoute.riderDestinationRank = primaryNodeRank;

                //Secondary has tertiary (2nd stop)
                if (primaryClassifiedRoute.intersectingRoute.intersectingRoute) {

                    //tertiary
                    let secondaryNodeRank: number = Infinity;
                    await Promise.all(primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes!.map((dRouteNode: DriverRouteNodeAssocitedDto) => {
                        if (dRouteNode.nodeId === primaryClassifiedRoute.intersectingRoute!.intersectingRoute!.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute?.intersectingRoute?.riderOriginRank!].nodeId) {
                            secondaryNodeRank = dRouteNode.rank!;
                        }
                    }));
                    primaryClassifiedRoute.intersectingRoute!.riderDestinationRank = secondaryNodeRank;
                }

            }

        }));

        return classifiedRoutes;
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    async retimeDriverRouteByDestinationRank(classifiedRoutes: Array<ClassifiedRouteDto>): Promise<Record<string, any>> {
        //  Promise<Array<ClassifiedRouteDto>> {
        // await Promise.all(classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRouteDto) => {

        let outputLog: string = "";

        for (let [index, classifiedRoute] of classifiedRoutes.entries()) {

            outputLog = outputLog.concat(`Route ${classifiedRoute.driverRoute.drouteId}${classifiedRoute.intersectingRoute ? `->${classifiedRoute.intersectingRoute.driverRoute.drouteId}` : ""}`)
            outputLog = outputLog.concat(`${classifiedRoute.intersectingRoute?.intersectingRoute ? `->${classifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteId}` : ""}\n`)

            // classifiedRoute
            let dataNp: any = await this.retimeRouteSection(classifiedRoute);

            classifiedRoute = dataNp.data;
            outputLog = outputLog.concat(`${dataNp.output}`)

            if (classifiedRoute.intersectingRoute) {
                let dataNs: any = await this.retimeRouteSection(classifiedRoute.intersectingRoute);

                classifiedRoute.intersectingRoute = dataNs.data;
                outputLog = outputLog.concat(`${dataNs.output}`)
            }
            if (classifiedRoute.intersectingRoute?.intersectingRoute) {

                let dataNt: any = await this.retimeRouteSection(classifiedRoute.intersectingRoute.intersectingRoute);

                classifiedRoute.intersectingRoute.intersectingRoute = dataNt.data;
                outputLog = outputLog.concat(`${dataNt.output}`)

            }

        }
        // }));

        return { output: outputLog, data: classifiedRoutes };
    }

    async retimeRouteSection(partialClassifiedRoute: ClassifiedRouteDto): Promise<Record<string, any>> {
        //  Promise<ClassifiedRouteDto> {
        let outputLog: string = "";

        if (!partialClassifiedRoute.driverRoute.fixedRoute) {
            if (partialClassifiedRoute.driverRoute.drouteNodes![partialClassifiedRoute.riderDestinationRank].status === "POTENTIAL") {

                // let nodeToNodeDistDurList: Record<string, any> = await getNodeToNodeDistances(await Promise.all(partialClassifiedRoute.driverRoute.drouteNodes!.map(async (drouteNode: DriverRouteNodeAssocitedDto) => {
                //     return drouteNode.nodeId;
                // })));

                let nodeToNodeDistDurList: Record<string, any> = await getNodeToNodeDistances(partialClassifiedRoute.driverRoute.drouteNodes!.map((drouteNode: DriverRouteNodeAssocitedDto) => {
                    if (drouteNode.rank! >= partialClassifiedRoute.riderDestinationRank) {
                        return drouteNode.nodeId;
                    }
                    return undefined;
                }).filter((nodeId: number | undefined) => nodeId !== undefined) as Array<number>);

                outputLog = outputLog.concat(`Retime flex route ${partialClassifiedRoute.driverRoute.drouteId} at node ${partialClassifiedRoute.driverRoute.drouteNodes![partialClassifiedRoute.riderDestinationRank].nodeId} arriving at ${partialClassifiedRoute.driverRoute.drouteNodes![partialClassifiedRoute.riderDestinationRank].arrivalTime}\n`)

                // initial rank of scheduled node
                let initialScheduledNodeRank: number = partialClassifiedRoute.riderDestinationRank;

                // change node status
                partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].status = "SCHEDULED";

                // get node departuretime chenage it
                let passingRouteOriginNodeDepartureTime: Moment = moment.utc(partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].arrivalTime).clone().add(partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].node?.driverTransitTime ?? 0, "minutes");

                let passingRouteOriginNodeCumulativeDistance: number = partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].cumDistance ?? 0;

                partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].departureTime = passingRouteOriginNodeDepartureTime.clone().format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
                partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].cumTime! = partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].cumTime! + partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].node?.driverTransitTime!

                let passingRouteOriginNodeCumulativeDuration: number = partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].cumTime ?? 0;

                // partialClassifiedRoute.driverRoute.drouteNodes!.slice(partialClassifiedRoute.riderDestinationRank + 1).forEach(async (drouteNode: DriverRouteNodeAssocitedDto, index: number) => {

                for (let [index, drouteNode] of partialClassifiedRoute.driverRoute.drouteNodes!.slice(partialClassifiedRoute.riderDestinationRank + 1).entries()) {

                    // let calculatedDisDurBetweenNodes: Record<string, any> = await getDistanceDurationBetweenNodes(
                    //     { longitude: partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].node!.long, latitude: partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].node!.lat },
                    //     { longitude: drouteNode.node!.long, latitude: drouteNode.node!.lat }
                    // );

                    let distdur: Record<string, any> = nodeToNodeDistDurList[`${partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].nodeId}-${drouteNode.nodeId}`];


                    drouteNode.arrivalTime = passingRouteOriginNodeDepartureTime.clone().add(distdur.duration, "minutes").format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
                    drouteNode.cumDistance = parseFloat((passingRouteOriginNodeCumulativeDistance + distdur.distance).toFixed(2));
                    drouteNode.cumTime = parseFloat((passingRouteOriginNodeCumulativeDuration + distdur.duration).toFixed(2));

                    // drouteNode.arrivalTime = passingRouteOriginNodeDepartureTime.clone().add(calculatedDisDurBetweenNodes.duration, "seconds").format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
                    // drouteNode.cumDistance = parseFloat((passingRouteOriginNodeCumulativeDistance + (calculatedDisDurBetweenNodes.distance / 1609.34)).toFixed(2));
                    // drouteNode.cumTime = parseFloat((passingRouteOriginNodeCumulativeDuration + (calculatedDisDurBetweenNodes.duration / 60)).toFixed(2));

                    if (drouteNode.status === "SCHEDULED") {

                        passingRouteOriginNodeDepartureTime = moment.utc(drouteNode.arrivalTime).clone().add(drouteNode.node?.driverTransitTime ?? 0, "minutes");

                        passingRouteOriginNodeCumulativeDistance = drouteNode.cumTime + (drouteNode.node?.driverTransitTime ?? 0);

                        drouteNode.departureTime = passingRouteOriginNodeDepartureTime.clone().format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
                        drouteNode.cumTime = drouteNode.cumTime + passingRouteOriginNodeCumulativeDistance;

                        passingRouteOriginNodeCumulativeDuration = drouteNode.cumTime;
                        initialScheduledNodeRank = initialScheduledNodeRank + index + 1;
                    }
                    partialClassifiedRoute.driverRoute.drouteNodes![partialClassifiedRoute.riderDestinationRank + index + 1] = drouteNode;
                }
                // );

            } else if (partialClassifiedRoute.driverRoute.drouteNodes![partialClassifiedRoute.riderDestinationRank].status === "ORIGIN" || partialClassifiedRoute.driverRoute.drouteNodes![partialClassifiedRoute.riderDestinationRank].status === "DESTINATION") {
                partialClassifiedRoute.driverRoute.drouteNodes![partialClassifiedRoute.riderDestinationRank].status = "SCHEDULED";
            }
        }

        return { output: outputLog, data: partialClassifiedRoute };
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    async calculateCumulativeDistanceDuration(classifiedRoutes: Array<ClassifiedRouteDto>): Promise<Array<ClassifiedRouteDto>> {

        await Promise.all(classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRouteDto) => {

            // primary
            primaryClassifiedRoute = await this.calculateCumulativeDistanceDurationRouteSection(primaryClassifiedRoute);

            if (primaryClassifiedRoute.intersectingRoute) {

                primaryClassifiedRoute.intersectingRoute = await this.calculateCumulativeDistanceDurationRouteSection(primaryClassifiedRoute.intersectingRoute);

                if (primaryClassifiedRoute.intersectingRoute.intersectingRoute) {

                    primaryClassifiedRoute.intersectingRoute.intersectingRoute = await this.calculateCumulativeDistanceDurationRouteSection(primaryClassifiedRoute.intersectingRoute.intersectingRoute);

                }
            }
        }));

        return classifiedRoutes;

    }

    async calculateCumulativeDistanceDurationRouteSection(classifiedRouteSection: ClassifiedRouteDto): Promise<ClassifiedRouteDto> {
        classifiedRouteSection.routeOriginDepartureTime = classifiedRouteSection.driverRoute.drouteNodes![classifiedRouteSection.riderOriginRank].departureTime as string;
        classifiedRouteSection.routeDestinationArrivalTime = classifiedRouteSection.driverRoute.drouteNodes![classifiedRouteSection.riderDestinationRank].arrivalTime as string;

        if (!classifiedRouteSection.driverRoute.fixedRoute) {
            let driverCumDistance: number = 0;
            let driverCumDuration: number = 0;

            let riderCumDistance: number = 0;
            let riderCumDuration: number = 0;

            let currentScheduledNode: DriverRouteNodeAssocitedDto = classifiedRouteSection.driverRoute.drouteNodes![0];

            // await Promise.all(
            // classifiedRouteSection.driverRoute.drouteNodes!.slice(1).map((drouteNode: DriverRouteNodeAssocitedDto) => {
            for (let [idx, drouteNode] of classifiedRouteSection.driverRoute.drouteNodes!.slice(1).entries()) {
                if (drouteNode.status !== "POTENTIAL") {

                    let firstNodeDeparture: Moment = moment.utc(currentScheduledNode.departureTime, "YYYY-MM-DD HH:mm:ss[z]");
                    let lastNodeArrival: Moment = moment.utc(drouteNode.arrivalTime, "YYYY-MM-DD HH:mm:ss[z]");

                    driverCumDistance += (drouteNode.cumDistance! - currentScheduledNode.cumDistance!);
                    driverCumDuration += parseFloat((lastNodeArrival.diff(firstNodeDeparture, "minutes")).toFixed(2));

                    if (currentScheduledNode.rank! >= classifiedRouteSection.riderOriginRank && drouteNode.rank! <= classifiedRouteSection.riderDestinationRank) {

                        let firstNodeDeparture: Moment = moment.utc(currentScheduledNode.departureTime, "YYYY-MM-DD HH:mm:ss[z]");
                        let lastNodeArrival: Moment = moment.utc(drouteNode.arrivalTime, "YYYY-MM-DD HH:mm:ss[z]");

                        riderCumDistance += (drouteNode.cumDistance! - currentScheduledNode.cumDistance!);
                        riderCumDuration += parseFloat((lastNodeArrival.diff(firstNodeDeparture, "minutes")).toFixed(2));
                    }
                    currentScheduledNode = drouteNode;
                }

            }
            // );
            // );

            classifiedRouteSection.riderCumulativeDuration = parseFloat((riderCumDuration).toFixed(2));
            classifiedRouteSection.riderCumulativeDistance = riderCumDistance;

            classifiedRouteSection.driverRouteDistance = driverCumDistance;
            classifiedRouteSection.driverRouteDuration = driverCumDuration;

        } else {
            let firstNodeDeparture: Moment = moment.utc(classifiedRouteSection.routeOriginDepartureTime, "YYYY-MM-DD HH:mm:ss[z]");
            let lastNodeArrival: Moment = moment.utc(classifiedRouteSection.routeDestinationArrivalTime, "YYYY-MM-DD HH:mm:ss[z]");

            let primaryFirstNodeDistance: number = classifiedRouteSection.driverRoute.drouteNodes![classifiedRouteSection.riderOriginRank].cumDistance!;
            let primaryLastNodeDistance: number = classifiedRouteSection.driverRoute.drouteNodes![classifiedRouteSection.riderDestinationRank].cumDistance!;

            classifiedRouteSection.riderCumulativeDuration = parseFloat((lastNodeArrival.diff(firstNodeDeparture, "minutes")).toFixed(2));
            classifiedRouteSection.riderCumulativeDistance = parseFloat((primaryLastNodeDistance - primaryFirstNodeDistance).toFixed(2));
        }

        return classifiedRouteSection;
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    async checkQOSMetrics(classifiedRoutes: Array<ClassifiedRouteDto>, riderDirectRouteDistance: number, riderDrirectRouteDuration: number, riderTransitFlexibility: number): Promise<Record<string, any>> {
        //  Promise<Array<ClassifiedRouteDto>> {

        let outputLog: string = "";

        const qualityCriteriaFilteredRoutes: Array<ClassifiedRouteDto> = [];

        await Promise.all(classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRouteDto) => {

            let routeChain: string = `Route ${primaryClassifiedRoute.driverRoute.drouteId}(${primaryClassifiedRoute.riderOriginRank}-${primaryClassifiedRoute.riderDestinationRank})${primaryClassifiedRoute.intersectingRoute ? `->${primaryClassifiedRoute.intersectingRoute.driverRoute.drouteId}(${primaryClassifiedRoute.intersectingRoute.riderOriginRank}-${primaryClassifiedRoute.intersectingRoute.riderDestinationRank})` : ""}`;
            routeChain = routeChain.concat(`${primaryClassifiedRoute.intersectingRoute?.intersectingRoute ? `->${primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteId}(${primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderOriginRank}-${primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderDestinationRank})` : ""}`)
            outputLog = outputLog.concat(`${routeChain}\n`);

            let riderRouteDistance: number = 0;
            let riderRouteDuration: number = 0;

            let distanceQuality: number;
            let durationQuality: number;
            let hasGoodQuality: boolean = true;

            // primary
            riderRouteDistance += primaryClassifiedRoute.riderCumulativeDistance!;
            riderRouteDuration += primaryClassifiedRoute.riderCumulativeDuration!;

            outputLog = outputLog.concat(`->${primaryClassifiedRoute.driverRoute.drouteId}\n`);
            outputLog = outputLog.concat(`    riderDistance=${primaryClassifiedRoute.riderCumulativeDistance!}, riderDuration=${primaryClassifiedRoute.riderCumulativeDuration!}\n`)

            if (!primaryClassifiedRoute.driverRoute.fixedRoute) {
                outputLog = outputLog.concat(`    Flex Route variables , directDriverRouteDistance=${primaryClassifiedRoute.driverRouteDirectDistance}, directDriverRouteDuration=${primaryClassifiedRoute.driverRouteDirectDuration}, driverRouteDistance=${primaryClassifiedRoute.driverRouteDistance}, driverRouteDuration=${primaryClassifiedRoute.driverRouteDuration}\n`);

                distanceQuality = parseFloat((primaryClassifiedRoute.driverRouteDistance! / primaryClassifiedRoute.driverRouteDirectDistance!).toFixed(2));
                durationQuality = parseFloat((primaryClassifiedRoute.driverRouteDuration! / primaryClassifiedRoute.driverRouteDirectDuration!).toFixed(2));

                outputLog = outputLog.concat(`    Flex route metrics distanceQuality=${distanceQuality}, durationQuality=${durationQuality}, overallQuality=${distanceQuality * durationQuality}\n`);

                if (distanceQuality > 1.50 || durationQuality > 1.50 || (distanceQuality * durationQuality) > 1.70) {
                    hasGoodQuality = false
                }
            }

            if (primaryClassifiedRoute.intersectingRoute) {

                //secondary
                riderRouteDistance += primaryClassifiedRoute.intersectingRoute.riderCumulativeDistance!;
                riderRouteDuration += primaryClassifiedRoute.intersectingRoute.riderCumulativeDuration!;

                outputLog = outputLog.concat(`->${primaryClassifiedRoute.intersectingRoute.driverRoute.drouteId}\n`);

                outputLog = outputLog.concat(`    riderDistance=${primaryClassifiedRoute.intersectingRoute.riderCumulativeDistance!}, riderDuration=${primaryClassifiedRoute.intersectingRoute.riderCumulativeDuration!}\n`);

                if (!primaryClassifiedRoute.intersectingRoute.driverRoute.fixedRoute) {

                    outputLog = outputLog.concat(`    Flex Route variables , directDriverRouteDistance=${primaryClassifiedRoute.intersectingRoute.driverRouteDirectDistance}, directDriverRouteDuration=${primaryClassifiedRoute.intersectingRoute.driverRouteDirectDuration}, driverRouteDistance=${primaryClassifiedRoute.intersectingRoute.driverRouteDistance}, driverRouteDuration=${primaryClassifiedRoute.intersectingRoute.driverRouteDuration}\n`);

                    distanceQuality = parseFloat((primaryClassifiedRoute.intersectingRoute.driverRouteDistance! / primaryClassifiedRoute.intersectingRoute.driverRouteDirectDistance!).toFixed(2));
                    durationQuality = parseFloat((primaryClassifiedRoute.intersectingRoute.driverRouteDuration! / primaryClassifiedRoute.intersectingRoute.driverRouteDirectDuration!).toFixed(2));

                    outputLog = outputLog.concat(`    Flex route metrics distanceQuality=${distanceQuality}, durationQuality=${durationQuality}, overallQuality=${distanceQuality * durationQuality}\n`);

                    if (distanceQuality > 1.50 || durationQuality > 1.50 || (distanceQuality * durationQuality) > 1.70) {
                        hasGoodQuality = false
                    }
                }

                if (primaryClassifiedRoute.intersectingRoute.intersectingRoute) {

                    //tertiary
                    riderRouteDistance += primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderCumulativeDistance!;
                    riderRouteDuration += primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderCumulativeDuration!;

                    outputLog = outputLog.concat(`->${primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteId}\n`);

                    outputLog = outputLog.concat(`    riderDistance=${primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderCumulativeDistance!}, riderDuration=${primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderCumulativeDuration!}\n`);

                    if (!primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.fixedRoute) {

                        outputLog = outputLog.concat(`    Flex Route variables , directDriverRouteDistance=${primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRouteDirectDistance}, directDriverRouteDuration=${primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRouteDirectDuration}, driverRouteDistance=${primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRouteDistance}, driverRouteDuration=${primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRouteDuration}\n`);

                        distanceQuality = parseFloat((primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRouteDistance! / primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRouteDirectDistance!).toFixed(2));
                        durationQuality = parseFloat((primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRouteDuration! / primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRouteDirectDuration!).toFixed(2));

                        outputLog = outputLog.concat(`    Flex route metrics distanceQuality=${distanceQuality}, durationQuality=${durationQuality}, overallQuality=${distanceQuality * durationQuality}\n`);

                        if (distanceQuality > 1.50 || durationQuality > 1.50 || (distanceQuality * durationQuality) > 1.70) {
                            hasGoodQuality = false
                        }
                    }
                }
            }

            distanceQuality = parseFloat((riderRouteDistance / riderDirectRouteDistance).toFixed(2));
            durationQuality = parseFloat((riderRouteDuration / (riderDrirectRouteDuration + riderTransitFlexibility)).toFixed(2));

            outputLog = outputLog.concat(`Rider Total Distance Metrics\n`);
            outputLog = outputLog.concat(`    totalRiderDistance=${riderRouteDistance}, totalRiderDuration=${riderRouteDuration}\n`);
            outputLog = outputLog.concat(`    riderDistanceQuality=${distanceQuality}, riderDurationQuality=${durationQuality}, riderOverallQuality=${distanceQuality * durationQuality}\n`);

            if (distanceQuality > 1.25 || durationQuality > 1.50 || (distanceQuality * durationQuality) > 1.50) {
                hasGoodQuality = false;
            }

            outputLog = outputLog.concat(`Route is ${hasGoodQuality ? `Accepted` : `Rejected`}\n`);

            primaryClassifiedRoute.routeEfficiency = parseFloat((distanceQuality * durationQuality).toFixed(2));

            // if (hasGoodQuality) {
            qualityCriteriaFilteredRoutes.push(primaryClassifiedRoute);
            // }

            outputLog = outputLog.concat(`******************************************************************************************************************************************************************************************************\n\n`)

        }));

        return { output: outputLog, data: qualityCriteriaFilteredRoutes };
    }
}