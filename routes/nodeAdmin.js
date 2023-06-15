
const { queryBatchInsertNodes, findPointsOfInterestBetweenPolygon } = require('../utilities/query');
const { logDebugInfo } = require('../utilities/logger');
const { getRouteInfo, isIntermediateNode, findParallelLines } = require('../utilities/utilities')



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

            const nodesData = await findPointsOfInterestBetweenPolygon(dataPoints);

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



const displayNodesBy2Point = async (req, res) => {
    try {
        if (!req.query.originNode || !req.query.destinationNode) {
            return res.status(400).json({ message: 'Invalid Data' });
        }
        else {

            // let intermediateNodes = []
            let waypointNodes = [];
            let dataPoints = [];
            dataPoints.push(req.query.originNode.split(',').map(Number));
            dataPoints.push(req.query.destinationNode.split(',').map(Number));


            // calculate edges of square polygon
            // takes two long;lat points
            // return 4 points of polygon
            const source = dataPoints[0]
            const destination = dataPoints[1]
            dataPoints = findParallelLines(dataPoints)
            // dataPoints = await calculatepolygonEdges(dataPoints);

            // return nodes of interest in polygon
            let nodesData = await findPointsOfInterestBetweenPolygon(dataPoints);
            console.log("ROI length", nodesData.data.length);

            //gets osrm route complete details
            const routeInfo = await getRouteInfo(source, destination);
            let inter = []
            for (let i = 0; i < routeInfo.routes[0].legs[0].steps.length-1; i++) {
                let waypointStart = routeInfo.routes[0].legs[0].steps[i].geometry.coordinates[0];
                
                let waypointEnd = routeInfo.routes[0].legs[0].steps[i].geometry.coordinates[routeInfo.routes[0].legs[0].steps[i].geometry.coordinates.length-1];
                
                waypointNodes.push({ 'waypointStart': waypointStart, 'waypointEnd': waypointEnd });
                for (let j = 0; j < nodesData.data.length; j++) {
                    let calculatedintermediateNode = isIntermediateNode(waypointStart, waypointEnd, nodesData.data[j]);
                    
                    if (calculatedintermediateNode.intercepted == true) {
                        inter.push(calculatedintermediateNode)
                        if (Object.keys(nodesData.data[j]).includes('isWaypoint')) {
                            if (nodesData.data[j].distance > calculatedintermediateNode.distance) {
                                
                                // nodesData.data[j].distance = calculatedintermediateNode.distance;
                                // { distance: calculatedintermediateNode.distance, ...nodesData.data[j] }
                            }
                            
                        } else {
                            nodesData.data[j] = { 'isWaypoint': true, 'distance': calculatedintermediateNode.distance, ...nodesData.data[j] };
                            console.log("iN else")
                        }
                        // intermediateNodes.push({ 'distance': calculatedintermediateNode.distance, 'lat': nodesData.data[j].lat, 'long': nodesData.data[j].long });
                    }
                }
            }
            console.log(inter)
            // let intermediateNodesSet = makeIntermediateNodeSet(intermediateNodes);
            nodesData = formatNodeData(nodesData.data);
           
            res.status(200).json({ "intermediateNodes": nodesData, "osrmRoute": routeInfo, "GISWaypoints": waypointNodes })
        }
    } catch (error) {
        logDebugInfo('error', 'batch_node_insert_with_n2n_calculation', 'nodes/n2n', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}


// const formatNodeData = (nodesData) => {
//     return nodesData.map((node) => {
//         if (!('isWaypoint' in node)) {
//             node = { 'isWaypoint': false, 'distance': 0, ...node };
//         }
//         return node;
//     }).filter(node => node.distance < 250);
// }

const formatNodeData = (nodesData) => {
    return nodesData.map((node) => {
        if (!('isWaypoint' in node)) {
            node = { 'isWaypoint': false, 'distance': 0, ...node };
        } else if (node.distance > 550) {
            // node = { 'isWaypoint': false, 'distance': 0, ...node };
            node.distance = 0;
            node.isWaypoint = false;
        }
        return node;
    })
    // .filter(node => node.distance < );
}
const makeIntermediateNodeSet = (intermediateNodes) => {
    intermediateNodes = intermediateNodes.filter(node => node.distance < 50);

    let intermediateNodesSet = new Set(intermediateNodes.map(node => JSON.stringify({ lat: node.lat, long: node.long, ...node })));

    const uniqueObjects = Array.from(intermediateNodesSet, str => ({ ...JSON.parse(str) }));

    return uniqueObjects;
}

const calculatepolygonEdges = async (dataPoints) => {
    const x1 = dataPoints[0][0];
    const y1 = dataPoints[0][1];
    const x2 = dataPoints[1][0];
    const y2 = dataPoints[1][1];

    const xc = (x1 + x2) / 2;
    const yc = (y1 + y2) / 2;
    const xd = (x1 - x2) / 2;
    const yd = (y1 - y2) / 2;

    const x3 = xc - yd;
    const y3 = yc + xd;
    const x4 = xc + yd;
    const y4 = yc - xd;

    return [dataPoints[0], [x4, y4], dataPoints[1], [x3, y3]];
}



  

module.exports = { batchImportNodes, displayNodesByCoordinate, displayNodesBy2Point }