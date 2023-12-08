import bcrypt from "bcrypt";
import crypto from "crypto";
import moment, { Moment } from 'moment-timezone';
import querystring from 'querystring';
import { sequelize } from "./db.config";
import axios, { AxiosResponse } from "axios";
import { Op, Transaction, literal } from "sequelize";
import { CoordinateDto, DriverRouteAssociatedNodeDto, DriverRouteNodeAssocitedDto, NodeDto, NodeToNodeDto, RouteClassification } from "./interface.utility";
import { GeolibInputCoordinates } from "geolib/es/types";
import { NodeRepository } from "../repository/node.repository";
import { DriverRouteRepository } from "../repository/droute.repository";
import { DriverRouteNodeRepository } from "../repository/drouteNode.repository";
import { getDistance, getRhumbLineBearing, computeDestinationPoint, getDistanceFromLine } from "geolib"
import { NodeToNodeRepository } from "../repository/n2n.repository";

export async function generatePasswordHash(password: string): Promise<string> {
    try {
        const generatedHash: any = await bcrypt.hash(password, 10);
        return generatedHash.toString();
    } catch (error: any) {
        throw error;
    }
}

export async function comparePasswordHash(loginPassword: string, userPassword: string): Promise<boolean> {
    return await bcrypt.compare(loginPassword, userPassword);
}

export function generateRandomToken(tokenLength: number): string {
    return (crypto.randomBytes(32)).toString("hex");
}

export function isValidFileHeader(fileBuffer: Buffer, columnsToValidate: Array<string>): boolean {
    const header: Array<string> = fileBuffer.toString().trim().split("\n").slice(0, 1)[0].split(",");
    if (header.length !== columnsToValidate.length || (header.filter((col_name, index) => columnsToValidate[index] !== col_name.trim())).length !== 0) {
        return false;
    }
    return true;
}

export function prepareBatchBulkImportData(fileBuffer: Buffer, dbColumnList: Array<any>): Array<Record<string, any>> {
    let batchData: Array<Record<string, any>> = [];
    batchData = fileBuffer.toString().split("\n").slice(1).map((line) => {
        if (line.trim() === "" || line.split(',').every((column) => column.trim() === "")) {
            return;
        }
        const values: Array<string> = line.split(",").map((column => column));
        const rowData: Record<string, any> = {};

        dbColumnList.map(async (dbColumn, index) => { rowData[dbColumn] = values[index].trim() });
        return rowData;
    }).filter(Boolean) as Record<string, any>[];
    return batchData;
}

export function generateNUniformRandomDateTimeValues(meanTime: string, sigmaTimeMinute: number, sampleCountToGenerate: number): Array<string> {
    const sigmaTimeMilliSecond = sigmaTimeMinute * 60000
    const generatedRandomSet: Set<string> = new Set();

    while (generatedRandomSet.size < sampleCountToGenerate) {
        let u: number = 0;
        let v: number = 0;
        let s: number = 0;

        do {
            u = Math.random() * 2 - 1;
            v = Math.random() * 2 - 1;
            s = u * u + v * v;
        } while (s >= 1 || s === 0);

        const multiplier: number = Math.sqrt(-2 * Math.log(s) / s);
        const randomOffset: number = u * multiplier * sigmaTimeMilliSecond;

        const randomDatetime: Date = new Date((new Date(meanTime)).getTime() + randomOffset);
        generatedRandomSet.add(randomDatetime.toISOString().replace('T', ' ').split('.')[0]);

    }
    return Array.from(generatedRandomSet)
}

export async function getGeographicCoordinatesByAddress(address: string): Promise<Record<string, any>> {
    try {
        const url: string = `https://nominatim.openstreetmap.org/search?q=${querystring.escape(address)}&format=json&addressdetails=1`
        const response: AxiosResponse<any, any> = await axios.get(url);
        if (response.status === 200) {
            let responseData: any = await response.data;
            return { latitude: await responseData[0]?.lat ?? null, longitude: await responseData[0]?.lon ?? null };
        } else {
            throw new Error();
        }
    } catch (error: any) {
        await new Promise(resolve => setTimeout(resolve, 100));
        return await getGeographicCoordinatesByAddress(address);
    }
}

