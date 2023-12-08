import { fn, col, Op } from "sequelize";
import { RiderRouteRepository } from "../repository/rroute.repository";
import { CustomError, FilterForm, NodeDto, RiderDto, RiderRouteDto, SessionDto } from "../util/interface.utility";
import { isValidFileHeader, prepareBatchBulkImportData, generateNUniformRandomDateTimeValues, findParallelLinePoints, findNodesOfInterestInArea, getRouteDetailsByOSRM, getDistances, formatNodeData, getGeographicCoordinatesByAddress, calculateDistanceBetweenPoints, normalizeTimeZone } from "../util/helper.utility";
import { RiderRepository } from "../repository/rider.repository";
import { NodeRepository } from "../repository/node.repository";
import { SessionRepository } from "../repository/session.repository";
import moment from "moment-timezone";
import { ObjectCsvStringifier } from "csv-writer/src/lib/csv-stringifiers/object";
import { createObjectCsvStringifier } from "csv-writer";
import { promises as fsPromises } from "fs";
export class RiderRouteService {
    private riderRouteRepository: RiderRouteRepository;
    private riderRepository: RiderRepository;
    private nodeRepository: NodeRepository;
    private sessionRepository: SessionRepository;

    constructor() {
        this.riderRouteRepository = new RiderRouteRepository();
        this.riderRepository = new RiderRepository();
        this.nodeRepository = new NodeRepository();
        this.sessionRepository = new SessionRepository();
    }

    async listRiderRoutes(tagListStr: string | undefined, pageNumber: number): Promise<Record<string, any>> {
        let whereCondition: Record<string, any> = {};

        const tagList: Array<string> = tagListStr?.split(",").map(tag => tag.trim()) || []
        if (tagList.length) {
            whereCondition = {
                [Op.or]: tagList.map((tag) => {
                    return { rrouteDbmTag: tag }
                })
            }
        }
        const riderRouteList: RiderRouteDto[] = await this.riderRouteRepository.findRiderRoutes({
            where: whereCondition,
            include: [{
                association: "origin"
            }, {
                association: "destination"
            }],
            order: [["riderId", "ASC"], ["rrouteId", "ASC"]],
            limit: 10,
            offset: (pageNumber - 1) * 10,
        });

        if (riderRouteList.length < 1) {
            throw new CustomError("No Rider Route Found", 404);
        }


        await Promise.all(riderRouteList.map(async (riderRoute) => {
            riderRoute.departureTime = riderRoute.departureTime ? (normalizeTimeZone(riderRoute.departureTime as string)) : riderRoute.departureTime;
        }));

        return { status: 200, data: { riderRoutes: riderRouteList } };
    }

    async listRiderRoutesByRiderId(riderId: number, pageNumber: number): Promise<Record<string, any>> {
        const riderRouteList: RiderRouteDto[] = await this.riderRouteRepository.findRiderRoutes({
            where: {
                riderId: riderId
            },
            include: [{
                association: "origin"
            }, {
                association: "destination"
            }],
            order: [["riderId", "ASC"], ["rrouteId", "ASC"]],
            limit: 10,
            offset: (pageNumber - 1) * 10,
        });

        if (riderRouteList.length < 1) {
            throw new CustomError("No Rider Route Found", 404);
        }
        return { status: 200, data: { riderRoutes: riderRouteList } };
    }

    async deleteRiderRouteById(rrouteId: number): Promise<Record<string, any>> {
        const deletedRiderRouteCount: number = await this.riderRouteRepository.deleteRiderRoute({
            where: {
                rrouteId: rrouteId
            }
        });
        if (deletedRiderRouteCount) {
            return { status: 200, data: { message: "Rider Route Deleted Successfully" } };
        } else {
            throw new CustomError("No Rider Route exists with this id", 404);
        }
    }

