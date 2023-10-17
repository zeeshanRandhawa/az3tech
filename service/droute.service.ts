import { Op, col, fn } from "sequelize";
import { createReadStream, promises as fsPromises } from "fs";
import { DriverRouteRepository } from "../repository/droute.repository";
import {
    ClassifiedRouteDto,
    CoordinateDto, CustomError, DriverRouteAssociatedNodeDto, DriverRouteNodeAssocitedDto, FilterForm, NodeDto, RouteOption, SessionDto, calculatedRoute,
} from "../util/interface.utility";
import { NodeRepository } from "../repository/node.repository";
import {
    isValidFileHeader, prepareBatchBulkImportData, extractOrigDestNodeId, sortRouteNodeListByNodeStop, getNodeObjectByNodeId, getDistanceDurationBetweenNodes, importDriverRoutes, normalizeTimeZone, getRouteDetailsByOSRM, getActiveDateList, isRoutesDateSorted, getDriverRoutesBetweenTimeFrame, findNearestNode,
} from "../util/helper.utility";
import { DriverRepository } from "../repository/driver.repository";
import ProcessSocket from "../util/socketProcess.utility";
import { SessionRepository } from "../repository/session.repository";
import moment, { Moment } from "moment";
import path from "path";
import archiver, { Archiver } from "archiver";
import { createObjectCsvStringifier } from "csv-writer";
import { ObjectCsvStringifier } from "csv-writer/src/lib/csv-stringifiers/object";
import { RiderDriverRouteMatchingStrategy } from "./driverRiderMatchingAlgorithm/riderDriverRouteMatchingStrategy.class";

export class DriverRouteService {
    private driverRouteRepository: DriverRouteRepository;
    private driverRepository: DriverRepository;
    private nodeRepository: NodeRepository;
    private sessionRepository: SessionRepository;

    constructor() {
        this.driverRouteRepository = new DriverRouteRepository();
        this.driverRepository = new DriverRepository();
        this.nodeRepository = new NodeRepository();
        this.sessionRepository = new SessionRepository();
    }

    async listDriverRoutes(tagListStr: string | undefined, pageNumber: number): Promise<Record<string, any>> {
        let whereCondition: Record<string, any> = {};

        const tagList: Array<string> =
            tagListStr?.split(",").map((tag) => tag.trim()) || [];
        if (tagList.length) {
            whereCondition = {
                [Op.or]: tagList.map((tag) => {
                    return { drouteDbmTag: tag };
                }),
            };
        }

        const driverRouteList: DriverRouteAssociatedNodeDto[] =
            await this.driverRouteRepository.findDriverRoutes({
                where: whereCondition,
                include: [
                    {
                        association: "origin",
                    },
                    {
                        association: "destination",
                    },
                    {
                        association: "driver",
                        attributes: ["firstName", "lastName"]
                    },
                ],
                order: [
                    ["driverId", "ASC"],
                    ["drouteId", "ASC"],
                ],
                limit: 10,
                offset: (pageNumber - 1) * 10,
            });

        if (driverRouteList.length < 1) {
            throw new CustomError("No Driver Route Found", 404);
        }
        await Promise.all(
            driverRouteList.map(async (driverRoute) => {
                driverRoute.departureTime = driverRoute.departureTime ? await normalizeTimeZone(driverRoute.departureTime as string) : driverRoute.departureTime;
            }));
        return { status: 200, data: { driverRoutes: driverRouteList } };
    }

    async listDriverRoutesByDriverId(driverId: number, pageNumber: number): Promise<Record<string, any>> {
        const driverRouteList: DriverRouteAssociatedNodeDto[] =
            await this.driverRouteRepository.findDriverRoutes({
                where: {
                    driverId: driverId,
                },
                include: [
                    {
                        association: "origin",
                    },
                    {
                        association: "destination",
                    },
                    {
                        association: "driver",
                        attributes: ["firstName", "lastName"]
                    },
                ],
                order: [
                    ["driverId", "ASC"],
                    ["drouteId", "ASC"],
                ],
                limit: 10,
                offset: (pageNumber - 1) * 10,
            });

        if (driverRouteList.length < 1) {
            throw new CustomError("No Driver Route Found", 404);
        }
        await Promise.all(
            driverRouteList.map(async (driverRoute) => {
                driverRoute.departureTime = driverRoute.departureTime ? await normalizeTimeZone(driverRoute.departureTime as string) : driverRoute.departureTime;
            }));
        return { status: 200, data: { driverRoutes: driverRouteList } };
    }

    async deleteDriverRouteById(drouteId: number): Promise<Record<string, any>> {
        const deletedDriverRouteCount: number = await this.driverRouteRepository.deleteDriverRoute({
            where: {
                drouteId: drouteId,
            },
        });
        if (deletedDriverRouteCount) {
            return {
                status: 200,
                data: { message: "Driver Route Deleted Successfully" },
            };
        } else {
            throw new CustomError("No Driver Route exists with this id", 404);
        }
    }

    async batchImportDriverRoutes(fileToImport: Express.Multer.File, sessionToken: string): Promise<Record<string, any>> {
        if (await ProcessSocket.getInstance().isProcessRunningForToken(sessionToken, "DRoute")) {
            return {
                status: 422,
                data: { message: "Another import process alreay running" },
            };
        }

        if (
            !isValidFileHeader(fileToImport.buffer, ["Route Name", "Origin Node Id", "Destination Node Id", "Departure Time", "Departure Flexibility", "Driver Id", "Passenger Capacity", "Max Wait", "Fixed Route", "Database Management Tag",])) {
            throw new CustomError("Invalid column name or length", 422);
        }
        const driverRouteBatchMetaData: Array<Record<string, any>> = prepareBatchBulkImportData(fileToImport.buffer, ["routeName", "originNodeId", "destinationNodeId", "departureTime", "departureFlexibility", "driverId", "passengerCapacity", "maxWait", "fixedRoute", "databaseManagementTag",]);

        await fsPromises.writeFile("./util/tempFiles/driverRouteTemp.json", JSON.stringify(driverRouteBatchMetaData), { encoding: "utf8" });
        const session: SessionDto | null = await this.sessionRepository.findSession({
            where: {
                sessionToken: sessionToken,
            },
            include: [
                {
                    association: "user",
                },
            ],
        });
        if (!session) {
            throw new CustomError("Session not found", 404);
        }
        ProcessSocket.getInstance().forkProcess("./util/process/driverRouteBatchImport.process.ts", "DriverRouteBatch", session!.user!.email.trim(), session.user?.waypointDistance!);

        return { status: 200, data: { message: "Nodes import in progress" } };
    }

    async getDriverRouteDistinctTagList(): Promise<Record<string, any>> {
        const driverRouteTagListRaw: DriverRouteAssociatedNodeDto[] = await this.driverRouteRepository.findDriverRoutes({
            attributes: [[fn("DISTINCT", col("droute_dbm_tag")), "drouteDbmTag"]],
            order: [["drouteDbmTag", "ASC"]],
        });
        const driverRouteTagList: Array<string | undefined> = driverRouteTagListRaw.map((driverRouteTag) => driverRouteTag.drouteDbmTag?.trim());

        return { status: 200, data: { driverRouteTagList: driverRouteTagList } };
    }