export async function findNodesOfInterestInArea(upperLeftCorner: Array<number>, lowerLeftCorner: Array<number>, upperRightCorner: Array<number>, lowerRightCorner: Array<number>, descriptionFilterList: Array<string>): Promise<Array<NodeDto>> {
    const nodesToDisplay: Array<NodeDto> = await new NodeRepository().findNodes({
        where: {
            [Op.and]: [
                literal(`((${lowerLeftCorner[0]} - ${upperLeftCorner[0]}) * (long - ${upperLeftCorner[0]})) + ((${lowerLeftCorner[1]} - ${upperLeftCorner[1]}) * (lat - ${upperLeftCorner[1]})) >= 0`),
                literal(`((${lowerLeftCorner[0]} - ${upperLeftCorner[0]}) * (long - ${upperLeftCorner[0]})) + ((${lowerLeftCorner[1]} - ${upperLeftCorner[1]}) * (lat - ${upperLeftCorner[1]})) <= ((${lowerLeftCorner[0]} - ${upperLeftCorner[0]}) * (${lowerLeftCorner[0]} - ${upperLeftCorner[0]})) + ((${lowerLeftCorner[1]} - ${upperLeftCorner[1]}) * (${lowerLeftCorner[1]} - ${upperLeftCorner[1]}))`),
                literal(`((${upperRightCorner[0]} - ${lowerLeftCorner[0]}) * (long - ${lowerLeftCorner[0]})) + ((${upperRightCorner[1]} - ${lowerLeftCorner[1]}) * (lat - ${lowerLeftCorner[1]})) >= 0`),
                literal(`((${upperRightCorner[0]} - ${lowerLeftCorner[0]}) * (long - ${lowerLeftCorner[0]})) + ((${upperRightCorner[1]} - ${lowerLeftCorner[1]}) * (lat - ${lowerLeftCorner[1]})) <= ((${upperRightCorner[0]} - ${lowerLeftCorner[0]}) * (${upperRightCorner[0]} - ${lowerLeftCorner[0]})) + ((${upperRightCorner[1]} - ${lowerLeftCorner[1]}) * (${upperRightCorner[1]} - ${lowerLeftCorner[1]}))`),
                {
                    description: {
                        [Op.notIn]: descriptionFilterList.length ? descriptionFilterList.map((description: string) => description) : descriptionFilterList
                    }
                }
            ]
        },
    });

    return nodesToDisplay
}

export function findParallelLinePoints(pointA: Record<string, number>, pointB: Record<string, number>): Array<Record<string, number>> {

    const distanceAB: number = calculateDistanceBetweenPoints(pointA as GeolibInputCoordinates, pointB as GeolibInputCoordinates);
    const offset: number = (distanceAB / 4) / (6371 * 100);

    const bearingAB: number = getRhumbLineBearing(pointA as GeolibInputCoordinates, pointB as GeolibInputCoordinates) * (Math.PI / 180);

    const pointC: { latitude: number, longitude: number } = computeDestinationPoint(pointA as GeolibInputCoordinates, offset, bearingAB + Math.PI / 2);
    const pointD: { latitude: number, longitude: number } = computeDestinationPoint(pointB as GeolibInputCoordinates, offset, bearingAB + Math.PI / 2);

    const pointE: { latitude: number, longitude: number } = computeDestinationPoint(pointA as GeolibInputCoordinates, offset, bearingAB - Math.PI / 2);
    const pointF: { latitude: number, longitude: number } = computeDestinationPoint(pointB as GeolibInputCoordinates, offset, bearingAB - Math.PI / 2);

    return [
        { longitude: pointC.longitude, latitude: pointC.latitude },
        { longitude: pointD.longitude, latitude: pointD.latitude },
        { longitude: pointE.longitude, latitude: pointE.latitude },
        { longitude: pointF.longitude, latitude: pointF.latitude }
    ];
}

export async function getRouteDetailsByOSRM(pointA: Record<string, any>, pointB: Record<string, any>, maxRetries: number = 4): Promise<Record<string, any> | any> {
    try {
        const url: string = `http://143.110.152.222:5000/route/v1/car/${pointA.longitude},${pointA.latitude};${pointB.longitude},${pointB.latitude}?steps=true&geometries=geojson&overview=full&annotations=true`;
        const response: AxiosResponse<any, any> = await axios.get(url);
        let osrmData: any = response.data;
        return osrmData;
    } catch (error: any) {
        if (maxRetries > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
            return await getRouteDetailsByOSRM(pointA, pointB, maxRetries - 1);
        } else {
            return error;
        }
    }
}

