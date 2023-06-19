
const { queryBatchInsertNodes, findPointsOfInterestBetweenPolygon, queryAll } = require('../utilities/query');
const { logDebugInfo } = require('../utilities/logger');
const {  getpageCount, hashPassword, getRouteInfo, findParallelLines , getDistances, hasSignificantCurve} = require('../utilities/utilities')
// const { distanceDurationBetweenAllNodes } = require('../node_calculation/n2n')
const { fork } = require('child_process');





let processList = [];
// ({ p_id: childPID, op_type: 'batchInsertNodes', status: 'started', user_identifier: req.cookies.admin_cookie });


const getNode2NodeCalculationStatus = async (req, res) => {
    let message = null;
    processList.forEach((proces) => {
        if (proces.user_identifier == req.cookies.admin_cookie) {
            message = proces.message;
        }
    });
    res.status(200).json({ message: message != null ? message : 'completed' });
}

function startChildProcess(oldNodes, newNodes) {
    const forked = fork('./utilities/worker.js', [JSON.stringify(oldNodes), JSON.stringify(newNodes)]);

    forked.on('close', (code) => {
        const currentPid = forked.pid;

        // processList.forEach((proces) => {
        //     if (proces.childProcess.pid == currentPid) {
        //         if (code == 0) {
        //             proces.status = 'complete';
        //         } else if (code == 1) {
        //             proces.status = 'error';
        //         }
        //         proces.childProcess = null;
        //     }
        // });
        processList = processList.filter(proces => proces.childProcess.pid != currentPid);
        // console.log(`Worker process exited with code ${code}`);
    });

    forked.on('error', (err) => {
        // console.error('Child process encountered an error:', err);
    });

    forked.on('message', (message) => {
        const currentPid = forked.pid;
        if (message.split(':')[0] == 'status') {
            processList.forEach((proces) => {
                if (proces.childProcess.pid == currentPid) {
                    proces.message = message.split(':')[1];
                }
            });
        }
    });

    return forked;
}

