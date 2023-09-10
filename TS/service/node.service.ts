import { Op, col, fn } from "sequelize";
import { createObjectCsvStringifier } from "csv-writer";
import { ObjectCsvStringifier } from "csv-writer/src/lib/csv-stringifiers/object";
import { promises as fsPromises } from "fs";
import { createReadStream } from "fs";
import path from "path";
import archiver, { Archiver } from "archiver";
import ProcessSocket from "../util/socketProcess.utility";
import { NodeRepository } from "../repository/node.repository";
import { CoordinateAttribute, CustomError, NodeAttributes, NodeForm, SessionAttributes } from "../util/interface.utility";
import {
    calculateDistanceBetweenPoints,
    findNodesOfInterestInArea, getGeographicCoordinatesByAddress,
    isValidFileHeader, prepareBatchBulkImportData
} from "../util/helper.utility";
import { SessionRepository } from "../repository/session.repository";
import { UserRepository } from "../repository/user.repository";


export class NodeService {

    private nodeRepository: NodeRepository;
    private sessionRepository: SessionRepository;
    private userRepository: UserRepository;

    constructor() {
        this.nodeRepository = new NodeRepository();
        this.sessionRepository = new SessionRepository();
        this.userRepository = new UserRepository();
    }

    async listNodes(pageNumber: number): Promise<any> {

        const nodeList: NodeAttributes[] = await this.nodeRepository.findNodes({
            where: {},
            order: [["nodeId", "ASC"]],
            limit: 10,
            offset: (pageNumber - 1) * 10,
        });

        if (nodeList.length < 1) {
            throw new CustomError("No Node Found", 404);
        }

        return { status: 200, data: { nodes: nodeList } };
    }

    async listNodesByAddress(addressToSearch: string, pageNumber: number): Promise<any> {

        const nodeList: NodeAttributes[] = await this.nodeRepository.findNodes({
            where: {
                address: { [Op.iLike]: `%${addressToSearch.trim()}%` }
            },
            order: [["nodeId", "ASC"]],
            limit: 10,
            offset: (pageNumber - 1) * 10,
        });

        if (nodeList.length < 1) {
            throw new CustomError("No Node Found", 404);
        }

        return { status: 200, data: { nodes: nodeList } };
    }

    async createNode(nodeData: NodeForm): Promise<Record<string, any>> {

        const geoCoordinates: Record<string, number> = await getGeographicCoordinatesByAddress(nodeData.address.trim().concat(", ").concat(nodeData.city.trim()).concat(", ").concat(nodeData.stateProvince.trim()));
        if (!geoCoordinates.latitude || !geoCoordinates.longitude) {
            throw new CustomError("Invalid address, city or stateProvince", 400);
        }

        await this.nodeRepository.createNode({
            location: nodeData.location,
            description: nodeData.description,
            address: nodeData.address,
            city: nodeData.city,
            stateProvince: nodeData.stateProvince,
            zipPostalCode: nodeData.zipPostalCode,
            lat: geoCoordinates.latitude,
            long: geoCoordinates.longitude,
            transitTime: nodeData.transitTime,
        }, {
            fields: ["location", "description", "address", "city", "stateProvince", "zipPostalCode", "lat", "long", "transitTime"]
        });

        return { status: 201, data: { message: "Node Created Successfully" } };
    }

    async updateNode(nodeId: number, nodeData: NodeForm): Promise<Record<string, any>> {
        const node: NodeAttributes | null = await this.nodeRepository.findNodeByPK(nodeId);

        if (!node) {
            throw new CustomError("Node does not exist", 404);
        }


        if (nodeData.address.trim() !== node.address?.trim() || nodeData.city.trim() !== node.city?.trim() || nodeData.stateProvince.trim() !== node.stateProvince?.trim()) {
            const geoCoordinates: Record<string, number> = await getGeographicCoordinatesByAddress(nodeData.address.trim().concat(", ").concat(nodeData.city.trim()).concat(", ").concat(nodeData.stateProvince.trim()));
            if (!geoCoordinates.latitude || !geoCoordinates.longitude) {
                throw new CustomError("Invalid address, city or stateProvince", 400);
            }
            await this.nodeRepository.updateNode({
                location: nodeData.location,
                description: nodeData.description,
                address: nodeData.address,
                city: nodeData.city,
                stateProvince: nodeData.stateProvince,
                zipPostalCode: nodeData.zipPostalCode,
                lat: geoCoordinates.latitude,
                long: geoCoordinates.longitude,
                transitTime: nodeData.transitTime,
            }, {
                nodeId: nodeId
            });
        } else {
            await this.nodeRepository.updateNode({
                location: nodeData.location,
                description: nodeData.description,
                zipPostalCode: nodeData.zipPostalCode,
                transitTime: nodeData.transitTime,
            }, {
                nodeId: nodeId
            });
        }
        return { status: 200, data: { message: "Node Updated Successfully" } }
    }