export async function getDistanceDurationBetweenNodes(pointA: Record<string, any>, pointB: Record<string, any>): Promise<Record<string, any>> {
    try {
        const url: string = `http://143.110.152.222:5000/route/v1/driving/${pointA.longitude},${pointA.latitude};${pointB.longitude},${pointB.latitude}?geometries=geojson&overview=false`
        const response: AxiosResponse<any, any> = await axios.get(url);
        if (response.status === 200) {
            let osrmData: any = await response.data;
            return osrmData.routes.length ? { distance: await osrmData.routes[0].distance, duration: await osrmData.routes[0].duration } : { distance: null, duration: null };
        } else {
            throw new Error();
        }
    } catch (error: any) {
        await new Promise(resolve => setTimeout(resolve, 250));
        return await getDistanceDurationBetweenNodes(pointA, pointB);
    }
}

export function hasSignificantCurve(coordinateList: Array<[number, number]>, threshold: number = 2): boolean {
    const distances: Array<number> = [];

    for (let i: number = 1; i < coordinateList.length; ++i) {
        const bearing: number = getRhumbLineBearing({ latitude: coordinateList[i - 1][1], longitude: coordinateList[i - 1][0] }, { latitude: coordinateList[i][1], longitude: coordinateList[i][0] })
        distances.push(bearing);
    }

    const mean: number = distances.reduce((sum, distance) => sum + distance, 0) / distances.length;
    const variance: number = distances.reduce((sum, distance) => sum + Math.pow(distance - mean, 2), 0) / distances.length;
    const standardDeviation: number = Math.sqrt(variance);

    return standardDeviation > threshold;
}

export function getDistances(pointA: [number, number], pointB: [number, number], nodePoint: Record<string, any>, pointsListGIS: Array<[number, number]>): Record<string, any> {
    if (hasSignificantCurve(pointsListGIS)) {
        let smallest: number | null = null;
        pointsListGIS.forEach(async (point: [number, number]) => {

            let thisDistance: number = calculateDistanceBetweenPoints({ latitude: point[1], longitude: point[0] }, { latitude: nodePoint.lat!, longitude: nodePoint.long! })

            if (smallest === null) {
                smallest = thisDistance;
            }
            else {
                smallest = thisDistance <= smallest ? thisDistance : smallest;
            }
        });
        return {
            distance: smallest,
            intercepted: true
        };
    }

    let distance = getDistanceFromLine(
        { latitude: nodePoint.lat!, longitude: nodePoint.long! },
        { latitude: pointA[1], longitude: pointA[0] },
        { latitude: pointB[1], longitude: pointB[0] }
    );
    return {
        distance: distance,
        intercepted: true
    };
}

export function formatNodeData(nodesData: any[], waypointDistance: number) {
    return nodesData.map((node: Record<string, any>) => {
        if (!node.hasOwnProperty("isWaypoint")) {
            node = { 'isWaypoint': false, 'distance': 0, ...node };
        } else if (node.distance > waypointDistance) {
            node.distance = 0;
            node.isWaypoint = false;
        }
        return node;
    })
};

export function calculateDistanceBetweenPoints(pointA: GeolibInputCoordinates, pointB: GeolibInputCoordinates): number {
    return getDistance(pointA, pointB);
}

export async function getNodeObjectByNodeId(nodeId: number): Promise<NodeDto | null> {
    const retrivedNode: NodeDto | null = await new NodeRepository().findNodeByPK(nodeId);
    return retrivedNode;
}

export function extractOrigDestNodeId(routeNodes: Array<Record<string, any>>): Record<string, any> {
    const originNodeList: Array<number> = routeNodes.map(rNode => rNode.originNode);
    const destinationNodeList: Array<number> = routeNodes.map(rNode => rNode.destinationNode);


    let actualOriginNodes: Array<number> = [];
    let actualDestinationNodes: Array<number> = [];

    routeNodes.forEach((rNode) => {
        if (destinationNodeList.filter(item => item !== rNode.originNode).length === destinationNodeList.length) {
            actualOriginNodes.push(rNode.originNode)
        }
        if (originNodeList.filter(item => item !== rNode.destinationNode).length === originNodeList.length) {
            actualDestinationNodes.push(rNode.destinationNode)
        }
    });

    return (actualOriginNodes.length !== 1 || actualDestinationNodes.length !== 1) ? { originNode: null, destinationNode: null } : { originNode: actualOriginNodes[0], destinationNode: actualDestinationNodes[0] };
}

