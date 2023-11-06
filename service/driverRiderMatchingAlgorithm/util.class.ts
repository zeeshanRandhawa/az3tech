import { DriverRouteAssociatedNodeDto, RouteClassification } from "../../util/interface.utility";

export class ClassifiedRoute {
    public classification: RouteClassification;
    public driverRoute: DriverRouteAssociatedNodeDto;
    public intersectigRoutes: Array<ClassifiedRoute>;
    public riderOriginRank: number;
    public riedrDestinationRank: number;
    // public riderCumulativeDistance: number;
    // public riderCumulativeDuration: number;
    public driverRouteDirectDistance: number;
    public driverRouteDirectDuration: number;

    constructor(driverRoute: DriverRouteAssociatedNodeDto, classification: RouteClassification,
        riderOriginRank: number = Infinity, riedrDestinationRank: number = Infinity, driverRouteDirectDistance: number = Infinity,
         driverRouteDirectDuration: number = Infinity) {
        // this.riderCumulativeDistance = Infinity;
        // this.riderCumulativeDuration = Infinity;
        this.driverRouteDirectDistance = driverRouteDirectDistance;
        this.driverRouteDirectDuration = driverRouteDirectDuration;
        
        this.riderOriginRank = riderOriginRank;
        this.riedrDestinationRank = riedrDestinationRank;
        this.classification = classification;
        this.driverRoute = driverRoute;
        this.intersectigRoutes = [];
    }
}