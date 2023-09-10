import { Socket } from "socket.io";
import { ChildProcess } from "child_process";

export class CustomError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
    }
}

export interface CoordinateAttribute {
    latitude: number | null,
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
    location?: string,
    description?: string,
    address: string,
    city: string,
    stateProvince: string,
    zipPostalCode?: string,
    transitTime?: string
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

export interface RoleAttributes {
    roleId: number;
    roleType: string;
}

export interface SessionAttributes {
    sessionId: number;
    sessionToken: string;
    sessionExpireTimestamp: Date;
    userId: number;
    user?: UserAttributes;
}

export interface UserAttributes {
    userId: number;
    email: string;
    password: string;
    roleId: number;
    sessions?: Array<SessionAttributes>;
    role?: RoleAttributes;
    rider?: RiderAttributes;
    driver?: DriverAttributes;
    waypointDistance?: number;
}

export interface NodeAttributes {
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
    transitTime?: number;
}

export interface DriverAttributes {
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
    user?: UserAttributes;
    droutes?: Array<DriverRouteAttributes>;
}

export interface DriverRouteAttributes {
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
    origin?: NodeAttributes;
    destination?: NodeAttributes;
    driver?: DriverAttributes;
    drouteNodes?: Array<DriverRouteNodeAttributes>;
}

export interface DriverRouteNodeAttributes {
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
    status?: number;
    node?: NodeAttributes;
    droute?: DriverRouteAttributes;
}

export interface RiderAttributes {
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
    user?: UserAttributes;
    rroutes?: Array<RiderRouteAttributes>;
}

export interface RiderRouteAttributes {
    rrouteNodeId: number;
    rrouteId: number;
    riderId: number;
    originNode: number;
    destinationNode: number;
    departureTime?: Date
    status?: string;
    rrouteDbmTag?: string;
    timeFlexibility?: number;
    intermediateNodesList?: string;
    rider?: RiderAttributes;
    origin?: NodeAttributes;
    destination?: NodeAttributes;
    rrouteNodes?: Array<RiderRouteNodeAttributes>;
}

export interface RiderRouteNodeAttributes {
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
    node?: NodeAttributes;
    rroute?: RiderRouteAttributes;
}