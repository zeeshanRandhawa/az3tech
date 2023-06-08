
const { queryBatchInsertNodes, queryAll, queryBetweenPoints } = require('../utilities/query');
const { logDebugInfo } = require('../utilities/logger');
const { distanceDurationBetweenAllNodes } = require('../node_calculation/n2n');



// take file buffer
const prepareBulkData = async (fileBuffer) => {
    try {
        const results = []; // list to store file data structure
        await fileBuffer
            .toString() // convert buffer to string
            .split('\r\n') // split each line of string
            .slice(1) // trunc first line as it is header containing columns
            .forEach((line) => {
                const [location, description, address, city, state_province, zip_postal_code, transit_time, lat, long] = line.split(','); // for each line split strig by , delimeter
                results.push({ location: location, description: description, address: address, city: city, state_province: state_province, zip_postal_code: zip_postal_code, transit_time: transit_time, long: long, lat: lat });
            }); // push the data as dict in list
        return { status: 200, data: results }; //return data
    } catch (error) {
        logDebugInfo('error', 'prepare_bulk_data', '', error.message, error.stack);
        return { status: 500, message: "Server Error " + error.message };
    }
}


const batchImportNodes = async (req, res) => {
    try {
        if (!req.files[0]) { // validate if file uploaded
            return res.status(400).json({ message: 'No file uploaded' });
        }
        if (!(['text/csv', 'application/vnd.ms-excel'].includes(req.files[0].mimetype))) { // check if file mimetype is csv
            return res.status(400).json({ message: 'Unsupported file type' });
        }
        const header = req.files[0].buffer
            .toString() // convert buffer to string
            .split('\r\n') // split each line of string
            .slice(0, 1)[0] // trunc first line as it is header containing columns)
            .split(',');
        if (header.length != 9 ||
            (header.filter(col_name => !['location', 'description', 'address', 'city', 'state_province', 'zip_postal_code', 'transit_time', 'long', 'lat'].includes(col_name))).length != 0) {
            return res.status(400).json({ message: 'Invalid column length' });
        }
        // const nodesData = await queryAll('nodes', columnName = '', columnValue = null, pagination = null, columns = ['node_id', 'long', 'lat']);

        const batchNodeData = await prepareBulkData(req.files[0].buffer); // prepare data to insert

        if (batchNodeData.status == 200) {
            const retRes = await queryBatchInsertNodes(batchNodeData.data); // execute batch query if data prepared
            // return res.sendStatus(200);

            // distanceDurationBetweenAllNodes(nodesData.data, retRes.data);

            if (retRes.status != 500) {
                res.sendStatus(retRes.status);//.json({ data: retRes.data }); // if no error occured then return 200
            } else {
                res.status(retRes.status).json({ message: retRes.data ? retRes.data : null }); // else return log file
            }
        } else {
            res.status(batchNodeData.status).json({ message: batchNodeData.message }); // batch data processing failed return error
        }
    } catch (error) {
        logDebugInfo('error', 'batch_node_insert', 'nodes', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}



const displayNodesByCoordinate = async (req, res) => {
    try {
        if (!req.query.corners) { // validate if file uploaded
            return res.status(400).json({ message: 'Invalid Data' });
        }
        else {
            const cleanedStr = req.query.corners.replace(/LngLat|\(|/g, '');
            const tupleStrings = cleanedStr.split('),');
            const dataPoints = tupleStrings.map(tupleStr => {
                const [longitude, latitude] = tupleStr.split('\)')[0].trim().split(',').map(Number);
                return [longitude, latitude];
            });


            // const dataPoints = [
            //     [-122.51125150619117, 37.793216678861974],
            //     [-122.39589506087867, 37.80189786814903],
            //     [-122.39314847884742, 37.75522448207987],
            //     [-122.50438505111305, 37.74653781043583]
            // ]

            const nodesData = await queryBetweenPoints(dataPoints);

            if (nodesData.status == 200) {
                res.status(200).json({ nodesData: nodesData.data });
            } else {
                res.sendStatus(500).json({ message: nodesData.data });
            }
            // const nodesData = await queryAll('nodes', columnName = '', columnValue = null, pagination = null, columns = ['lat', 'long']);
        }
    } catch (error) {
        logDebugInfo('error', 'batch_node_insert_with_n2n_calculation', 'nodes/n2n', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }

}

module.exports = { batchImportNodes, displayNodesByCoordinate }

34.07656506059995, -117.8586465679738
33.804277509479775, -117.8586465679738
33.804277509479775, -118.37514687386543
34.07656506059995, -118.37514687386543