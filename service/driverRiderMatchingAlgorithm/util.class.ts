import { DriverRouteAssociatedNodeAttributes } from "../../util/interface.utility";

export enum RouteClassification {
    Primary,
    Secondary,
    Tertiary
}

export class ClassifiedRoute {
    public driverRoute: DriverRouteAssociatedNodeAttributes;
    public classification: RouteClassification;
    public hasDestination: boolean;
    public intersectigRoutes: Array<ClassifiedRoute>;
    constructor(driverRoute: DriverRouteAssociatedNodeAttributes, classification: RouteClassification) {
        this.hasDestination = false;
        this.driverRoute = driverRoute;
        this.classification = classification;
        this.intersectigRoutes = [];
    }
}