// take file buffer
const prepareBulkData = async (fileBuffer) => {
    try {
        const results = []; // list to store file data structure
        await fileBuffer
            .toString() // convert buffer to string
            .split('\n') // split each line of string
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

const isProcessRunning = (token, op_type) => {
    let flag = false;
    processList.forEach((proces) => {
        if (proces.op_type == op_type && proces.user_identifier == token && (proces.status != 'complete' || proces.status != 'error')) {
            flag = true;
        }
    });
    return flag;
}

const batchImportNodes = async (req, res) => {
    try {
        if (isProcessRunning(req.cookies.admin_cookie, 'batchInsertNodes')) {
            return res.status(400).json({ message: 'Another import process alreay running' });
        }
        if (!req.files[0]) { // validate if file uploaded
            return res.status(400).json({ message: 'No file uploaded' });
        }
        if (!(['text/csv', 'application/vnd.ms-excel'].includes(req.files[0].mimetype))) { // check if file mimetype is csv
            return res.status(400).json({ message: 'Unsupported file type' });
        }
        const header = req.files[0].buffer
            .toString() // convert buffer to string
            .split('\n') // split each line of string
            .slice(0, 1)[0] // trunc first line as it is header containing columns)
            .split(',');
            console.log(header);
            
        if (header.length != 9 ||
            (header.filter(col_name => !['location', 'description', 'address', 'city', 'state_province', 'zip_postal_code', 'transit_time', 'long', 'lat'].includes(col_name))).length != 0) {
            return res.status(400).json({ message: 'Invalid column length' });
        }
        const nodesData = await queryAll('nodes', columnName = '', columnValue = null, pagination = null, columns = ['node_id', 'long', 'lat']);

        const batchNodeData = await prepareBulkData(req.files[0].buffer); // prepare data to insert

        if (batchNodeData.status == 200) {
            const retRes = await queryBatchInsertNodes(batchNodeData.data); // execute batch query if data prepared
            // return res.sendStatus(200);


            const childP = startChildProcess(nodesData.data, retRes.data);
            processList.push({ message: "", childProcess: childP, op_type: 'batchInsertNodes', status: 'running', user_identifier: req.cookies.admin_cookie });

            // console.log(processList);
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
        console.log(error)
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
           

            //gets osrm route complete details
            const routeInfo = await getRouteInfo(source, destination);
            let inter = []
            // for (let i = 0; i < routeInfo.routes[0].legs[0].steps.length-1; i++) {
            //     let waypointStart = routeInfo.routes[0].legs[0].steps[i].geometry.coordinates[0];
                
            //     let waypointEnd = routeInfo.routes[0].legs[0].steps[i].geometry.coordinates[routeInfo.routes[0].legs[0].steps[i].geometry.coordinates.length-1];
                
            //     waypointNodes.push({ 'waypointStart': waypointStart, 'waypointEnd': waypointEnd });
            //     for (let j = 0; j < nodesData.data.length; j++) {
            //         // let calculatedintermediateNode = isIntermediateNode(waypointStart, waypointEnd, nodesData.data[j]);
                    
            //         let calculatedintermediateNode = getDistances(waypointStart, waypointEnd, nodesData.data[j]);
            //         if (calculatedintermediateNode.intercepted == true) {
            //             inter.push(calculatedintermediateNode)
            //             if (Object.keys(nodesData.data[j]).includes('isWaypoint')) {
            //                 if (nodesData.data[j].distance > calculatedintermediateNode.distance) {
                                
            //                     // nodesData.data[j].distance = calculatedintermediateNode.distance;
            //                     // { distance: calculatedintermediateNode.distance, ...nodesData.data[j] }
            //                 }
                            
            //             } else {
            //                 nodesData.data[j] = { 'isWaypoint': true, 'distance': calculatedintermediateNode.distance, ...nodesData.data[j] };
                           
            //             }
            //             // intermediateNodes.push({ 'distance': calculatedintermediateNode.distance, 'lat': nodesData.data[j].lat, 'long': nodesData.data[j].long });
            //         }
            //     }
            // }
            for (let j = 0; j < nodesData.data.length; j++) {
                
                for (let i = 0; i < routeInfo.routes[0].legs[0].steps.length - 1; i++) {
                    
                    let waypointStart = routeInfo.routes[0].legs[0].steps[i].geometry.coordinates[0];
                    let waypointEnd = routeInfo.routes[0].legs[0].steps[i].geometry.coordinates[routeInfo.routes[0].legs[0].steps[i].geometry.coordinates.length - 1];
                    let allPoints = routeInfo.routes[0].legs[0].steps[i].geometry.coordinates
                   
                    
               
                    waypointNodes.push({ 'waypointStart': waypointStart, 'waypointEnd': waypointEnd });
                    
                    let calculatedintermediateNode = getDistances(waypointStart, waypointEnd, nodesData.data[j], hasSignificantCurve(allPoints), allPoints);
                    
                    if (calculatedintermediateNode.intercepted == true) {
                        inter.push(calculatedintermediateNode)
                        if (Object.keys(nodesData.data[j]).includes('isWaypoint')) {
                            if (nodesData.data[j].distance > calculatedintermediateNode.distance) {
                                nodesData.data[j].distance = calculatedintermediateNode.distance;
                                // { distance: calculatedintermediateNode.distance, ...nodesData.data[j] }
                            }
                        } else {
                            nodesData.data[j] = { 'isWaypoint': true, 'distance': calculatedintermediateNode.distance, ...nodesData.data[j] };
                        }
                        // intermediateNodes.push({ 'distance': calculatedintermediateNode.distance, 'lat': nodesData.data[j].lat, 'long': nodesData.data[j].long });
                    }
                    
                }
                
            }
            
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
        } else if (node.distance > 1609.34) {
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



  

module.exports = { batchImportNodes, displayNodesByCoordinate, displayNodesBy2Point, getNode2NodeCalculationStatus }