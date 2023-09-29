import { CoordinateAttribute, NodeAttributes } from "../../util/interface.utility";

export abstract class RouteClassifierStrategy {
    constructor() {

    }

    abstract findNearestDestinationNode(coordinateData: CoordinateAttribute): Promise<NodeAttributes>;

    abstract findNearestOriginNode(coordinateData: CoordinateAttribute): Promise<NodeAttributes>;

}