export function sortRouteNodeListByNodeStop(routeNodes: Array<Record<string, any>>, routeOriginatingNodeId: number): Array<Record<string, any>> {

    const reorderedRouteNodes: Array<Record<string, any>> = [];
    let nextNode: number = routeOriginatingNodeId;

    while (routeNodes.length > 0) {
        const nextIndex: number = routeNodes.findIndex((node) => node.originNode === nextNode);
        if (nextIndex === -1) {
            break;
        }
        const nextDict: Record<string, any> = routeNodes.splice(nextIndex, 1)[0];
        reorderedRouteNodes.push(nextDict);
        nextNode = nextDict.destinationNode;
    }
    return reorderedRouteNodes;
}

export function isRoutesDateSorted(routeNodes: Array<Record<string, any>>): boolean {
    for (let i = 0; i < routeNodes.length - 1; ++i) {
        if (routeNodes[i].departureTime < routeNodes[i].arrivalTime) {
            return false;
        }
        if (routeNodes[i].departureTime > routeNodes[i + 1].arrivalTime) {
            return false;
        }
    }
    return true;
}

export async function importDriverRoutes(generatedDroutesWithDRouteNodes: Array<Record<string, any>>): Promise<boolean> {

    const transaction: Transaction = await sequelize.transaction();
    try {
        const driverRouteRepository: DriverRouteRepository = new DriverRouteRepository();
        const driverRouteNodeRepository: DriverRouteNodeRepository = new DriverRouteNodeRepository();

        const driverRoutesFinalObject: Array<Record<string, any>> = generatedDroutesWithDRouteNodes.map((driverRoute) => {
            let filteredData: Record<string, any> = {};
            for (const key in driverRoute) {
                if (key !== "routeNodes") {
                    filteredData[key] = driverRoute[key];
                }
            }
            return filteredData;
        });
        const driverRouteIds: Array<number> = await driverRouteRepository.batchImportDriverRoutes(driverRoutesFinalObject, transaction);

        if (driverRouteIds.length) {
            const driverRouteNodesFinalObject: Array<Record<string, any>> = [];
            await Promise.all(generatedDroutesWithDRouteNodes.map(async (driverRoute, index) => {
                await Promise.all(driverRoute!.routeNodes.final.map(async (driverRouteNode: Record<string, any>) => {
                    driverRouteNode.drouteId = driverRouteIds[index];
                    driverRouteNodesFinalObject.push(driverRouteNode);
                }));
            }));

            const driverRouteNodeIds: Array<number> = await driverRouteNodeRepository.batchImportDriverRouteNodes(driverRouteNodesFinalObject, transaction);
            if (driverRouteNodeIds.length === driverRouteNodesFinalObject.length) {
                await transaction.commit();
            } else {
                transaction.rollback();
                return false;
            }
        } else {
            await transaction.rollback();
            return false;
        }
        return true;
    }
    catch (error: any) {
        await transaction.rollback();
        return false;
    }
}