    async deleteDriverRouteByTags(tagListStr: string): Promise<Record<string, any>> {
        let whereCondition: Record<string, any> = {};
        const tagList: Array<string> = tagListStr?.split(",").map((tag) => tag.trim()) || [];
        if (tagList.length) {
            whereCondition = {
                [Op.or]: tagList.map((tag) => {
                    return { drouteDbmTag: tag };
                }),
            };
        }
        const deletedDriverRouteCount: number = await this.driverRouteRepository.deleteDriverRoute({
            where: whereCondition,
        });
        if (deletedDriverRouteCount) {
            return { status: 200, data: { message: "Driver Route By Tags Deleted Successfully" } };
        } else {
            throw new CustomError("No Driver Route exists with this tag", 404);
        }
    }

    async getDriverRoutePageCount(tagListStr: string | undefined, driverId: string | undefined): Promise<Record<string, any>> {
        let driverRoutesCount: number;

        if (!tagListStr) {
            if (!driverId) {
                driverRoutesCount = await this.driverRouteRepository.countDriverRoutes({});
            } else {
                driverRoutesCount = await this.driverRouteRepository.countDriverRoutes({
                    where: {
                        driverId: parseInt(driverId, 10),
                    },
                });
            }
        } else {
            let whereCondition: Record<string, any> = {};
            const tagList: Array<string> = tagListStr?.split(",").map((tag) => tag.trim()) || [];
            if (tagList.length) {
                whereCondition = {
                    [Op.or]: tagList.map((tag) => {
                        return { drouteDbmTag: tag };
                    }),
                };
            }
            driverRoutesCount = await this.driverRouteRepository.countDriverRoutes({
                where: whereCondition,
            });
        }
        return { status: 200, data: { driverRoutesCount: Math.ceil(driverRoutesCount) } };
    }

