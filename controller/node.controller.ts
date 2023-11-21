import { NodeService } from "../service/node.service"
import { CoordinateDto, CustomError, NodeForm } from "../util/interface.utility"


export class NodeController {

    private nodeService: NodeService;

    constructor() {
        this.nodeService = new NodeService();
    }

    async listNodes(pageNumber: number): Promise<any> {
        try {
            return await this.nodeService.listNodes(pageNumber);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async listNodesByAddress(addressToSearch: string | undefined, pageNumber: number): Promise<any> {
        if (!addressToSearch) {
            return { status: 422, data: { message: "Invalid data" } };
        }

        try {
            return await this.nodeService.listNodesByAddress(addressToSearch, pageNumber);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async createNode(nodeData: NodeForm): Promise<any> {
        const requiredFields: (keyof NodeForm)[] = ["location", "description", "address", "city", "stateProvince", "zipPostalCode", "riderTransitTime", "driverTransitTime"];
        const missingFields = requiredFields.filter(field => !(field in nodeData));

        if (missingFields.length > 0) {
            return { status: 422, data: { message: "Invalid Data" } };
        }
        if (!nodeData.address || !nodeData.city || !nodeData.stateProvince) {
            return { status: 422, data: { message: "Missing Required Columns" } };
        }
        try {
            return await this.nodeService.createNode(nodeData);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async updateNode(nodeId: number, nodeData: NodeForm): Promise<any> {
        const requiredFields: (keyof NodeForm)[] = ["location", "description", "address", "city", "stateProvince", "zipPostalCode", "riderTransitTime", "driverTransitTime"];
        const missingFields = requiredFields.filter(field => !(field in nodeData));

        if (missingFields.length > 0) {
            return { status: 422, data: { message: "Invalid Data" } };
        }
        if (!nodeData.address || !nodeData.city || !nodeData.stateProvince) {
            return { status: 422, data: { message: "Missing Required Columns" } };
        }
        try {
            return await this.nodeService.updateNode(nodeId, nodeData);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async deleteNode(nodeId: number): Promise<any> {
        try {
            return await this.nodeService.deleteNodeById(nodeId);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async exportNodesToCSV(): Promise<any> {
        try {
            return await this.nodeService.exportNodesToCSV();
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async listLogFileNames(): Promise<any> {
        try {
            return await this.nodeService.listLogFileNames();
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async deleteLogByName(fileName: string | undefined): Promise<any> {
        if (!fileName) {
            return { status: 422, data: { message: "Invalid file name" } };
        }
        try {
            return await this.nodeService.deleteLogByName(fileName);

        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async downloadLogFiles(fileName: string | undefined): Promise<any> {
        if (!fileName) {
            return { status: 422, data: { message: "Invalid file name" } };
        }
        try {
            return await this.nodeService.downloadLogFiles(fileName);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async listDistictStates(): Promise<any> {
        try {
            return await this.nodeService.listDistictStates();
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async getNodeCountByCityForStateProvince(stateProvince: string | undefined): Promise<any> {
        if (!stateProvince) {
            return { status: 422, data: { message: "Invalid data" } };
        }
        try {
            return await this.nodeService.getNodeCountByCityForStateProvince(stateProvince);
        } catch (error: any) {

            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async batchImportNodes(fileToImport: Express.Multer.File, sessionToken: string): Promise<any> {
        if (!fileToImport) {
            return { status: 400, data: { message: "No file uploaded for batch import" } }
        }
        if (!(["text/csv", "application/vnd.ms-excel"].includes(fileToImport.mimetype))) {
            return { status: 422, data: { message: "Unsupported file type" } }
        }
        try {
            return await this.nodeService.batchImportNodes(fileToImport, sessionToken);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async getNodesInAreaOfInterest(upperLeftCorner: string, lowerLeftCorner: string, upperRightCorner: string, lowerRightCorner: string): Promise<any> {
        if (!upperLeftCorner.trim() || !lowerLeftCorner.trim() || !upperRightCorner.trim() || !lowerRightCorner.trim()) {
            return { status: 200, data: { message: "Invalid data" } }
        }

        try {
            return await this.nodeService.getNodesInAreaOfInterest(upperLeftCorner.split(",").map(coordinate => parseFloat(coordinate)), lowerLeftCorner.split(",").map(coordinate => parseFloat(coordinate)), upperRightCorner.split(",").map(coordinate => parseFloat(coordinate)), lowerRightCorner.split(",").map(coordinate => parseFloat(coordinate)));
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: 200, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };

            return { status: 500, data: { message: error.message } };
        }
    }

    async getNodeCount(addressToSearch: string | undefined): Promise<any> {
        try {
            return await this.nodeService.getNodeCount(addressToSearch);
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }
}