export function convertIntToColorCode(numValue: number): string {
    const hue: number = (numValue * 200.5) % 360;
    const saturation: number = 80;
    const lightness: number = 50;
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export function convertColorCodeToInteger(colorCodeStr: string): number {
    let result: string = "";

    for (let i = 0; i < colorCodeStr.length; ++i) {
        const charCode: number = colorCodeStr.charCodeAt(i);
        if (!isNaN(charCode)) {
            result += charCode.toString();
        }
    }

    return parseInt(result, 10);
}

export function normalizeTimeZone(datetimestamp: string): string {
    const serverTimezone: any = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const convertedTimestamp: Moment = moment(datetimestamp).tz(serverTimezone)

    if (convertedTimestamp.clone().format("YYYY-MM-DD HH:mm:ss").indexOf("1970-01-01") !== -1) {
        return convertedTimestamp.clone().format("HH:mm");
    }
    return convertedTimestamp.clone().format("YYYY-MM-DD HH:mm:ss");
}

export function getActiveDateList(scheduledWeekdays: string, scheduledStartDate: string, scheduledEndDate: string): Array<string> {

    const startDate = moment(scheduledStartDate.trim(), 'ddd, DD MMM YYYY HH:mm:ss Z');
    const endDate = moment(scheduledEndDate.trim(), 'ddd, DD MMM YYYY HH:mm:ss Z');

    const activeDates: Array<string> = [];
    let currentDate = startDate.clone();
    while (currentDate.isSameOrBefore(endDate)) {
        if (scheduledWeekdays.charAt((currentDate.day() + 6) % 7) === '1') {
            activeDates.push(currentDate.clone().format("YYYY-MM-DD"));
        }
        currentDate.add(1, 'days');
    }

    return activeDates;
}

export async function getDriverRoutesBetweenTimeFrame(startDateTimeWindow: string, endDateTimeWindow: string, nodeIdList: Array<number>): Promise<Array<DriverRouteAssociatedNodeDto>> {
    const searchQueryWithNodeIds: Array<any> = [
        {
            [Op.or]: [
                {
                    [Op.and]: [
                        {
                            [Op.or]: [
                                {
                                    departureTime: {
                                        [Op.and]: [
                                            { [Op.gte]: startDateTimeWindow },
                                            { [Op.lte]: endDateTimeWindow }
                                        ]
                                    }
                                },
                                {
                                    [Op.and]: [
                                        literal(`"DriverRouteNode"."departure_time" + ((CASE WHEN "droute"."departure_flexibility" > 0 THEN "droute"."departure_flexibility" ELSE 0 END) * interval '1 minute') >= '${startDateTimeWindow}'`),
                                        literal(`"DriverRouteNode"."departure_time" + ((CASE WHEN "droute"."departure_flexibility" > 0 THEN "droute"."departure_flexibility" ELSE 0 END) * interval '1 minute') <= '${endDateTimeWindow}'`)
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
                                    { [Op.gte]: startDateTimeWindow },
                                    { [Op.lte]: endDateTimeWindow }
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
        }
    ]

    if (nodeIdList.length) {
        searchQueryWithNodeIds.push({ nodeId: nodeIdList });
    }

    const driverRouteNodeIds: Array<Record<string, any>> = await new DriverRouteNodeRepository().findDriverRouteNodes({
        attributes: [["droute_id", "drouteIdByDrouteNode"]],
        where: {
            [Op.and]: [
                {
                    [Op.and]: searchQueryWithNodeIds
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
        return [];
    }

    const driverRoutes: Array<DriverRouteAssociatedNodeDto> = await new DriverRouteRepository().findDriverRoutes({
        where: {
            drouteId:
            {
                [Op.in]: Array.from(new Set(driverRouteNodeIds.map(dRouteNodeNT => parseInt(dRouteNodeNT.drouteIdByDrouteNode, 10))))
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

    return driverRoutes;
}

export async function findNearestNode(coordinateData: CoordinateDto): Promise<Record<string, any>> {
    const smallestDistanceCoordinate: Record<string, any> = {
        distance: Infinity,
        smallestDistanceNode: undefined
    };

    const nodeList: Array<NodeDto> = await new NodeRepository().findNodes({});
    if (nodeList.length < 1) {
        return smallestDistanceCoordinate;
    }

    await Promise.all(nodeList.map(async (node: NodeDto) => {
        if (node.lat !== undefined || node.long !== undefined) {
            let distance: number = calculateDistanceBetweenPoints({ latitude: node.lat!, longitude: node.long! }, { latitude: coordinateData.latitude!, longitude: coordinateData.longitude! })
            if (distance <= smallestDistanceCoordinate.distance) {
                smallestDistanceCoordinate.distance = distance;
                smallestDistanceCoordinate.smallestDistanceNode = node
            }
        }
    }));

    return smallestDistanceCoordinate;
}

export async function getNodeToNodeDistances(nodeToNodeIdList: Array<number>): Promise<Record<string, any>> {

    let distDurN2N: Record<string, any> = {};
    let n2nRepository: NodeToNodeRepository = new NodeToNodeRepository();

    let n2nList: NodeToNodeDto[] = await n2nRepository.findNodes({
        where: {
            [Op.and]: [
                {
                    origNodeId: {
                        [Op.in]: nodeToNodeIdList
                    }
                },
                {
                    destNodeId: {
                        [Op.in]: nodeToNodeIdList
                    }
                }
            ]

        }
    })

    await Promise.all(n2nList.map(async (n2n: NodeToNodeDto) => {
        distDurN2N[`${n2n.origNodeId}-${n2n.destNodeId}`] = { distance: n2n.distance, duration: n2n.duration }
    }));

    return distDurN2N;
}

export async function retimeRoute(passingRoute: DriverRouteAssociatedNodeDto, rank: number): Promise<DriverRouteAssociatedNodeDto> {

    if (!passingRoute.fixedRoute) {
        if (passingRoute.drouteNodes![rank].status === "POTENTIAL") {
            let nodeToNodeDistDurList: Record<string, any> = await getNodeToNodeDistances(passingRoute.drouteNodes!.map((drouteNode: DriverRouteNodeAssocitedDto) => {
                if (drouteNode.rank! >= rank) {
                    return drouteNode.nodeId;
                }
                return undefined;
            }).filter((nodeId: number | undefined) => nodeId !== undefined) as Array<number>);

            // initial rank of scheduled node
            let initialScheduledNodeRank: number = rank;

            // change node status
            passingRoute.drouteNodes![initialScheduledNodeRank].status = "SCHEDULED";

            // get node departuretime chenage it
            let passingRouteOriginNodeDepartureTime: Moment = moment.utc(passingRoute.drouteNodes![initialScheduledNodeRank].arrivalTime).clone().add(passingRoute.drouteNodes![initialScheduledNodeRank].node?.driverTransitTime ?? 0, "minutes");

            let passingRouteOriginNodeCumulativeDistance: number = passingRoute.drouteNodes![initialScheduledNodeRank].cumDistance ?? 0;

            passingRoute.drouteNodes![initialScheduledNodeRank].departureTime = passingRouteOriginNodeDepartureTime.clone().format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
            passingRoute.drouteNodes![initialScheduledNodeRank].cumTime! = passingRoute.drouteNodes![initialScheduledNodeRank].cumTime! + passingRoute.drouteNodes![initialScheduledNodeRank].node?.driverTransitTime!

            let passingRouteOriginNodeCumulativeDuration: number = parseFloat((passingRoute.drouteNodes![initialScheduledNodeRank].cumTime ?? 0).toFixed(2));


            for (let [index, drouteNode] of passingRoute.drouteNodes!.slice(rank + 1).entries()) {

                let distdur: Record<string, any> = nodeToNodeDistDurList[`${passingRoute.drouteNodes![initialScheduledNodeRank].nodeId}-${drouteNode.nodeId}`];

                drouteNode.arrivalTime = passingRouteOriginNodeDepartureTime.clone().add(distdur.duration, "minutes").format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
                drouteNode.cumDistance = parseFloat((passingRouteOriginNodeCumulativeDistance + distdur.distance).toFixed(2));
                drouteNode.cumTime = parseFloat((passingRouteOriginNodeCumulativeDuration + distdur.duration).toFixed(2));

                if (drouteNode.status === "SCHEDULED") {

                    passingRouteOriginNodeDepartureTime = moment.utc(drouteNode.arrivalTime).clone().add(drouteNode.node?.driverTransitTime ?? 0, "minutes");

                    passingRouteOriginNodeCumulativeDistance = drouteNode.cumTime + (drouteNode.node?.driverTransitTime ?? 0);

                    drouteNode.departureTime = passingRouteOriginNodeDepartureTime.clone().format("YYYY-MM-DD[T]HH:mm:ss.000[Z]");
                    drouteNode.cumTime = Math.round(drouteNode.cumTime + passingRouteOriginNodeCumulativeDistance);

                    passingRouteOriginNodeCumulativeDuration = parseFloat(drouteNode.cumTime.toFixed(2));
                    initialScheduledNodeRank = initialScheduledNodeRank + index + 1;
                }
                // passingRoute.drouteNodes![rank + index + 1] = drouteNode;
            }
        }
    }
    return passingRoute;
}