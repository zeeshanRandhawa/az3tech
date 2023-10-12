import { DriverRouteAssociatedNodeDto, RouteClassification } from "../../util/interface.utility";

export class ClassifiedRoute {
    public classification: RouteClassification;
    public driverRoute: DriverRouteAssociatedNodeDto;
    public intersectigRoutes: Array<ClassifiedRoute>;
    public cumDistance: number;
    public cumDuration: number;
    public originRank: number;
    public destinationRank: number;

    constructor(driverRoute: DriverRouteAssociatedNodeDto, classification: RouteClassification,
        originRank: number = Infinity, destinationRank: number = Infinity) {
        this.cumDuration = Infinity;
        this.cumDistance = Infinity;
        this.originRank = originRank;
        this.destinationRank = destinationRank;
        this.classification = classification;
        this.driverRoute = driverRoute;
        this.intersectigRoutes = [];
    }
}