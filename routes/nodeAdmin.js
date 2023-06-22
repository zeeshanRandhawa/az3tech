
const { queryBatchInsertNodes, findPointsOfInterestBetweenPolygon, queryAll, qSetWaypointDistance, qGetWaypointDistance, countRows } = require('../utilities/query');
const { logDebugInfo } = require('../utilities/logger');
const { getRouteInfo, findParallelLines, getDistances, hasSignificantCurve, calculateDistanceBetweenPoints } = require('../utilities/utilities')
const { fork } = require('child_process');
const fs = require('node:fs/promises');
const { forEach } = require('mathjs');
const createCsvWriter = require('csv-writer').createObjectCsvStringifier;


// user_identifier(email): { message: "", childProcess: childP, op_type: 'batchInsertNodes', status: 'running', sockets: [] }



class NodeAdmin {
    constructor(io) {
        this.processList = {};
        this.io = io;
        this.initializeSocket();
    }

    initializeSocket() {
        this.io.on('connect', (socket) => {
            // console.log('connected');
            socket.on('sessiontoken', async (message) => {
                // console.log('message', message);
                const email = await queryAll('sessions', 'session_token', message, null, ['email']);
                if (email.data[0].email in this.processList) {
                    this.processList[email.data[0].email].sockets.push(socket);
                } else {
                    // this.processList[email.data[0].email] = { message: "", childProcess: null, operationType: "", status: "", sockets: [socket] }
                    this.processList[email.data[0].email] = { message: '', chileProcess: null, op_type: '', status: '', sockets: [socket] };
                }
                // socket.emit('sessiontokenreceivestatus', 'done');
                // console.log(this.processList);
            });

            socket.on('disconnect', () => {
                // console.log('socket closed');
                for (let key in this.processList) {
                    this.processList[key].sockets = this.processList[key].sockets.filter(sckt => sckt.id != socket.id);
                }
                // console.log(this.processList);

            });
        });
    }

    getNode2NodeCalculationStatus = async (req, res) => {
        try {
            const email = await queryAll('sessions', 'session_token', req.headers.cookies, null, ['email']);
            if (email.data[0].email in this.processList) {
                res.status(200).json({ message: !this.processList[email.data[0].email].message ? 'completed' : this.processList[email.data[0].email].message });
            } else {
                res.status(200).json({ message: 'completed' });
            }
        } catch (error) {
            res.status(200).json({ message: 'completed' });
        }
    }

    startChildProcess() {
        const forked = fork('./utilities/worker.js');

        forked.on('close', (code) => {
            const currentPid = forked.pid;

            let keyToDelete = null;
            for (let key in this.processList) {
                if (this.processList[key].childProcess.pid == currentPid) {
                    keyToDelete = key;
                    this.processList[key].sockets.forEach((sckt) => {
                        sckt.emit('uploadStatus', { 'message': 'completed' });
                    });
                    // this.processList[key].message = message.split(':')[1];
                    // this.io.sockets.emit("uploadStatus", { 'message': message.split(':')[1] });
                }
            }
            if (keyToDelete != null) {
                delete this.processList[keyToDelete];
            }
            // this.processList = this.processList.filter(proces => proces.childProcess.pid != currentPid);
            // this.io.sockets.emit("uploadStatus", { 'message': 'completed' });

        });

        forked.on('error', (err) => {
        });

        forked.on('message', (message) => {
            const currentPid = forked.pid;
            if (message.split(':')[0] == 'status') {
                for (let key in this.processList) {
                    // console.log('check it', this.processList)
                    if (this.processList[key].childProcess.pid == currentPid) {
                        this.processList[key].sockets.forEach((sckt) => {
                            sckt.emit('uploadStatus', { 'message': message.split(':')[1] });
                        });
                        this.processList[key].message = message.split(':')[1];
                        // this.io.sockets.emit("uploadStatus", { 'message': message.split(':')[1] });
                    }
                }
            }
        });

        return forked;
    }

