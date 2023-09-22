import moment, { Moment } from "moment";
import { promises as fsPromises } from "fs";
import { createObjectCsvStringifier } from "csv-writer";
import { ObjectCsvStringifier } from "csv-writer/src/lib/csv-stringifiers/object";
import {
    extractOrigDestNodeId, findNodesOfInterestInArea, findParallelLinePoints, formatNodeData, getDistanceDurationBetweenNodes,
    getDistances, getNodeObjectByNodeId, getRouteDetailsByOSRM, importDriverRoutes, sortRouteNodeListByNodeStop
} from "../helper.utility";
import { NodeAttributes } from "../interface.utility";
import { DriverRepository } from "../../repository/driver.repository";
import { NodeRepository } from "../../repository/node.repository";


async function assertDriverRouteMetaBatchGroupData(driverRouteMetaBatchGroups: Record<string, any>): Promise<Record<string, any>> {
    const keysToDelete: Array<string> = [];
    const failedRoutes: Array<Record<string, any>> = [];

    const driverRepository: DriverRepository = new DriverRepository();
    const nodeRepository: NodeRepository = new NodeRepository();

    for (let routeName in driverRouteMetaBatchGroups) {
        const distinctNodes: Set<number> = new Set<number>();
        await Promise.all(driverRouteMetaBatchGroups[routeName].routeNodes.initial.map(async (routeNode: Record<string, any>) => {
            distinctNodes.add(routeNode.originNode);
            distinctNodes.add(routeNode.destinationNode);
        }));

        let distinctOriginDestinationRouteNodesId: Record<string, any> = extractOrigDestNodeId(driverRouteMetaBatchGroups[routeName].routeNodes.initial);

        if (distinctOriginDestinationRouteNodesId.originNode && distinctOriginDestinationRouteNodesId.destinationNode) {

            if ((await nodeRepository.findNodes({ where: { nodeId: [...distinctNodes] } })).length === distinctNodes.size && distinctNodes.size == driverRouteMetaBatchGroups[routeName].routeNodes.initial.length + 1) {

                driverRouteMetaBatchGroups[routeName].originNode = distinctOriginDestinationRouteNodesId.originNode;
                driverRouteMetaBatchGroups[routeName].destinationNode = distinctOriginDestinationRouteNodesId.destinationNode;

                if (await driverRepository.findDriverByPK(parseInt(driverRouteMetaBatchGroups[routeName].driverId, 10))) {
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

    await Promise.all(keysToDelete.map(async (key: string) => {
        delete driverRouteMetaBatchGroups[key];
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
            await fsPromises.writeFile(`./util/logs/${new Date().toLocaleString().replace(/[/.,\s:]/g, '_')}_batch_driver_routes.csv`, csvContent, { encoding: 'utf8' });
        }
    } catch (error: any) {
    }

    return driverRouteMetaBatchGroups
}

async function importGeneratedRouteNodes(): Promise<void> {
    try {
        let waypointDistance: number = parseFloat(process.argv[2]);

        process.send!("status:Preparing meta data from bulk file");
        let initialDriverRouteBatchData: Array<Record<string, any>> | null = JSON.parse(await fsPromises.readFile("./util/tempFiles/driverRouteTemp.json",
            { encoding: "utf8" }));
        let driverRouteMetaBatchGroups: Record<string, any> | null = prepareDriverRouteBatchMetaData(initialDriverRouteBatchData!);
        initialDriverRouteBatchData = null;

        process.send!("status:Asserting driver route data");
        let assertedDriverRouteMetaBatchGroups: Record<string, any> | null = await assertDriverRouteMetaBatchGroupData(driverRouteMetaBatchGroups!);
        driverRouteMetaBatchGroups = null;

        process.send!("status:Generating route nodes based on route origin, destination from node pairs");
        let generatedDroutesWithDRouteNodes: Array<Record<string, any>> = await generateDroutesWithNodeFromDrouteMetaBatchGroupedData(Object.values(assertedDriverRouteMetaBatchGroups!), waypointDistance);

        process.send!("status:Asserting data generated");
        generatedDroutesWithDRouteNodes = generatedDroutesWithDRouteNodes.map((dRouteGroupNode) => {
            if (dRouteGroupNode!.fixedRoute && dRouteGroupNode!.routeNodes.initial.length == dRouteGroupNode!.routeNodes.final.length - 1) {
                return dRouteGroupNode;
            } else if (!dRouteGroupNode!.fixedRoute && dRouteGroupNode!.routeNodes.initial.length + 1 <= dRouteGroupNode!.routeNodes.final.length) {
                return dRouteGroupNode
            }
            return {};
        }).filter((obj) => Object.keys(obj).length > 0);

        process.send!("status:Inserting batch data in database");
        await importDriverRoutes(generatedDroutesWithDRouteNodes);
        process.send!("status:Batch data insertion completed");

        await fsPromises.writeFile("./util/tempFiles/driverRouteTemp.json", "", { encoding: "utf8" });


    } catch (error: any) {
        process.send!("status:Error");
    }
}

async function generateDroutesWithNodeFromDrouteMetaBatchGroupedData(driverRouteBatchGroups: Array<Record<string, any>>, waypointDistance: number): Promise<Array<Record<string, any>>> {

    driverRouteBatchGroups = (await Promise.all(driverRouteBatchGroups.map(async (driverRouteMeta) => {

        if (driverRouteMeta!.fixedRoute) {

            let distinctOriginDestinationRouteNodesId: Record<string, any> = extractOrigDestNodeId(driverRouteMeta!.routeNodes.initial);

            if (distinctOriginDestinationRouteNodesId.originNode && distinctOriginDestinationRouteNodesId.destinationNode) {

                driverRouteMeta!.routeNodes.initial = sortRouteNodeListByNodeStop(driverRouteMeta!.routeNodes.initial,
                    distinctOriginDestinationRouteNodesId.originNode);

                driverRouteMeta!.originNode = distinctOriginDestinationRouteNodesId.originNode;
                driverRouteMeta!.destinationNode = distinctOriginDestinationRouteNodesId.destinationNode;

                let temprouteNode: Record<string, any> = {
                    drouteId: null, outbDriverId: driverRouteMeta!.driverId, nodeId: distinctOriginDestinationRouteNodesId.originNode, arrivalTime: null,
                    departureTime: driverRouteMeta!.departureTime, maxWait: driverRouteMeta!.maxWait, rank: 0, capacity: driverRouteMeta!.capacity,
                    capacityUsed: 0, cumDistance: 0, cumTime: 0, status: "ORIGIN"
                };

                driverRouteMeta!.routeNodes.final.push(temprouteNode);

                let cumulativeTime: number = 0;
                let cumulativeDistance: number = 0;

                let departureTime: Moment = moment(driverRouteMeta!.departureTime, "YYYY-MM-DD HH:mm")


                for (let [index, rNode] of driverRouteMeta!.routeNodes.initial.entries()) {

                    let routeOriginNode: NodeAttributes | null = await getNodeObjectByNodeId(rNode.originNode);
                    let routeDestinationNode: NodeAttributes | null = await getNodeObjectByNodeId(rNode.destinationNode)

                    if (routeOriginNode !== null && routeDestinationNode !== null) {

                        let calculatedDistanceDurationBetweenNodes: Record<string, any> = await getDistanceDurationBetweenNodes(
                            { longitude: routeOriginNode?.long, latitude: routeOriginNode?.lat },
                            { longitude: routeDestinationNode?.long, latitude: routeDestinationNode?.lat }
                        );

                        if (Object.values(calculatedDistanceDurationBetweenNodes).every(value => value !== null)) {

                            let arrivalTime: Moment = departureTime.clone().add(calculatedDistanceDurationBetweenNodes.duration, "seconds");
                            departureTime = arrivalTime.clone().add(routeDestinationNode?.transitTime, "minutes");

                            cumulativeTime += calculatedDistanceDurationBetweenNodes.duration / 60;
                            cumulativeDistance += calculatedDistanceDurationBetweenNodes.distance;

                            if (index == driverRouteMeta!.routeNodes.initial.length - 1) {

                                temprouteNode = {
                                    drouteId: null, outbDriverId: driverRouteMeta!.driverId, nodeId: rNode.destinationNode,
                                    arrivalTime: arrivalTime.format("YYYY-MM-DD HH:mm").concat(":00 +00:00"), departureTime: null, maxWait: driverRouteMeta!.maxWait,
                                    rank: index + 1, capacity: driverRouteMeta!.capacity, capacityUsed: 0,
                                    cumDistance: (cumulativeDistance / 1609.344).toFixed(2), cumTime: cumulativeTime, status: "DESTINATION"
                                };

                            } else {

                                temprouteNode = {
                                    drouteId: null, outbDriverId: driverRouteMeta!.driverId, nodeId: rNode.destinationNode,
                                    arrivalTime: arrivalTime.format("YYYY-MM-DD HH:mm").concat(":00 +00:00"),
                                    departureTime: departureTime.format("YYYY-MM-DD HH:mm").concat(":00 +00:00"), maxWait: driverRouteMeta!.maxWait, rank: index + 1,
                                    capacity: driverRouteMeta!.capacity, capacityUsed: 0,
                                    cumDistance: (cumulativeDistance / 1609.344).toFixed(2),
                                    cumTime: cumulativeTime, status: "SCHEDULED"
                                };
                            }

                            driverRouteMeta!.routeNodes.final.push(temprouteNode);
                        }
                    }
                }
            }
        }
        return driverRouteMeta;
    }))).filter(Boolean);

    driverRouteBatchGroups = (await Promise.all(driverRouteBatchGroups.map(async (driverRouteMeta) => {

        if (!driverRouteMeta!.fixedRoute) {

            let distinctOriginDestinationRouteNodesId: Record<string, any> = extractOrigDestNodeId(driverRouteMeta!.routeNodes.initial);
            if (distinctOriginDestinationRouteNodesId.originNode && distinctOriginDestinationRouteNodesId.destinationNode) {

                driverRouteMeta!.routeNodes.initial = sortRouteNodeListByNodeStop(driverRouteMeta!.routeNodes.initial,
                    distinctOriginDestinationRouteNodesId.originNode);

                driverRouteMeta!.originNode = distinctOriginDestinationRouteNodesId.originNode;
                driverRouteMeta!.destinationNode = distinctOriginDestinationRouteNodesId.destinationNode;

                let rank = 0;

                let temprouteNode: Record<string, any> = {
                    drouteId: null, outbDriverId: driverRouteMeta!.driverId, nodeId: distinctOriginDestinationRouteNodesId.originNode, arrivalTime: null,
                    departureTime: driverRouteMeta!.departureTime, maxWait: driverRouteMeta!.maxWait, rank: rank, capacity: driverRouteMeta!.capacity,
                    capacityUsed: 0, cumDistance: 0, cumTime: 0, status: "ORIGIN"
                };

                driverRouteMeta!.routeNodes.final.push(temprouteNode);

                let routeOriginNode: NodeAttributes | null = await getNodeObjectByNodeId(driverRouteMeta!.routeNodes.initial[0].originNode);
                let routeDestinationNode: NodeAttributes | null = await getNodeObjectByNodeId(driverRouteMeta!.routeNodes.initial[0].destinationNode);

                if (routeOriginNode !== null && routeDestinationNode !== null) {

                    let calculatedDistanceDurationBetweenNodes: Record<string, any> = await getDistanceDurationBetweenNodes(
                        { longitude: routeOriginNode?.long, latitude: routeOriginNode?.lat },
                        { longitude: routeDestinationNode?.long, latitude: routeDestinationNode?.lat }
                    );
                    if (Object.values(calculatedDistanceDurationBetweenNodes).every(value => value !== null)) {

                        let arrivalTime: Moment = (moment(driverRouteMeta!.departureTime,
                            "YYYY-MM-DD HH:mm").add(calculatedDistanceDurationBetweenNodes.duration, "seconds"));

                        rank = rank + 1;
                        temprouteNode = {
                            drouteId: null, outbDriverId: driverRouteMeta!.driverId, nodeId: driverRouteMeta!.routeNodes.initial[0].destinationNode,
                            arrivalTime: arrivalTime.format("YYYY-MM-DD HH:mm").concat(":00 +00:00"), departureTime: null, maxWait: driverRouteMeta!.maxWait, rank: rank,
                            capacity: driverRouteMeta!.capacity, capacityUsed: 0,
                            cumDistance: parseFloat((calculatedDistanceDurationBetweenNodes.distance / 1609.34).toFixed(2)), cumTime: calculatedDistanceDurationBetweenNodes.duration / 60,
                            status: "DESTINATION"
                        };

                        driverRouteMeta!.routeNodes.final.push(temprouteNode);

                        let intermediateNodes: Array<Record<string, any> | undefined> = await findNodesOfInterestInAreaWithinRange(routeOriginNode,
                            routeDestinationNode, waypointDistance);

                        for (let interNode of intermediateNodes) {
                            if (interNode!.nodeId != driverRouteMeta!.originNode && interNode!.nodeId != driverRouteMeta!.destinationNode) {

                                let calculatedDistanceDurationBetweenNodes: Record<string, any> = await getDistanceDurationBetweenNodes(
                                    { longitude: routeOriginNode?.long, latitude: routeOriginNode?.lat },
                                    { longitude: interNode!.long, latitude: interNode!.lat }
                                );
                                let arrivalTime: Moment = (moment(driverRouteMeta!.departureTime,
                                    "YYYY-MM-DD HH:mm").add(calculatedDistanceDurationBetweenNodes.duration, "seconds"));

                                let temprouteNode = {
                                    drouteId: null, outbDriverId: driverRouteMeta!.driverId, nodeId: interNode!.nodeId,
                                    arrivalTime: arrivalTime.format("YYYY-MM-DD HH:mm").concat(":00 +00:00"), departureTime: null, maxWait: driverRouteMeta!.maxWait, rank: null,
                                    capacity: driverRouteMeta!.capacity, capacityUsed: 0,
                                    cumDistance: parseFloat((calculatedDistanceDurationBetweenNodes.distance / 1609.34).toFixed(2)), cumTime: calculatedDistanceDurationBetweenNodes.duration / 60,
                                    status: "POTENTIAL"
                                };

                                driverRouteMeta!.routeNodes.final.push(temprouteNode);
                            }
                        }
                        await driverRouteMeta.routeNodes.final.sort((a: Record<string, any>, b: Record<string, any>) => a.cumDistance - b.cumDistance);

                        await Promise.all(driverRouteMeta.routeNodes.final.map(async (tmpRNode: Record<string, any>) => {
                            if (tmpRNode.status === "POTENTIAL") {
                                tmpRNode.rank = rank;
                                rank = rank + 1;
                            }
                        }));
                        await Promise.all(driverRouteMeta.routeNodes.final.map(async (tmpRNode: Record<string, any>) => {
                            if (tmpRNode.status === "DESTINATION") {
                                tmpRNode.rank = rank;
                            }
                        }));
                    }
                }
            }
        }
        return driverRouteMeta;
    }))).filter(Boolean);
    return driverRouteBatchGroups;
}

async function findNodesOfInterestInAreaWithinRange(routeOriginNode: NodeAttributes, routeDestinationNode: NodeAttributes, waypointDistance: number): Promise<Array<Record<string, any> | undefined>> {
    const parallelLinePoints: Array<Record<string, number>> = findParallelLinePoints(
        { longitude: routeOriginNode.long!, latitude: routeOriginNode.lat! },
        { longitude: routeDestinationNode.long!, latitude: routeDestinationNode.lat! }
    );

    let nodesInAreaOfInterest: Array<Record<string, any> | undefined> = await findNodesOfInterestInArea(Object.values(parallelLinePoints[0]),
        Object.values(parallelLinePoints[1]), Object.values(parallelLinePoints[2]), Object.values(parallelLinePoints[3]), [])

    const routeInfo: Record<string, any> = await getRouteDetailsByOSRM(
        { longitude: routeOriginNode.long!, latitude: routeOriginNode.lat! },
        { longitude: routeDestinationNode.long!, latitude: routeDestinationNode.lat! }
    );

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
    nodesInAreaOfInterest = formatNodeData(nodesInAreaOfInterest, waypointDistance).map((wpNode) => {
        if (wpNode.isWaypoint) {
            return wpNode;
        }
        return;
    }).filter(Boolean).filter((iNode) => {
        return (routeOriginNode.lat != iNode!.lat && routeOriginNode.long != iNode!.long) &&
            (routeDestinationNode.lat != iNode!.lat && routeOriginNode.long != iNode!.long)
    });
    return nodesInAreaOfInterest.filter(Boolean);
}

function prepareDriverRouteBatchMetaData(initialFileData: Array<Record<string, any>>): Record<string, any> {
    const driverRouteBatchGroups: Record<string, any> = {}
    for (let line of initialFileData) {
        line.departureTime = moment(line.departureTime, "M/D/YYYY H:mm").format("YYYY-MM-DD HH:mm").concat(":00 +00:00")

        if (!Object.keys(driverRouteBatchGroups).includes(line.routeName)) {

            driverRouteBatchGroups[line.routeName] = {
                originNode: null, destinationNode: null, departureTime: line.departureTime,
                capacity: line.passengerCapacity, maxWait: line.maxWait, status: "NEW", driverId: line.driverId, drouteDbmTag: line.databaseManagementTag,
                drouteName: line.routeName, departureFlexibility: line.departureFlexibility,
                fixedRoute: line.fixedRoute === "1" ? true : false, routeNodes: { initial: [], final: [] }
            }

            driverRouteBatchGroups[line.routeName].routeNodes.initial.push({
                originNode: parseInt(line.originNodeId, 10),
                destinationNode: parseInt(line.destinationNodeId, 10)
            });
            driverRouteBatchGroups[line.routeName].routeNodes.final = []
        } else {
            driverRouteBatchGroups[line.routeName].routeNodes.initial.push({
                originNode: parseInt(line.originNodeId, 10),
                destinationNode: parseInt(line.destinationNodeId, 10)
            });
        }
    };
    return driverRouteBatchGroups;
}

importGeneratedRouteNodes();