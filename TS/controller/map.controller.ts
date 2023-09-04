import { MapService } from "../service/map.service"
import { CoordinateAttribute, CustomError } from "../util/interface.utility"


export class MapController {

    private mapService: MapService;

    constructor() {
        this.mapService = new MapService();
    }


    async displayMapNodesInAreaOfInterest(upperLeftCorner: string, lowerLeftCorner: string, upperRightCorner: string, lowerRightCorner: string): Promise<any> {
        if (!upperLeftCorner.trim() || !lowerLeftCorner.trim() || !upperRightCorner.trim() || !lowerRightCorner.trim()) {
            return { status: 200, data: { message: "Invalid data" } }
        }

        try {
            return await this.mapService.displayMapNodesInAreaOfInterest(upperLeftCorner.split(",").map(coordinate => parseFloat(coordinate)), lowerLeftCorner.split(",").map(coordinate => parseFloat(coordinate)), upperRightCorner.split(",").map(coordinate => parseFloat(coordinate)), lowerRightCorner.split(",").map(coordinate => parseFloat(coordinate)));
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: 200, data: { message: error.message } };
            }
        }
    }

    async displayMapRouteWithIntermediateNodesBetweenPoints(originPoint: string | undefined, destinationPoint: string | undefined, sessionToken: string | undefined): Promise<any> {
        if (!originPoint?.trim() || !destinationPoint?.trim() || !sessionToken) {
            return { status: 422, data: { message: "Invalid data" } };
        }
        try {
            return await this.mapService.displayMapRouteWithIntermediateNodesBetweenPoints({ longitude: parseFloat(originPoint.split(",")[0]), latitude: parseFloat(originPoint.split(",")[1]) }, { longitude: parseFloat(destinationPoint.split(",")[0]), latitude: parseFloat(destinationPoint.split(",")[1]) }, sessionToken);
        } catch (error: any) {

            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
        }
    }

    async getWaypointDistance(sessionToken?: string | undefined): Promise<any> {
        if (!sessionToken || sessionToken.length == 0) {
            return { status: 422, data: { message: "Invalid Data" } };
        }
        try {
            return await this.mapService.getWaypointDistance(sessionToken);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
        }
    }

    async setWaypointDistance(waypointDistance: number, sessionToken?: string | undefined): Promise<any> {
        if (!sessionToken || sessionToken.length == 0 || !waypointDistance) {
            return { status: 422, data: { message: "Invalid Data" } };
        }
        try {
            return await this.mapService.setWaypointDistance(waypointDistance, sessionToken);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
        }
    }

    async displayMapNearestNode(longitude: number, latitude: number): Promise<any> {
        if (!longitude || !latitude || (latitude <= -90 && latitude >= 90) || (longitude <= -180 && longitude >= 180)) {
            return { status: 422, data: { message: "Invalid coordinates" } };
        }
        try {
            return await this.mapService.displayMapNearestNode({ longitude: longitude, latitude: latitude } as CoordinateAttribute);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
        }
    }
}