    async deleteNodeById(nodeId: number): Promise<Record<string, any>> {
        const deletedNodeCount: number = await this.nodeRepository.deleteNode({
            where: {
                nodeId: nodeId
            }
        });
        if (deletedNodeCount) {
            return { status: 200, data: { message: "Node Deleted Successfully" } };
        } else {
            throw new CustomError("No Node exists with this id", 404);
        }
    }

    async exportNodesToCSV(): Promise<Record<string, any>> {
        const nodeList: NodeAttributes[] = await this.nodeRepository.findNodes({
            order: [["nodeId", "ASC"]]
        });

        const csvStringifier: ObjectCsvStringifier = createObjectCsvStringifier({
            header: [
                { id: "nodeId", title: "Node Id" },
                { id: "location", title: "Location" },
                { id: "description", title: "Description" },
                { id: "address", title: "Address" },
                { id: "city", title: "City" },
                { id: "stateProvince", title: "State/Province" },
                { id: "zipPostalCode", title: "Zip/Postal Code" },
                { id: "long", title: "Logitude" },
                { id: "lat", title: "latitude" },
                { id: "locid", title: "Location Id" },
                { id: "transitTime", title: "Transit Time" }
            ],
        });
        const csvContent: string = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(nodeList);

        return { status: 200, data: { content: csvContent } };
    }

    async listLogFileNames(): Promise<Record<string, any>> {
        return fsPromises.readdir("./util/logs/").then((files) => {
            const csvFiles = files.filter((file) => path.extname(file) === ".csv" && path.basename(file).includes("node"));
            if (csvFiles.length) {
                return { status: 200, data: { fileNameList: csvFiles } };
            } else {
                return { status: 404, data: { message: "No logs available" } };
            }

        }).catch((error: any) => {
            return { status: 400, data: { message: error.message } };
        });
    }

    async deleteLogByName(fileName: string): Promise<Record<string, any>> {
        return fsPromises.unlink(`./util/logs/${fileName}`).then(() => {
            return { status: 200, data: { message: "Log deleted successfully" } };
        }).catch((error: any) => {
            throw new CustomError("File not found", 404);
        });
    }

    async downloadLogFiles(fileName: string): Promise<Record<string, any>> {
        return fsPromises.readdir("./util/logs/").then((files: string[]) => {

            let csvFiles: string[];

            if (fileName === "allFiles") {
                csvFiles = files.filter((file) => path.extname(file) === ".csv");
            } else {
                csvFiles = files.filter((file) => path.extname(file) === ".csv" && path.basename(file) === fileName);
            }
            if (csvFiles.length === 0) {
                return { status: 404, data: { message: "No file Found" } }
            }

            const zip: Archiver = archiver("zip");
            csvFiles.forEach(async (file: string) => {
                const filePath: string = path.join("./util/logs/", file);
                zip.append(createReadStream(filePath), { name: file });
            });

            return { status: 200, data: { zip: zip } };
        });
    };

    async listDistictStates(): Promise<Record<string, any>> {
        const distinctStates: Array<Record<string, any>> = await this.nodeRepository.findDistinctGroupByAttributed({
            attributes: [
                [fn("DISTINCT", col("state_province")), "stateProvince"]
            ],
            order: [
                ["stateProvince", "ASC"]
            ]
        });

        const filteredStateList: Array<string> = distinctStates.filter((state) => {
            return state.stateProvince !== null && state.stateProvince.trim() !== ""
        }).map((state) => {
            state.stateProvince = state.stateProvince.trim();
            return state.stateProvince;
        });

        if (filteredStateList.length) {
            return { status: 200, data: { distinctStateList: filteredStateList } };
        } else {
            return { status: 404, data: { message: "No distinct state found" } };
        }
    }

