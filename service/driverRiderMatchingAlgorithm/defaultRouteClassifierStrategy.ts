import moment from "moment";
import { getDriverRoutesBetweenTimeFrame } from "../../util/helper.utility";
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
    async findRoutesPassingAtNode(arrivalDepartureDateTime: string, riderTimeFlexibility: number, nodeId: number, transitTime: number, destnationNodeId: number, routeClassification: RouteClassification): Promise<Array<ClassifiedRoute>> {

        let dateTimeStartWindow: string = moment(arrivalDepartureDateTime, "YYYY-MM-DD HH:mm").clone().add(transitTime, "minutes").utcOffset(0, true).format("YYYY-MM-DD HH:mm:ss[Z]");
        let dateTimeEndWindow: string = moment(arrivalDepartureDateTime, "YYYY-MM-DD HH:mm").clone().add(riderTimeFlexibility + transitTime, "minutes").utcOffset(0, true).format("YYYY-MM-DD HH:mm:ss[Z]");

        const passingRoutesAtNode: Array<DriverRouteAssociatedNodeDto> = await getDriverRoutesBetweenTimeFrame(dateTimeStartWindow, dateTimeEndWindow, [nodeId]);
        const passingRoutesAtNodeClassified: Array<ClassifiedRoute> = await Promise.all(passingRoutesAtNode.map(
            async (passingRoute: DriverRouteAssociatedNodeDto) => {

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

                return new ClassifiedRoute(passingRoute, routeClassification, originRank, destinationRank);

            }));

        return passingRoutesAtNodeClassified;
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
                            primaryNodeRank = dRouteNode.rank!;
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

    async calculateCummulativeDistanceDuration(classifiedRoutes: Array<ClassifiedRouteDto>): Promise<Array<ClassifiedRouteDto>> {

        await Promise.all(classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRouteDto) => {

            let primaryFirstNodeDeparture: Moment = moment(primaryClassifiedRoute.driverRoute.drouteNodes?.slice(0, 1)[0].departureTime as string, "YYYY-MM-DD HH:mm:ss[z]");
            let primaryLastNodeArrival: Moment = moment(primaryClassifiedRoute.driverRoute.drouteNodes?.slice(-1)[0].arrivalTime as string, "YYYY-MM-DD HH:mm:ss[z]");

            let primaryFirstNodeDistance: number = primaryClassifiedRoute.driverRoute.drouteNodes?.slice(0, 1)[0].cumDistance!;
            let primaryLastNodeDistance: number = primaryClassifiedRoute.driverRoute.drouteNodes?.slice(-1)[0].cumDistance!;

            primaryClassifiedRoute.cumDuration = primaryLastNodeArrival.diff(primaryFirstNodeDeparture, "minutes");
            primaryClassifiedRoute.cumDistance = parseFloat((primaryLastNodeDistance - primaryFirstNodeDistance).toFixed(2));

            if (primaryClassifiedRoute.intersectingRoute) {

                let secondaryFirstNodeDeparture: Moment = moment(primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes?.slice(0, 1)[0].departureTime as string, "YYYY-MM-DD HH:mm:ss[z]");
                let secondaryLastNodeArrival: Moment = moment(primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes?.slice(-1)[0].arrivalTime as string, "YYYY-MM-DD HH:mm:ss[z]");

                let secondaryFirstNodeDistance: number = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes?.slice(0, 1)[0].cumDistance!;
                let secondaryLastNodeDistance: number = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes?.slice(-1)[0].cumDistance!;

                primaryClassifiedRoute.intersectingRoute.cumDuration = secondaryLastNodeArrival.diff(secondaryFirstNodeDeparture, "minutes") + primaryClassifiedRoute.cumDuration;
                primaryClassifiedRoute.intersectingRoute.cumDistance = parseFloat(((secondaryLastNodeDistance - secondaryFirstNodeDistance) + primaryClassifiedRoute.cumDistance).toFixed(2));


                if (primaryClassifiedRoute.intersectingRoute.intersectingRoute) {

                    let tertiaryFirstNodeDeparture: Moment = moment(primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes?.slice(0, 1)[0].departureTime as string, "YYYY-MM-DD HH:mm:ss[z]");
                    let tertiaryLastNodeArrival: Moment = moment(primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes?.slice(-1)[0].arrivalTime as string, "YYYY-MM-DD HH:mm:ss[z]");
                    let tertiaryFirstNodeDistance: number = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes?.slice(0, 1)[0].cumDistance!;
                    let tertiaryLastNodeDistance: number = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes?.slice(-1)[0].cumDistance!;

                    primaryClassifiedRoute.intersectingRoute.intersectingRoute.cumDuration = tertiaryLastNodeArrival.diff(tertiaryFirstNodeDeparture, "minutes") + primaryClassifiedRoute.intersectingRoute.cumDuration;
                    primaryClassifiedRoute.intersectingRoute.intersectingRoute.cumDistance = parseFloat(((tertiaryLastNodeDistance - tertiaryFirstNodeDistance) + primaryClassifiedRoute.intersectingRoute.cumDistance).toFixed(2));

                }
            }
        }));

        return classifiedRoutes;

    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    async checkQOSMetrics(classifiedRoutes: Array<ClassifiedRouteDto>, directPathDistance: number, directPathDuration: number): Promise<{ filteredRoutes: Array<ClassifiedRouteDto>, routeMetrics: Array<QualityMetrics> }> {

        let routeQosData: Array<QualityMetrics> = [];
        const qualityCriteriaFilteredRoutes: Array<ClassifiedRouteDto> = [];


        await Promise.all(classifiedRoutes.map(async (primaryClassifiedRoute: ClassifiedRouteDto) => {

            let routeQOS: QualityMetrics = {
                directRouteDuration: directPathDuration, directRouteDistance: directPathDistance, primaryRouteDuration: null, primaryRouteDistance: null, secondaryRouteDuration: null,
                secondaryRouteDistance: null, tertiaryRouteDuration: null, tertiaryRouteDistance: null, routeQualityRatio: null, status: null
            }

            let distanceQuality: number;
            let durationQuality: number;

            if (primaryClassifiedRoute.intersectingRoute) {
                if (primaryClassifiedRoute.intersectingRoute.intersectingRoute) {
                    //tertiary

                    distanceQuality = parseFloat((primaryClassifiedRoute.intersectingRoute.intersectingRoute.cumDistance! / directPathDistance).toFixed(2));
                    durationQuality = parseFloat((primaryClassifiedRoute.intersectingRoute.intersectingRoute.cumDuration! / directPathDuration).toFixed(2));


                    routeQOS.tertiaryRouteDistance = primaryClassifiedRoute.intersectingRoute.intersectingRoute.cumDistance!;
                    routeQOS.tertiaryRouteDuration = primaryClassifiedRoute.intersectingRoute.intersectingRoute.cumDuration!;

                } else {

                    //secondary
                    distanceQuality = parseFloat((primaryClassifiedRoute.intersectingRoute.cumDistance! / directPathDistance).toFixed(2));
                    durationQuality = parseFloat((primaryClassifiedRoute.intersectingRoute.cumDuration! / directPathDuration).toFixed(2));

                    routeQOS.secondaryRouteDistance = primaryClassifiedRoute.intersectingRoute.cumDistance!;
                    routeQOS.secondaryRouteDuration = primaryClassifiedRoute.intersectingRoute.cumDuration!;
                }
            } else {

                // primary

                distanceQuality = parseFloat((primaryClassifiedRoute.cumDistance! / directPathDistance).toFixed(2));
                durationQuality = parseFloat((primaryClassifiedRoute.cumDuration! / directPathDuration).toFixed(2));

                routeQOS.primaryRouteDistance = primaryClassifiedRoute.cumDistance!;
                routeQOS.primaryRouteDuration = primaryClassifiedRoute.cumDuration!;

            }


            routeQOS.routeQualityRatio = parseFloat((distanceQuality * durationQuality).toFixed(2));

            if (distanceQuality * durationQuality < 1.5) {

                routeQOS.status = "Accepted";

                qualityCriteriaFilteredRoutes.push(primaryClassifiedRoute);
            } else {

                routeQOS.status = "Rejected";

            }

            routeQosData.push(routeQOS);

        }));

        return { filteredRoutes: qualityCriteriaFilteredRoutes, routeMetrics: routeQosData };
    }
}