    async bulkImportRiderRoutes(fileToImport: Express.Multer.File): Promise<Record<string, any>> {
        if (!isValidFileHeader(fileToImport.buffer, ["Database Management Tag", "Origin City", "Destination City", "Number of Routes", "Mean Departure Time", "Time Standard Deviation"])) {
            throw new CustomError("Invalid columns or column length", 422);
        }

        const metaRiderRouteBulkData: Array<Record<string, any>> = prepareBatchBulkImportData(fileToImport.buffer, ["rrouteDbmTag", "originCity", "destinationCity", "numberOfRoutes", "meanDepartureTime", "sigmaTime"]);

        const riderIdList: RiderDto[] = await this.riderRepository.findRiders({
            attributes: ["riderId"]
        });

        let batchImportData: Array<Record<string, any>> = []

        await Promise.all(metaRiderRouteBulkData.map(async (routeMeta: Record<string, any>, index: number): Promise<void> => {
            const originCityIdList: NodeDto[] = await this.nodeRepository.findNodes({
                where: {
                    city: routeMeta.originCity
                },
                attributes: ["nodeId"]
            });

            const destinationCityIdList: NodeDto[] = await this.nodeRepository.findNodes({
                where: {
                    city: routeMeta.destinationCity
                },
                attributes: ["nodeId"]
            });

            if (originCityIdList.length === 0 || destinationCityIdList.length === 0) {

            } else {
                const distributedRandomDateTimeList: Array<string> = generateNUniformRandomDateTimeValues(routeMeta.meanDepartureTime, routeMeta.sigmaTime, routeMeta.numberOfRoutes)

                for (let i: number = 0; i < routeMeta.numberOfRoutes; ++i) {

                    let randomOriginCityId: number = originCityIdList[Math.floor(Math.random() * originCityIdList.length)].nodeId;
                    let randomDestinationCityId: number = destinationCityIdList[Math.floor(Math.random() * destinationCityIdList.length)].nodeId;
                    let randomRiderId: number = riderIdList[Math.floor(Math.random() * riderIdList.length)].riderId;

                    batchImportData.push({
                        riderId: randomRiderId,
                        originNode: randomOriginCityId,
                        destinationNode: randomDestinationCityId,
                        departureTime: distributedRandomDateTimeList[i],
                        timeFlexibility: Math.floor(Math.random() * 7),
                        status: "REQUESTED",
                        rrouteDbmTag: routeMeta.rrouteDbmTag
                    });
                }
            }
            this.riderRouteRepository.batchImportRiderRoutes(batchImportData);
        }));

        return { status: 200, data: { message: "Rider Route data successfully imported" } };

    }

