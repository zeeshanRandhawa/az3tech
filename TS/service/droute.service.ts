import { Op, col, fn, literal } from "sequelize";
import { createReadStream, promises as fsPromises } from "fs";
import { DriverRouteRepository } from "../repository/droute.repository";
import { CustomError, DriverRouteAttributes, DriverRouteNodeAttributes, FilterForm, NodeAttributes, SessionAttributes } from "../util/interface.utility";
import { NodeRepository } from "../repository/node.repository";
import {
    isValidFileHeader, prepareBatchBulkImportData, extractOrigDestNodeId, sortRouteNodeListByNodeStop, getNodeObjectByNodeId,
    getDistanceDurationBetweenNodes, importDriverRoutes, normalizeTimeZone, findNodesOfInterestInArea, findParallelLinePoints,
    formatNodeData, getDistances, getRouteDetailsByOSRM, getActiveDateList
} from "../util/helper.utility";
import { DriverRepository } from "../repository/driver.repository";
import ProcessSocket from "../util/socketProcess.utility";
import { SessionRepository } from "../repository/session.repository";
import moment, { Moment } from "moment";
import path from "path";
import archiver, { Archiver } from "archiver";
import { createObjectCsvStringifier } from "csv-writer";
import { ObjectCsvStringifier } from "csv-writer/src/lib/csv-stringifiers/object";
import { DriverRouteNodeRepository } from "../repository/drouteNode.repository";

export class DriverRouteService {

    private driverRouteRepository: DriverRouteRepository;
    private driverRouteNodeRepository: DriverRouteNodeRepository;
    private driverRepository: DriverRepository;
    private nodeRepository: NodeRepository;
    private sessionRepository: SessionRepository;

    constructor() {
        this.driverRouteRepository = new DriverRouteRepository();
        this.driverRouteNodeRepository = new DriverRouteNodeRepository();
        this.driverRepository = new DriverRepository();
        this.nodeRepository = new NodeRepository();
        this.sessionRepository = new SessionRepository();
    }

    async listDriverRoutes(tagListStr: string | undefined, pageNumber: number): Promise<Record<string, any>> {
        let whereCondition: Record<string, any> = {};

        const tagList: Array<string> = tagListStr?.split(",").map(tag => tag.trim()) || []
        if (tagList.length) {
            whereCondition = {
                [Op.or]: tagList.map((tag) => {
                    return { drouteDbmTag: tag }
                })
            }
        }

        const driverRouteList: DriverRouteAttributes[] = await this.driverRouteRepository.findDriverRoutes({
            where: whereCondition,
            order: [["driverId", "ASC"], ["drouteId", "ASC"]],
            limit: 10,
            offset: (pageNumber - 1) * 10,
        });

        if (driverRouteList.length < 1) {
            throw new CustomError("No Driver Route Found", 404);
        }
        await Promise.all(driverRouteList.map(async (driverRoute) => {
            driverRoute.departureTime = driverRoute.departureTime ? (await normalizeTimeZone(driverRoute.departureTime as string)) : driverRoute.departureTime;
        }));
        return { status: 200, data: { driverRoutes: driverRouteList } };
    }

    async listDriverRoutesByDriverId(driverId: number, pageNumber: number): Promise<Record<string, any>> {
        const driverRouteList: DriverRouteAttributes[] = await this.driverRouteRepository.findDriverRoutes({
            where: {
                driverId: driverId
            },
            order: [["driverId", "ASC"], ["drouteId", "ASC"]],
            limit: 10,
            offset: (pageNumber - 1) * 10,
        });

        if (driverRouteList.length < 1) {
            throw new CustomError("No Driver Route Found", 404);
        }
        await Promise.all(driverRouteList.map(async (driverRoute) => {
            driverRoute.departureTime = driverRoute.departureTime ? (await normalizeTimeZone(driverRoute.departureTime as string)) : driverRoute.departureTime;
        }));
        return { status: 200, data: { driverRoutes: driverRouteList } };
    }