    async getNodeCountByCityForStateProvince(stateProvince: string): Promise<Record<string, any>> {
        let cityNodeCountByState: Array<Record<string, any>> = await this.nodeRepository.findDistinctGroupByAttributed({
            attributes: [
                "city", [fn("COUNT", col("node_id")), "nodes"]
            ],
            where: {
                stateProvince: stateProvince
            },
            group: ["city"],
            order: [
                ["city", "ASC"]
            ]
        });

        cityNodeCountByState = cityNodeCountByState.map((cityNodeCount) => {
            cityNodeCount.city = cityNodeCount.city.trim();
            return cityNodeCount;
        });

        if (cityNodeCountByState.length) {
            return { status: 200, data: { stateCityNodeCount: cityNodeCountByState } };
        } else {
            return { status: 404, data: { message: "No city found in state" } };
        }
    }

    async batchImportNodes(fileToImport: Express.Multer.File, sessionToken: string): Promise<Record<string, any>> {
        if (await ProcessSocket.getInstance().isProcessRunningForToken(sessionToken, "Node")) {
            return { status: 422, data: { message: "Another import process alreay running" } }
        }

        if (!isValidFileHeader(fileToImport.buffer, ["Location", "Description", "Address", "City", "State/Province", "Zip/Postal Code", "Transit Time"])) {
            throw new CustomError("Invalid column length", 422);
        }
        const nodeBatchMetaData: Array<Record<string, any>> = prepareBatchBulkImportData(fileToImport.buffer, ["location", "description", "address", "city", "stateProvince", "zipPostalCode", "transitTime"]);

        await fsPromises.writeFile("./util/tempFiles/nodeTemp.json", JSON.stringify(nodeBatchMetaData), { encoding: "utf8" });

        const session: SessionAttributes | null = await this.sessionRepository.findSession({
            where: {
                sessionToken: sessionToken
            },
            include: [{
                association: "user"
            }]
        });

        ProcessSocket.getInstance().forkProcess("./util/process/nodeBatchImport.process.ts", "Node", session?.user?.email.trim()!, 0);

        return { status: 200, data: { message: "Nodes import in progress" } };
    }

    async getNodeCount(addressToSearch: string | undefined): Promise<Record<string, any>> {
        let nodesCount: number;

        if (!addressToSearch) {
            nodesCount = await this.nodeRepository.countNodes({});
        } else {
            nodesCount = await this.nodeRepository.countNodes({
                where: {
                    address: { [Op.iLike]: `%${addressToSearch}%` }
                }
            });
        }
        return { status: 200, data: { nodesCount: Math.ceil(nodesCount) } };
    }

    async getNodesInAreaOfInterest(upperLeftCorner: Array<number>, lowerLeftCorner: Array<number>, upperRightCorner: Array<number>, lowerRightCorner: Array<number>): Promise<Record<string, any>> {

        const nodesToDisplay: Array<Record<string, any>> = await findNodesOfInterestInArea(upperLeftCorner, lowerLeftCorner, upperRightCorner, lowerRightCorner, []);

        if (nodesToDisplay.length) {
            const totalNodesCount: number = await this.nodeRepository.countNodes({});

            return { status: 200, data: { nodesInArea: nodesToDisplay, totalNodeCount: totalNodesCount, nodeCountInArea: nodesToDisplay.length } };
        } else {
            return { status: 404, data: { message: "No node found in this area" } };
        }
    }

    async getNearestNode(coordinateData: CoordinateAttribute): Promise<Record<string, any>> {
        const nodeList: Array<NodeAttributes> = await this.nodeRepository.findNodes({});
        if (nodeList.length < 1) {
            throw new CustomError("No Node Found", 404);
        }

        const smallestDistanceCoordinate: Record<string, any> = {
            distance: Infinity,
            coordinates: {}
        };
        await Promise.all(nodeList.map(async (node: NodeAttributes) => {
            if (node.lat !== undefined || node.long !== undefined) {
                let distance: number = calculateDistanceBetweenPoints({ latitude: node.lat!, longitude: node.long! }, { latitude: coordinateData.latitude!, longitude: coordinateData.longitude! })
                if (distance <= smallestDistanceCoordinate.distance) {
                    smallestDistanceCoordinate.distance = distance;
                    smallestDistanceCoordinate.coordinates = { latitude: node.lat, longitude: node.long }
                }
            }
        }));

        return { status: 200, data: smallestDistanceCoordinate };
    }
}