    async batchImportRiderRoutes(fileToImport: Express.Multer.File): Promise<any> {
        if (!isValidFileHeader(fileToImport.buffer, ["Rider Id", "Origin Address", "Origin City", "Origin State Province", "Destination Address", "Destination City", "Destination State Province", "Departure Time", "Time Flexibility", "Database Management Tag"])) {
            throw new CustomError("Invalid columns or column length", 422);
        }

        const systemNodesList: Array<NodeDto> = await this.nodeRepository.findNodes({});
        if (systemNodesList.length < 1) {
            throw new CustomError("No Node Found", 404);
        }

        const metaRiderRoutesBatchData: Array<Record<string, any>> = prepareBatchBulkImportData(fileToImport.buffer, ["riderId", "originAddress", "originCity", "originStateProvince", "destinationAddress", "destinationCity", "destinationStateProvince", "departureTime", "timeFlexibility", "databaseManagementTag"]);

        const failedRoutes: Array<Record<string, any>> = [];

        const finalriderRouteData: Array<Record<string, any>> = (await Promise.all(metaRiderRoutesBatchData.map(async (metaRiderRoute: Record<string, any>) => {
            let originCoordinateByAddress: Record<string, any> = await getGeographicCoordinatesByAddress(metaRiderRoute.originAddress.concat(" ").concat(metaRiderRoute.originCity.concat(" ").concat(metaRiderRoute.originStateProvince)));
            let destinationCoordinateByAddress: Record<string, any> = await getGeographicCoordinatesByAddress(metaRiderRoute.destinationAddress.concat(" ").concat(metaRiderRoute.destinationCity.concat(" ").concat(metaRiderRoute.destinationStateProvince)));

            if (!originCoordinateByAddress.latitude || !originCoordinateByAddress.longitude || !destinationCoordinateByAddress.latitude || !destinationCoordinateByAddress.longitude) {
                failedRoutes.push(metaRiderRoute);
            } else {
                let originSmallestDistanceNode: Record<string, any> = {
                    distance: Infinity,
                    node: null
                };
                let destinationSmallestDistanceNode: Record<string, any> = {
                    distance: Infinity,
                    node: null
                };
                await Promise.all(systemNodesList.map(async (node: NodeDto) => {
                    if (node.lat !== undefined || node.long !== undefined) {
                        let distance: number = calculateDistanceBetweenPoints({ latitude: node.lat!, longitude: node.long! }, { latitude: originCoordinateByAddress.latitude!, longitude: originCoordinateByAddress.longitude! })
                        if (distance <= originSmallestDistanceNode.distance) {
                            originSmallestDistanceNode.distance = distance;
                            originSmallestDistanceNode.node = node
                        }
                        distance = calculateDistanceBetweenPoints({ latitude: node.lat!, longitude: node.long! }, { latitude: destinationCoordinateByAddress.latitude!, longitude: destinationCoordinateByAddress.longitude! })
                        if (distance <= destinationSmallestDistanceNode.distance) {
                            destinationSmallestDistanceNode.distance = distance;
                            destinationSmallestDistanceNode.node = node
                        }
                    }
                }));

                if (originSmallestDistanceNode.distance !== Infinity && destinationSmallestDistanceNode.distance !== Infinity) {
                    return {
                        riderId: metaRiderRoute.riderId, originNode: originSmallestDistanceNode.node.nodeId,
                        destinationNode: destinationSmallestDistanceNode.node.nodeId,
                        departureTime: moment(metaRiderRoute.departureTime, "M/D/YYYY H:mm").utcOffset(0, true).format("YYYY-MM-DD HH:mm:ss[Z]"),
                        status: "REQUESTED", rrouteDbmTag: metaRiderRoute.databaseManagementTag, timeFlexibility: metaRiderRoute.timeFlexibility
                    }
                } else {
                    failedRoutes.push(metaRiderRoute);
                }
            }
            return {};
        }))).filter((riderRoute) => Object.keys(riderRoute).length > 0);

        await this.riderRouteRepository.batchImportRiderRoutes(finalriderRouteData);

        try {
            if (failedRoutes.length) {
                const csvStringifier: ObjectCsvStringifier = createObjectCsvStringifier({
                    header: [
                        { id: "riderId", title: "Rider Id" },
                        { id: "originAddress", title: "Origin Address" },
                        { id: "originCity", title: "Origin City" },
                        { id: "originStateProvince", title: "Origin State Province" },
                        { id: "destinationAddress", title: "Destination Address" },
                        { id: "destinationCity", title: "Destination City" },
                        { id: "destinationStateProvince", title: "Destination State Province" },
                        { id: "departureTime", title: "Departure Time" },
                        { id: "timeFlexibility", title: "Time Flexibility" },
                        { id: "databaseManagementTag", title: "Database Management Tag" }
                    ]
                });
                const csvContent: string = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(failedRoutes);
                await fsPromises.writeFile(`./util/logs/${new Date().toLocaleString().replace(/[/.,\s:]/g, "_")}_batch_rider_routes.csv`, csvContent, { encoding: "utf8" });
            }
        } catch (error: any) {
        }

        return { status: 200, data: { message: "Rider Routes imported successfully" } };

    }

