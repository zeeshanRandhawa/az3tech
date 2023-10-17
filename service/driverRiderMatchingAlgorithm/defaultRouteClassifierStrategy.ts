import moment from "moment";
import { calculateDistanceBetweenPoints, getDistanceDurationBetweenNodes, getDriverRoutesBetweenTimeFrame } from "../../util/helper.utility";
import { ClassifiedRouteDto, DriverRouteAssociatedNodeDto, DriverRouteNodeAssocitedDto, QualityMetrics, RouteClassification } from "../../util/interface.utility";
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

        let dateTimeStartWindow: string = moment(arrivalDepartureDateTime, "YYYY-MM-DD HH:mm").clone().add(transitTime, "minutes").utcOffset(0, true).format("YYYY-MM-DD HH:mm:ss[Z]");
        let dateTimeEndWindow: string = moment(arrivalDepartureDateTime, "YYYY-MM-DD HH:mm").clone().add(riderTimeFlexibility + transitTime, "minutes").utcOffset(0, true).format("YYYY-MM-DD HH:mm:ss[Z]");

        const passingRoutesAtNode: Array<DriverRouteAssociatedNodeDto> = await getDriverRoutesBetweenTimeFrame(dateTimeStartWindow, dateTimeEndWindow, [nodeId]);

        const passingRoutesAtNodeClassified: Array<ClassifiedRoute> = (await Promise.all(passingRoutesAtNode.map(
            async (passingRoute: DriverRouteAssociatedNodeDto) => {

                if (!routesToExclude.includes(passingRoute.drouteId)) {

                    let originRank: number = Infinity;
                    let destinationRank: number = Infinity;

                    await Promise.all(passingRoute.drouteNodes!.map(async (drouteNode: DriverRouteNodeAssocitedDto) => {
                        if (drouteNode.nodeId === nodeId) {
                            originRank = drouteNode.rank ?? Infinity;
                        }
                    }));
                    if (originRank !== Infinity) {
                        passingRoute.drouteNodes = passingRoute.drouteNodes?.filter((dRouteNode: DriverRouteNodeAssocitedDto) => {

                            return dRouteNode.rank! >= originRank;
                        });
                    }

                    await Promise.all(passingRoute.drouteNodes!.map(async (dRouteNode: DriverRouteNodeAssocitedDto) => {
                        if (destnationNodeId === dRouteNode.nodeId && dRouteNode.rank! > originRank) {
                            destinationRank = dRouteNode.rank ?? Infinity;
                        }
                    }));

                    if (!passingRoute.fixedRoute) {
                        if (passingRoute.drouteNodes![0].status === "POTENTIAL") {

                            let passingRouteOriginNodeDepartureTime: Moment = moment(passingRoute.drouteNodes![0].arrivalTime).clone().add(passingRoute.drouteNodes![0].node?.transitTime ?? 0, "minutes");

                            let passingRouteOriginNodeCumulativeDistance: number = passingRoute.drouteNodes![0].cumDistance ?? 0;

                            passingRoute.drouteNodes![0].departureTime = passingRouteOriginNodeDepartureTime.clone().format("YYYY-MM-DD HH:mm:ss[Z]");
                            passingRoute.drouteNodes![0].cumTime! += passingRoute.drouteNodes![0].cumTime! + passingRoute.drouteNodes![0].node?.transitTime!

                            let passingRouteOriginNodeCumulativeDuration: number = passingRoute.drouteNodes![0].cumTime ?? 0;

                            await Promise.all(passingRoute.drouteNodes!.slice(1).map(async (drouteNode: DriverRouteNodeAssocitedDto) => {

                                let calculatedDisDurBetweenNodes: Record<string, any> = await getDistanceDurationBetweenNodes(
                                    { longitude: passingRoute.drouteNodes![0].node!.long, latitude: passingRoute.drouteNodes![0].node!.lat },
                                    { longitude: drouteNode.node!.long, latitude: drouteNode.node!.lat }
                                );

                                drouteNode.arrivalTime = passingRouteOriginNodeDepartureTime.clone().add(calculatedDisDurBetweenNodes.duration, "seconds").format("YYYY-MM-DD HH:mm:ss[Z]");
                                drouteNode.cumDistance = parseFloat((passingRouteOriginNodeCumulativeDistance + calculatedDisDurBetweenNodes.duration).toFixed(2));
                                drouteNode.cumTime = parseFloat((passingRouteOriginNodeCumulativeDuration + (calculatedDisDurBetweenNodes.distance / 1609.34)).toFixed(2));

                            }));

                        }
                    }

                    return new ClassifiedRoute(passingRoute, routeClassification, originRank, destinationRank);

                }
                return;
            }))).filter(Boolean) as Array<ClassifiedRoute>;

        return passingRoutesAtNodeClassified;
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    filterRoutesWithDestination(classifiedRoutes: Array<ClassifiedRoute>): Array<ClassifiedRoute> {
        const filteredRoutesWithDestination: Array<ClassifiedRoute> = this.filterRoutes(classifiedRoutes);
        return filteredRoutesWithDestination;
    }
    private filterRoutes(primaryClassifiedRoutes: Array<ClassifiedRoute>) {
        return primaryClassifiedRoutes.filter(primaryClassifiedRoute => {

            primaryClassifiedRoute.intersectigRoutes = this.filterSecondaryRoutes(primaryClassifiedRoute.intersectigRoutes);
            return primaryClassifiedRoute.destinationRank !== Infinity || primaryClassifiedRoute.intersectigRoutes.length > 0;
        });
    }
    private filterSecondaryRoutes(secondaryClassifiedRoutes: Array<ClassifiedRoute>) {
        return secondaryClassifiedRoutes.filter(secondaryClassifiedRoute => {
            secondaryClassifiedRoute.intersectigRoutes = this.filterTertiaryRoutes(secondaryClassifiedRoute.intersectigRoutes);
            return secondaryClassifiedRoute.destinationRank !== Infinity || secondaryClassifiedRoute.intersectigRoutes.length > 0;
        });
    }
    private filterTertiaryRoutes(tertiaryClassifiedRoutes: Array<ClassifiedRoute>) {
        return tertiaryClassifiedRoutes.filter(tertiaryClassifiedRoute => {
            return tertiaryClassifiedRoute.destinationRank !== Infinity
        });
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    async seperateClassifiedRoutes(classifiedRoutes: Array<ClassifiedRoute>): Promise<Array<ClassifiedRouteDto>> {
        const finalClassifiedRoutes: Array<ClassifiedRouteDto> = [];

        await Promise.all(classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRoute) => {
            if (primaryClassifiedRoute.destinationRank !== Infinity) {
                let primaryRouteDto: ClassifiedRouteDto = {
                    classification: primaryClassifiedRoute.classification, originRank: primaryClassifiedRoute.originRank,
                    destinationRank: primaryClassifiedRoute.destinationRank, driverRoute: JSON.parse(JSON.stringify(primaryClassifiedRoute.driverRoute)),
                }
                finalClassifiedRoutes.push(primaryRouteDto);
            }
            await Promise.all(primaryClassifiedRoute.intersectigRoutes.map(async (secondaryClassifiedRoute: ClassifiedRoute) => {
                if (secondaryClassifiedRoute.destinationRank !== Infinity) {
                    let secondaryRouteDto: ClassifiedRouteDto = {
                        classification: secondaryClassifiedRoute.classification, originRank: secondaryClassifiedRoute.originRank,
                        destinationRank: secondaryClassifiedRoute.destinationRank, driverRoute: JSON.parse(JSON.stringify(secondaryClassifiedRoute.driverRoute)),

                    }
                    let primaryRouteDto: ClassifiedRouteDto = {
                        classification: primaryClassifiedRoute.classification, originRank: primaryClassifiedRoute.originRank,
                        destinationRank: primaryClassifiedRoute.destinationRank, intersectingRoute: JSON.parse(JSON.stringify(secondaryRouteDto)),
                        driverRoute: JSON.parse(JSON.stringify(primaryClassifiedRoute.driverRoute)),
                    }
                    finalClassifiedRoutes.push(primaryRouteDto);
                }
                await Promise.all(secondaryClassifiedRoute.intersectigRoutes.map(async (tertiaryClassifiedRoute: ClassifiedRoute) => {
                    if (tertiaryClassifiedRoute.destinationRank !== Infinity) {
                        let tertiaryRouteDto: ClassifiedRouteDto = {
                            classification: tertiaryClassifiedRoute.classification, originRank: tertiaryClassifiedRoute.originRank,
                            destinationRank: tertiaryClassifiedRoute.destinationRank, driverRoute: JSON.parse(JSON.stringify(tertiaryClassifiedRoute.driverRoute)),
                        }
                        let secondaryRouteDto: ClassifiedRouteDto = {
                            classification: secondaryClassifiedRoute.classification, originRank: secondaryClassifiedRoute.originRank,
                            destinationRank: secondaryClassifiedRoute.destinationRank, intersectingRoute: JSON.parse(JSON.stringify(tertiaryRouteDto)),
                            driverRoute: JSON.parse(JSON.stringify(secondaryClassifiedRoute.driverRoute)),
                        }
                        let primaryRouteDto: ClassifiedRouteDto = {
                            classification: primaryClassifiedRoute.classification, originRank: primaryClassifiedRoute.originRank,
                            destinationRank: primaryClassifiedRoute.destinationRank, intersectingRoute: JSON.parse(JSON.stringify(secondaryRouteDto)),
                            driverRoute: JSON.parse(JSON.stringify(primaryClassifiedRoute.driverRoute)),
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

    async removeUnnecessaryNodes(classifiedRoutes: Array<ClassifiedRouteDto>): Promise<Array<ClassifiedRouteDto>> {

        await Promise.all(classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRouteDto) => {
            if (primaryClassifiedRoute.intersectingRoute) {

                let primaryNodeRank: number = Infinity;
                await Promise.all(primaryClassifiedRoute.driverRoute.drouteNodes!.map((dRouteNode: DriverRouteNodeAssocitedDto) => {
                    if (dRouteNode.nodeId === primaryClassifiedRoute.intersectingRoute!.driverRoute.drouteNodes![0].nodeId) {
                        primaryNodeRank = dRouteNode.rank!;
                    }
                }));
                primaryClassifiedRoute.driverRoute.drouteNodes = primaryClassifiedRoute.driverRoute.drouteNodes?.filter(drouteNode => drouteNode.rank! <= primaryNodeRank);
                primaryClassifiedRoute.destinationRank = Infinity;

                if (primaryClassifiedRoute.intersectingRoute.intersectingRoute) {

                    let secondaryNodeRank: number = Infinity;
                    await Promise.all(primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes!.map((dRouteNode: DriverRouteNodeAssocitedDto) => {
                        if (dRouteNode.nodeId === primaryClassifiedRoute.intersectingRoute!.intersectingRoute!.driverRoute.drouteNodes![0].nodeId) {
                            secondaryNodeRank = dRouteNode.rank!;
                        }
                    }));
                    primaryClassifiedRoute.intersectingRoute!.driverRoute.drouteNodes = primaryClassifiedRoute.intersectingRoute!.driverRoute.drouteNodes?.filter(drouteNode => drouteNode.rank! <= secondaryNodeRank)
                    primaryClassifiedRoute.intersectingRoute!.destinationRank = Infinity;

                    primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes?.filter(drouteNode => drouteNode.rank! <= primaryClassifiedRoute.intersectingRoute!.intersectingRoute!.destinationRank);


                } else {
                    primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes?.filter(drouteNode => drouteNode.rank! <= primaryClassifiedRoute.intersectingRoute!.destinationRank);
                }

            } else {
                primaryClassifiedRoute.driverRoute.drouteNodes = primaryClassifiedRoute.driverRoute.drouteNodes?.filter(drouteNode => drouteNode.rank! <= primaryClassifiedRoute.destinationRank);
            }
        }));

        return classifiedRoutes;
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    async calculateCumulativeDistanceDuration(classifiedRoutes: Array<ClassifiedRouteDto>): Promise<Array<ClassifiedRouteDto>> {

        await Promise.all(classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRouteDto) => {

            primaryClassifiedRoute.routeOriginDepartureTime = primaryClassifiedRoute.driverRoute.drouteNodes?.slice(0, 1)[0].departureTime as string;
            primaryClassifiedRoute.routeDestinationArrivalTime = primaryClassifiedRoute.driverRoute.drouteNodes?.slice(-1)[0].arrivalTime as string;

            let primaryFirstNodeDeparture: Moment = moment(primaryClassifiedRoute.routeOriginDepartureTime, "YYYY-MM-DD HH:mm:ss[z]");
            let primaryLastNodeArrival: Moment = moment(primaryClassifiedRoute.routeDestinationArrivalTime, "YYYY-MM-DD HH:mm:ss[z]");

            let primaryFirstNodeDistance: number = primaryClassifiedRoute.driverRoute.drouteNodes?.slice(0, 1)[0].cumDistance!;
            let primaryLastNodeDistance: number = primaryClassifiedRoute.driverRoute.drouteNodes?.slice(-1)[0].cumDistance!;

            primaryClassifiedRoute.cumDuration = primaryLastNodeArrival.diff(primaryFirstNodeDeparture, "minutes");
            primaryClassifiedRoute.cumDistance = parseFloat((primaryLastNodeDistance - primaryFirstNodeDistance).toFixed(2));

            if (primaryClassifiedRoute.intersectingRoute) {

                primaryClassifiedRoute.intersectingRoute.routeOriginDepartureTime = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes?.slice(0, 1)[0].departureTime as string;
                primaryClassifiedRoute.intersectingRoute.routeDestinationArrivalTime = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes?.slice(-1)[0].arrivalTime as string;

                let secondaryFirstNodeDeparture: Moment = moment(primaryClassifiedRoute.intersectingRoute.routeOriginDepartureTime, "YYYY-MM-DD HH:mm:ss[z]");
                let secondaryLastNodeArrival: Moment = moment(primaryClassifiedRoute.intersectingRoute.routeDestinationArrivalTime, "YYYY-MM-DD HH:mm:ss[z]");

                let secondaryFirstNodeDistance: number = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes?.slice(0, 1)[0].cumDistance!;
                let secondaryLastNodeDistance: number = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes?.slice(-1)[0].cumDistance!;

                primaryClassifiedRoute.intersectingRoute.cumDuration = secondaryLastNodeArrival.diff(secondaryFirstNodeDeparture, "minutes")
                //  + primaryClassifiedRoute.cumDuration;
                primaryClassifiedRoute.intersectingRoute.cumDistance = parseFloat((secondaryLastNodeDistance - secondaryFirstNodeDistance).toFixed(2))
                //  + primaryClassifiedRoute.cumDistance).toFixed(2));


                if (primaryClassifiedRoute.intersectingRoute.intersectingRoute) {

                    primaryClassifiedRoute.intersectingRoute.routeOriginDepartureTime = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes?.slice(0, 1)[0].departureTime as string;
                    primaryClassifiedRoute.intersectingRoute.routeDestinationArrivalTime = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes?.slice(-1)[0].arrivalTime as string;

                    let tertiaryFirstNodeDeparture: Moment = moment(primaryClassifiedRoute.intersectingRoute.routeOriginDepartureTime, "YYYY-MM-DD HH:mm:ss[z]");
                    let tertiaryLastNodeArrival: Moment = moment(primaryClassifiedRoute.intersectingRoute.routeDestinationArrivalTime, "YYYY-MM-DD HH:mm:ss[z]");

                    let tertiaryFirstNodeDistance: number = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes?.slice(0, 1)[0].cumDistance!;
                    let tertiaryLastNodeDistance: number = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes?.slice(-1)[0].cumDistance!;

                    primaryClassifiedRoute.intersectingRoute.intersectingRoute.cumDuration = tertiaryLastNodeArrival.diff(tertiaryFirstNodeDeparture, "minutes")
                    //  + primaryClassifiedRoute.intersectingRoute.cumDuration;
                    primaryClassifiedRoute.intersectingRoute.intersectingRoute.cumDistance = parseFloat((tertiaryLastNodeDistance - tertiaryFirstNodeDistance).toFixed(2))
                    //  + primaryClassifiedRoute.intersectingRoute.cumDistance).toFixed(2));

                }
            }
        }));

        return classifiedRoutes;

    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    async checkQOSMetrics(classifiedRoutes: Array<ClassifiedRouteDto>, directPathDistance: number, directPathDuration: number): Promise<Array<ClassifiedRouteDto>> {

        const qualityCriteriaFilteredRoutes: Array<ClassifiedRouteDto> = [];

        await Promise.all(classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRouteDto) => {

            let distanceQuality: number;
            let durationQuality: number;
            let hasGoodQuality: boolean = true;

            // primary
            distanceQuality = parseFloat((primaryClassifiedRoute.cumDistance! / directPathDistance).toFixed(2));
            durationQuality = parseFloat((primaryClassifiedRoute.cumDuration! / directPathDuration).toFixed(2));
            if (primaryClassifiedRoute.driverRoute.fixedRoute) {
                if (distanceQuality > 1.25 || durationQuality > 1.50 || (distanceQuality * durationQuality) > 1.50) {
                    hasGoodQuality = false
                }
            } else {
                if (distanceQuality > 1.50 || durationQuality > 1.50 || (distanceQuality * durationQuality) > 1.70) {
                    hasGoodQuality = false
                }
            }
            primaryClassifiedRoute.routeEfficiency = distanceQuality * durationQuality;

            if (primaryClassifiedRoute.intersectingRoute) {

                //secondary
                distanceQuality = parseFloat((primaryClassifiedRoute.intersectingRoute.cumDistance! / directPathDistance).toFixed(2));
                durationQuality = parseFloat((primaryClassifiedRoute.intersectingRoute.cumDuration! / directPathDuration).toFixed(2));
                if (primaryClassifiedRoute.intersectingRoute.driverRoute.fixedRoute) {
                    if (distanceQuality > 1.25 || durationQuality > 1.50 || (distanceQuality * durationQuality) > 1.50) {
                        hasGoodQuality = false
                    }
                } else {
                    if (distanceQuality > 1.50 || durationQuality > 1.50 || (distanceQuality * durationQuality) > 1.70) {
                        hasGoodQuality = false
                    }
                }
                primaryClassifiedRoute.intersectingRoute.routeEfficiency = distanceQuality * durationQuality;

                if (primaryClassifiedRoute.intersectingRoute.intersectingRoute) {

                    //tertiary
                    distanceQuality = parseFloat((primaryClassifiedRoute.intersectingRoute.intersectingRoute.cumDistance! / directPathDistance).toFixed(2));
                    durationQuality = parseFloat((primaryClassifiedRoute.intersectingRoute.intersectingRoute.cumDuration! / directPathDuration).toFixed(2));

                    if (primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.fixedRoute) {
                        if (distanceQuality > 1.25 || durationQuality > 1.50 || (distanceQuality * durationQuality) > 1.50) {
                            hasGoodQuality = false
                        }
                    } else {
                        if (distanceQuality > 1.50 || durationQuality > 1.50 || (distanceQuality * durationQuality) > 1.70) {
                            hasGoodQuality = false
                        }
                    }
                    primaryClassifiedRoute.intersectingRoute.intersectingRoute.routeEfficiency = distanceQuality * durationQuality;
                }
            }

            if (hasGoodQuality) {
                qualityCriteriaFilteredRoutes.push(primaryClassifiedRoute);
            }

        }));

        return qualityCriteriaFilteredRoutes;
    }



    // async checkQOSMetrics(classifiedRoutes: Array<ClassifiedRouteDto>, directPathDistance: number, directPathDuration: number): Promise<Array<ClassifiedRouteDto>> {

    //     const qualityCriteriaFilteredRoutes: Array<ClassifiedRouteDto> = [];

    //     await Promise.all(classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRouteDto) => {

    //         let distanceQuality: number;
    //         let durationQuality: number;


    //         let hasGoodQuality: boolean = true;

    //         // let routeCumulativeDistance: number | null;
    //         // let routeCumulativeDuration: number | null;

    //         if (primaryClassifiedRoute.intersectingRoute) {
    //             if (primaryClassifiedRoute.intersectingRoute.intersectingRoute) {
    //                 //tertiary

    //                 // routeCumulativeDistance = primaryClassifiedRoute.cumDistance! + primaryClassifiedRoute.intersectingRoute.cumDistance! + primaryClassifiedRoute.intersectingRoute.intersectingRoute.cumDistance!
    //                 // routeCumulativeDuration = primaryClassifiedRoute.cumDuration! + primaryClassifiedRoute.intersectingRoute.cumDuration! + primaryClassifiedRoute.intersectingRoute.intersectingRoute.cumDuration!

    //                 distanceQuality = parseFloat((primaryClassifiedRoute.intersectingRoute.intersectingRoute.cumDistance! / directPathDistance).toFixed(2));
    //                 durationQuality = parseFloat((primaryClassifiedRoute.intersectingRoute.intersectingRoute.cumDuration! / directPathDuration).toFixed(2));

    //             } else {
    //                 //secondary
    //                 // routeCumulativeDistance = primaryClassifiedRoute.cumDistance! + primaryClassifiedRoute.intersectingRoute.cumDistance!
    //                 // routeCumulativeDuration = primaryClassifiedRoute.cumDuration! + primaryClassifiedRoute.intersectingRoute.cumDuration!

    //                 distanceQuality = parseFloat((primaryClassifiedRoute.intersectingRoute.cumDistance! / directPathDistance).toFixed(2));
    //                 durationQuality = parseFloat((primaryClassifiedRoute.intersectingRoute.cumDuration! / directPathDuration).toFixed(2));

    //             }
    //         } else {

    //             // primary

    //             distanceQuality = parseFloat((primaryClassifiedRoute.cumDistance! / directPathDistance).toFixed(2));
    //             durationQuality = parseFloat((primaryClassifiedRoute.cumDuration! / directPathDuration).toFixed(2));

    //         }


    //         // if (parseFloat((distanceQuality * durationQuality).toFixed(2)) < 1.5) {

    //         primaryClassifiedRoute.routeEfficiency = parseFloat((distanceQuality * durationQuality).toFixed(2));
    //         qualityCriteriaFilteredRoutes.push(primaryClassifiedRoute);

    //         // }


    //     }));

    //     return qualityCriteriaFilteredRoutes;
    // }
}