    async deleteDriverRoutesByFilters(filterFormData: FilterForm, driverId: number): Promise<Record<string, any>> {
        let whereCondition: Record<string, any> = {};

        const filterEntries: Array<any> = Object.entries(filterFormData);
        const filterConditions: Array<any> = filterEntries.map(([filterKey, filterValue]: [string, any]) => {
            if (filterKey === "departureTime") {
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

        if (driverId !== undefined && driverId) {
            filterConditions.push({ driverId: driverId });
        }
        whereCondition = { [Op.and]: filterConditions };
        const deletedRouteCount: number = await this.driverRouteRepository.deleteDriverRoute({
            where: whereCondition,
        });

        if (deletedRouteCount) {
            return { status: 200, data: { message: "Driver Route(s) Deleted Successfully" } };
        } else {
            throw new CustomError("No driver route exists by these filters", 404);
        }
    }

    async listLogFileNames(): Promise<Record<string, any>> {
        return fsPromises.readdir("./util/logs/").then((files) => {
            const csvFiles = files.filter((file) => path.extname(file) === ".csv" && path.basename(file).includes("driver_routes"));
            if (csvFiles.length) {
                return { status: 200, data: { fileNameList: csvFiles } };
            } else {
                return { status: 404, data: { message: "No logs available" } };
            }
        }).catch((error: any) => {
            return { status: 400, data: { message: error.message } };
        });
    }

    async deleteLogByName(fileName: string): Promise<Record<string, any>> {
        return fsPromises.unlink(`./util/logs/${fileName}`).then(() => {
            return { status: 200, data: { message: "Log deleted successfully" } };
        }).catch(() => {
            throw new CustomError("File not found", 404);
        });
    }

    async downloadLogFiles(fileName: string): Promise<Record<string, any>> {
        return fsPromises.readdir("./util/logs/").then((files: string[]) => {
            let csvFiles: string[];

            if (fileName === "allFiles") {
                csvFiles = files.filter((file) => path.extname(file) === ".csv" && path.basename(file).includes("driver_routes"));
            } else {
                csvFiles = files.filter((file) => path.extname(file) === ".csv" && path.basename(file) === fileName);
            }
            if (csvFiles.length === 0) {
                return { status: 404, data: { message: "No file Found" } };
            }

            const zip: Archiver = archiver("zip");
            csvFiles.forEach(async (file: string) => {
                const filePath: string = path.join("./util/logs/", file);
                zip.append(createReadStream(filePath), { name: file });
            });

            return { status: 200, data: { zip: zip } };
        });
    }

    async transitImportDriverRoutes(fileToImport: Express.Multer.File, scheduledWeekdays: string, scheduledStartDate: string, scheduledEndDate: string, sessionToken: string): Promise<Record<string, any>> {
        if (!isValidFileHeader(fileToImport.buffer, ["Route Name", "Origin Node Id", "Destination Node Id", "Arrival Time", "Departure Time", "Driver Id", "Passenger Capacity", "Database Management Tag"])) {
            throw new CustomError("Invalid column name or length", 422);
        }

        const driverRouteTransitMetaData: Array<Record<string, any>> = prepareBatchBulkImportData(fileToImport.buffer, ["routeName", "originNodeId", "destinationNodeId", "arrivalTime", "departureTime", "driverId", "passengerCapacity", "databaseManagementTag"]);
        const driverRouteTransitMetaDataGrouped: Record<string, any> = await this.prepareTransitRouteMetaBatchData(driverRouteTransitMetaData, scheduledWeekdays, scheduledStartDate, scheduledEndDate);
        const assertedDriverRouteTransitMetaDataGrouped: Record<string, any> = await this.assertDriverRouteMetaTransitGroupData(driverRouteTransitMetaDataGrouped);
        const finalTransitRoutesToImport: Array<Record<string, any>> = await this.prepareFinalTrnsitRouteGroupToImport(Object.values(assertedDriverRouteTransitMetaDataGrouped));

        if (!(await importDriverRoutes(finalTransitRoutesToImport))) {
            return { status: 500, data: { message: "Transit route import failed" } };
        }
        return { status: 200, data: { message: "Transit route import completed" } };
    }

    async prepareTransitRouteMetaBatchData(driverRouteTransitMetaData: Array<Record<string, any>>, scheduledWeekdays: string, scheduledStartDate: string, scheduledEndDate: string): Promise<any> {
        try {
            const activeDates: Array<string> = getActiveDateList(scheduledWeekdays, scheduledStartDate, scheduledEndDate);
            const driverRouteTransitMetaDataGrouped: Record<string, any> = {};

            let key: any;
            await Promise.all(activeDates.map(async (activeDate: string, i: number) => {
                const oldActiveDateTime: string = activeDates[i];

                await Promise.all(driverRouteTransitMetaData.map(async (routeMeta: Record<string, any>, index: number) => {
                    let arrivalDateTime: Moment | null = !routeMeta.arrivalTime.trim() ? null : moment(activeDates[i].concat(" ").concat(routeMeta.arrivalTime.trim()), "YYYY-MM-DD HH:mm").utcOffset(0, true);
                    let departureDateTime: Moment | null = !routeMeta.departureTime.trim() ? null : moment(activeDates[i].concat(" ").concat(routeMeta.departureTime.trim()), "YYYY-MM-DD HH:mm").utcOffset(0, true);

                    if (!arrivalDateTime) {
                        key = departureDateTime?.clone().format("YYYY-MM-DD HH:mm:ss[z]");
                    }

                    if (!Object.keys(driverRouteTransitMetaDataGrouped).includes(routeMeta.routeName.concat(i).concat(key))) {
                        driverRouteTransitMetaDataGrouped[routeMeta.routeName.concat(i).concat(key)] = {
                            originNode: null, destinationNode: null,
                            departureTime: departureDateTime, capacity: routeMeta.passengerCapacity, status: "NEW", driverId: routeMeta.driverId,
                            drouteDbmTag: routeMeta.databaseManagementTag, drouteName: routeMeta.routeName, intermediateNodesList: null,
                            fixedRoute: true, routeNodes: { initial: [], final: [] }
                        };

                        driverRouteTransitMetaDataGrouped[routeMeta.routeName.concat(i).concat(key)].routeNodes.initial.push({
                            originNode: parseInt(routeMeta.originNodeId, 10), destinationNode: parseInt(routeMeta.destinationNodeId, 10),
                            arrivalTime: arrivalDateTime, departureTime: departureDateTime,
                        });
                    } else {
                        let previousDepartureDateTime: any = driverRouteTransitMetaDataGrouped[routeMeta.routeName.concat(i).concat(key)].routeNodes.initial.slice(-1)[0].departureTime;
                        if (previousDepartureDateTime > arrivalDateTime!) {
                            while (previousDepartureDateTime > arrivalDateTime!) {
                                arrivalDateTime = arrivalDateTime!.clone().add(1, "days");
                            }
                            activeDates[i] = arrivalDateTime!.clone().format("YYYY-MM-DD");
                        }
                        if (arrivalDateTime && departureDateTime && arrivalDateTime > departureDateTime) {
                            while (arrivalDateTime > departureDateTime) {
                                departureDateTime = departureDateTime.clone().add(1, "days");
                            }
                            activeDates[i] = departureDateTime.clone().format("YYYY-MM-DD");
                        }

                        driverRouteTransitMetaDataGrouped[routeMeta.routeName.concat(i).concat(key)].routeNodes.initial.push({
                            originNode: parseInt(routeMeta.originNodeId, 10),
                            destinationNode: routeMeta.destinationNodeId ? parseInt(routeMeta.destinationNodeId, 10) : null, arrivalTime: arrivalDateTime,
                            departureTime: departureDateTime,
                        });

                        if (!departureDateTime) {
                            activeDates[i] = oldActiveDateTime;
                        }
                    }
                }));
            }));

            return driverRouteTransitMetaDataGrouped;
        } catch (error: any) { }
    }

    async prepareFinalTrnsitRouteGroupToImport(driverRouteTransitMetaDataGroupedArray: any): Promise<any> {
        try {
            driverRouteTransitMetaDataGroupedArray = (await Promise.all(driverRouteTransitMetaDataGroupedArray.map(async (driverRouteMeta: Record<string, any>) => {
                // let distinctOriginDestinationRouteNodesId: Record<string, any> = extractOrigDestNodeId(driverRouteMeta.routeNodes.initial.slice(0, -1));

                // if (distinctOriginDestinationRouteNodesId.originNode && distinctOriginDestinationRouteNodesId.destinationNode &&
                //     distinctOriginDestinationRouteNodesId.destinationNode === driverRouteMeta.routeNodes.initial[driverRouteMeta.routeNodes.initial.length - 1].originNode) {

                // driverRouteMeta.routeNodes.initial = sortRouteNodeListByNodeStop(driverRouteMeta.routeNodes.initial, distinctOriginDestinationRouteNodesId.originNode);

                // driverRouteMeta.originNode = distinctOriginD0stinationRouteNodesId.originNode;
                // driverRouteMeta.destinationNode = distinctOriginDestinationRouteNodesId.destinationNode;

                let departureTime: Moment = driverRouteMeta.departureTime;

                driverRouteMeta.departureTime = driverRouteMeta.departureTime.clone().format("YYYY-MM-DD HH:mm:ss[z]");

                let arrivalTime: Moment | null = null;

                let temprouteNode: Record<string, any> = {
                    drouteId: null, outbDriverId: driverRouteMeta.driverId, nodeId: driverRouteMeta.originNode, arrivalTime: arrivalTime,
                    departureTime: departureTime.clone().format("YYYY-MM-DD HH:mm:ss[z]"), rank: 0, capacity: driverRouteMeta.capacity,
                    capacityUsed: 0, cumDistance: 0, cumTime: 0, status: "ORIGIN",
                };

                driverRouteMeta.routeNodes.final.push(temprouteNode);

                let cumTime: number = 0;
                let cumDistance: number = 0;

                for (let [index, rNode] of driverRouteMeta.routeNodes.initial.slice(1).entries()) {
                    let routeOriginNode: NodeDto | null = await getNodeObjectByNodeId(driverRouteMeta.routeNodes.initial[index].originNode);
                    let routeDestinationNode: NodeDto | null = await getNodeObjectByNodeId(rNode.originNode);

                    if (routeOriginNode !== null && routeDestinationNode !== null) {
                        let calculatedDistanceDurationBetweenNodes: Record<string, any> = await getDistanceDurationBetweenNodes({ longitude: routeOriginNode?.long, latitude: routeOriginNode?.lat }, { longitude: routeDestinationNode?.long, latitude: routeDestinationNode?.lat });

                        if (Object.values(calculatedDistanceDurationBetweenNodes).every((value) => value !== null)) {
                            if (!rNode.departureTime) {
                                cumTime += moment.duration(rNode.arrivalTime.diff(departureTime)).asMinutes();
                            } else {
                                cumTime += moment.duration(rNode.departureTime.diff(departureTime)).asMinutes();
                            }
                            departureTime = rNode.departureTime;

                            cumDistance += calculatedDistanceDurationBetweenNodes.distance;

                            if (
                                index == driverRouteMeta.routeNodes.initial.length - 2
                            ) {
                                temprouteNode = {
                                    drouteId: null, outbDriverId: driverRouteMeta.driverId, nodeId: rNode.originNode,
                                    arrivalTime: rNode.arrivalTime.clone().format("YYYY-MM-DD HH:mm:ss[z]"),
                                    departureTime: null, rank: index + 1, capacity: driverRouteMeta.capacity, capacityUsed: 0,
                                    cumDistance: (cumDistance / 1609.344).toFixed(2), cumTime: cumTime.toFixed(2), status: "DESTINATION"
                                };
                            } else {
                                temprouteNode = {
                                    drouteId: null, outbDriverId: driverRouteMeta.driverId, nodeId: rNode.originNode,
                                    arrivalTime: rNode.arrivalTime.clone().format("YYYY-MM-DD HH:mm:ss[z]"),
                                    departureTime: driverRouteMeta.routeNodes.initial[index + 1].departureTime.clone().format("YYYY-MM-DD HH:mm:ss[z]"),
                                    rank: index + 1, capacity: driverRouteMeta.capacity, capacityUsed: 0, cumDistance: (cumDistance / 1609.344).toFixed(2),
                                    cumTime: cumTime.toFixed(2), status: "SCHEDULED"
                                };
                            }
                            driverRouteMeta.routeNodes.final.push(temprouteNode);
                        }
                    }
                }
                // }
                return driverRouteMeta;
            }))).filter(Boolean);

            driverRouteTransitMetaDataGroupedArray = driverRouteTransitMetaDataGroupedArray.map((driverRouteFinal: Record<string, any>) => {
                if (driverRouteFinal.fixedRoute && driverRouteFinal.routeNodes.initial.length === driverRouteFinal.routeNodes.final.length) {
                    return driverRouteFinal;
                } else {
                    return;
                }
            }).filter(Boolean);

            return driverRouteTransitMetaDataGroupedArray;
        } catch (error: any) { }
    }

    async assertDriverRouteMetaTransitGroupData(driverRouteMetaTransitGroups: Record<string, any>): Promise<Record<string, any>> {
        const keysToDelete: Array<string> = [];
        const failedRoutes: Array<Record<string, any>> = [];

        for (let routeName in driverRouteMetaTransitGroups) {
            const distinctNodes: Set<number> = new Set<number>();
            await Promise.all(driverRouteMetaTransitGroups[routeName].routeNodes.initial.map(async (routeNode: Record<string, any>) => {
                routeNode.originNode ? distinctNodes.add(routeNode.originNode) : undefined;
                routeNode.destinationNode ? distinctNodes.add(routeNode.destinationNode) : undefined;
            }));

            let distinctOriginDestinationRouteNodesId: Record<string, any> = extractOrigDestNodeId(driverRouteMetaTransitGroups[routeName].routeNodes.initial.slice(0, -1));

            if (distinctOriginDestinationRouteNodesId.originNode && distinctOriginDestinationRouteNodesId.destinationNode && distinctOriginDestinationRouteNodesId.destinationNode === driverRouteMetaTransitGroups[routeName].routeNodes.initial[driverRouteMetaTransitGroups[routeName].routeNodes.initial.length - 1].originNode) {
                if ((await this.nodeRepository.findNodes({ where: { nodeId: [...distinctNodes] } })).length === distinctNodes.size && distinctNodes.size == driverRouteMetaTransitGroups[routeName].routeNodes.initial.length) {
                    driverRouteMetaTransitGroups[routeName].originNode = distinctOriginDestinationRouteNodesId.originNode;
                    driverRouteMetaTransitGroups[routeName].destinationNode = distinctOriginDestinationRouteNodesId.destinationNode;

                    if (await this.driverRepository.findDriverByPK(parseInt(driverRouteMetaTransitGroups[routeName].driverId, 10))) {
                        driverRouteMetaTransitGroups[routeName].routeNodes.initial = sortRouteNodeListByNodeStop(driverRouteMetaTransitGroups[routeName].routeNodes.initial, distinctOriginDestinationRouteNodesId.originNode);

                        if (!isRoutesDateSorted(driverRouteMetaTransitGroups[routeName].routeNodes.initial)) {
                            failedRoutes.push({ failedRouteName: routeName, error: "Route Dates not sorted. Route Nodes have invalid dates" });
                            keysToDelete.push(routeName);
                        }
                    } else {
                        failedRoutes.push({ failedRouteName: routeName, error: "Invalid driver Id" });
                        keysToDelete.push(routeName);
                    }
                } else {
                    failedRoutes.push({ failedRouteName: routeName, error: "Invalid Node(s)" });
                    keysToDelete.push(routeName);
                }
            } else {
                failedRoutes.push({ failedRouteName: routeName, error: "Invalid Origin Destination Node" });
                keysToDelete.push(routeName);
            }
        }

        await Promise.all(keysToDelete.map((key: string) => {
            delete driverRouteMetaTransitGroups[key];
        }));

        try {
            if (failedRoutes.length) {
                const csvStringifier: ObjectCsvStringifier = createObjectCsvStringifier({
                    header: [
                        { id: "failedRouteName", title: "Failed Route Name" },
                        { id: "error", title: "Reason" },
                    ]
                });
                const csvContent: string = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(failedRoutes);
                await fsPromises.writeFile(`./util/logs/${new Date().toLocaleString().replace(/[/.,\s:]/g, "_")}_transit_driver_routes.csv`, csvContent, { encoding: "utf8" });
            }
        } catch (error: any) { }

        return driverRouteMetaTransitGroups;
    }

    //new
    // async displayDriverRoutesAtNodeBetweenTimeFrame(nodeId: number, startDateTimeWindow: string, endDateTimeWindow: string, sessionToken: string): Promise<Record<string, any>> {

    //     const driverRouteNodeIds: Array<Record<string, any>> = await this.driverRouteNodeRepository.findDriverRouteNodes({
    //         attributes: [["droute_id", "drouteNodeId"]],
    //         where: {
    //             [Op.and]: [
    //                 {
    //                     [Op.and]: [
    //                         {
    //                             [Op.or]: [
    //                                 {
    //                                     [Op.and]: [
    //                                         {
    //                                             [Op.or]: [
    //                                                 {
    //                                                     departureTime: {
    //                                                         [Op.and]: [
    //                                                             { [Op.gte]: startDateTimeWindow },
    //                                                             { [Op.lte]: endDateTimeWindow }
    //                                                         ]
    //                                                     }
    //                                                 },
    //                                                 {
    //                                                     [Op.and]: [
    //                                                         literal(`"DriverRouteNode"."departure_time" + ((CASE WHEN "droute"."departure_flexibility" > 0 THEN "droute"."departure_flexibility" ELSE 0 END) * interval '1 minute') >= '${startDateTimeWindow}'`),
    //                                                         literal(`"DriverRouteNode"."departure_time" + ((CASE WHEN "droute"."departure_flexibility" > 0 THEN "droute"."departure_flexibility" ELSE 0 END) * interval '1 minute') <= '${endDateTimeWindow}'`)
    //                                                     ]
    //                                                 }
    //                                             ]
    //                                         },
    //                                         {
    //                                             status: "ORIGIN"
    //                                         }
    //                                     ]
    //                                 },
    //                                 {
    //                                     [Op.and]: [
    //                                         {
    //                                             arrivalTime: {
    //                                                 [Op.and]: [
    //                                                     { [Op.gte]: startDateTimeWindow },
    //                                                     { [Op.lte]: endDateTimeWindow }
    //                                                 ]
    //                                             }
    //                                         },
    //                                         {
    //                                             [Op.or]: [
    //                                                 {
    //                                                     status: "SCHEDULED"
    //                                                 },
    //                                                 {
    //                                                     status: "POTENTIAL"
    //                                                 }
    //                                             ]
    //                                         }
    //                                     ]
    //                                 }
    //                             ]
    //                         },
    //                         { nodeId: nodeId }
    //                     ]
    //                 }
    //             ]
    //         },
    //         include: [
    //             {
    //                 association: "droute",
    //                 attributes: [],
    //                 required: true
    //             }
    //         ]
    //     });

    //     if (!driverRouteNodeIds.length) {
    //         throw new CustomError("No Driver Route found in on this node in given time window", 404);
    //     }

    //     const driverRoutes: Array<DriverRouteAssociatedNodeDto> = await this.driverRouteRepository.findDriverRoutes({
    //         where: {
    //             drouteId:
    //             {
    //                 [Op.in]: driverRouteNodeIds.map(dRouteNodeNT => parseInt(dRouteNodeNT.drouteNodeId, 10))
    //             },
    //         },
    //         include: [
    //             { association: "origin" },
    //             { association: "destination" },
    //             {
    //                 association: "drouteNodes",
    //                 required: true,
    //                 include: [
    //                     { association: "node" }
    //                 ]
    //             }
    //         ],
    //         order: [["drouteNodes", "rank", "ASC"]]
    //     });

    //     const session: SessionDto | null = await this.sessionRepository.findSession({
    //         where: {
    //             sessionToken: !sessionToken ? "" : sessionToken
    //         },
    //         include: [{
    //             association: "user"
    //         }]
    //     });
    //     let waypointDistance: number = session?.user?.waypointDistance ?? 1609.34;

    //     const driverRouteDataPlainJSON: Array<Record<string, any>> = await Promise.all(driverRoutes.map(async (driverRoute: DriverRouteAssociatedNodeDto) => {
    //         // let GISWaypoints: Array<Record<string, any>> = [];
    //         let osrmRoute: Array<any> = [];
    //         let intermediateNodes: Array<Record<string, any>> = [];

    //         let tmpOsrmRouteArray: Array<any> = new Array<any>(driverRoute.drouteNodes!.length - 1);
    //         let tmpIntermediateNodesArray: Array<Record<string, any>> = new Array<Record<string, any>>(driverRoute.drouteNodes!.length - 1);

    //         await Promise.all(driverRoute.drouteNodes!.slice(0, -1).map(async (drouteNode: DriverRouteNodeAssocitedDto, k: number) => {

    //             // for (let k = 0; k < driverRoute.drouteNodes!.length - 1; ++k) {
    //             let nodePointA: DriverRouteNodeAssocitedDto = drouteNode;
    //             // driverRoute.drouteNodes![k];
    //             let nodePointB: DriverRouteNodeAssocitedDto = driverRoute.drouteNodes![k + 1];

    //             const parallelLinePoints: Array<Record<string, number>> = findParallelLinePoints({ longitude: nodePointA.node?.long!, latitude: nodePointA.node?.lat! }, { longitude: nodePointB.node?.long!, latitude: nodePointB.node?.lat! });
    //             let nodesInAreaOfInterest: Array<Record<string, any> | undefined> = await findNodesOfInterestInArea(Object.values(parallelLinePoints[0]), Object.values(parallelLinePoints[1]), Object.values(parallelLinePoints[2]), Object.values(parallelLinePoints[3]), [])
    //             const routeInfo: Record<string, any> = await getRouteDetailsByOSRM({ longitude: nodePointA.node?.long!, latitude: nodePointA.node?.lat! }, { longitude: nodePointB.node?.long!, latitude: nodePointB.node?.lat! });

    //             // let waypointNodes: Array<Record<string, any>> = [];

    //             if (!driverRoute.fixedRoute) {
    //                 for (let i: number = 0; i < nodesInAreaOfInterest.length; ++i) {
    //                     for (let j: number = 0; j < routeInfo.routes[0].legs[0].steps.length - 1; ++j) {

    //                         let subRoutePointsGIS: Array<[number, number]> = routeInfo.routes[0].legs[0].steps[j].geometry.coordinates;

    //                         let waypointStart: [number, number] = subRoutePointsGIS[0]
    //                         let waypointEnd: [number, number] = subRoutePointsGIS[routeInfo.routes[0].legs[0].steps[j].geometry.coordinates.length - 1];
    //                         // waypointNodes.push({ "waypointStart": waypointStart, "waypointEnd": waypointEnd });

    //                         let calculatedintermediateNode: Record<string, any> = getDistances(waypointStart, waypointEnd, nodesInAreaOfInterest[i]!, subRoutePointsGIS);

    //                         if (calculatedintermediateNode.intercepted === true) {
    //                             if (Object.keys(nodesInAreaOfInterest[i]!).includes("isWaypoint")) {
    //                                 if (nodesInAreaOfInterest[i]!.distance > calculatedintermediateNode.distance) {
    //                                     nodesInAreaOfInterest[i]!.distance = calculatedintermediateNode.distance;
    //                                 }
    //                             } else {
    //                                 nodesInAreaOfInterest[i] = { "isWaypoint": true, "distance": calculatedintermediateNode.distance, ...nodesInAreaOfInterest[i] };
    //                             }
    //                         }
    //                     }
    //                 }
    //                 nodesInAreaOfInterest = formatNodeData(nodesInAreaOfInterest, waypointDistance).map((wpNode) => {
    //                     if (wpNode.isWaypoint) {
    //                         return wpNode;
    //                     }
    //                     return;
    //                 }).filter(Boolean).filter((iNode) => {
    //                     return (nodePointA.node?.lat != iNode!.lat && nodePointA.node?.long != iNode!.long) && (nodePointA.node?.lat != iNode!.lat && nodePointB.node?.long != iNode!.long);
    //                 }).filter(Boolean);
    //                 tmpIntermediateNodesArray[k] = nodesInAreaOfInterest;
    //                 // intermediateNodes = intermediateNodes.concat(nodesInAreaOfInterest);

    //             }
    //             tmpOsrmRouteArray[k] = routeInfo.routes[0].geometry.coordinates;

    //             // osrmRoute = osrmRoute.concat(routeInfo.routes[0].geometry.coordinates);
    //             // GISWaypoints = GISWaypoints.concat(waypointNodes)
    //             // }
    //         }));

    //         for (let i = 0; i < driverRoute.drouteNodes!.length - 1; ++i) {
    //             intermediateNodes = intermediateNodes.concat(tmpIntermediateNodesArray[i]);
    //             osrmRoute = osrmRoute.concat(tmpOsrmRouteArray[i])
    //         }

    //         intermediateNodes = intermediateNodes.filter(Boolean).filter((iNode) => {
    //             return (driverRoute.origin?.lat != iNode!.lat && driverRoute.origin?.long != iNode!.long) && (driverRoute.destination?.lat != iNode!.lat && driverRoute.destination?.long != iNode!.long);
    //         }).filter(Boolean);

    //         // let distinctGISWaypoints: Array<Record<string, any>> = [];
    //         // let distinctCombinations: Set<String> | null = new Set<string>();

    //         // for (const obj of GISWaypoints) {
    //         //     const combinationKey = `${obj.waypointStart.toString()} - ${obj.waypointEnd.toString()}`;
    //         //     if (!distinctCombinations.has(combinationKey)) {
    //         //         distinctCombinations.add(combinationKey);
    //         //         distinctGISWaypoints.push(obj);
    //         //     }
    //         // }

    //         const drouteNodeIds: Set<number> = new Set<number>(driverRoute.drouteNodes!.map(dRouteNode => dRouteNode.nodeId));
    //         intermediateNodes = intermediateNodes.filter(iNode => !drouteNodeIds.has(iNode.nodeId));

    //         return {
    //             ...driverRoute, "intermediateNodes": intermediateNodes, "osrmRoute": osrmRoute
    //             // ,  "GISWayPoints": distinctGISWaypoints
    //         };
    //     }));

    //     return { status: 200, data: { driverRouteData: driverRouteDataPlainJSON } };
    // }

    //old
    async displayDriverRoutesAtNodeBetweenTimeFrame(nodeId: number, startDateTimeWindow: string, endDateTimeWindow: string, sessionToken: string): Promise<Record<string, any>> {
        // const driverRouteNodeIds: Array<Record<string, any>> = await this.driverRouteNodeRepository.findDriverRouteNodes({
        //     attributes: [["droute_id", "drouteNodeId"]],
        //     where: {
        //         [Op.and]: [
        //             {
        //                 [Op.and]: [
        //                     {
        //                         [Op.or]: [
        //                             {
        //                                 [Op.and]: [
        //                                     {
        //                                         [Op.or]: [
        //                                             {
        //                                                 departureTime: {
        //                                                     [Op.and]: [
        //                                                         { [Op.gte]: startDateTimeWindow },
        //                                                         { [Op.lte]: endDateTimeWindow }
        //                                                     ]
        //                                                 }
        //                                             },
        //                                             {
        //                                                 [Op.and]: [
        //                                                     literal(`"DriverRouteNode"."departure_time" + ((CASE WHEN "droute"."departure_flexibility" > 0 THEN "droute"."departure_flexibility" ELSE 0 END) * interval '1 minute') >= '${startDateTimeWindow}'`),
        //                                                     literal(`"DriverRouteNode"."departure_time" + ((CASE WHEN "droute"."departure_flexibility" > 0 THEN "droute"."departure_flexibility" ELSE 0 END) * interval '1 minute') <= '${endDateTimeWindow}'`)
        //                                                 ]
        //                                             }
        //                                         ]
        //                                     },
        //                                     {
        //                                         status: "ORIGIN"
        //                                     }
        //                                 ]
        //                             },
        //                             {
        //                                 [Op.and]: [
        //                                     {
        //                                         arrivalTime: {
        //                                             [Op.and]: [
        //                                                 { [Op.gte]: startDateTimeWindow },
        //                                                 { [Op.lte]: endDateTimeWindow }
        //                                             ]
        //                                         }
        //                                     },
        //                                     {
        //                                         [Op.or]: [
        //                                             {
        //                                                 status: "SCHEDULED"
        //                                             },
        //                                             {
        //                                                 status: "POTENTIAL"
        //                                             }
        //                                         ]
        //                                     }
        //                                 ]
        //                             }
        //                         ]
        //                     },
        //                     { nodeId: nodeId }
        //                 ]
        //             }
        //         ]
        //     },
        //     include: [
        //         {
        //             association: "droute",
        //             attributes: [],
        //             required: true
        //         }
        //     ]
        // });

        // if (!driverRouteNodeIds.length) {
        //     throw new CustomError("No Driver Route found in on this node in given time window", 404);
        // }

        // const driverRoutes: Array<DriverRouteAssociatedNodeDto> = await this.driverRouteRepository.findDriverRoutes({
        //     where: {
        //         drouteId:
        //         {
        //             [Op.in]: Array.from(new Set(driverRouteNodeIds.map(dRouteNodeNT => parseInt(dRouteNodeNT.drouteNodeId, 10))))
        //         },
        //     },
        //     include: [
        //         { association: "origin" },
        //         { association: "destination" },
        //         {
        //             association: "drouteNodes",
        //             required: true,
        //             include: [
        //                 { association: "node" }
        //             ]
        //         }
        //     ],
        //     order: [["drouteNodes", "rank", "ASC"]]
        // });

        const driverRoutes: Array<DriverRouteAssociatedNodeDto> = await getDriverRoutesBetweenTimeFrame(startDateTimeWindow, endDateTimeWindow, [nodeId]);

        if (!driverRoutes.length) {
            throw new CustomError("No Driver Route found in on this node in given time window", 404);
        }

        // const session: SessionDto | null = await this.sessionRepository.findSession({
        //     where: {
        //         sessionToken: !sessionToken ? "" : sessionToken
        //     },
        //     include: [{
        //         association: "user"
        //     }]
        // });
        // let waypointDistance: number = session?.user?.waypointDistance ?? 1609.34;

        const driverRouteDataPlainJSON: Array<Record<string, any>> = await Promise.all(driverRoutes.map(async (driverRoute: DriverRouteAssociatedNodeDto) => {
            // let GISWaypoints: Array<Record<string, any>> = [];
            let osrmRoute: Array<any> = [];
            // let intermediateNodes: Array<Record<string, any>> = [];

            let tmpOsrmRouteArray: Array<any> = new Array<any>(driverRoute.drouteNodes!.length - 1);
            // let tmpIntermediateNodesArray: Array<Record<string, any>> = new Array<Record<string, any>>(driverRoute.drouteNodes!.length - 1);

            let driverRouteNodesHavingOSRMRoute: Array<NodeDto> = [];

            driverRoute.drouteNodes!.forEach((drouteNode: DriverRouteNodeAssocitedDto) => {
                if (["SCHEDULED", "ORIGIN", "DESTINATION"].includes(drouteNode.status!.trim())) {
                    driverRouteNodesHavingOSRMRoute.push(drouteNode.node!);
                }
            });

            //  = driverRoute.drouteNodes![1];

            await Promise.all(driverRouteNodesHavingOSRMRoute!.slice(0, -1).map(async (drouteNode: NodeDto, k: number) => {
                // for (let k = 0; k < driverRoute.drouteNodes!.length - 1; ++k) {
                // let nodePointA: DriverRouteNodeAssocitedDto = drouteNode;
                let nodePointA: NodeDto = driverRouteNodesHavingOSRMRoute![k];
                let nodePointB: NodeDto = driverRouteNodesHavingOSRMRoute![k + 1];

                // const parallelLinePoints: Array<Record<string, number>> = findParallelLinePoints({ longitude: nodePointA.node?.long!, latitude: nodePointA.node?.lat! }, { longitude: nodePointB.node?.long!, latitude: nodePointB.node?.lat! });
                // let nodesInAreaOfInterest: Array<Record<string, any> | undefined> = await findNodesOfInterestInArea(Object.values(parallelLinePoints[0]), Object.values(parallelLinePoints[1]), Object.values(parallelLinePoints[2]), Object.values(parallelLinePoints[3]), [])

                // if ((nodePointA.status?.trim() === "ORIGIN" || nodePointA.status?.trim() === "SCHEDULED") && (nodePointB.status?.trim() === "DESTINATION" || nodePointB.status?.trim() === "SCHEDULED")) {
                const routeInfo: Record<string, any> = await getRouteDetailsByOSRM({ longitude: nodePointA.long!, latitude: nodePointA.lat! }, { longitude: nodePointB.long!, latitude: nodePointB.lat! });
                // let waypointNodes: Array<Record<string, any>> = [];

                // if (!driverRoute.fixedRoute) {
                //     for (let i: number = 0; i < nodesInAreaOfInterest.length; ++i) {
                //         for (let j: number = 0; j < routeInfo.routes[0].legs[0].steps.length - 1; ++j) {

                //             let subRoutePointsGIS: Array<[number, number]> = routeInfo.routes[0].legs[0].steps[j].geometry.coordinates;

                //             let waypointStart: [number, number] = subRoutePointsGIS[0]
                //             let waypointEnd: [number, number] = subRoutePointsGIS[routeInfo.routes[0].legs[0].steps[j].geometry.coordinates.length - 1];
                //             // waypointNodes.push({ "waypointStart": waypointStart, "waypointEnd": waypointEnd });

                //             let calculatedintermediateNode: Record<string, any> = getDistances(waypointStart, waypointEnd, nodesInAreaOfInterest[i]!, subRoutePointsGIS);

                //             if (calculatedintermediateNode.intercepted === true) {
                //                 if (Object.keys(nodesInAreaOfInterest[i]!).includes("isWaypoint")) {
                //                     if (nodesInAreaOfInterest[i]!.distance > calculatedintermediateNode.distance) {
                //                         nodesInAreaOfInterest[i]!.distance = calculatedintermediateNode.distance;
                //                     }
                //                 } else {
                //                     nodesInAreaOfInterest[i] = { "isWaypoint": true, "distance": calculatedintermediateNode.distance, ...nodesInAreaOfInterest[i] };
                //                 }
                //             }
                //         }
                //     }
                //     nodesInAreaOfInterest = formatNodeData(nodesInAreaOfInterest, waypointDistance).map((wpNode) => {
                //         if (wpNode.isWaypoint) {
                //             return wpNode;
                //         }
                //         return;
                //     }).filter(Boolean).filter((iNode) => {
                //         return (nodePointA.node?.lat != iNode!.lat && nodePointA.node?.long != iNode!.long) && (nodePointA.node?.lat != iNode!.lat && nodePointB.node?.long != iNode!.long);
                //     }).filter(Boolean);
                //     tmpIntermediateNodesArray[k] = nodesInAreaOfInterest;
                //     // intermediateNodes = intermediateNodes.concat(nodesInAreaOfInterest);

                // }
                tmpOsrmRouteArray[k] = routeInfo.routes[0].geometry.coordinates;
                // }

                // if (nodePointB.status?.trim() === "SCHEDULED") {
                //     nodePointA = nodePointB;
                // }

                // osrmRoute = osrmRoute.concat(routeInfo.routes[0].geometry.coordinates);
                // GISWaypoints = GISWaypoints.concat(waypointNodes)
                // }
            }));

            for (let i = 0; i < driverRoute.drouteNodes!.length - 1; ++i) {
                // intermediateNodes = intermediateNodes.concat(tmpIntermediateNodesArray[i]);
                osrmRoute = osrmRoute.concat(!tmpOsrmRouteArray[i] ? [] : tmpOsrmRouteArray[i]);
            }

            // intermediateNodes = intermediateNodes.filter(Boolean).filter((iNode) => {
            //     return (driverRoute.origin?.lat != iNode!.lat && driverRoute.origin?.long != iNode!.long) && (driverRoute.destination?.lat != iNode!.lat && driverRoute.destination?.long != iNode!.long);
            // }).filter(Boolean);

            // let distinctGISWaypoints: Array<Record<string, any>> = [];
            // let distinctCombinations: Set<String> | null = new Set<string>();

            // for (const obj of GISWaypoints) {
            //     const combinationKey = `${obj.waypointStart.toString()} - ${obj.waypointEnd.toString()}`;
            //     if (!distinctCombinations.has(combinationKey)) {
            //         distinctCombinations.add(combinationKey);
            //         distinctGISWaypoints.push(obj);
            //     }
            // }

            // const drouteNodeIds: Set<number> = new Set<number>(driverRoute.drouteNodes!.map(dRouteNode => dRouteNode.nodeId));
            // intermediateNodes = intermediateNodes.filter(iNode => !drouteNodeIds.has(iNode.nodeId));

            return {
                ...driverRoute,
                //  "intermediateNodes": intermediateNodes,
                osrmRoute: osrmRoute,
                // ,  "GISWayPoints": distinctGISWaypoints
            };
        }));

        return { status: 200, data: { driverRouteData: driverRouteDataPlainJSON } };
    }

    async displayDriverRouteById(drouteId: number): Promise<any> {
        const driverRoute: DriverRouteAssociatedNodeDto | null = await new DriverRouteRepository().findDriverRoute({
            where: {
                drouteId: drouteId,
            },
            include: [
                { association: "origin" },
                { association: "destination" },
                {
                    association: "drouteNodes",
                    required: true,
                    include: [{ association: "node" }],
                },
            ],
            order: [["drouteNodes", "rank", "ASC"]],
        });

        if (!driverRoute) {
            throw new CustomError("No Driver Route Found", 404);
        }

        let osrmRoute: Array<any> = [];
        let tmpOsrmRouteArray: Array<any> = new Array<any>(driverRoute.drouteNodes!.length - 1);
        let driverRouteNodesHavingOSRMRoute: Array<NodeDto> = [];

        driverRoute.drouteNodes!.forEach((drouteNode: DriverRouteNodeAssocitedDto) => {
            if (["SCHEDULED", "ORIGIN", "DESTINATION"].includes(drouteNode.status!.trim())) {
                driverRouteNodesHavingOSRMRoute.push(drouteNode.node!);
            }
        });

        await Promise.all(driverRouteNodesHavingOSRMRoute!.slice(0, -1).map(async (drouteNode: NodeDto, k: number) => {
            let nodePointA: NodeDto = driverRouteNodesHavingOSRMRoute![k];
            let nodePointB: NodeDto = driverRouteNodesHavingOSRMRoute![k + 1];

            const routeInfo: Record<string, any> = await getRouteDetailsByOSRM({ longitude: nodePointA.long!, latitude: nodePointA.lat! }, { longitude: nodePointB.long!, latitude: nodePointB.lat! });
            tmpOsrmRouteArray[k] = routeInfo.routes[0].geometry.coordinates;
        }));

        for (let i = 0; i < driverRoute.drouteNodes!.length - 1; ++i) {
            osrmRoute = osrmRoute.concat(!tmpOsrmRouteArray[i] ? [] : tmpOsrmRouteArray[i]);
        }

        return { status: 200, data: { driverRouteData: { ...driverRoute, osrmRoute: osrmRoute, } } };
    }

    async findMatchingDriverRoutes(originCoordinates: CoordinateDto, destinationCoordinates: CoordinateDto, departureDateTime: string, departureFlexibility: number, sessionToken: string | undefined, requestType: string): Promise<any> {

        if (requestType !== "ios" && requestType !== "web") {
            return { status: 400, data: { message: "Unknown request" } };
        }

        const originNode: NodeDto = (await findNearestNode(originCoordinates)).smallestDistanceNode;
        const destinationNode: NodeDto = (await findNearestNode(destinationCoordinates)).smallestDistanceNode;

        let routeStrategy: RiderDriverRouteMatchingStrategy = new RiderDriverRouteMatchingStrategy();

        let matchingRoutesWithQosMetrics: Array<ClassifiedRouteDto> = await routeStrategy.getRiderDriverRoutes(departureDateTime, departureFlexibility, originNode, destinationNode)

        if (requestType === "ios") {

            let routeOptions: Array<RouteOption> = [];

            await Promise.all(matchingRoutesWithQosMetrics.map(async (primaryClassifiedRoute: ClassifiedRouteDto) => {

                let routeOption: RouteOption = {};

                let totalDistance: number = (primaryClassifiedRoute.cumDistance ?? 0) + (primaryClassifiedRoute.intersectingRoute?.cumDistance ?? 0) + (primaryClassifiedRoute.intersectingRoute?.intersectingRoute?.cumDistance ?? 0);

                let primaryFirstNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.driverRoute.drouteNodes?.slice(0, 1)[0]!;
                let primaryLastNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.driverRoute.drouteNodes?.slice(-1)[0]!;
                routeOption.primary = {
                    originNode: primaryFirstNode.nodeId, destinationNode: primaryLastNode.nodeId, drouteId: primaryClassifiedRoute.driverRoute.drouteId,
                    originDepartureTime: primaryFirstNode.departureTime as string, destinationArrivalTime: primaryLastNode.arrivalTime as string,
                    drouteName: primaryClassifiedRoute.driverRoute.drouteName!, distanceRatio: primaryClassifiedRoute.cumDistance! / totalDistance
                }

                if (primaryClassifiedRoute.intersectingRoute) {

                    let secondaryFirstNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes?.slice(0, 1)[0]!;
                    let secondaryLastNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes?.slice(-1)[0]!;
                    routeOption.secondary = {
                        originNode: secondaryFirstNode.nodeId, destinationNode: secondaryLastNode.nodeId, drouteId: primaryClassifiedRoute.intersectingRoute.driverRoute.drouteId,
                        originDepartureTime: secondaryFirstNode.departureTime as string, destinationArrivalTime: secondaryLastNode.arrivalTime as string,
                        drouteName: primaryClassifiedRoute.intersectingRoute.driverRoute.drouteName!, distanceRatio: primaryClassifiedRoute.intersectingRoute.cumDistance! / totalDistance
                    }

                    if (primaryClassifiedRoute.intersectingRoute.intersectingRoute) {

                        let tertiaryFirstNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes?.slice(0, 1)[0]!;
                        let tertiaryLastNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes?.slice(-1)[0]!;
                        routeOption.tertiary = {
                            originNode: tertiaryFirstNode.nodeId, destinationNode: tertiaryLastNode.nodeId,
                            drouteId: primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteId,
                            originDepartureTime: tertiaryFirstNode.departureTime as string,
                            destinationArrivalTime: tertiaryLastNode.arrivalTime as string,
                            drouteName: primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteName!,
                            distanceRatio: primaryClassifiedRoute.intersectingRoute.intersectingRoute.cumDistance! / totalDistance
                        }
                    }
                }

                let ratioSum: number = (routeOption.primary?.distanceRatio ?? 0) + (routeOption.secondary?.distanceRatio ?? 0) + (routeOption.tertiary?.distanceRatio ?? 0)
                let scaleFactor: number = 10 / ratioSum;

                routeOption.primary.distanceRatio = parseFloat((routeOption.primary.distanceRatio * scaleFactor).toFixed(2));
                if (routeOption.secondary) {
                    routeOption.secondary.distanceRatio = parseFloat((routeOption.secondary.distanceRatio * scaleFactor).toFixed(2));
                }
                if (routeOption.tertiary) {
                    routeOption.tertiary.distanceRatio = parseFloat((routeOption.tertiary.distanceRatio * scaleFactor).toFixed(2));
                }

                routeOptions.push(routeOption);

            }));

            return { status: 200, data: { matchingRouteOptions: routeOptions } };

        } else if (requestType === "web") {

            let routeOptions: Array<calculatedRoute> = [];

            await Promise.all(matchingRoutesWithQosMetrics.map(async (primaryClassifiedRoute: ClassifiedRouteDto) => {

                let routeOption: calculatedRoute = {
                    routeEfficiency: 0,
                    routeCumulativeDuration: 0
                };

                let primaryFirstNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.driverRoute.drouteNodes?.slice(0, 1)[0]!;
                let primaryLastNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.driverRoute.drouteNodes?.slice(-1)[0]!;
                routeOption.primary = {
                    drouteId: primaryClassifiedRoute.driverRoute.drouteId, originNode: primaryFirstNode.nodeId, destinationNode: primaryLastNode.nodeId,
                    originDepartureTime: primaryFirstNode.departureTime as string, destinationArrivalTime: primaryLastNode.arrivalTime as string,
                    routeDuration: primaryClassifiedRoute.cumDuration ?? 0, routeDistance: primaryClassifiedRoute.cumDistance ?? 0,
                }
                routeOption.routeCumulativeDuration += primaryClassifiedRoute.cumDuration ?? 0;
                routeOption.routeEfficiency += primaryClassifiedRoute.routeEfficiency ?? 0;

                if (primaryClassifiedRoute.intersectingRoute) {

                    let secondaryFirstNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes?.slice(0, 1)[0]!;
                    let secondaryLastNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes?.slice(-1)[0]!;
                    routeOption.secondary = {
                        originNode: secondaryFirstNode.nodeId, destinationNode: secondaryLastNode.nodeId, drouteId: primaryClassifiedRoute.intersectingRoute.driverRoute.drouteId,
                        originDepartureTime: secondaryFirstNode.departureTime as string, destinationArrivalTime: secondaryLastNode.arrivalTime as string,
                        routeDuration: primaryClassifiedRoute.intersectingRoute.cumDuration ?? 0, routeDistance: primaryClassifiedRoute.intersectingRoute.cumDistance ?? 0
                    }
                    routeOption.routeCumulativeDuration += primaryClassifiedRoute.intersectingRoute.cumDuration ?? 0;
                    routeOption.routeEfficiency += primaryClassifiedRoute.intersectingRoute.routeEfficiency ?? 0;

                    if (primaryClassifiedRoute.intersectingRoute.intersectingRoute) {

                        let tertiaryFirstNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes?.slice(0, 1)[0]!;
                        let tertiaryLastNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes?.slice(-1)[0]!;
                        routeOption.tertiary = {
                            originNode: tertiaryFirstNode.nodeId, destinationNode: tertiaryLastNode.nodeId,
                            drouteId: primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteId,
                            originDepartureTime: tertiaryFirstNode.departureTime as string,
                            destinationArrivalTime: tertiaryLastNode.arrivalTime as string,
                            routeDuration: primaryClassifiedRoute.intersectingRoute.intersectingRoute.cumDuration ?? 0,
                            routeDistance: primaryClassifiedRoute.intersectingRoute.intersectingRoute.cumDistance ?? 0
                        }

                        routeOption.routeCumulativeDuration += primaryClassifiedRoute.intersectingRoute.intersectingRoute.cumDuration ?? 0;
                        routeOption.routeEfficiency += primaryClassifiedRoute.intersectingRoute.intersectingRoute.routeEfficiency ?? 0;
                    }
                }

                // routeOption.routeEfficiency = primaryClassifiedRoute.routeEfficiency ?? 0;
                // routeOption.routeCumulativeDuration = (routeOption.primary.routeDuration ?? 0) + (routeOption.secondary?.routeDuration ?? 0) + (routeOption.tertiary?.routeDuration ?? 0);

                if (primaryClassifiedRoute.intersectingRoute) {
                    if (primaryClassifiedRoute.intersectingRoute.intersectingRoute) {
                        //tertiary
                        routeOption.routeEfficiency = parseFloat((routeOption.routeEfficiency / 3).toFixed(2));

                    } else {
                        //secondary
                        routeOption.routeEfficiency = parseFloat((routeOption.routeEfficiency / 2).toFixed(2));
                    }
                }

                routeOptions.push(routeOption);

            }));

            return {
                status: 200,
                data: {
                    matchingRoutes: routeOptions,
                    originNode: originNode.nodeId,
                    originNodeAddress: "".concat(originNode.description ?? "").concat(" ").concat(originNode.address ?? "")
                        .concat(" ").concat(originNode.city ?? "").concat(" ").concat(originNode.stateProvince ?? ""),
                    destinationNode: destinationNode.nodeId,
                    destinationNodeAddress: "".concat(destinationNode.description ?? "").concat(" ").concat(destinationNode.address ?? "")
                        .concat(" ").concat(destinationNode.city ?? "").concat(" ").concat(destinationNode.stateProvince ?? "")
                }
            };

        }
    }
}