    async getRiderRouteDistinctTagList(): Promise<Record<string, any>> {
        const riderRouteTagListRaw: RiderRouteDto[] = await this.riderRouteRepository.findRiderRoutes({
            attributes: [
                [fn("DISTINCT", col("rroute_dbm_tag")), "rrouteDbmTag"],
            ],
            order: [
                ["rrouteDbmTag", "ASC"]
            ]
        });
        const riderRouteTagList: Array<string | undefined> = riderRouteTagListRaw.map(riderRouteTag => riderRouteTag.rrouteDbmTag?.trim());

        return { status: 200, data: { riderRouteTagList: riderRouteTagList } };
    }

    async deleteRiderRouteByTags(tagListStr: string): Promise<Record<string, any>> {
        let whereCondition: Record<string, any> = {};
        const tagList: Array<string> = tagListStr?.split(",").map(tag => tag.trim()) || []
        if (tagList.length) {
            whereCondition = {
                [Op.or]: tagList.map((tag) => {
                    return { rrouteDbmTag: tag }
                })
            }
        }
        const deletedRiderRouteCount: number = await this.riderRouteRepository.deleteRiderRoute({
            where: whereCondition
        });
        if (deletedRiderRouteCount) {
            return { status: 200, data: { message: "Rider Route By Tags Deleted Successfully" } };
        } else {
            throw new CustomError("No Rider Route exists with provided tag(s)", 404);
        }
    }

    async getRiderRoutePageCount(tagListStr: string | undefined, riderId: string | undefined): Promise<Record<string, any>> {
        let riderRoutesCount: number;

        if (!tagListStr) {
            if (!riderId) {
                riderRoutesCount = await this.riderRouteRepository.countRiderRoutes({});
            } else {
                riderRoutesCount = await this.riderRouteRepository.countRiderRoutes({
                    where: {
                        riderId: parseInt(riderId, 10)
                    }
                });
            }
        } else {
            let whereCondition: Record<string, any> = {};
            const tagList: Array<string> = tagListStr?.split(",").map(tag => tag.trim()) || []
            if (tagList.length) {
                whereCondition = {
                    [Op.or]: tagList.map((tag) => {
                        return { rrouteDbmTag: tag }
                    })
                }
            }
            riderRoutesCount = await this.riderRouteRepository.countRiderRoutes({
                where: whereCondition
            });
        }
        return { status: 200, data: { riderRoutesCount: Math.ceil(riderRoutesCount) } };
    }

    async deleteRiderRoutesByFilters(filterFormData: FilterForm, riderId: number): Promise<Record<string, any>> {
        let whereCondition: Record<string, any> = {};

        const filterEntries: Array<any> = Object.entries(filterFormData);
        const filterConditions: Array<any> = filterEntries.map(([filterKey, filterValue]: [string, any]) => {

            if (filterKey === 'departureTime') {
                const { start, end } = filterValue;
                if (start && end) {
                    return {
                        [filterKey]: {
                            [Op.gte]: start,
                            [Op.lte]: end,
                        },
                    };
                } else {
                    return;
                }
            }
            if (filterValue) {
                return { [filterKey]: filterValue };
            } else {
                return;
            }
        }).filter(Boolean);

        if (riderId !== undefined && riderId) {
            filterConditions.push({ riderId: riderId });
        }
        whereCondition = { [Op.and]: filterConditions };
        const deletedRouteCount: number = await this.riderRouteRepository.deleteRiderRoute({
            where: whereCondition
        });

        if (deletedRouteCount) {
            return { status: 200, data: { message: "Rider Route(s) Deleted Successfully" } };
        } else {
            throw new CustomError("No rider route exists by these filters", 404);
        }
    }

