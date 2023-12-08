import { Op, col, fn } from "sequelize";
import { createReadStream, promises as fsPromises } from "fs";
import { DriverRouteRepository } from "../repository/droute.repository";
import {
    ClassifiedRouteDto,
    CoordinateDto, CustomError, DriverRouteAssociatedNodeDto, DriverRouteNodeAssocitedDto, FilterForm, NodeDto, OsrmCoordinates, RouteOption, SessionDto, calculatedRoute,
} from "../util/interface.utility";
import { NodeRepository } from "../repository/node.repository";
import {
    isValidFileHeader, prepareBatchBulkImportData, extractOrigDestNodeId, sortRouteNodeListByNodeStop, getNodeObjectByNodeId,
    getDistanceDurationBetweenNodes, importDriverRoutes, normalizeTimeZone, getRouteDetailsByOSRM, getActiveDateList, isRoutesDateSorted,
    getDriverRoutesBetweenTimeFrame, findNearestNode, retimeRoute,
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
                driverRoute.departureTime = driverRoute.departureTime ? normalizeTimeZone(driverRoute.departureTime as string) : driverRoute.departureTime;
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
                driverRoute.departureTime = driverRoute.departureTime ? normalizeTimeZone(driverRoute.departureTime as string) : driverRoute.departureTime;
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

    async listLogFileNames(fileGroupName: string, fileMimeType: string): Promise<Record<string, any>> {
        return fsPromises.readdir("./util/logs/").then((files) => {
            const filesList = files.filter((file) => path.extname(file) === fileMimeType && path.basename(file).includes(fileGroupName));
            if (filesList.length) {
                return { status: 200, data: { fileNameList: filesList } };
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

    async downloadLogFiles(fileName: string, fileGroupName: string, fileMimeType: string): Promise<Record<string, any>> {
        return fsPromises.readdir("./util/logs/").then((files: string[]) => {
            let filesList: string[];

            if (fileName === "allFiles") {
                filesList = files.filter((file) => path.extname(file) === fileMimeType && path.basename(file).includes(fileGroupName));
            } else {
                filesList = files.filter((file) => path.extname(file) === fileMimeType && path.basename(file) === fileName);
            }
            if (filesList.length === 0) {
                return { status: 404, data: { message: "No file Found" } };
            }

            const zip: Archiver = archiver("zip");
            filesList.forEach(async (file: string) => {
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
        const finalTransitRoutesToImport: Array<Record<string, any>> = await this.prepareFinalTransitRouteGroupToImport(Object.values(assertedDriverRouteTransitMetaDataGrouped));

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

    async prepareFinalTransitRouteGroupToImport(driverRouteTransitMetaDataGroupedArray: any): Promise<any> {
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

    async displayDriverRoutesAtNodeBetweenTimeFrame(nodeId: number, departureDateTimeWindow: string, departureFlexibility: number, isPartial: boolean, sessionToken: string): Promise<Record<string, any>> {

        let dateTimeStartWindow: string = moment(departureDateTimeWindow, "YYYY-MM-DD HH:mm").clone().utcOffset(0, true).format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
        let dateTimeEndWindow: string = moment(departureDateTimeWindow, "YYYY-MM-DD HH:mm").clone().add(departureFlexibility, "minutes").utcOffset(0, true).format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");

        // we are getting all driver routes
        const driverRoutes: Array<DriverRouteAssociatedNodeDto> = await getDriverRoutesBetweenTimeFrame(dateTimeStartWindow, dateTimeEndWindow, [nodeId]);

        let nodePointIntersectingRouteArrivalTimes: Array<Record<number, Array<{ Routeid: number; arrival_time: Date | string }>>> = [];

        if (!driverRoutes.length) {
            throw new CustomError("No Driver Route found in on this node in given time window", 404);
        }

        let driverRouteDataPlainJSON: Array<Record<string, any>> = await Promise.all(driverRoutes.map(async (driverRoute: DriverRouteAssociatedNodeDto) => {

            let riderOriginRank: number = Infinity;

            // find rider origin rank
            await Promise.all(driverRoute.drouteNodes!.map(async (drouteNode: DriverRouteNodeAssocitedDto) => {
                if (drouteNode.nodeId === nodeId) {
                    riderOriginRank = drouteNode.rank ?? Infinity;
                }
                const nodeIdIndex = nodePointIntersectingRouteArrivalTimes.findIndex(record => record.hasOwnProperty(drouteNode.nodeId));
                const timeRecord = {
                    Routeid: drouteNode.drouteId,
                    arrival_time: normalizeTimeZone((drouteNode.arrivalTime ?? drouteNode.departureTime!) as string)
                };

                if (nodeIdIndex === -1) {
                    nodePointIntersectingRouteArrivalTimes.push({ [drouteNode.nodeId]: [timeRecord] });
                } else {
                    nodePointIntersectingRouteArrivalTimes[nodeIdIndex][drouteNode.nodeId].push(timeRecord);
                }
            }));
            driverRoute = await retimeRoute(driverRoute, riderOriginRank)

            let osrmRoute: Array<[number, number]> = await this.getOptionOsrmRouteSection(driverRoute.drouteId, isPartial ? nodeId : driverRoute.originNode, driverRoute.destinationNode, !isPartial ? nodeId : Infinity);

            // let driverRouteNodesHavingOSRMRoute: Array<NodeDto> = [];

            // let searchNodeRank: number = Infinity;
            // await Promise.all(driverRoute.drouteNodes!.map(async (drouteNode: DriverRouteNodeAssocitedDto) => {
            //     if (drouteNode.nodeId === nodeId) {
            //         searchNodeRank = drouteNode.rank!
            //     }
            // }));

            // driverRoute.drouteNodes!.forEach((drouteNode: DriverRouteNodeAssocitedDto) => {
            //     if (drouteNode.rank! === searchNodeRank) {
            //         driverRouteNodesHavingOSRMRoute.push(drouteNode.node!);
            //     } else if (["SCHEDULED", "ORIGIN", "DESTINATION"].includes(drouteNode.status!.trim())) {
            //         if (isPartial && drouteNode.rank! > searchNodeRank) {
            //             driverRouteNodesHavingOSRMRoute.push(drouteNode.node!);
            //         } else if (!isPartial) {
            //             driverRouteNodesHavingOSRMRoute.push(drouteNode.node!);
            //         }
            //     }
            // });

            // let tmpOsrmRouteArray: Array<any> = new Array<any>(driverRouteNodesHavingOSRMRoute.length - 1);

            // await Promise.all(driverRouteNodesHavingOSRMRoute!.slice(0, -1).map(async (drouteNode: NodeDto, k: number) => {

            //     let nodePointA: NodeDto = driverRouteNodesHavingOSRMRoute![k];
            //     let nodePointB: NodeDto = driverRouteNodesHavingOSRMRoute![k + 1];

            //     const routeInfo: Record<string, any> = await getRouteDetailsByOSRM({ longitude: nodePointA.long!, latitude: nodePointA.lat! }, { longitude: nodePointB.long!, latitude: nodePointB.lat! });

            //     tmpOsrmRouteArray[k] = routeInfo.routes[0].geometry.coordinates;

            // }));

            // for (let i = 0; i < driverRoute.drouteNodes!.length - 1; ++i) {
            //     osrmRoute = osrmRoute.concat(!tmpOsrmRouteArray[i] ? [] : tmpOsrmRouteArray[i]);
            // }

            return {
                ...driverRoute,
                osrmRoute: osrmRoute,
            };
        }));


        driverRouteDataPlainJSON = await Promise.all(driverRouteDataPlainJSON.map(async (driverRouteOsrm: Record<string, any>) => {

            let searchNodeRank: number = Infinity;
            await Promise.all(driverRouteOsrm.drouteNodes!.map(async (drouteNode: DriverRouteNodeAssocitedDto) => {
                if (drouteNode.nodeId === nodeId) {
                    searchNodeRank = drouteNode.rank!
                }
            }));


            let arrivalTimeAtNode: string = "";
            // driverRouteOsrm.drouteNodes = 
            driverRouteOsrm.drouteNodes!.map((drouteNode: DriverRouteNodeAssocitedDto) => {
                if (drouteNode.nodeId === nodeId) {
                    arrivalTimeAtNode = moment(drouteNode.arrivalTime, "YYYY-MM-DD HH:mm").utcOffset(0, true).format("YYYY-MM-DD HH:mm")
                }
                // return drouteNode.rank! > searchNodeRank
            });
            driverRouteOsrm.arrivalTimeAtNode = arrivalTimeAtNode
            return driverRouteOsrm;
        }));

        const nodeToSearch: NodeDto | null = await this.nodeRepository.findNodeByPK(nodeId)

        return {
            status: 200, data: {
                driverRouteData: driverRouteDataPlainJSON, searchedNode: nodeToSearch,
                nodeDepartureDateTimeWindow: departureDateTimeWindow,
                nodeDepartureFlexibility: departureFlexibility,
                nodePointIntersectingRouteArrivalTimes: nodePointIntersectingRouteArrivalTimes,
            }
        };
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

        let osrmRoute: Array<[number, number]> = await this.getOptionOsrmRouteSection(drouteId, driverRoute.originNode, driverRoute.destinationNode);
        // let tmpOsrmRouteArray: Array<any> = new Array<any>(driverRoute.drouteNodes!.length - 1);
        // let driverRouteNodesHavingOSRMRoute: Array<NodeDto> = [];

        // driverRoute.drouteNodes!.forEach((drouteNode: DriverRouteNodeAssocitedDto) => {
        //     if (["SCHEDULED", "ORIGIN", "DESTINATION"].includes(drouteNode.status!.trim())) {
        //         driverRouteNodesHavingOSRMRoute.push(drouteNode.node!);
        //     }
        // });

        // await Promise.all(driverRouteNodesHavingOSRMRoute!.slice(0, -1).map(async (drouteNode: NodeDto, k: number) => {
        //     let nodePointA: NodeDto = driverRouteNodesHavingOSRMRoute![k];
        //     let nodePointB: NodeDto = driverRouteNodesHavingOSRMRoute![k + 1];

        //     const routeInfo: Record<string, any> = await getRouteDetailsByOSRM({ longitude: nodePointA.long!, latitude: nodePointA.lat! }, { longitude: nodePointB.long!, latitude: nodePointB.lat! });
        //     tmpOsrmRouteArray[k] = routeInfo.routes[0].geometry.coordinates;
        // }));

        // for (let i = 0; i < driverRoute.drouteNodes!.length - 1; ++i) {
        //     osrmRoute = osrmRoute.concat(!tmpOsrmRouteArray[i] ? [] : tmpOsrmRouteArray[i]);
        // }

        return { status: 200, data: { driverRouteData: { ...driverRoute, osrmRoute: osrmRoute, } } };
    }

    async findMatchingDriverRoutes(originCoordinates: CoordinateDto, destinationCoordinates: CoordinateDto, departureDateTime: string, departureFlexibility: number, sessionToken: string | undefined, requestType: string, riderOriginAddress: string, riderDestinationAddress: string): Promise<any> {

        if (requestType !== "ios" && requestType !== "web") {
            return { status: 400, data: { message: "Unknown request" } };
        }

        const originNode: NodeDto = (await findNearestNode(originCoordinates)).smallestDistanceNode;
        const destinationNode: NodeDto = (await findNearestNode(destinationCoordinates)).smallestDistanceNode;

        let directDistanceDuration: Record<string, any> = await getDistanceDurationBetweenNodes({ longitude: originNode.long, latitude: originNode.lat }, { longitude: destinationNode.long, latitude: destinationNode.lat })

        // get direct osrm distance duration to get qulaity metrics
        let riderRouteDirectDistance: number = parseFloat((directDistanceDuration.distance / 1609.34).toFixed(1));
        let riderRouteDirectDuration: number = Math.round(directDistanceDuration.duration / 60);

        let routeStrategy: RiderDriverRouteMatchingStrategy = new RiderDriverRouteMatchingStrategy();

        let matchingRoutesWithQosMetrics: Array<ClassifiedRouteDto> = await routeStrategy.getRiderDriverRoutes(departureDateTime, departureFlexibility, originNode, destinationNode, riderRouteDirectDistance, riderRouteDirectDuration, riderOriginAddress, riderDestinationAddress)

        // return { status: 200, data: { matchingRouteOptions: matchingRoutesWithQosMetrics } };

        if (requestType === "ios") {

            let routeOptions: Array<RouteOption> = [];

            await Promise.all(matchingRoutesWithQosMetrics.map(async (primaryClassifiedRoute: ClassifiedRouteDto) => {

                let routeOption: RouteOption = {};

                let totalDistance: number = (primaryClassifiedRoute.riderCumulativeDistance ?? 0) + (primaryClassifiedRoute.intersectingRoute?.riderCumulativeDistance ?? 0) + (primaryClassifiedRoute.intersectingRoute?.intersectingRoute?.riderCumulativeDistance ?? 0);

                let primaryFirstNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.driverRoute.drouteNodes![primaryClassifiedRoute.riderOriginRank];
                let primaryLastNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.driverRoute.drouteNodes![primaryClassifiedRoute.riderDestinationRank];
                routeOption.primary = {
                    originNode: primaryFirstNode.nodeId, destinationNode: primaryLastNode.nodeId, drouteId: primaryClassifiedRoute.driverRoute.drouteId,
                    originDepartureTime: primaryFirstNode.departureTime as string, destinationArrivalTime: primaryLastNode.arrivalTime as string,
                    drouteName: primaryClassifiedRoute.driverRoute.drouteName!, distanceRatio: primaryClassifiedRoute.riderCumulativeDistance! / totalDistance,
                    duration: Math.round(primaryClassifiedRoute.riderCumulativeDistance!), location: primaryFirstNode.node?.location!,
                    description: primaryFirstNode.node?.description!
                }

                if (primaryClassifiedRoute.intersectingRoute) {

                    let secondaryFirstNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute.riderOriginRank];
                    let secondaryLastNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute.riderDestinationRank];
                    routeOption.secondary = {
                        originNode: secondaryFirstNode.nodeId, destinationNode: secondaryLastNode.nodeId, drouteId: primaryClassifiedRoute.intersectingRoute.driverRoute.drouteId,
                        originDepartureTime: secondaryFirstNode.departureTime as string, destinationArrivalTime: secondaryLastNode.arrivalTime as string,
                        drouteName: primaryClassifiedRoute.intersectingRoute.driverRoute.drouteName!, distanceRatio: primaryClassifiedRoute.intersectingRoute.riderCumulativeDistance! / totalDistance,
                        duration: Math.round(primaryClassifiedRoute.intersectingRoute.riderCumulativeDistance!), location: secondaryFirstNode.node?.location!,
                        description: secondaryFirstNode.node?.description!
                    }

                    if (primaryClassifiedRoute.intersectingRoute.intersectingRoute) {

                        let tertiaryFirstNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderOriginRank];
                        let tertiaryLastNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderDestinationRank];
                        routeOption.tertiary = {
                            originNode: tertiaryFirstNode.nodeId, destinationNode: tertiaryLastNode.nodeId,
                            drouteId: primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteId,
                            originDepartureTime: tertiaryFirstNode.departureTime as string,
                            destinationArrivalTime: tertiaryLastNode.arrivalTime as string,
                            drouteName: primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteName!,
                            distanceRatio: primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderCumulativeDistance! / totalDistance,
                            duration: Math.round(primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderCumulativeDistance!),
                            location: tertiaryFirstNode.node?.location!, description: tertiaryFirstNode.node?.description!
                        }
                    }
                }

                let ratioSum: number = (routeOption.primary?.distanceRatio ?? 0) + (routeOption.secondary?.distanceRatio ?? 0) + (routeOption.tertiary?.distanceRatio ?? 0)
                let scaleFactor: number = 10 / ratioSum;

                routeOption.primary.distanceRatio = parseFloat((routeOption.primary.distanceRatio! * scaleFactor).toFixed(2));
                if (routeOption.secondary) {
                    routeOption.secondary.distanceRatio = parseFloat((routeOption.secondary.distanceRatio! * scaleFactor).toFixed(2));
                }
                if (routeOption.tertiary) {
                    routeOption.tertiary.distanceRatio = parseFloat((routeOption.tertiary.distanceRatio! * scaleFactor).toFixed(2));
                }

                routeOptions.push(routeOption);

            }));

            return { status: 200, data: { matchingRouteOptions: routeOptions } };

        } else if (requestType === "web") {

            let routeOptions: Array<calculatedRoute> = [];

            await Promise.all(matchingRoutesWithQosMetrics.map(async (primaryClassifiedRoute: ClassifiedRouteDto) => {

                let routeOption: calculatedRoute = {
                    timeQuality: primaryClassifiedRoute.timeQuality ?? 0,
                    distanceQuality: primaryClassifiedRoute.distanceQuality ?? 0,
                    overallQuality: primaryClassifiedRoute.overallQuality ?? 0,
                    routeCumulativeDuration: 0,
                    routeCummulativeDistance: 0,
                    riderRouteDirectDistance: riderRouteDirectDistance,
                    riderRouteDirectDuration: riderRouteDirectDuration
                };

                // Primary
                let primaryFirstNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.driverRoute.drouteNodes![primaryClassifiedRoute.riderOriginRank];
                let primaryLastNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.driverRoute.drouteNodes![primaryClassifiedRoute.riderDestinationRank];

                primaryClassifiedRoute.driverRoute.drouteNodes!.map(async (driverRouteNode: DriverRouteNodeAssocitedDto) => {
                    driverRouteNode.departureTime = driverRouteNode.departureTime ? normalizeTimeZone(driverRouteNode.departureTime as string) : driverRouteNode.departureTime;
                    driverRouteNode.arrivalTime = driverRouteNode.arrivalTime ? normalizeTimeZone(driverRouteNode.arrivalTime as string) : driverRouteNode.arrivalTime;
                });

                routeOption.primary = {
                    drouteId: primaryClassifiedRoute.driverRoute.drouteId, originNode: primaryFirstNode.nodeId, destinationNode: primaryLastNode.nodeId,
                    originDepartureTime: normalizeTimeZone(primaryFirstNode.departureTime as string), destinationArrivalTime: normalizeTimeZone(primaryLastNode.arrivalTime as string),
                    routeDuration: Math.round(primaryClassifiedRoute.riderCumulativeDuration ?? 0), routeDistance: parseFloat(primaryClassifiedRoute.riderCumulativeDistance?.toFixed(1) ?? '0'),
                    drouteNodes: primaryClassifiedRoute.driverRoute.drouteNodes!, drouteName: primaryClassifiedRoute.driverRoute.drouteName!,
                    originNodeDescription: primaryFirstNode.node?.description!, originNodeLocation: primaryFirstNode.node?.location!, transferWaitTime: 0,
                    destinationNodeDescription: primaryLastNode.node?.description!, destinationNodeLocation: primaryLastNode.node?.location!
                }
                if (!primaryClassifiedRoute.driverRoute.fixedRoute) {
                    routeOption.primary!.driverRouteDistance = primaryClassifiedRoute.driverRouteDistance;
                    routeOption.primary!.driverRouteDuration = primaryClassifiedRoute.driverRouteDuration;
                    routeOption.primary!.driverRouteDirectDistance = primaryClassifiedRoute.driverRouteDirectDistance;
                    routeOption.primary!.driverRouteDirectDuration = primaryClassifiedRoute.driverRouteDirectDuration;
                }
                routeOption.routeCumulativeDuration += primaryClassifiedRoute.riderCumulativeDuration ?? 0;
                routeOption.routeCummulativeDistance += primaryClassifiedRoute.riderCumulativeDistance ?? 0;

                // routeOption.routeEfficiency += primaryClassifiedRoute.routeEfficiency ?? 0;

                // Secondary 1-Stop
                if (primaryClassifiedRoute.intersectingRoute) {

                    let secondaryFirstNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute.riderOriginRank];
                    let secondaryLastNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute.riderDestinationRank];

                    primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes!.map(async (driverRouteNode: DriverRouteNodeAssocitedDto) => {
                        driverRouteNode.departureTime = driverRouteNode.departureTime ? normalizeTimeZone(driverRouteNode.departureTime as string) : driverRouteNode.departureTime;
                        driverRouteNode.arrivalTime = driverRouteNode.arrivalTime ? normalizeTimeZone(driverRouteNode.arrivalTime as string) : driverRouteNode.arrivalTime;
                    });

                    routeOption.secondary = {
                        originNode: secondaryFirstNode.nodeId, destinationNode: secondaryLastNode.nodeId, drouteId: primaryClassifiedRoute.intersectingRoute.driverRoute.drouteId,
                        originDepartureTime: normalizeTimeZone(secondaryFirstNode.departureTime as string), destinationArrivalTime: normalizeTimeZone(secondaryLastNode.arrivalTime as string),
                        routeDuration: Math.round(primaryClassifiedRoute.intersectingRoute.riderCumulativeDuration ?? 0), routeDistance: parseFloat(primaryClassifiedRoute.intersectingRoute.riderCumulativeDistance?.toFixed(1) ?? '0'),
                        drouteNodes: primaryClassifiedRoute.intersectingRoute.driverRoute.drouteNodes!, drouteName: primaryClassifiedRoute.intersectingRoute.driverRoute.drouteName!,
                        originNodeDescription: secondaryFirstNode.node?.description!, originNodeLocation: secondaryFirstNode.node?.location!,
                        destinationNodeDescription: secondaryLastNode.node?.description!, destinationNodeLocation: secondaryLastNode.node?.location!,
                        transferWaitTime: primaryClassifiedRoute.intersectingRoute.transferWaitTime
                    }
                    if (!primaryClassifiedRoute.intersectingRoute.driverRoute.fixedRoute) {
                        routeOption.secondary!.driverRouteDistance = primaryClassifiedRoute.intersectingRoute.driverRouteDistance;
                        routeOption.secondary!.driverRouteDuration = primaryClassifiedRoute.intersectingRoute.driverRouteDuration;
                        routeOption.secondary!.driverRouteDirectDistance = primaryClassifiedRoute.intersectingRoute.driverRouteDirectDistance;
                        routeOption.secondary!.driverRouteDirectDuration = primaryClassifiedRoute.intersectingRoute.driverRouteDirectDuration;
                    }
                    routeOption.routeCumulativeDuration += ((primaryClassifiedRoute.intersectingRoute.riderCumulativeDuration ?? 0) + primaryClassifiedRoute.intersectingRoute.transferWaitTime);
                    routeOption.routeCummulativeDistance += primaryClassifiedRoute.intersectingRoute.riderCumulativeDistance ?? 0;

                    // routeOption.routeEfficiency += primaryClassifiedRoute.intersectingRoute.routeEfficiency ?? 0;

                    // Tertiary 2-Stop
                    if (primaryClassifiedRoute.intersectingRoute.intersectingRoute) {

                        let tertiaryFirstNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderOriginRank];
                        let tertiaryLastNode: DriverRouteNodeAssocitedDto = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes![primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderDestinationRank];

                        primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes!.map(async (driverRouteNode: DriverRouteNodeAssocitedDto) => {
                            driverRouteNode.departureTime = driverRouteNode.departureTime ? normalizeTimeZone(driverRouteNode.departureTime as string) : driverRouteNode.departureTime;
                            driverRouteNode.arrivalTime = driverRouteNode.arrivalTime ? normalizeTimeZone(driverRouteNode.arrivalTime as string) : driverRouteNode.arrivalTime;
                        });

                        routeOption.tertiary = {
                            originNode: tertiaryFirstNode.nodeId, destinationNode: tertiaryLastNode.nodeId,
                            drouteId: primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteId,
                            originDepartureTime: normalizeTimeZone(tertiaryFirstNode.departureTime as string),
                            destinationArrivalTime: normalizeTimeZone(tertiaryLastNode.arrivalTime as string),
                            routeDuration: Math.round(primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderCumulativeDuration ?? 0),
                            routeDistance: parseFloat(primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderCumulativeDistance?.toFixed(1) ?? '0'),
                            drouteNodes: primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteNodes!, drouteName: primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.drouteName!,
                            originNodeDescription: tertiaryFirstNode.node?.description!, originNodeLocation: tertiaryFirstNode.node?.location!,
                            destinationNodeDescription: tertiaryLastNode.node?.description!, destinationNodeLocation: tertiaryLastNode.node?.location!,
                            transferWaitTime: primaryClassifiedRoute.intersectingRoute.intersectingRoute.transferWaitTime

                        }
                        if (!primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRoute.fixedRoute) {
                            routeOption.tertiary!.driverRouteDistance = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRouteDistance;
                            routeOption.tertiary!.driverRouteDuration = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRouteDirectDuration;
                            routeOption.tertiary!.driverRouteDirectDistance = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRouteDirectDistance;
                            routeOption.tertiary!.driverRouteDirectDuration = primaryClassifiedRoute.intersectingRoute.intersectingRoute.driverRouteDirectDuration;
                        }
                        routeOption.routeCumulativeDuration += ((primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderCumulativeDuration ?? 0) + primaryClassifiedRoute.intersectingRoute.intersectingRoute.transferWaitTime);
                        routeOption.routeCummulativeDistance += primaryClassifiedRoute.intersectingRoute.intersectingRoute.riderCumulativeDistance ?? 0;

                        // routeOption.routeEfficiency += primaryClassifiedRoute.intersectingRoute.intersectingRoute.routeEfficiency ?? 0;
                    }
                }

                // routeOption.routeEfficiency = primaryClassifiedRoute.routeEfficiency ?? 0;
                // routeOption.routeCumulativeDuration = (routeOption.primary.routeDuration ?? 0) + (routeOption.secondary?.routeDuration ?? 0) + (routeOption.tertiary?.routeDuration ?? 0);

                // if (primaryClassifiedRoute.intersectingRoute) {
                //     if (primaryClassifiedRoute.intersectingRoute.intersectingRoute) {
                //         //tertiary
                //         routeOption.routeEfficiency = parseFloat((routeOption.routeEfficiency / 3).toFixed(1));

                //     } else {
                //         //secondary
                //         routeOption.routeEfficiency = parseFloat((routeOption.routeEfficiency / 2).toFixed(1));
                //     }
                // }

                routeOption.routeCummulativeDistance = parseFloat(routeOption.routeCummulativeDistance.toFixed(1))

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

    async getOptionOsrmRoute(routeOptions: RouteOption): Promise<any> {

        let osrmRoute: OsrmCoordinates = { primary: [], secondary: [], tertiary: [] };

        osrmRoute.primary = await this.getOptionOsrmRouteSection(routeOptions.primary?.drouteId!, routeOptions.primary?.originNode!, routeOptions.primary?.destinationNode!);
        if (routeOptions.secondary) {
            osrmRoute.secondary = await this.getOptionOsrmRouteSection(routeOptions.secondary?.drouteId!, routeOptions.secondary?.originNode!, routeOptions.secondary?.destinationNode!);
        }
        if (routeOptions.tertiary) {
            osrmRoute.tertiary = await this.getOptionOsrmRouteSection(routeOptions.tertiary?.drouteId!, routeOptions.tertiary?.originNode!, routeOptions.tertiary?.destinationNode!);
        }

        return { status: 200, data: { routeOptionOsrmDetails: osrmRoute } };
    }

    async getOptionOsrmRouteSection(drouteId: number, originNode: number = Infinity, destinationNode: number = Infinity, nodeIdPoint: number = Infinity): Promise<Array<[number, number]>> {
        const driverRoute: DriverRouteAssociatedNodeDto | null = await new DriverRouteRepository().findDriverRoute({
            where: {
                drouteId: drouteId,
            },
            include: [
                {
                    association: "drouteNodes",
                    required: true,
                    include: [{ association: "node" }],
                },
            ],
            order: [["drouteNodes", "rank", "ASC"]],
        });


        if (!driverRoute) {
            return [];
        }

        let originRank: number = Infinity;
        let destinationRank: number = Infinity;
        await Promise.all(driverRoute.drouteNodes!.map(async (drouteNode: DriverRouteNodeAssocitedDto) => {
            if (drouteNode.nodeId === originNode) {
                originRank = drouteNode.rank!;
            } else if (drouteNode.nodeId === destinationNode) {
                destinationRank = drouteNode.rank!;
            }
        }));

        let osrmRoute: Array<[number, number]> = [];
        let tmpOsrmRouteArray: Array<any> = new Array<any>((destinationRank - originRank) + 1);
        let driverRouteNodesHavingOSRMRoute: Array<NodeDto> = [];

        driverRouteNodesHavingOSRMRoute.push(driverRoute.drouteNodes![originRank].node!);
        driverRoute.drouteNodes!.slice(originRank + 1, destinationRank).forEach((drouteNode: DriverRouteNodeAssocitedDto) => {
            if (["SCHEDULED", "ORIGIN", "DESTINATION"].includes(drouteNode.status!.trim())) {
                driverRouteNodesHavingOSRMRoute.push(drouteNode.node!);
            } else if (nodeIdPoint !== Infinity && drouteNode.nodeId === nodeIdPoint) {
                driverRouteNodesHavingOSRMRoute.push(drouteNode.node!);
            }
        });
        driverRouteNodesHavingOSRMRoute.push(driverRoute.drouteNodes![destinationRank].node!);

        await Promise.all(driverRouteNodesHavingOSRMRoute!.slice(0, -1).map(async (drouteNode: NodeDto, k: number) => {
            let nodePointA: NodeDto = driverRouteNodesHavingOSRMRoute![k];
            let nodePointB: NodeDto = driverRouteNodesHavingOSRMRoute![k + 1];

            let routeInfo: Record<string, any> = await getRouteDetailsByOSRM({ longitude: nodePointA.long!, latitude: nodePointA.lat! }, { longitude: nodePointB.long!, latitude: nodePointB.lat! });
            tmpOsrmRouteArray[k] = routeInfo.routes[0].geometry.coordinates;
        }));

        for (let i = 0; i < driverRoute.drouteNodes!.length - 1; ++i) {
            osrmRoute = osrmRoute.concat(!tmpOsrmRouteArray[i] ? [] : tmpOsrmRouteArray[i]);
        }

        return osrmRoute;
    }
}