    async deleteDriverRouteById(drouteId: number): Promise<Record<string, any>> {
        const deletedDriverRouteCount: number = await this.driverRouteRepository.deleteDriverRoute({
            where: {
                drouteId: drouteId
            }
        });
        if (deletedDriverRouteCount) {
            return { status: 200, data: { message: "Driver Route Deleted Successfully" } };
        } else {
            throw new CustomError("No Driver Route exists with this id", 404);
        }
    }

    async batchImportDriverRoutes(fileToImport: Express.Multer.File, sessionToken: string): Promise<Record<string, any>> {
        if (await ProcessSocket.getInstance().isProcessRunningForToken(sessionToken, "DRoute")) {
            return { status: 422, data: { message: "Another import process alreay running" } }
        }

        if (!isValidFileHeader(fileToImport.buffer, ["Route Name", "Origin Node Id", "Destination Node Id", "Departure Time", "Departure Flexibility", "Driver Id", "Passenger Capacity", "Max Wait", "Fixed Route", "Database Management Tag"])) {
            throw new CustomError("Invalid column name or length", 422);
        }
        const driverRouteBatchMetaData: Array<Record<string, any>> = prepareBatchBulkImportData(fileToImport.buffer, ["routeName", "originNodeId", "destinationNodeId", "departureTime", "departureFlexibility", "driverId", "passengerCapacity", "maxWait", "fixedRoute", "databaseManagementTag"]);

        await fsPromises.writeFile("./util/tempFiles/driverRouteTemp.json", JSON.stringify(driverRouteBatchMetaData), { encoding: "utf8" });
        const session: SessionAttributes | null = await this.sessionRepository.findSession({
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
        ProcessSocket.getInstance().forkProcess("./util/process/driverRouteBatchImport.process.ts", "DriverRouteBatch", session!.user!.email.trim(), session.user?.waypointDistance!);

        return { status: 200, data: { message: "Nodes import in progress" } };

    }

    async getDriverRouteDistinctTagList(): Promise<Record<string, any>> {
        const driverRouteTagListRaw: DriverRouteAttributes[] = await this.driverRouteRepository.findDriverRoutes({
            attributes: [
                [fn("DISTINCT", col("droute_dbm_tag")), "drouteDbmTag"],
            ],
            order: [
                ["drouteDbmTag", "ASC"]
            ]
        });
        const driverRouteTagList: Array<string | undefined> = driverRouteTagListRaw.map(driverRouteTag => driverRouteTag.drouteDbmTag?.trim());

        return { status: 200, data: { driverRouteTagList: driverRouteTagList } };
    }

    async deleteDriverRouteByTags(tagListStr: string): Promise<Record<string, any>> {
        let whereCondition: Record<string, any> = {};
        const tagList: Array<string> = tagListStr?.split(",").map(tag => tag.trim()) || []
        if (tagList.length) {
            whereCondition = {
                [Op.or]: tagList.map((tag) => {
                    return { drouteDbmTag: tag }
                })
            }
        }
        const deletedDriverRouteCount: number = await this.driverRouteRepository.deleteDriverRoute({
            where: whereCondition
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
                        driverId: parseInt(driverId, 10)
                    }
                });
            }
        } else {
            let whereCondition: Record<string, any> = {};
            const tagList: Array<string> = tagListStr?.split(",").map(tag => tag.trim()) || []
            if (tagList.length) {
                whereCondition = {
                    [Op.or]: tagList.map((tag) => {
                        return { drouteDbmTag: tag }
                    })
                }
            }
            driverRoutesCount = await this.driverRouteRepository.countDriverRoutes({
                where: whereCondition
            });
        }
        return { status: 200, data: { driverRoutesCount: Math.ceil(driverRoutesCount) } };
    }

    async deleteDriverRoutesByFilters(filterFormData: FilterForm, driverId: number): Promise<Record<string, any>> {
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

        if (driverId !== undefined && driverId) {
            filterConditions.push({ driverId: driverId });
        }
        whereCondition = { [Op.and]: filterConditions };
        const deletedRouteCount: number = await this.driverRouteRepository.deleteDriverRoute({
            where: whereCondition
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
                return { status: 404, data: { message: "No file Found" } }
            }

            const zip: Archiver = archiver("zip");
            csvFiles.forEach(async (file: string) => {
                const filePath: string = path.join("./util/logs/", file);
                zip.append(createReadStream(filePath), { name: file });
            });

            return { status: 200, data: { zip: zip } };
        });
    };

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
            const driverRouteTransitMetaDataGrouped: Record<string, any> = {}
            // for (let i = 0; i < activeDates.length; ++i) {
            await Promise.all(activeDates.map(async (activeDate: string, i: number) => {
                await Promise.all(driverRouteTransitMetaData.map(async (routeMeta: Record<string, any>, index: number) => {

                    let arrivalDateTime: Moment | null = !routeMeta.arrivalTime.trim() ? null : moment(activeDates[i].concat(" ").concat(routeMeta.arrivalTime.trim()), 'YYYY-MM-DD HH:mm');
                    let departureDateTime: Moment | null = !routeMeta.departureTime.trim() ? null : moment(activeDates[i].concat(" ").concat(routeMeta.departureTime.trim()), 'YYYY-MM-DD HH:mm');

                    if (!Object.keys(driverRouteTransitMetaDataGrouped).includes(routeMeta.routeName.concat(i))) {
                        driverRouteTransitMetaDataGrouped[routeMeta.routeName.concat(i)] = {
                            originNode: null, destinationNode: null, departureTime: departureDateTime,
                            capacity: routeMeta.passengerCapacity, status: "NEW", driverId: routeMeta.driverId, drouteDbmTag: routeMeta.databaseManagementTag,
                            drouteName: routeMeta.routeName, intermediateNodesList: null, fixedRoute: true, routeNodes: { initial: [], final: [] }
                        }

                        driverRouteTransitMetaDataGrouped[routeMeta.routeName.concat(i)].routeNodes.initial.push({
                            originNode: parseInt(routeMeta.originNodeId, 10), destinationNode: parseInt(routeMeta.destinationNodeId, 10),
                            arrivalTime: arrivalDateTime, departureTime: departureDateTime
                        });
                    } else {
                        let previousDepartureDateTime: any = driverRouteTransitMetaDataGrouped[routeMeta.routeName.concat(i)].routeNodes.initial.slice(-1)[0].departureTime;
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

                        driverRouteTransitMetaDataGrouped[routeMeta.routeName.concat(i)].routeNodes.initial.push({
                            originNode: parseInt(routeMeta.originNodeId, 10), destinationNode: routeMeta.destinationNodeId ? parseInt(routeMeta.destinationNodeId, 10) : null,
                            arrivalTime: arrivalDateTime, departureTime: departureDateTime
                        });
                    }
                }));
                // }
            }));

            return driverRouteTransitMetaDataGrouped;
        } catch (error: any) {
        }
    }

    async prepareFinalTrnsitRouteGroupToImport(driverRouteTransitMetaDataGroupedArray: any): Promise<any> {
        try {
            driverRouteTransitMetaDataGroupedArray = (await Promise.all(driverRouteTransitMetaDataGroupedArray.map(
                async (driverRouteMeta: Record<string, any>) => {

                    let distinctOriginDestinationRouteNodesId: Record<string, any> = extractOrigDestNodeId(driverRouteMeta.routeNodes.initial.slice(0, -1));

                    if (distinctOriginDestinationRouteNodesId.originNode && distinctOriginDestinationRouteNodesId.destinationNode &&
                        distinctOriginDestinationRouteNodesId.destinationNode === driverRouteMeta.routeNodes.initial[driverRouteMeta.routeNodes.initial.length - 1].originNode) {

                        driverRouteMeta.routeNodes.initial = sortRouteNodeListByNodeStop(driverRouteMeta.routeNodes.initial, distinctOriginDestinationRouteNodesId.originNode);

                        driverRouteMeta.originNode = distinctOriginDestinationRouteNodesId.originNode;
                        driverRouteMeta.destinationNode = distinctOriginDestinationRouteNodesId.destinationNode;

                        let departureTime: Moment = driverRouteMeta.departureTime;

                        driverRouteMeta.departureTime = driverRouteMeta.departureTime.clone().format("YYYY-MM-DD HH:mm").concat(":00 +00:00");

                        let arrivalTime: Moment | null = null;

                        let temprouteNode: Record<string, any> = {
                            drouteId: null, outbDriverId: driverRouteMeta.driverId, nodeId: distinctOriginDestinationRouteNodesId.originNode,
                            arrivalTime: arrivalTime, departureTime: departureTime.clone().format("YYYY-MM-DD HH:mm").concat(":00 +00:00"),
                            rank: 0, capacity: driverRouteMeta.capacity, capacityUsed: Math.floor(Math.random() * driverRouteMeta.capacity),
                            cumDistance: 0, cumTime: 0, status: 'ORIGIN'
                        };

                        driverRouteMeta.routeNodes.final.push(temprouteNode);

                        let cumTime: number = 0;
                        let cumDistance: number = 0;

                        for (let [index, rNode] of driverRouteMeta.routeNodes.initial.slice(1).entries()) {

                            let routeOriginNode: NodeAttributes | null = await getNodeObjectByNodeId(driverRouteMeta.routeNodes.initial[index].originNode);
                            let routeDestinationNode: NodeAttributes | null = await getNodeObjectByNodeId(rNode.originNode)

                            if (routeOriginNode !== null && routeDestinationNode !== null) {

                                let calculatedDistanceDurationBetweenNodes: Record<string, any> = await getDistanceDurationBetweenNodes({ longitude: routeOriginNode?.long, latitude: routeOriginNode?.lat }, { longitude: routeDestinationNode?.long, latitude: routeDestinationNode?.lat });

                                if (Object.values(calculatedDistanceDurationBetweenNodes).every(value => value !== null)) {

                                    if (!rNode.departureTime) {
                                        cumTime += (moment.duration(rNode.arrivalTime.diff(departureTime))).asMinutes();
                                    } else {
                                        cumTime += (moment.duration(rNode.departureTime.diff(departureTime))).asMinutes();
                                    }
                                    departureTime = rNode.departureTime;

                                    cumDistance += calculatedDistanceDurationBetweenNodes.distance

                                    if (index == driverRouteMeta.routeNodes.initial.length - 2) {
                                        temprouteNode = {
                                            drouteId: null, outbDriverId: driverRouteMeta.driverId, nodeId: rNode.originNode,
                                            arrivalTime: rNode.arrivalTime.clone().format("YYYY-MM-DD HH:mm").concat(":00 +00:00"), departureTime: null, rank: index + 1,
                                            capacity: driverRouteMeta.capacity, capacityUsed: Math.floor(Math.random() * driverRouteMeta.capacity),
                                            cumDistance: cumDistance, cumTime: cumTime, status: 'DESTINATON'
                                        };
                                    } else {
                                        temprouteNode = {
                                            drouteId: null, outbDriverId: driverRouteMeta.driverId, nodeId: rNode.originNode,
                                            arrivalTime: rNode.arrivalTime.clone().format("YYYY-MM-DD HH:mm").concat(":00 +00:00"),
                                            departureTime: driverRouteMeta.routeNodes.initial[index + 1].departureTime.clone().format("YYYY-MM-DD HH:mm").concat(":00 +00:00"),
                                            rank: index + 1, capacity: driverRouteMeta.capacity, capacityUsed: Math.floor(Math.random() * driverRouteMeta.capacity),
                                            cumDistance: cumDistance, cumTime: cumTime, status: 'SCHEDULED'
                                        };
                                    }
                                    driverRouteMeta.routeNodes.final.push(temprouteNode);
                                }
                            }
                        }
                    }
                    return driverRouteMeta;
                }))).filter(Boolean);

            driverRouteTransitMetaDataGroupedArray = driverRouteTransitMetaDataGroupedArray.map((driverRouteFinal: Record<string, any>) => {
                if (driverRouteFinal.fixedRoute && driverRouteFinal.routeNodes.initial.length === driverRouteFinal.routeNodes.final.length) {
                    return driverRouteFinal;
                } else {
                    return
                }
            }).filter(Boolean);

            return driverRouteTransitMetaDataGroupedArray;
        } catch (error: any) {
        }
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

            if (distinctOriginDestinationRouteNodesId.originNode && distinctOriginDestinationRouteNodesId.destinationNode &&
                distinctOriginDestinationRouteNodesId.destinationNode === driverRouteMetaTransitGroups[routeName].routeNodes.initial[driverRouteMetaTransitGroups[routeName].routeNodes.initial.length - 1].originNode) {

                if ((await this.nodeRepository.findNodes({ where: { nodeId: [...distinctNodes] } })).length === distinctNodes.size && distinctNodes.size == driverRouteMetaTransitGroups[routeName].routeNodes.initial.length) {

                    driverRouteMetaTransitGroups[routeName].originNode = distinctOriginDestinationRouteNodesId.originNode;
                    driverRouteMetaTransitGroups[routeName].destinationNode = distinctOriginDestinationRouteNodesId.destinationNode;

                    if (await this.driverRepository.findDriverByPK(parseInt(driverRouteMetaTransitGroups[routeName].driverId, 10))) {
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
                        { id: "error", title: "Reason" }
                    ]
                });
                const csvContent: string = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(failedRoutes);
                await fsPromises.writeFile(`./util/logs/${new Date().toLocaleString().replace(/[/.,\s:]/g, '_')}_transit_driver_routes.csv`, csvContent, { encoding: 'utf8' });
            }
        } catch (error: any) {
        }

        return driverRouteMetaTransitGroups
    }

    async displayDriverRoutesAtNodeBetweenTimeFrame(nodeId: number, startDateTimeWindow: string, endDateTimeWindow: string, sessionToken: string): Promise<Record<string, any>> {

        const driverRouteNodeIds: Array<Record<string, any>> = await this.driverRouteNodeRepository.findDriverRouteNodes({
            attributes: [["droute_id", "drouteNodeId"]],
            where: {
                [Op.and]: [
                    {
                        [Op.and]: [
                            {
                                [Op.or]: [
                                    {
                                        [Op.and]: [
                                            {
                                                [Op.or]: [
                                                    {
                                                        departureTime: {
                                                            [Op.and]: [
                                                                { [Op.gt]: startDateTimeWindow },
                                                                { [Op.lt]: endDateTimeWindow }
                                                            ]
                                                        }
                                                    },
                                                    {
                                                        [Op.and]: [
                                                            literal(`"DriverRouteNode"."departure_time" + ((CASE WHEN "droute"."departure_flexibility" > 0 THEN "droute"."departure_flexibility" ELSE 0 END) * interval '1 minute') > '${startDateTimeWindow}'`),
                                                            literal(`"DriverRouteNode"."departure_time" + ((CASE WHEN "droute"."departure_flexibility" > 0 THEN "droute"."departure_flexibility" ELSE 0 END) * interval '1 minute') < '${endDateTimeWindow}'`)
                                                        ]
                                                    }
                                                ]
                                            },
                                            {
                                                status: "ORIGIN"
                                            }
                                        ]
                                    },
                                    {
                                        [Op.and]: [
                                            {
                                                arrivalTime: {
                                                    [Op.and]: [
                                                        { [Op.gt]: startDateTimeWindow },
                                                        { [Op.lt]: endDateTimeWindow }
                                                    ]
                                                }
                                            },
                                            {
                                                [Op.or]: [
                                                    {
                                                        status: "SCHEDULED"
                                                    },
                                                    {
                                                        status: "POTENTIAL"
                                                    }
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            },
                            { nodeId: nodeId }
                        ]
                    }
                ]
            },
            include: [
                {
                    association: "droute",
                    attributes: [],
                    required: true
                }
            ]
        });

        if (!driverRouteNodeIds.length) {
            throw new CustomError("No Driver Route found in on this node in given time window", 404);
        }

        const driverRoutes: Array<DriverRouteAttributes> = await this.driverRouteRepository.findDriverRoutes({
            where: {
                drouteId:
                {
                    [Op.in]: driverRouteNodeIds.map(dRouteNodeNT => parseInt(dRouteNodeNT.drouteNodeId, 10))
                },
            },
            include: [
                { association: "origin" },
                { association: "destination" },
                {
                    association: "drouteNodes",
                    required: true,
                    include: [
                        { association: "node" }
                    ]
                }
            ],
            order: [["drouteNodes", "rank", "ASC"]]
        });

        const session: SessionAttributes | null = await this.sessionRepository.findSession({
            where: {
                sessionToken: !sessionToken ? "" : sessionToken
            },
            include: [{
                association: "user"
            }]
        });
        let waypointDistance: number = session?.user?.waypointDistance ?? 1609;

        const driverRouteDataPlainJSON: Array<Record<string, any>> = await Promise.all(driverRoutes.map(async (driverRoute: DriverRouteAttributes) => {
            // let GISWaypoints: Array<Record<string, any>> = [];
            let osrmRoute: Array<any> = [];
            let intermediateNodes: Array<Record<string, any>> = [];

            for (let k = 0; k < driverRoute.drouteNodes!.length - 1; ++k) {
                let nodePointA: DriverRouteNodeAttributes = driverRoute.drouteNodes![k];
                let nodePointB: DriverRouteNodeAttributes = driverRoute.drouteNodes![k + 1];

                const parallelLinePoints: Array<Record<string, number>> = findParallelLinePoints({ longitude: nodePointA.node?.long!, latitude: nodePointA.node?.lat! }, { longitude: nodePointB.node?.long!, latitude: nodePointB.node?.lat! });
                let nodesInAreaOfInterest: Array<Record<string, any> | undefined> = await findNodesOfInterestInArea(Object.values(parallelLinePoints[0]), Object.values(parallelLinePoints[1]), Object.values(parallelLinePoints[2]), Object.values(parallelLinePoints[3]), [])
                const routeInfo: Record<string, any> = await getRouteDetailsByOSRM({ longitude: nodePointA.node?.long!, latitude: nodePointA.node?.lat! }, { longitude: nodePointB.node?.long!, latitude: nodePointB.node?.lat! });

                // let waypointNodes: Array<Record<string, any>> = [];

                for (let i: number = 0; i < nodesInAreaOfInterest.length; ++i) {
                    for (let j: number = 0; j < routeInfo.routes[0].legs[0].steps.length - 1; ++j) {

                        let subRoutePointsGIS: Array<[number, number]> = routeInfo.routes[0].legs[0].steps[j].geometry.coordinates;

                        let waypointStart: [number, number] = subRoutePointsGIS[0]
                        let waypointEnd: [number, number] = subRoutePointsGIS[routeInfo.routes[0].legs[0].steps[j].geometry.coordinates.length - 1];
                        // waypointNodes.push({ 'waypointStart': waypointStart, 'waypointEnd': waypointEnd });

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
                nodesInAreaOfInterest = formatNodeData(nodesInAreaOfInterest, waypointDistance).map((wpNode) => {
                    if (wpNode.isWaypoint) {
                        return wpNode;
                    }
                    return;
                }).filter(Boolean).filter((iNode) => {
                    return (nodePointA.node?.lat != iNode!.lat && nodePointA.node?.long != iNode!.long) && (nodePointA.node?.lat != iNode!.lat && nodePointB.node?.long != iNode!.long);
                });

                intermediateNodes = intermediateNodes.concat(nodesInAreaOfInterest);
                osrmRoute = osrmRoute.concat(routeInfo.routes[0].geometry.coordinates);
                // GISWaypoints = GISWaypoints.concat(waypointNodes)
            }
            // let distinctGISWaypoints: Array<Record<string, any>> = [];
            // let distinctCombinations: Set<String> | null = new Set<string>();

            // for (const obj of GISWaypoints) {
            //     const combinationKey = `${obj.waypointStart.toString()} - ${obj.waypointEnd.toString()}`;
            //     if (!distinctCombinations.has(combinationKey)) {
            //         distinctCombinations.add(combinationKey);
            //         distinctGISWaypoints.push(obj);
            //     }
            // }
            return {
                ...driverRoute, "intermediateNodes": intermediateNodes, "osrmRoute": osrmRoute
                // ,  "GISWayPoints": distinctGISWaypoints
            };
        }));

        return { status: 200, data: { driverRouteData: driverRouteDataPlainJSON } };
    }
}