    async displayRiderRoutesOriginatingFromNodeBetweenTimeFrame(nodeId: number, startOriginDateTime: string, endOrigindateTime: string, sessionToken: string): Promise<Record<string, any>> {

        const riderRouteDataPlainJSON: Array<Record<string, any>> = [];

        const riderRoutes: RiderRouteDto[] = await this.riderRouteRepository.findRiderRoutes({
            where: {
                [Op.and]: [
                    {
                        departureTime: {
                            [Op.and]: [
                                { [Op.gt]: startOriginDateTime.concat(":00") },
                                { [Op.lt]: endOrigindateTime.concat(":00") }
                            ]
                        }
                    },
                    {
                        originNode: nodeId
                    }
                ]
            },
            include: [
                { association: "origin" },
                { association: "destination" },
                {
                    association: "rrouteNodes",
                    include: [{ association: "node" }]
                }
            ]
        });

        if (!riderRoutes.length) {
            throw new CustomError("No Rider Route found in on this node in given time window", 404);
        }

        for (let riderRoute of riderRoutes) {
            const parallelLinePoints: Array<Record<string, number>> = findParallelLinePoints({ longitude: riderRoute.origin?.long!, latitude: riderRoute.origin?.lat! }, { longitude: riderRoute.destination?.long!, latitude: riderRoute.destination?.lat! });
            let nodesInAreaOfInterest: Array<Record<string, any> | undefined> = await findNodesOfInterestInArea(Object.values(parallelLinePoints[0]), Object.values(parallelLinePoints[1]), Object.values(parallelLinePoints[2]), Object.values(parallelLinePoints[3]), [])
            const routeInfo: Record<string, any> = await getRouteDetailsByOSRM({ longitude: riderRoute.origin?.long!, latitude: riderRoute.origin?.lat! }, { longitude: riderRoute.destination?.long!, latitude: riderRoute.destination?.lat! });

            const waypointNodes: Array<Record<string, any>> = [];

            for (let i: number = 0; i < nodesInAreaOfInterest.length; ++i) {
                for (let j: number = 0; j < routeInfo.routes[0].legs[0].steps.length - 1; ++j) {

                    let subRoutePointsGIS: Array<[number, number]> = routeInfo.routes[0].legs[0].steps[j].geometry.coordinates;

                    let waypointStart: [number, number] = subRoutePointsGIS[0]
                    let waypointEnd: [number, number] = subRoutePointsGIS[routeInfo.routes[0].legs[0].steps[j].geometry.coordinates.length - 1];
                    waypointNodes.push({ 'waypointStart': waypointStart, 'waypointEnd': waypointEnd });

                    let calculatedintermediateNode: Record<string, any> = getDistances(waypointStart, waypointEnd, nodesInAreaOfInterest[i]!, subRoutePointsGIS);

                    if (calculatedintermediateNode.intercepted === true) {
                        if (Object.keys(nodesInAreaOfInterest[i]!).includes('isWaypoint')) {
                            if (nodesInAreaOfInterest[i]!.distance > calculatedintermediateNode.distance) {
                                nodesInAreaOfInterest[i]!.distance = calculatedintermediateNode.distance;
                            }
                        } else {
                            nodesInAreaOfInterest[i] = { 'isWaypoint': true, 'distance': calculatedintermediateNode.distance, ...nodesInAreaOfInterest[i] };
                        }
                    }
                }
            }

            const session: SessionDto | null = await this.sessionRepository.findSession({
                where: {
                    sessionToken: sessionToken
                },
                include: [{
                    association: "user"
                }]
            });
            if (!session) {
                throw new CustomError("Session not found", 404);
            }


            nodesInAreaOfInterest = formatNodeData(nodesInAreaOfInterest, session.user?.waypointDistance!).map((wpNode) => {
                if (wpNode.isWaypoint) {
                    return wpNode;
                }
                return;
            }).filter(Boolean).filter((iNode) => {
                return (riderRoute.origin?.lat != iNode!.lat && riderRoute.origin?.long != iNode!.long) && (riderRoute.destination?.lat != iNode!.lat && riderRoute.origin?.long != iNode!.long)
            });
            riderRouteDataPlainJSON.push({ ...riderRoute, "intermediateNodes": nodesInAreaOfInterest, "osrmRoute": routeInfo.routes[0].geometry.coordinates, "GISWaypoints": waypointNodes })

        }

        return { status: 200, data: { riderRouteData: riderRouteDataPlainJSON } };
    }
}