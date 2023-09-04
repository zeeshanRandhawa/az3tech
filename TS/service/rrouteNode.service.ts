import { RiderRouteNodeRepository } from "../repository/rrouteNode.repository";
import { CustomError, RiderRouteNodeAttributes } from "../util/interface.utility";

export class RiderRouteNodeService {
    private riderRouteNodeRepository: RiderRouteNodeRepository;

    constructor() {
        this.riderRouteNodeRepository = new RiderRouteNodeRepository();
    }

    async listRiderRouteNodesByRiderRouteId(riderRouteId: number, pageNumber: number): Promise<Record<string, any>> {
        const riderRouteNodeList: RiderRouteNodeAttributes[] = await this.riderRouteNodeRepository.findRiderRouteNodes({
            where: {
                rrouteId: riderRouteId
            },
            order: [["rank", "ASC"]],
            limit: 10,
            offset: (pageNumber - 1) * 10,
        });

        if (riderRouteNodeList.length < 1) {
            throw new CustomError("No Rider Route Node Found", 404);
        }
        return { status: 200, data: { riderRouteNodes: riderRouteNodeList } };
    }

    async getRiderRouteNodePageCount(riderRouteId: number): Promise<Record<string, any>> {
        let riderRouteNodesCount: number;

        riderRouteNodesCount = await this.riderRouteNodeRepository.countRiderRouteNodes({
            where: {
                rrouteId: riderRouteId
            }
        });

        return { status: 200, data: { riderRouteNodesCount: Math.ceil(riderRouteNodesCount) } };
    }

}