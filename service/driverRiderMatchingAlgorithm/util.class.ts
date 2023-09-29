import { DriverRouteNodeAssocitedAttributes } from "../../util/interface.utility";

enum RouteClassification {
    Primary,
    Secondary,
    Tertiary
}

export class ClassifiedRoute {
    private driverRoute: DriverRouteNodeAssocitedAttributes;
    private classification: RouteClassification;
    private hasDestination: boolean;
    constructor(driverRoute: DriverRouteNodeAssocitedAttributes, classification: RouteClassification) {
        this.hasDestination = false;
        this.driverRoute = driverRoute;
        this.classification = classification;
    }
}


// export class PrimaryRoute implements DriverRouteAttributes {

//     public drouteId!: number;
//     public originNode!: number;
//     public destinationNode!: number;
//     public departureTime?: string | Date | undefined;
//     public capacity?: number | undefined;
//     public maxWait?: number | undefined;
//     public fixedRoute!: boolean;
//     public status?: string | undefined;
//     public driverId!: number;
//     public drouteDbmTag?: string | undefined;
//     public drouteName?: string | undefined;
//     public departureFlexibility?: number | undefined;
//     public intermediateNodesList?: string | undefined;
//     public origin?: NodeAttributes | undefined;
//     public destination?: NodeAttributes | undefined;
//     public driver?: DriverAttributes | undefined;

//     private hasDestination: boolean;
//     private routeNodes: Array<PrimaryRouteNode>

//     constructor() {
//         this.hasDestination = false;
//         this.routeNodes = [];
//     }

// }
// class PrimaryRouteNode implements DriverRouteNodeAttributes {

//     public drouteNodeId!: number;
//     public drouteId!: number;
//     public outbDriverId!: number;
//     public nodeId!: number;
//     public permutationId?: number | undefined;
//     public arrivalTime?: string | Date | undefined;
//     public departureTime?: string | Date | undefined;
//     public maxWait?: number | undefined;
//     public rank?: number | undefined;
//     public capacity?: number | undefined;
//     public capacityUsed?: number | undefined;
//     public cumDistance?: number | undefined;
//     public cumTime?: number | undefined;
//     public status?: string | undefined;
//     public node?: NodeAttributes | undefined;

//     private secondaryRoutes: Array<SecondaryRoute>;

//     constructor() {
//         this.secondaryRoutes = [];
//     }
// }

// export class SecondaryRoute implements DriverRouteAttributes {

//     public drouteId!: number;
//     public originNode!: number;
//     public destinationNode!: number;
//     public departureTime?: string | Date | undefined;
//     public capacity?: number | undefined;
//     public maxWait?: number | undefined;
//     public fixedRoute!: boolean;
//     public status?: string | undefined;
//     public driverId!: number;
//     public drouteDbmTag?: string | undefined;
//     public drouteName?: string | undefined;
//     public departureFlexibility?: number | undefined;
//     public intermediateNodesList?: string | undefined;
//     public origin?: NodeAttributes | undefined;
//     public destination?: NodeAttributes | undefined;
//     public driver?: DriverAttributes | undefined;

//     private hasDestination: boolean;
//     private routeNodes: Array<SecondaryRouteNode>

//     constructor() {
//         this.hasDestination = false;
//         this.routeNodes = [];
//     }
// }
// class SecondaryRouteNode implements DriverRouteNodeAttributes {

//     public drouteNodeId!: number;
//     public drouteId!: number;
//     public outbDriverId!: number;
//     public nodeId!: number;
//     public permutationId?: number | undefined;
//     public arrivalTime?: string | Date | undefined;
//     public departureTime?: string | Date | undefined;
//     public maxWait?: number | undefined;
//     public rank?: number | undefined;
//     public capacity?: number | undefined;
//     public capacityUsed?: number | undefined;
//     public cumDistance?: number | undefined;
//     public cumTime?: number | undefined;
//     public status?: string | undefined;
//     public node?: NodeAttributes | undefined;

//     private tertiartyRoutes: Array<TertiaryRoute>;

//     constructor() {
//         this.tertiartyRoutes = [];
//     }
// }

// export class TertiaryRoute implements DriverRouteAttributes {

//     public drouteId!: number;
//     public originNode!: number;
//     public destinationNode!: number;
//     public departureTime?: string | Date | undefined;
//     public capacity?: number | undefined;
//     public maxWait?: number | undefined;
//     public fixedRoute!: boolean;
//     public status?: string | undefined;
//     public driverId!: number;
//     public drouteDbmTag?: string | undefined;
//     public drouteName?: string | undefined;
//     public departureFlexibility?: number | undefined;
//     public intermediateNodesList?: string | undefined;
//     public origin?: NodeAttributes | undefined;
//     public destination?: NodeAttributes | undefined;
//     public driver?: DriverAttributes | undefined;

//     private hasDestination: boolean;
//     private routeNodes: Array<TertiaryRouteNode>

//     constructor() {
//         this.hasDestination = false;
//         this.routeNodes = [];
//     }
// }
// class TertiaryRouteNode implements DriverRouteNodeAttributes {

//     public drouteNodeId!: number;
//     public drouteId!: number;
//     public outbDriverId!: number;
//     public nodeId!: number;
//     public permutationId?: number | undefined;
//     public arrivalTime?: string | Date | undefined;
//     public departureTime?: string | Date | undefined;
//     public maxWait?: number | undefined;
//     public rank?: number | undefined;
//     public capacity?: number | undefined;
//     public capacityUsed?: number | undefined;
//     public cumDistance?: number | undefined;
//     public cumTime?: number | undefined;
//     public status?: string | undefined;
//     public node?: NodeAttributes | undefined;

//     constructor() {

//     }
// }