    isProcessRunning = async (token, op_type) => {
        let flag = false;
        const email = await queryAll('sessions', 'session_token', token, null, ['email']);
        // console.log('asdsasad', email);
        // console.log(this.processList);

        for (let key in this.processList) {
            // console.log(key)
            if (key == email.data[0].email) {
                if (this.processList[key].op_type == op_type && (this.processList[key].status != 'complete' || this.processList[key].status != 'error')) {
                    flag = true
                }
            }
        }
        return flag;
    }

    setWayPointDistance = async (req, res) => {
        try {
            const waypointDistance = req.body.waypointDistance;

            if (!waypointDistance || waypointDistance < 1) {
                res.status(400).json({ message: 'Invalid data' });
            } else {
                await qSetWaypointDistance(req.headers.cookies, waypointDistance);
                res.status(200).json({ message: 'Updated' });
            }
        } catch (error) {
            res.status(500).json({ message: 'Server Error' + error.message });
        }
    }

    getWayPointDistance = async (req, res) => {
        try {
            const sessionToken = req.headers.cookies;
            const waypointDistance = await qGetWaypointDistance(sessionToken);
            res.status(200).json({ waypointDistance: waypointDistance.data });
        } catch (error) {
            res.status(500).json({ message: 'Server Error' + error.message });
        }
    }

    prepareBulkData = async (fileBuffer) => {
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

    batchImportNodes = async (req, res) => {
        try {
            if (await this.isProcessRunning(req.headers.cookies, 'batchInsertNodes')) {
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

            if (header.length != 9 ||
                (header.filter(col_name => !['location', 'description', 'address', 'city', 'state_province', 'zip_postal_code', 'transit_time', 'long', 'lat'].includes(col_name))).length != 0) {
                return res.status(400).json({ message: 'Invalid column length' });
            }
            const nodesData = await queryAll('nodes', '', null, null, ['node_id', 'long', 'lat']);

            const batchNodeData = await this.prepareBulkData(req.files[0].buffer); // prepare data to insert

            if (batchNodeData.status == 200) {
                const retRes = await queryBatchInsertNodes(batchNodeData.data); // execute batch query if data prepared

                await this.writeJsonToFile(JSON.stringify({ 'old': nodesData.data, 'new': retRes.data }));

                const childP = this.startChildProcess();

                const email = await queryAll('sessions', 'session_token', req.headers.cookies, null, ['email']);

                this.processList[email.data[0].email].childProcess = childP;
                this.processList[email.data[0].email].status = 'running'
                //  = { childProcess: childP, status: 'running', ...this.processList[email.data[0].email] };

                if (retRes.status != 500) {
                    res.sendStatus(retRes.status);//.json({ data: retRes.data }); // if no error occured then return 200
                } else {
                    res.status(retRes.status).json({ message: retRes.data ? retRes.data : null }); // else return log file
                }
            } else {
                res.status(batchNodeData.status).json({ message: batchNodeData.message }); // batch data processing failed return error
            }
        } catch (error) {
            // console.log(error);
            logDebugInfo('error', 'batch_node_insert', 'nodes', error.message, error.stack);
            res.status(500).json({ message: "Server Error " + error.message });
        }
    }

    displayNodesByCoordinate = async (req, res) => {
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
                const nodesData = await findPointsOfInterestBetweenPolygon(dataPoints);

                if (nodesData.status == 200) {
                    res.status(200).json({ nodesData: nodesData.data, totalCount: await countRows('nodes'), retrievedNodes: nodesData.data.length });
                } else {
                    res.sendStatus(500).json({ message: nodesData.data });
                }
            }
        } catch (error) {
            logDebugInfo('error', 'batch_node_insert_with_n2n_calculation', 'nodes/n2n', error.message, error.stack);
            res.status(500).json({ message: "Server Error " + error.message });
        }
    }

