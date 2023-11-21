import { Socket } from "socket.io";
import { ChildProcess } from "child_process";

export class CustomError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
    }
}

export interface CoordinateDto {
    latitude: number | null;
    longitude: number | null
}

export interface FilterForm {
    status?: string | null;
    fixedRoute?: boolean | null;
    maxWait?: number | null;
    capacity?: number | null;
    departureTime: {
        start: string | null;
        end: string | null;
    };
}

export interface NodeForm {
    location?: string;
    description?: string;
    address: string;
    city: string;
    stateProvince: string;
    zipPostalCode?: string;
    riderTransitTime?: string
    driverTransitTime?: string
}

export interface ProcessListEntry {
    message: string;
    childProcess: ChildProcess | null;
    opType: string;
    status: string;
    sockets: Array<Socket>;
}

export interface SignupForm {
    firstName: string;
    lastName?: string;
    email: string;
    password: string;
    mobileNumber: string;
    countryCode: string;
    profilePicture?: string | null;
}

export interface RiderDriverForm {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    address?: string;
    city?: string;
    stateProvince?: string;
    zipPostalCode?: number;
    profilePicture?: string | null;
    mobileNumber: string;
    countryCode: string;
    description?: string;
    capacity?: number
}

export interface LoginForm {
    email: string;
    password: string;
}

export interface RoleDto {
    roleId: number;
    roleType: string;
}

export interface SessionDto {
    sessionId: number;
    sessionToken: string;
    sessionExpireTimestamp: Date;
    userId: number;
    user?: UserDto;
}

export interface UserDto {
    email: string;
    password: string;
    roleId: number;
    userId: number;
    waypointDistance?: number;
    sessions?: Array<SessionDto>;
    role?: RoleDto;
    rider?: RiderDto;
    driver?: DriverDto;
}

export interface NodeDto {
    nodeId: number
    location?: string
    description?: string;
    address?: string;
    city?: string;
    stateProvince?: string;
    zipPostalCode?: string;
    long?: number;
    lat?: number;
    locid?: string;
    riderTransitTime?: number;
    driverTransitTime?: number;
}

export interface DriverDto {
    driverId: number
    firstName: string;
    lastName?: string;
    description?: string;
    address?: string;
    city?: string;
    stateProvince?: string;
    zipPostalCode?: string;
    capacity?: number;
    profilePicture?: string;
    userId?: number;
    phoneNumber?: string;
    user?: UserDto;
    droutes?: Array<DriverRouteAssociatedNodeDto>;
}

export interface DriverRouteDto {
    drouteId: number;
    originNode: number;
    destinationNode: number;
    departureTime?: Date | string;
    capacity?: number;
    maxWait?: number;
    fixedRoute: boolean;
    status?: string;
    driverId: number;
    drouteDbmTag?: string;
    drouteName?: string;
    departureFlexibility?: number;
    intermediateNodesList?: string;
    origin?: NodeDto;
    destination?: NodeDto;
    driver?: DriverDto;
}

export interface DriverRouteAssociatedNodeDto extends DriverRouteDto {
    drouteNodes?: Array<DriverRouteNodeAssocitedDto>;
}

export interface DriverRouteNodeDto {
    drouteNodeId: number;
    drouteId: number;
    outbDriverId: number;
    nodeId: number;
    permutationId?: number;
    arrivalTime?: Date | string;
    departureTime?: Date | string;
    maxWait?: number;
    rank?: number;
    capacity?: number;
    capacityUsed?: number;
    cumDistance?: number;
    cumTime?: number;
    status?: string;
    node?: NodeDto;
    driver?: DriverDto;
}

export interface DriverRouteNodeAssocitedDto extends DriverRouteNodeDto {
    droute?: DriverRouteAssociatedNodeDto;
}

export interface RiderDto {
    riderId: number
    firstName: string;
    lastName?: string;
    address?: string;
    city?: string;
    stateProvince?: string;
    zipPostalCode?: string;
    profilePicture?: string
    phoneNumber?: string;
    userId?: number;
    user?: UserDto;
    rroutes?: Array<RiderRouteDto>;
}

export interface RiderRouteDto {
    rrouteNodeId: number;
    rrouteId: number;
    riderId: number;
    originNode: number;
    destinationNode: number;
    departureTime?: Date | string
    status?: string;
    rrouteDbmTag?: string;
    timeFlexibility?: number;
    intermediateNodesList?: string;
    rider?: RiderDto;
    origin?: NodeDto;
    destination?: NodeDto;
    rrouteNodes?: Array<RiderRouteNodeDto>;
}

export interface RiderRouteNodeDto {
    rrouteId: number;
    drouteId?: number;
    riderId: number;
    nodeId: number;
    permutationId?: number;
    arrivalTime?: Date;
    departureTime?: Date;
    rank?: number;
    cumDistance?: number;
    cumTime?: number;
    status?: string;
    node?: NodeDto;
    rroute?: RiderRouteDto;
}

export enum RouteClassification {
    Primary,
    Secondary,
    Tertiary,
}

export interface ClassifiedRouteDto {
    routeEfficiency?: number;

    classification: RouteClassification;
    driverRoute: DriverRouteAssociatedNodeDto;
    intersectingRoute?: ClassifiedRouteDto;

    riderCumulativeDistance?: number;
    riderCumulativeDuration?: number;

    riderOriginRank: number;
    riderDestinationRank: number;

    routeOriginDepartureTime?: string;
    routeDestinationArrivalTime?: string;

    driverRouteDirectDistance?: number;
    driverRouteDirectDuration?: number;

    driverRouteDistance?: number;
    driverRouteDuration?: number;
}

export interface RouteOption {
    primary?: RouteDetail;
    secondary?: RouteDetail;
    tertiary?: RouteDetail;
}

export interface RouteDetail {
    drouteId: number
    drouteName: string
    originNode: number;
    destinationNode: number;
    originDepartureTime: string;
    destinationArrivalTime: string;
    distanceRatio: number;

    duration: number;

    description: string;
    location: string;
}

export interface calculatedRoute {
    routeEfficiency: number;

    routeCumulativeDuration: number;
    routeCummulativeDistance: number;

    riderRouteDirectDistance: number;
    riderRouteDirectDuration: number;

    primary?: caculatedRouteDetail;
    secondary?: caculatedRouteDetail;
    tertiary?: caculatedRouteDetail;
}

export interface caculatedRouteDetail {
    drouteId: number;

    drouteName: string;

    originNode: number;
    originNodeDescription: string;
    originNodeLocation: string;

    destinationNode: number;
    destinationNodeDescription: string;
    destinationNodeLocation: string;

    originDepartureTime: string;
    destinationArrivalTime: string;

    routeDuration: number;
    routeDistance: number;

    driverRouteDirectDistance?: number;
    driverRouteDirectDuration?: number;

    driverRouteDistance?: number;
    driverRouteDuration?: number;

    drouteNodes: Array<DriverRouteNodeAssocitedDto>;

}

export interface QualityMetrics {
    directRouteDuration: number | null;
    directRouteDistance: number | null;
    primaryRouteDuration: number | null;
    primaryRouteDistance: number | null;
    secondaryRouteDuration: number | null;
    secondaryRouteDistance: number | null;
    tertiaryRouteDuration: number | null;
    tertiaryRouteDistance: number | null;
    routeQualityRatio: number | null;
    status: string | null
}
export interface NodeToNodeDto {
    origNodeId: number;
    destNodeId: number;
    duration: number;
    distance: number;
}