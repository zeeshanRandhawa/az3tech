import moment from "moment";
import { getDistanceDurationBetweenNodes, getDriverRoutesBetweenTimeFrame, normalizeTimeZone } from "../../util/helper.utility";
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
    async findRoutesPassingAtNode(arrivalDepartureDateTime: string, riderTimeFlexibility: number, nodeId: number, transitTime: number, destnationNodeId: number, routeClassification: RouteClassification, routesToExclude: Array<number>): Promise<Array<ClassifiedRoute>> {

        // node start and end time to search
        let dateTimeStartWindow: Moment = moment(arrivalDepartureDateTime, "YYYY-MM-DD HH:mm").clone().add(transitTime, "minutes");
        let dateTimeEndWindow: Moment = moment(arrivalDepartureDateTime, "YYYY-MM-DD HH:mm").clone().add(riderTimeFlexibility + transitTime, "minutes");

        // console.log(dateTimeStartWindow.utcOffset(0, true).format("YYYY-MM-DD[T]HH:mm:ss.000[Z]"), dateTimeEndWindow.utcOffset(0, true).format("YYYY-MM-DD[T]HH:mm:ss.000[Z]"))

        // query database layer to get routes from db
        // takes dateStart, dateEnd, nodeId, 
        const passingRoutesAtNode: Array<DriverRouteAssociatedNodeDto> = await getDriverRoutesBetweenTimeFrame(dateTimeStartWindow.utcOffset(0, true).format("YYYY-MM-DD[T]HH:mm:ss.000[Z]"), dateTimeEndWindow.utcOffset(0, true).format("YYYY-MM-DD[T]HH:mm:ss.000[Z]"), [nodeId]);

        // console.log(`    ${passingRoutesAtNode.length} routes available`);

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

                    // console.log(`     ${' '.repeat(routeClassification)}Node ${passingRoute.drouteNodes![riderDestinationRank].nodeId} (Destination) found *****************${routeClassification === 0 ? 'Direct' : routeClassification === 1 ? '1-stop' : '2-stop'} route found`);
                    // console.log(`   ${' '.repeat(routeClassification)}Destination found at node ${passingRoute.drouteNodes![riderDestinationRank].nodeId} for route ${passingRoute.drouteId}`)
                }

                // retime if it is flex route after inserting rider origin
                if (!passingRoute.fixedRoute) {
                    if (passingRoute.drouteNodes![riderOriginRank].status === "POTENTIAL") {

                        // console.log(`     ${' '.repeat(routeClassification)}Retime flex route ${passingRoute.drouteId} at node ${passingRoute.drouteNodes![riderOriginRank].nodeId} arriving at ${passingRoute.drouteNodes![riderOriginRank].arrivalTime}`)

                        // initial rank of scheduled node
                        let initialScheduledNodeRank: number = riderOriginRank;

                        // change node status
                        passingRoute.drouteNodes![initialScheduledNodeRank].status = "SCHEDULED";

                        // get node departuretime chenage it
                        let passingRouteOriginNodeDepartureTime: Moment = moment.utc(passingRoute.drouteNodes![initialScheduledNodeRank].arrivalTime).clone().add(passingRoute.drouteNodes![initialScheduledNodeRank].node?.transitTime ?? 0, "minutes");

                        let passingRouteOriginNodeCumulativeDistance: number = passingRoute.drouteNodes![initialScheduledNodeRank].cumDistance ?? 0;

                        passingRoute.drouteNodes![initialScheduledNodeRank].departureTime = passingRouteOriginNodeDepartureTime.clone().format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
                        passingRoute.drouteNodes![initialScheduledNodeRank].cumTime! = passingRoute.drouteNodes![initialScheduledNodeRank].cumTime! + passingRoute.drouteNodes![initialScheduledNodeRank].node?.transitTime!

                        let passingRouteOriginNodeCumulativeDuration: number = passingRoute.drouteNodes![initialScheduledNodeRank].cumTime ?? 0;

                        passingRoute.drouteNodes!.slice(riderOriginRank + 1).forEach(async (drouteNode: DriverRouteNodeAssocitedDto, index: number) => {

                            let calculatedDisDurBetweenNodes: Record<string, any> = await getDistanceDurationBetweenNodes(
                                { longitude: passingRoute.drouteNodes![initialScheduledNodeRank].node!.long, latitude: passingRoute.drouteNodes![initialScheduledNodeRank].node!.lat },
                                { longitude: drouteNode.node!.long, latitude: drouteNode.node!.lat }
                            );

                            drouteNode.arrivalTime = passingRouteOriginNodeDepartureTime.clone().add(calculatedDisDurBetweenNodes.duration, "seconds").format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
                            drouteNode.cumDistance = parseFloat((passingRouteOriginNodeCumulativeDistance + (calculatedDisDurBetweenNodes.distance / 1609.34)).toFixed(2));
                            drouteNode.cumTime = parseFloat((passingRouteOriginNodeCumulativeDuration + (calculatedDisDurBetweenNodes.duration / 60)).toFixed(2));

                            if (drouteNode.status === "SCHEDULED") {

                                passingRouteOriginNodeDepartureTime = moment.utc(drouteNode.arrivalTime).clone().add(drouteNode.node?.transitTime ?? 0, "minutes");

                                passingRouteOriginNodeCumulativeDistance = drouteNode.cumTime + (drouteNode.node?.transitTime ?? 0);

                                drouteNode.departureTime = passingRouteOriginNodeDepartureTime.clone().format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
                                drouteNode.cumTime = drouteNode.cumTime = passingRouteOriginNodeCumulativeDistance;

                                passingRouteOriginNodeCumulativeDuration = drouteNode.cumTime;
                                initialScheduledNodeRank = initialScheduledNodeRank + index + 1;
                            }

                        });

                    } else if (passingRoute.drouteNodes![riderOriginRank].status === "ORIGIN" || passingRoute.drouteNodes![riderOriginRank].status === "DESTINATION") {
                        passingRoute.drouteNodes![riderOriginRank].status = "SCHEDULED";
                    }
                }

                passingRoutesAtNodeClassified.push(new ClassifiedRoute(passingRoute, routeClassification, riderOriginRank, riderDestinationRank));

            } else {
                // console.log(`     ${' '.repeat(routeClassification)}${passingRoute.drouteId} already found in ${RouteClassification[routeClassification - 1]} route(s) rejecting...`)
            }
        }));

        return passingRoutesAtNodeClassified;
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    filterRoutesWithDestination(classifiedRoutes: Array<ClassifiedRoute>): Array<ClassifiedRoute> {
        const filteredRoutesWithDestination: Array<ClassifiedRoute> = this.filterRoutes(classifiedRoutes);
        return filteredRoutesWithDestination;
    }
    private filterRoutes(primaryClassifiedRoutes: Array<ClassifiedRoute>) {
        return primaryClassifiedRoutes.filter(primaryClassifiedRoute => {
            // console.log(`*Searching destination for primary route ${primaryClassifiedRoute.driverRoute.drouteId}`)
            // if (primaryClassifiedRoute.riedrDestinationRank === Infinity) {
            //     console.log("  Destination not found\n")
            // } else {
            //     console.log("  Destination found\n")
            // }
            primaryClassifiedRoute.intersectigRoutes = this.filterSecondaryRoutes(primaryClassifiedRoute.intersectigRoutes);
            return primaryClassifiedRoute.riedrDestinationRank !== Infinity || primaryClassifiedRoute.intersectigRoutes.length > 0;
        });
    }
    private filterSecondaryRoutes(secondaryClassifiedRoutes: Array<ClassifiedRoute>) {
        return secondaryClassifiedRoutes.filter(secondaryClassifiedRoute => {
            // console.log(` **Searching destination for secondary route ${secondaryClassifiedRoute.driverRoute.drouteId}`)
            secondaryClassifiedRoute.intersectigRoutes = this.filterTertiaryRoutes(secondaryClassifiedRoute.intersectigRoutes);
            // if (secondaryClassifiedRoute.riedrDestinationRank === Infinity) {
            //     console.log("    Destination not found\n")
            // } else {
            //     console.log("    Destination found\n")
            // }
            return secondaryClassifiedRoute.riedrDestinationRank !== Infinity || secondaryClassifiedRoute.intersectigRoutes.length > 0;
        });
    }
    private filterTertiaryRoutes(tertiaryClassifiedRoutes: Array<ClassifiedRoute>) {

        return tertiaryClassifiedRoutes.filter(tertiaryClassifiedRoute => {
            // console.log(`    ***Searching destination for tertiary route ${tertiaryClassifiedRoute.driverRoute.drouteId}`);
            // if (tertiaryClassifiedRoute.riedrDestinationRank === Infinity) {
            //     console.log("        Destination not found")
            // } else {
            //     console.log("        Destination found")
            // }
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

    async retimeDriverRouteByDestinationRank(classifiedRoutes: Array<ClassifiedRouteDto>): Promise<Array<ClassifiedRouteDto>> {
        // await Promise.all(classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRouteDto) => {

        for (let classifiedRoute of classifiedRoutes) {
            // if (!primaryClassifiedRoute.driverRoute.fixedRoute) {
            //     if (primaryClassifiedRoute.driverRoute.drouteNodes![primaryClassifiedRoute.riderDestinationRank].status === "POTENTIAL") {

            //         // initial rank of scheduled node
            //         let initialScheduledNodeRank: number = primaryClassifiedRoute.riderDestinationRank;

            //         // change node status
            //         primaryClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].status = "SCHEDULED";

            //         // get node departuretime chenage it
            //         let passingRouteOriginNodeDepartureTime: Moment = moment.utc(primaryClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].arrivalTime).clone().add(primaryClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].node?.transitTime ?? 0, "minutes");

            //         let passingRouteOriginNodeCumulativeDistance: number = primaryClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].cumDistance ?? 0;

            //         primaryClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].departureTime = passingRouteOriginNodeDepartureTime.clone().format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
            //         primaryClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].cumTime! = primaryClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].cumTime! + primaryClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].node?.transitTime!

            //         let passingRouteOriginNodeCumulativeDuration: number = primaryClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].cumTime ?? 0;

            //         primaryClassifiedRoute.driverRoute.drouteNodes!.slice(primaryClassifiedRoute.riderDestinationRank + 1).forEach(async (drouteNode: DriverRouteNodeAssocitedDto, index: number) => {

            //             let calculatedDisDurBetweenNodes: Record<string, any> = await getDistanceDurationBetweenNodes(
            //                 { longitude: primaryClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].node!.long, latitude: primaryClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].node!.lat },
            //                 { longitude: drouteNode.node!.long, latitude: drouteNode.node!.lat }
            //             );

            //             drouteNode.arrivalTime = passingRouteOriginNodeDepartureTime.clone().add(calculatedDisDurBetweenNodes.duration, "seconds").format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
            //             drouteNode.cumDistance = parseFloat((passingRouteOriginNodeCumulativeDistance + (calculatedDisDurBetweenNodes.distance / 1609.34)).toFixed(2));
            //             drouteNode.cumTime = parseFloat((passingRouteOriginNodeCumulativeDuration + (calculatedDisDurBetweenNodes.duration / 60)).toFixed(2));

            //             if (drouteNode.status === "SCHEDULED") {

            //                 passingRouteOriginNodeDepartureTime = moment.utc(drouteNode.arrivalTime).clone().add(drouteNode.node?.transitTime ?? 0, "minutes");

            //                 passingRouteOriginNodeCumulativeDistance = drouteNode.cumTime + (drouteNode.node?.transitTime ?? 0);

            //                 drouteNode.departureTime = passingRouteOriginNodeDepartureTime.clone().format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
            //                 drouteNode.cumTime = drouteNode.cumTime = passingRouteOriginNodeCumulativeDistance;

            //                 passingRouteOriginNodeCumulativeDuration = drouteNode.cumTime;
            //                 initialScheduledNodeRank = initialScheduledNodeRank + index + 1;
            //             }

            //         });

            //     } else if (primaryClassifiedRoute.driverRoute.drouteNodes![primaryClassifiedRoute.riderDestinationRank].status === "ORIGIN" || primaryClassifiedRoute.driverRoute.drouteNodes![primaryClassifiedRoute.riderDestinationRank].status === "DESTINATION") {
            //         primaryClassifiedRoute.driverRoute.drouteNodes![primaryClassifiedRoute.riderDestinationRank].status = "SCHEDULED";
            //     }
            // }


            // if (primaryClassifiedRoute.intersectingRoute) {
            //     if (!primaryClassifiedRoute.intersectingRoute.driverRoute.fixedRoute) {
            //         if (primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute.riderDestinationRank].status === "POTENTIAL") {

            //             // initial rank of scheduled node
            //             let initialScheduledNodeRank: number = primaryClassifiedRoute.intersectingRoute.riderDestinationRank;

            //             // change node status
            //             primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![initialScheduledNodeRank].status = "SCHEDULED";

            //             // get node departuretime chenage it
            //             let passingRouteOriginNodeDepartureTime: Moment = moment.utc(primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![initialScheduledNodeRank].arrivalTime).clone().add(primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![initialScheduledNodeRank].node?.transitTime ?? 0, "minutes");

            //             let passingRouteOriginNodeCumulativeDistance: number = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![initialScheduledNodeRank].cumDistance ?? 0;

            //             primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![initialScheduledNodeRank].departureTime = passingRouteOriginNodeDepartureTime.clone().format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
            //             primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![initialScheduledNodeRank].cumTime! = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![initialScheduledNodeRank].cumTime! + primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![initialScheduledNodeRank].node?.transitTime!

            //             let passingRouteOriginNodeCumulativeDuration: number = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![initialScheduledNodeRank].cumTime ?? 0;

            //             primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes!.slice(primaryClassifiedRoute.intersectingRoute.riderDestinationRank + 1).forEach(async (drouteNode: DriverRouteNodeAssocitedDto, index: number) => {

            //                 let calculatedDisDurBetweenNodes: Record<string, any> = await getDistanceDurationBetweenNodes(
            //                     { longitude: primaryClassifiedRoute.intersectingRoute!.driverRoute.drouteNodes![initialScheduledNodeRank].node!.long, latitude: primaryClassifiedRoute.intersectingRoute!.driverRoute.drouteNodes![initialScheduledNodeRank].node!.lat },
            //                     { longitude: drouteNode.node!.long, latitude: drouteNode.node!.lat }
            //                 );

            //                 drouteNode.arrivalTime = passingRouteOriginNodeDepartureTime.clone().add(calculatedDisDurBetweenNodes.duration, "seconds").format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
            //                 drouteNode.cumDistance = parseFloat((passingRouteOriginNodeCumulativeDistance + (calculatedDisDurBetweenNodes.distance / 1609.34)).toFixed(2));
            //                 drouteNode.cumTime = parseFloat((passingRouteOriginNodeCumulativeDuration + (calculatedDisDurBetweenNodes.duration / 60)).toFixed(2));

            //                 if (drouteNode.status === "SCHEDULED") {

            //                     passingRouteOriginNodeDepartureTime = moment.utc(drouteNode.arrivalTime).clone().add(drouteNode.node?.transitTime ?? 0, "minutes");

            //                     passingRouteOriginNodeCumulativeDistance = drouteNode.cumTime + (drouteNode.node?.transitTime ?? 0);

            //                     drouteNode.departureTime = passingRouteOriginNodeDepartureTime.clone().format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
            //                     drouteNode.cumTime = drouteNode.cumTime = passingRouteOriginNodeCumulativeDistance;

            //                     passingRouteOriginNodeCumulativeDuration = drouteNode.cumTime;
            //                     initialScheduledNodeRank = initialScheduledNodeRank + index + 1;
            //                 }

            //             });

            //         } else if (primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute.riderDestinationRank].status === "ORIGIN" || primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute.riderDestinationRank].status === "DESTINATION") {
            //             primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute.riderDestinationRank].status = "SCHEDULED";
            //         }
            //     }
            // }

            // if (primaryClassifiedRoute.intersectingRoute?.intersectingRoute) {
            //     if (!primaryClassifiedRoute.intersectingRoute!.intersectingRoute.driverRoute.fixedRoute) {
            //         if (primaryClassifiedRoute.intersectingRoute!.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute!.intersectingRoute.riderDestinationRank].status === "POTENTIAL") {

            //             // initial rank of scheduled node
            //             let initialScheduledNodeRank: number = primaryClassifiedRoute.intersectingRoute!.intersectingRoute.riderDestinationRank;

            //             // change node status
            //             primaryClassifiedRoute.intersectingRoute!.intersectingRoute.driverRoute.drouteNodes![initialScheduledNodeRank].status = "SCHEDULED";

            //             // get node departuretime chenage it
            //             let passingRouteOriginNodeDepartureTime: Moment = moment.utc(primaryClassifiedRoute.intersectingRoute!.intersectingRoute.driverRoute.drouteNodes![initialScheduledNodeRank].arrivalTime).clone().add(primaryClassifiedRoute.intersectingRoute!.intersectingRoute.driverRoute.drouteNodes![initialScheduledNodeRank].node?.transitTime ?? 0, "minutes");

            //             let passingRouteOriginNodeCumulativeDistance: number = primaryClassifiedRoute.intersectingRoute!.intersectingRoute.driverRoute.drouteNodes![initialScheduledNodeRank].cumDistance ?? 0;

            //             primaryClassifiedRoute.intersectingRoute!.intersectingRoute.driverRoute.drouteNodes![initialScheduledNodeRank].departureTime = passingRouteOriginNodeDepartureTime.clone().format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
            //             primaryClassifiedRoute.intersectingRoute!.intersectingRoute.driverRoute.drouteNodes![initialScheduledNodeRank].cumTime! = primaryClassifiedRoute.intersectingRoute!.intersectingRoute.driverRoute.drouteNodes![initialScheduledNodeRank].cumTime! + primaryClassifiedRoute.intersectingRoute!.intersectingRoute.driverRoute.drouteNodes![initialScheduledNodeRank].node?.transitTime!

            //             let passingRouteOriginNodeCumulativeDuration: number = primaryClassifiedRoute.intersectingRoute!.intersectingRoute.driverRoute.drouteNodes![initialScheduledNodeRank].cumTime ?? 0;

            //             primaryClassifiedRoute.intersectingRoute!.intersectingRoute.driverRoute.drouteNodes!.slice(primaryClassifiedRoute.intersectingRoute!.intersectingRoute.riderDestinationRank + 1).forEach(async (drouteNode: DriverRouteNodeAssocitedDto, index: number) => {

            //                 let calculatedDisDurBetweenNodes: Record<string, any> = await getDistanceDurationBetweenNodes(
            //                     { longitude: primaryClassifiedRoute.intersectingRoute!.intersectingRoute!.driverRoute.drouteNodes![initialScheduledNodeRank].node!.long, latitude: primaryClassifiedRoute.intersectingRoute!.intersectingRoute!.driverRoute.drouteNodes![initialScheduledNodeRank].node!.lat },
            //                     { longitude: drouteNode.node!.long, latitude: drouteNode.node!.lat }
            //                 );

            //                 drouteNode.arrivalTime = passingRouteOriginNodeDepartureTime.clone().add(calculatedDisDurBetweenNodes.duration, "seconds").format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
            //                 drouteNode.cumDistance = parseFloat((passingRouteOriginNodeCumulativeDistance + (calculatedDisDurBetweenNodes.distance / 1609.34)).toFixed(2));
            //                 drouteNode.cumTime = parseFloat((passingRouteOriginNodeCumulativeDuration + (calculatedDisDurBetweenNodes.duration / 60)).toFixed(2));

            //                 if (drouteNode.status === "SCHEDULED") {

            //                     passingRouteOriginNodeDepartureTime = moment.utc(drouteNode.arrivalTime).clone().add(drouteNode.node?.transitTime ?? 0, "minutes");

            //                     passingRouteOriginNodeCumulativeDistance = drouteNode.cumTime + (drouteNode.node?.transitTime ?? 0);

            //                     drouteNode.departureTime = passingRouteOriginNodeDepartureTime.clone().format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
            //                     drouteNode.cumTime = drouteNode.cumTime = passingRouteOriginNodeCumulativeDistance;

            //                     passingRouteOriginNodeCumulativeDuration = drouteNode.cumTime;
            //                     initialScheduledNodeRank = initialScheduledNodeRank + index + 1;
            //                 }

            //             });

            //         } else if (primaryClassifiedRoute.intersectingRoute!.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute!.intersectingRoute.riderDestinationRank].status === "ORIGIN" || primaryClassifiedRoute.intersectingRoute!.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute!.intersectingRoute.riderDestinationRank].status === "DESTINATION") {
            //             primaryClassifiedRoute.intersectingRoute!.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute!.intersectingRoute.riderDestinationRank].status = "SCHEDULED";
            //         }
            //     }
            // }

            // let routeChain: string = `Route ${classifiedRoute.driverRoute.drouteId}${classifiedRoute.intersectingRoute ? `->${classifiedRoute.intersectingRoute.driverRoute.drouteId}` : "->"}`;
            // routeChain = routeChain.concat(`${classifiedRoute.intersectingRoute?.intersectingRoute ? `->${classifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteId}` : "->"}`)
            // console.log((routeChain));

            classifiedRoute = await this.retimeRouteSection(classifiedRoute);

            if (classifiedRoute.intersectingRoute) {
                classifiedRoute.intersectingRoute = await this.retimeRouteSection(classifiedRoute.intersectingRoute);
            }
            if (classifiedRoute.intersectingRoute?.intersectingRoute) {

                classifiedRoute.intersectingRoute.intersectingRoute = await this.retimeRouteSection(classifiedRoute.intersectingRoute.intersectingRoute);
            }

        }
        // }));

        return classifiedRoutes;
    }

    async retimeRouteSection(partialClassifiedRoute: ClassifiedRouteDto): Promise<ClassifiedRouteDto> {
        if (!partialClassifiedRoute.driverRoute.fixedRoute) {
            if (partialClassifiedRoute.driverRoute.drouteNodes![partialClassifiedRoute.riderDestinationRank].status === "POTENTIAL") {

                // console.log(`Retime flex route ${partialClassifiedRoute.driverRoute.drouteId} at node ${partialClassifiedRoute.driverRoute.drouteNodes![partialClassifiedRoute.riderDestinationRank].nodeId} arriving at ${partialClassifiedRoute.driverRoute.drouteNodes![partialClassifiedRoute.riderDestinationRank].arrivalTime}`)


                // initial rank of scheduled node
                let initialScheduledNodeRank: number = partialClassifiedRoute.riderDestinationRank;

                // change node status
                partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].status = "SCHEDULED";

                // get node departuretime chenage it
                let passingRouteOriginNodeDepartureTime: Moment = moment.utc(partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].arrivalTime).clone().add(partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].node?.transitTime ?? 0, "minutes");

                let passingRouteOriginNodeCumulativeDistance: number = partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].cumDistance ?? 0;

                partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].departureTime = passingRouteOriginNodeDepartureTime.clone().format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
                partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].cumTime! = partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].cumTime! + partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].node?.transitTime!

                let passingRouteOriginNodeCumulativeDuration: number = partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].cumTime ?? 0;

                partialClassifiedRoute.driverRoute.drouteNodes!.slice(partialClassifiedRoute.riderDestinationRank + 1).forEach(async (drouteNode: DriverRouteNodeAssocitedDto, index: number) => {

                    let calculatedDisDurBetweenNodes: Record<string, any> = await getDistanceDurationBetweenNodes(
                        { longitude: partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].node!.long, latitude: partialClassifiedRoute.driverRoute.drouteNodes![initialScheduledNodeRank].node!.lat },
                        { longitude: drouteNode.node!.long, latitude: drouteNode.node!.lat }
                    );

                    drouteNode.arrivalTime = passingRouteOriginNodeDepartureTime.clone().add(calculatedDisDurBetweenNodes.duration, "seconds").format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
                    drouteNode.cumDistance = parseFloat((passingRouteOriginNodeCumulativeDistance + (calculatedDisDurBetweenNodes.distance / 1609.34)).toFixed(2));
                    drouteNode.cumTime = parseFloat((passingRouteOriginNodeCumulativeDuration + (calculatedDisDurBetweenNodes.duration / 60)).toFixed(2));

                    if (drouteNode.status === "SCHEDULED") {

                        passingRouteOriginNodeDepartureTime = moment.utc(drouteNode.arrivalTime).clone().add(drouteNode.node?.transitTime ?? 0, "minutes");

                        passingRouteOriginNodeCumulativeDistance = drouteNode.cumTime + (drouteNode.node?.transitTime ?? 0);

                        drouteNode.departureTime = passingRouteOriginNodeDepartureTime.clone().format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
                        drouteNode.cumTime = drouteNode.cumTime = passingRouteOriginNodeCumulativeDistance;

                        passingRouteOriginNodeCumulativeDuration = drouteNode.cumTime;
                        initialScheduledNodeRank = initialScheduledNodeRank + index + 1;
                    }

                });

            } else if (partialClassifiedRoute.driverRoute.drouteNodes![partialClassifiedRoute.riderDestinationRank].status === "ORIGIN" || partialClassifiedRoute.driverRoute.drouteNodes![partialClassifiedRoute.riderDestinationRank].status === "DESTINATION") {
                partialClassifiedRoute.driverRoute.drouteNodes![partialClassifiedRoute.riderDestinationRank].status = "SCHEDULED";
            }
        }
        return partialClassifiedRoute;
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

            // primaryClassifiedRoute.routeOriginDepartureTime = primaryClassifiedRoute.driverRoute.drouteNodes![primaryClassifiedRoute.riderOriginRank].departureTime as string;
            // primaryClassifiedRoute.routeDestinationArrivalTime = primaryClassifiedRoute.driverRoute.drouteNodes![primaryClassifiedRoute.riderDestinationRank].arrivalTime as string;

            // if (!primaryClassifiedRoute.driverRoute.fixedRoute) {
            //     let driverCumDistance: number = 0;
            //     let driverCumDuration: number = 0;

            //     let riderCumDistance: number = 0;
            //     let riderCumDuration: number = 0;

            //     let currentScheduledNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.driverRoute.drouteNodes![0];

            //     await Promise.all(primaryClassifiedRoute.driverRoute.drouteNodes!.slice(1).map((drouteNode: DriverRouteNodeAssocitedDto) => {
            //         if (drouteNode.status !== "POTENTIAL") {
            //             driverCumDistance += (drouteNode.cumDistance! - currentScheduledNode.cumDistance!);
            //             driverCumDuration += (drouteNode.cumTime! - currentScheduledNode.cumTime!);

            //             if (currentScheduledNode.rank! >= primaryClassifiedRoute.riderOriginRank && drouteNode.rank! <= primaryClassifiedRoute.riderDestinationRank) {

            //                 riderCumDistance += (drouteNode.cumDistance! - currentScheduledNode.cumDistance!);
            //                 riderCumDuration += (drouteNode.cumTime! - currentScheduledNode.cumTime!);
            //             }

            //             currentScheduledNode = drouteNode;

            //         }

            //     }));

            //     primaryClassifiedRoute.riderCumulativeDuration = parseFloat((riderCumDuration).toFixed(2));
            //     primaryClassifiedRoute.riderCumulativeDistance = riderCumDistance;

            //     primaryClassifiedRoute.driverRouteDistance = driverCumDistance;
            //     primaryClassifiedRoute.driverRouteDuration = driverCumDuration;

            // } else {
            //     let primaryFirstNodeDeparture: Moment = moment.utc(primaryClassifiedRoute.routeOriginDepartureTime, "YYYY-MM-DD HH:mm:ss[z]");
            //     let primaryLastNodeArrival: Moment = moment.utc(primaryClassifiedRoute.routeDestinationArrivalTime, "YYYY-MM-DD HH:mm:ss[z]");

            //     let primaryFirstNodeDistance: number = primaryClassifiedRoute.driverRoute.drouteNodes![primaryClassifiedRoute.riderOriginRank].cumDistance!;
            //     let primaryLastNodeDistance: number = primaryClassifiedRoute.driverRoute.drouteNodes![primaryClassifiedRoute.riderDestinationRank].cumDistance!;

            //     primaryClassifiedRoute.riderCumulativeDuration = parseFloat((primaryLastNodeArrival.diff(primaryFirstNodeDeparture, "minutes")).toFixed(2));
            //     primaryClassifiedRoute.riderCumulativeDistance = parseFloat((primaryLastNodeDistance - primaryFirstNodeDistance).toFixed(2));
            // }

            // if (primaryClassifiedRoute.intersectingRoute) {

            //     // intersecting 1st stop secondary
            //     primaryClassifiedRoute.intersectingRoute.routeOriginDepartureTime = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute.riderOriginRank].departureTime as string;
            //     primaryClassifiedRoute.intersectingRoute.routeDestinationArrivalTime = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute.riderDestinationRank].arrivalTime as string;

            //     if (!primaryClassifiedRoute.intersectingRoute.driverRoute.fixedRoute) {
            //         let driverCumDistance: number = 0;
            //         let driverCumDuration: number = 0;

            //         let riderCumDistance: number = 0;
            //         let riderCumDuration: number = 0;

            //         let currentScheduledNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![0];

            //         await Promise.all(primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes!.slice(1).map((drouteNode: DriverRouteNodeAssocitedDto) => {
            //             if (drouteNode.status !== "POTENTIAL") {
            //                 driverCumDistance += (drouteNode.cumDistance! - currentScheduledNode.cumDistance!);
            //                 driverCumDuration += (drouteNode.cumTime! - currentScheduledNode.cumTime!);

            //                 if (currentScheduledNode.rank! >= primaryClassifiedRoute.intersectingRoute!.riderOriginRank && drouteNode.rank! <= primaryClassifiedRoute.intersectingRoute!.riderDestinationRank) {
            //                     riderCumDistance += (drouteNode.cumDistance! - currentScheduledNode.cumDistance!);
            //                     riderCumDuration += (drouteNode.cumTime! - currentScheduledNode.cumTime!);
            //                 }
            //                 currentScheduledNode = drouteNode;

            //             }

            //         }));

            //         primaryClassifiedRoute.intersectingRoute.riderCumulativeDuration = parseFloat((riderCumDuration).toFixed(2));
            //         primaryClassifiedRoute.intersectingRoute.riderCumulativeDistance = riderCumDistance;

            //         primaryClassifiedRoute.intersectingRoute.driverRouteDistance = driverCumDistance;
            //         primaryClassifiedRoute.intersectingRoute.driverRouteDuration = driverCumDuration;

            //     } else {

            //         let secondaryFirstNodeDeparture: Moment = moment.utc(primaryClassifiedRoute.intersectingRoute.routeOriginDepartureTime, "YYYY-MM-DD HH:mm:ss[z]");
            //         let secondaryLastNodeArrival: Moment = moment.utc(primaryClassifiedRoute.intersectingRoute.routeDestinationArrivalTime, "YYYY-MM-DD HH:mm:ss[z]");

            //         let secondaryFirstNodeDistance: number = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute.riderOriginRank].cumDistance!;
            //         let secondaryLastNodeDistance: number = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute.riderDestinationRank].cumDistance!;

            //         primaryClassifiedRoute.intersectingRoute.riderCumulativeDuration = parseFloat((secondaryLastNodeArrival.diff(secondaryFirstNodeDeparture, "minutes")).toFixed(2));
            //         primaryClassifiedRoute.intersectingRoute.riderCumulativeDistance = parseFloat((secondaryLastNodeDistance - secondaryFirstNodeDistance).toFixed(2));
            //     }

            //     if (primaryClassifiedRoute.intersectingRoute.intersectingRoute) {

            //         // intersecting 2nd stop tertiary
            //         primaryClassifiedRoute.intersectingRoute.intersectingRoute.routeOriginDepartureTime = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderOriginRank].departureTime as string;
            //         primaryClassifiedRoute.intersectingRoute.intersectingRoute.routeDestinationArrivalTime = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderDestinationRank].arrivalTime as string;

            //         if (!primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.fixedRoute) {
            //             let driverCumDistance: number = 0;
            //             let driverCumDuration: number = 0;

            //             let riderCumDistance: number = 0;
            //             let riderCumDuration: number = 0;

            //             let currentScheduledNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes![0];

            //             await Promise.all(primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes!.slice(1).map((drouteNode: DriverRouteNodeAssocitedDto) => {
            //                 if (drouteNode.status !== "POTENTIAL") {
            //                     driverCumDistance += (drouteNode.cumDistance! - currentScheduledNode.cumDistance!);
            //                     driverCumDuration += (drouteNode.cumTime! - currentScheduledNode.cumTime!);

            //                     if (currentScheduledNode.rank! >= primaryClassifiedRoute.intersectingRoute!.intersectingRoute!.riderOriginRank && drouteNode.rank! <= primaryClassifiedRoute.intersectingRoute!.intersectingRoute!.riderDestinationRank) {
            //                         riderCumDistance += (drouteNode.cumDistance! - currentScheduledNode.cumDistance!);
            //                         riderCumDuration += (drouteNode.cumTime! - currentScheduledNode.cumTime!);
            //                     }

            //                     currentScheduledNode = drouteNode;

            //                 }

            //             }));

            //             primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderCumulativeDuration = parseFloat((riderCumDuration).toFixed(2));
            //             primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderCumulativeDistance = riderCumDistance;

            //             primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRouteDistance = driverCumDistance;
            //             primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRouteDuration = driverCumDuration;

            //         } else {

            //             let tertiaryFirstNodeDeparture: Moment = moment.utc(primaryClassifiedRoute.intersectingRoute.intersectingRoute.routeOriginDepartureTime, "YYYY-MM-DD HH:mm:ss[z]");
            //             let tertiaryLastNodeArrival: Moment = moment.utc(primaryClassifiedRoute.intersectingRoute.intersectingRoute.routeDestinationArrivalTime, "YYYY-MM-DD HH:mm:ss[z]");

            //             let tertiaryFirstNodeDistance: number = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderOriginRank].cumDistance!;
            //             let tertiaryLastNodeDistance: number = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderDestinationRank].cumDistance!;

            //             primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderCumulativeDuration = parseFloat((tertiaryLastNodeArrival.diff(tertiaryFirstNodeDeparture, "minutes")).toFixed(2));
            //             primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderCumulativeDistance = parseFloat((tertiaryLastNodeDistance - tertiaryFirstNodeDistance).toFixed(2));
            //         }
            //     }
            // }
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

            await Promise.all(classifiedRouteSection.driverRoute.drouteNodes!.slice(1).map((drouteNode: DriverRouteNodeAssocitedDto) => {
                if (drouteNode.status !== "POTENTIAL") {
                    driverCumDistance += (drouteNode.cumDistance! - currentScheduledNode.cumDistance!);
                    driverCumDuration += (drouteNode.cumTime! - currentScheduledNode.cumTime!);

                    if (currentScheduledNode.rank! >= classifiedRouteSection.riderOriginRank && drouteNode.rank! <= classifiedRouteSection.riderDestinationRank) {

                        riderCumDistance += (drouteNode.cumDistance! - currentScheduledNode.cumDistance!);
                        riderCumDuration += (drouteNode.cumTime! - currentScheduledNode.cumTime!);
                    }

                    currentScheduledNode = drouteNode;

                }

            }));

            classifiedRouteSection.riderCumulativeDuration = parseFloat((riderCumDuration).toFixed(2));
            classifiedRouteSection.riderCumulativeDistance = riderCumDistance;

            classifiedRouteSection.driverRouteDistance = driverCumDistance;
            classifiedRouteSection.driverRouteDuration = driverCumDuration;

        } else {
            let primaryFirstNodeDeparture: Moment = moment.utc(classifiedRouteSection.routeOriginDepartureTime, "YYYY-MM-DD HH:mm:ss[z]");
            let primaryLastNodeArrival: Moment = moment.utc(classifiedRouteSection.routeDestinationArrivalTime, "YYYY-MM-DD HH:mm:ss[z]");

            let primaryFirstNodeDistance: number = classifiedRouteSection.driverRoute.drouteNodes![classifiedRouteSection.riderOriginRank].cumDistance!;
            let primaryLastNodeDistance: number = classifiedRouteSection.driverRoute.drouteNodes![classifiedRouteSection.riderDestinationRank].cumDistance!;

            classifiedRouteSection.riderCumulativeDuration = parseFloat((primaryLastNodeArrival.diff(primaryFirstNodeDeparture, "minutes")).toFixed(2));
            classifiedRouteSection.riderCumulativeDistance = parseFloat((primaryLastNodeDistance - primaryFirstNodeDistance).toFixed(2));
        }

        return classifiedRouteSection;
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    async checkQOSMetrics(classifiedRoutes: Array<ClassifiedRouteDto>, riderDirectRouteDistance: number, riderDrirectRouteDuration: number): Promise<Array<ClassifiedRouteDto>> {

        const qualityCriteriaFilteredRoutes: Array<ClassifiedRouteDto> = [];

        await Promise.all(classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRouteDto) => {


            // let routeChain: string = `Route ${primaryClassifiedRoute.driverRoute.drouteId}${primaryClassifiedRoute.intersectingRoute ? `->${primaryClassifiedRoute.intersectingRoute.driverRoute.drouteId}` : "->"}`;
            // routeChain = routeChain.concat(`${primaryClassifiedRoute.intersectingRoute?.intersectingRoute ? `->${primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteId}` : "->"}`)
            // console.log((routeChain));



            let riderRouteDistance: number = 0;
            let riderRouteDuration: number = 0;

            let distanceQuality: number;
            let durationQuality: number;
            let hasGoodQuality: boolean = true;

            // primary
            riderRouteDistance += primaryClassifiedRoute.riderCumulativeDistance!;
            riderRouteDuration += primaryClassifiedRoute.riderCumulativeDuration!;

            if (!primaryClassifiedRoute.driverRoute.fixedRoute) {
                distanceQuality = parseFloat((primaryClassifiedRoute.driverRouteDistance! / primaryClassifiedRoute.driverRouteDirectDistance!).toFixed(2));
                durationQuality = parseFloat((primaryClassifiedRoute.driverRouteDuration! / primaryClassifiedRoute.driverRouteDirectDuration!).toFixed(2));

                if (distanceQuality > 1.50 || durationQuality > 1.50 || (distanceQuality * durationQuality) > 1.70) {
                    hasGoodQuality = false
                }
            }

            if (primaryClassifiedRoute.intersectingRoute) {

                //secondary
                riderRouteDistance += primaryClassifiedRoute.intersectingRoute.riderCumulativeDistance!;
                riderRouteDuration += primaryClassifiedRoute.intersectingRoute.riderCumulativeDuration!;

                if (!primaryClassifiedRoute.intersectingRoute.driverRoute.fixedRoute) {
                    distanceQuality = parseFloat((primaryClassifiedRoute.intersectingRoute.driverRouteDistance! / primaryClassifiedRoute.intersectingRoute.driverRouteDirectDistance!).toFixed(2));
                    durationQuality = parseFloat((primaryClassifiedRoute.intersectingRoute.driverRouteDuration! / primaryClassifiedRoute.intersectingRoute.driverRouteDirectDuration!).toFixed(2));

                    if (distanceQuality > 1.50 || durationQuality > 1.50 || (distanceQuality * durationQuality) > 1.70) {
                        hasGoodQuality = false
                    }
                }

                if (primaryClassifiedRoute.intersectingRoute.intersectingRoute) {

                    //tertiary
                    riderRouteDistance += primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderCumulativeDistance!;
                    riderRouteDuration += primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderCumulativeDuration!;

                    if (!primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.fixedRoute) {
                        distanceQuality = parseFloat((primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRouteDistance! / primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRouteDirectDistance!).toFixed(2));
                        durationQuality = parseFloat((primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRouteDuration! / primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRouteDirectDuration!).toFixed(2));

                        if (distanceQuality > 1.50 || durationQuality > 1.50 || (distanceQuality * durationQuality) > 1.70) {
                            hasGoodQuality = false
                        }
                    }
                }
            }

            distanceQuality = parseFloat((riderRouteDistance / riderDirectRouteDistance).toFixed(2));
            durationQuality = parseFloat((riderRouteDuration / riderDrirectRouteDuration).toFixed(2));

            if (distanceQuality > 1.25 || durationQuality > 1.50 || (distanceQuality * durationQuality) > 1.50) {
                hasGoodQuality = false;
            }

            primaryClassifiedRoute.routeEfficiency = parseFloat((distanceQuality * durationQuality).toFixed(2));

            // if (hasGoodQuality) {
            qualityCriteriaFilteredRoutes.push(primaryClassifiedRoute);
            // }

        }));

        return qualityCriteriaFilteredRoutes;
    }
}