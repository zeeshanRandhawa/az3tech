import { NodeRepository } from "../repository/node.repository";
import { CoordinateAttribute, CustomError, NodeAttributes, SessionAttributes } from "../util/interface.utility";
import {
    calculateDistanceBetweenPoints,
    findNodesOfInterestInArea, findParallelLinePoints, formatNodeData, getDistances,
    getRouteDetailsByOSRM, convertColorCodeToInteger, convertIntToColorCode
} from "../util/helper.utility";
import { SessionRepository } from "../repository/session.repository";
import { UserRepository } from "../repository/user.repository";


export class MapService {

    private nodeRepository: NodeRepository;
    private sessionRepository: SessionRepository;
    private userRepository: UserRepository;

    constructor() {
        this.nodeRepository = new NodeRepository();
        this.sessionRepository = new SessionRepository();
        this.userRepository = new UserRepository();
    }

    async displayMapNodesInAreaOfInterest(upperLeftCorner: Array<number>, lowerLeftCorner: Array<number>, upperRightCorner: Array<number>, lowerRightCorner: Array<number>, descriptionFilterListStr: string): Promise<Record<string, any>> {

        let nodesToDisplay: Array<Record<string, any>> = await findNodesOfInterestInArea(upperLeftCorner, lowerLeftCorner, upperRightCorner, lowerRightCorner, descriptionFilterListStr.split(",").map(description => description.trim()));
        const totalNodesCount: number = await this.nodeRepository.countNodes({});

        let colorCodingSet: Record<string, any> = {};
        nodesToDisplay = nodesToDisplay.map((node) => {
            if (node.description) {
                if (!colorCodingSet.hasOwnProperty(node.description.trim())) {
                    colorCodingSet[node.description.trim()] = convertIntToColorCode(convertColorCodeToInteger(node.description.trim()));
                }
                node.nodeColor = colorCodingSet[node.description.trim()]
                node.description = node.description.trim();
            }
            return node;
        });

        return { status: 200, data: { nodesInArea: nodesToDisplay, totalNodeCount: totalNodesCount, nodeCountInArea: nodesToDisplay.length } };
    }

    async displayMapRouteWithIntermediateNodesBetweenPoints(originPoint: Record<string, number>, destinationPoint: Record<string, number>, sessionToken: string): Promise<Record<string, any>> {

        const parallelLinePoints: Array<Record<string, number>> = findParallelLinePoints(originPoint, destinationPoint);
        let nodesInAreaOfInterest: Array<Record<string, any>> = await findNodesOfInterestInArea(Object.values(parallelLinePoints[0]), Object.values(parallelLinePoints[1]), Object.values(parallelLinePoints[2]), Object.values(parallelLinePoints[3]), [])
        const routeInfo: Record<string, any> = await getRouteDetailsByOSRM(originPoint, destinationPoint);

        const waypointNodes: Array<Record<string, any>> = [];

        await Promise.all(nodesInAreaOfInterest.map(async (nodeInArea, i: number) => {
            await Promise.all(routeInfo.routes[0].legs[0].steps.map(async (step: any, j: number) => {
                let subRoutePointsGIS: Array<[number, number]> = step.geometry.coordinates;

                let waypointStart: [number, number] = subRoutePointsGIS[0]
                let waypointEnd: [number, number] = subRoutePointsGIS[step.geometry.coordinates.length - 1];
                waypointNodes.push({ 'waypointStart': waypointStart, 'waypointEnd': waypointEnd });

                let calculatedintermediateNode: Record<string, any> = getDistances(waypointStart, waypointEnd, nodeInArea, subRoutePointsGIS);

                if (calculatedintermediateNode.intercepted === true) {
                    if (Object.keys(nodesInAreaOfInterest[i]).includes('isWaypoint')) {
                        if (nodesInAreaOfInterest[i].distance > calculatedintermediateNode.distance) {
                            nodesInAreaOfInterest[i].distance = calculatedintermediateNode.distance;
                        }
                    } else {
                        nodesInAreaOfInterest[i] = { 'isWaypoint': true, 'distance': calculatedintermediateNode.distance, ...nodesInAreaOfInterest[i] };
                    }
                }
            }));
        }));

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

        nodesInAreaOfInterest = formatNodeData(nodesInAreaOfInterest, session.user?.waypointDistance!);

        return { status: 200, data: { "intermediateNodes": nodesInAreaOfInterest, "osrmRoute": routeInfo, "GISWaypoints": waypointNodes } };
    }

    async getWaypointDistance(sessionToken: string): Promise<Record<string, any>> {
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
        return { status: 200, data: { waypointDistance: session.user?.waypointDistance } };
    }

    async setWaypointDistance(waypointDistance: number, sessionToken: string): Promise<Record<string, any>> {
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

        await this.userRepository.updateUser({
            waypointDistance: waypointDistance
        }, {
            email: session.user?.email.trim()
        });

        return { status: 200, data: { message: "Updated successfullt" } }
    }

    async displayMapNearestNode(coordinateData: CoordinateAttribute): Promise<Record<string, any>> {
        const nodeList: Array<NodeAttributes> = await this.nodeRepository.findNodes({});
        if (nodeList.length < 1) {
            throw new CustomError("No Node Found", 404);
        }

        const smallestDistanceCoordinate: Record<string, any> = {
            distance: Infinity,
            coordinates: {}
        };
        await Promise.all(nodeList.map(async (node: NodeAttributes) => {
            if (node.lat !== undefined || node.long !== undefined) {
                let distance: number = calculateDistanceBetweenPoints({ latitude: node.lat!, longitude: node.long! }, { latitude: coordinateData.latitude!, longitude: coordinateData.longitude! })
                if (distance <= smallestDistanceCoordinate.distance) {
                    smallestDistanceCoordinate.distance = distance;
                    smallestDistanceCoordinate.coordinates = { latitude: node.lat, longitude: node.long }
                }
            }
        }));
        return { status: 200, data: smallestDistanceCoordinate };
    }
}