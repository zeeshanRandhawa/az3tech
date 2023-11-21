import { promises as fsPromises } from "fs";
import { createObjectCsvStringifier } from "csv-writer";
import { ObjectCsvStringifier } from "csv-writer/src/lib/csv-stringifiers/object";
import { NodeRepository } from "../../repository/node.repository";
import { getGeographicCoordinatesByAddress } from "../helper.utility";

async function batchImportNode() {
    try {
        process.send!('status:preparing bulk data from file');
        let nodeBatchData: Array<Record<string, any>> = JSON.parse(await fsPromises.readFile("./util/tempFiles/nodeTemp.json", { encoding: "utf8" }));

        process.send!('status:Calculating coordinates from addresses');
        nodeBatchData = await calculateCoordinatesFromAddressForBatchProcess(nodeBatchData);

        process.send!('status:Inserting bulk data in nodes table');
        await new NodeRepository().batchImportNodes(nodeBatchData);
        process.send!('status:Bulk data insertion complete nodes table');

        process.send!('status:Cleaning up');
        await fsPromises.writeFile('./util/tempFiles/nodeTemp.json', '', { encoding: 'utf8' });
    } catch (error: any) {

        process.send!('status:Error');
    }
}

async function calculateCoordinatesFromAddressForBatchProcess(nodeBatchMetaData: Array<Record<string, any>>): Promise<Array<Record<string, any>>> {
    const failedNodes: Array<Record<string, any>> = [];
    const nodesWithCoordinates: Array<Record<string, any>> = [];
    try {
        await Promise.all(nodeBatchMetaData.map(async (node) => {
            let generatedLatLong: Record<string, any> = await getGeographicCoordinatesByAddress(node.address.trim().concat(", ").concat(node.city.trim()).concat(", ").concat(node.stateProvince.trim()));
            if (!generatedLatLong.longitude || !generatedLatLong.latitude) {
                failedNodes.push(node);
            } else {
                node.lat = generatedLatLong.latitude;
                node.long = generatedLatLong.longitude;
                nodesWithCoordinates.push(node);
            }
        }));
        try {
            if (failedNodes.length) {
                const csvStringifier: ObjectCsvStringifier = createObjectCsvStringifier({
                    header: [
                        { id: "location", title: "Location" },
                        { id: "description", title: "Description" },
                        { id: "address", title: "Address" },
                        { id: "city", title: "City" },
                        { id: "stateProvince", title: "State/Province" },
                        { id: "zipPostalCode", title: "Zip/Postal Code" },
                        { id: "riderTransitTime", title: "Rider Transit Time" },
                        { id: "driverTransitTime", title: "Driver Transit Time" }
                    ]
                });
                const csvContent: string = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(failedNodes);
                await fsPromises.writeFile(`./util/logs/${new Date().toLocaleString().replace(/[/.,\s:]/g, '_')}_node.csv`, csvContent, { encoding: 'utf8' });
            }
        } catch (error: any) {
        }
    } catch (error: any) {

    }
    return nodesWithCoordinates;
}

batchImportNode();