    displayNodesBy2Point = async (req, res) => {
        try {
            if (!req.query.originNode || !req.query.destinationNode) {
                return res.status(400).json({ message: 'Invalid Data' });
            }
            else {

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

                // return nodes of interest in polygon
                let nodesData = await findPointsOfInterestBetweenPolygon(dataPoints);


                //gets osrm route complete details
                const routeInfo = await getRouteInfo(source, destination);
                let inter = []

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
                                }
                            } else {
                                nodesData.data[j] = { 'isWaypoint': true, 'distance': calculatedintermediateNode.distance, ...nodesData.data[j] };
                            }
                        }

                    }

                }

                nodesData = this.formatNodeData(nodesData.data, (await qGetWaypointDistance(req.headers.cookies)).data);

                res.status(200).json({ "intermediateNodes": nodesData, "osrmRoute": routeInfo, "GISWaypoints": waypointNodes })
            }
        } catch (error) {
            logDebugInfo('error', 'batch_node_insert_with_n2n_calculation', 'nodes/n2n', error.message, error.stack);
            res.status(500).json({ message: "Server Error " + error.message });
        }
    }

    formatNodeData = (nodesData, waypointDistance) => {
        return nodesData.map((node) => {
            if (!('isWaypoint' in node)) {
                node = { 'isWaypoint': false, 'distance': 0, ...node };
            } else if (node.distance > waypointDistance) {
                node.distance = 0;
                node.isWaypoint = false;
            }
            return node;
        })

    }
    makeIntermediateNodeSet = (intermediateNodes) => {
        intermediateNodes = intermediateNodes.filter(node => node.distance < 50);

        let intermediateNodesSet = new Set(intermediateNodes.map(node => JSON.stringify({ lat: node.lat, long: node.long, ...node })));

        const uniqueObjects = Array.from(intermediateNodesSet, str => ({ ...JSON.parse(str) }));

        return uniqueObjects;
    }

    calculatepolygonEdges = async (dataPoints) => {
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

    writeJsonToFile = async (jsonStr) => {
        await fs.writeFile(`./utilities/uploadfiles/n2ndata.json`, jsonStr, 'utf8', (err) => {
            if (err) {
                return;
            }
        });
    }

    getAllNodes = async (req, res) => {
        try {
            const nodeList = await queryAll('nodes', '', null, req.query.pageNumber, null);
            if (nodeList.status == 200) {
                res.status(200).json({ "nodes": nodeList.data }); // if response is OK return data
            } else {
                res.status(nodeList.status).json({ message: nodeList.data }); // else return error
            }
        } catch (error) {
            logDebugInfo('error', 'list_nodes', 'nodes', error.message, error.stack);
            res.status(500).json({ message: "Server Error " + error.message });
        }
    }

    downloadNodesCSV = async (req, res) => {
        const nodeList = await queryAll('nodes', '', null, req.query.pageNumber, null);
        const data = nodeList.data;

        const csvStringifier = createCsvWriter({
            header: [
                { id: 'node_id', title: 'Node ID' },
                { id: 'location', title: 'Location' },
                { id: 'description', title: 'Description' },
                { id: 'address', title: 'Address' },
                { id: 'city', title: 'City' },
                { id: 'state_province', title: 'State/Province' },
                { id: 'zip_postal_code', title: 'Postal Code' },
                { id: 'long', title: 'Logitude' },
                { id: 'lat', title: 'latitude' },
                { id: 'locid', title: 'Location ID' },
                { id: 'transit_time', title: 'Transit Time' },
            ],
        });

        const csvContent = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(data);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="filename.csv"');

        res.send(csvContent);
    }

    getNearestNode = async (req,res) =>{
        let searchCoordinates = req.body.searchCoordinates;

        const nodeList = await queryAll('nodes', '', null, req.query.pageNumber, null);
        let smallest = {distance:"", coordinates:{}}
        nodeList.data.forEach((element)=>{
            let distance = calculateDistanceBetweenPoints({latitude:element.lat, longitude:element.long}, {latitude: searchCoordinates.lat, longitude: searchCoordinates.long})
            console.log(distance)
            if(smallest.distance ==""){
                smallest.distance = distance;
                smallest.coordinates = {lat:element.lat, long: element.long}
            }
            else if(distance<= smallest.distance){
                smallest.distance = distance;
                smallest.coordinates = {lat:element.lat, long: element.long}            
            }
        })
        res.status(200).json(smallest);
    }
}

module.exports = NodeAdmin;
