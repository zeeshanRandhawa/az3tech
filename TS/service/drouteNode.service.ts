import { DriverRouteNodeRepository } from "../repository/drouteNode.repository";
import { normalizeTimeZone } from "../util/helper.utility";
import { CustomError, DriverRouteNodeAttributes } from "../util/interface.utility";

export class DriverRouteNodeService {
    private driverRouteNodeRepository: DriverRouteNodeRepository;

    constructor() {
        this.driverRouteNodeRepository = new DriverRouteNodeRepository();
    }

    async listDriverRouteNodesByDriverRouteId(driverRouteId: number, pageNumber: number): Promise<Record<string, any>> {
        const driverRouteNodeList: DriverRouteNodeAttributes[] = await this.driverRouteNodeRepository.findDriverRouteNodes({
            where: {
                drouteId: driverRouteId
            },
            order: [["rank", "ASC"]],
            limit: 10,
            offset: (pageNumber - 1) * 10,
        });

        if (driverRouteNodeList.length < 1) {
            throw new CustomError("No Driver Route Node Found", 404);
        }
        driverRouteNodeList.map(async (driverRouteNode) => {
            driverRouteNode.departureTime = driverRouteNode.departureTime ? await normalizeTimeZone(driverRouteNode.departureTime as string) : driverRouteNode.departureTime;
            driverRouteNode.arrivalTime = driverRouteNode.arrivalTime ? await normalizeTimeZone(driverRouteNode.arrivalTime as string) : driverRouteNode.arrivalTime;
        });
        return { status: 200, data: { driverRouteNodes: driverRouteNodeList } };
    }

    async getDriverRouteNodePageCount(driverRouteId: number): Promise<Record<string, any>> {
        let driverRouteNodesCount: number;

        driverRouteNodesCount = await this.driverRouteNodeRepository.countDriverRouteNodes({
            where: {
                drouteId: driverRouteId
            }
        });

        return { status: 200, data: { driverRouteNodesCount: Math.ceil(driverRouteNodesCount) } };
    }
}