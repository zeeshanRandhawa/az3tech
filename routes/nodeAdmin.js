
const { findPointsOfInterestBetweenPolygon, queryAll, qSetWaypointDistance, qGetWaypointDistance, countRows, deleteWhereById, queryCreate, modifyProfile, queryFilter } = require('../utilities/query');
const { getRouteInfo, findParallelLines, getDistances, hasSignificantCurve, calculateDistanceBetweenPoints, formatNodeData, fetchCoordinatesDataFromApi } = require('../utilities/utilities')
const { logDebugInfo } = require('../utilities/logger');
const { fork } = require('child_process');
const fs = require('node:fs/promises');
const fss = require('fs');
const createCsvWriter = require('csv-writer').createObjectCsvStringifier;
const path = require('path');
const archiver = require('archiver');
const querystring = require('querystring');


class NodeAdmin {
    constructor(io) {
        this.processList = {};
        this.io = io
        this.initializeSocket();
    }

    initializeSocket() {
        try {
            this.io.on('connect', (socket) => {
                socket.on('sessionTokenNode', async (message) => {
                    const email = await queryAll('sessions', 'session_token', message, null, ['email']);
                    if (email.data[0].email in this.processList) {
                        this.processList[email.data[0].email].sockets.push(socket);
                    } else {
                        this.processList[email.data[0].email] = { message: '', childProcess: null, op_type: '', status: '', sockets: [socket] };
                    }
                });

                socket.on('disconnect', () => {
                    for (let key in this.processList) {
                        this.processList[key].sockets = this.processList[key].sockets.filter(sckt => sckt.id != socket.id);
                    }
                });

                socket.on("poolStatusNode", async (message) => {

                    const email = await queryAll('sessions', 'session_token', message, null, ['email']);

                    if (email.data[0].email in this.processList) {
                        let currentMessage = this.processList[email.data[0].email].message
                        socket.emit("uploadStatusNode", { 'message': currentMessage })
                    }

                });

            });
        } catch (error) {
        }
    }

    startChildProcess() {
        try {
            const forked = fork('./utilities/nodeimport.js');
            forked.on('close', (code) => {
                const currentPid = forked.pid;

                let keyToDelete = null;
                for (let key in this.processList) {
                    if (this.processList[key].childProcess.pid == currentPid) {
                        keyToDelete = key;
                        this.processList[key].sockets.forEach((sckt) => {
                            sckt.emit('uploadStatusNode', { 'message': 'completed' });
                        });
                    }
                }
                if (keyToDelete != null) {
                    delete this.processList[keyToDelete];
                }
            });

            forked.on('error', (err) => {
            });

            forked.on('message', (message) => {
                const currentPid = forked.pid;
                if (message.split(':')[0] == 'status') {
                    for (let key in this.processList) {
                        if (this.processList[key].childProcess.pid == currentPid) {
                            this.processList[key].sockets.forEach((sckt) => {
                                sckt.emit('uploadStatusNode', { 'message': message.split(':')[1] });
                            });
                            this.processList[key].message = message.split(':')[1];
                        }
                    }
                }
            });
            return forked;
        } catch (error) {
        }
    }

    isProcessRunning = async (token, op_type) => {
        try {
            let flag = false;
            const email = await queryAll('sessions', 'session_token', token, null, ['email']);

            for (let key in this.processList) {
                if (key == email.data[0].email) {
                    if (this.processList[key].op_type == op_type && (this.processList[key].status != 'complete' || this.processList[key].status != 'error')) {
                        flag = true
                    }
                }
            }
            return flag;
        } catch (error) {
        }
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

            if (header.length != 7 ||
                (header.filter(col_name => !['location', 'description', 'address', 'city', 'state_province', 'zip_postal_code', 'transit_time'].includes(col_name))).length != 0) {
                return res.status(400).json({ message: 'Invalid column length' });
            }
            const nodesData = await queryAll('nodes', '', null, null, ['node_id', 'long', 'lat'], false, null, 'WHERE lat IS NOT NULL AND long IS NOT NULL');

            await this.writeJsonToFile(JSON.stringify({ 'old': nodesData.data, 'newToInsert': req.files[0].buffer.toString().split('\n').slice(1) }));


            const email = await queryAll('sessions', 'session_token', req.headers.cookies, null, ['email']);
            const childP = this.startChildProcess();
            if (email.data[0].email in this.processList) {
                this.processList[email.data[0].email].childProcess = childP;
                this.processList[email.data[0].email].status = 'running'
            } else {
                this.processList[email.data[0].email] = { message: '', childProcess: childP, op_type: '', status: 'running', sockets: [] };
            }

            this.processList[email.data[0].email].childProcess = childP;
            this.processList[email.data[0].email].status = 'running'

            res.sendStatus(200);
        } catch (error) {
            logDebugInfo('error', 'batch_node_insert', 'nodes', error.message, error.stack);
            res.status(500).json({ message: "Server Error " + error.message });
        }
    }

    // Function to convert an integer to an RGB color code

    intToColorCode = (num) => {
        const hue = (num * 200.5) % 360; // Vary hue based on the number
        const saturation = 80; // You can adjust this as needed
        const lightness = 50; // You can adjust this as needed
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }
    convertStringToInteger = (str) => {
        let result = '';

        for (let i = 0; i < str.length; i++) {
            const charCode = str.charCodeAt(i);
            if (!isNaN(charCode)) {
                result += charCode;
            }
        }

        return parseInt(result);
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
                    let colorCoding = {};
                    let i = 0;

                    res.status(200).json({
                        nodesData: nodesData.data.map((node) => {
                            if (node.description) {
                                if (!colorCoding.hasOwnProperty(node.description.trim())) {
                                    colorCoding[node.description.trim()] = this.intToColorCode(this.convertStringToInteger(node.description.trim()));
                                    i = i + 1;
                                }
                                node.nodeColor = colorCoding[node.description.trim()]
                                node.description = node.description.trim();
                            }
                            return node;
                        }), totalCount: await countRows('nodes'), retrievedNodes: nodesData.data.length
                    });
                } else {
                    res.sendStatus(500).json({ message: nodesData.data });
                }
            }
        } catch (error) {
            // console.log(error);
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

                // console.log(routeInfo)
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

                nodesData = formatNodeData(nodesData.data, (await qGetWaypointDistance(req.headers.cookies)).data);

                res.status(200).json({ "intermediateNodes": nodesData, "osrmRoute": routeInfo, "GISWaypoints": waypointNodes })
            }
        } catch (error) {
            logDebugInfo('error', 'batch_node_insert_with_n2n_calculation', 'nodes/n2n', error.message, error.stack);
            res.status(500).json({ message: "Server Error " + error.message });
        }
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
            const nodeList = await queryAll('nodes', '', null, req.query.pageNumber, null, false, null, '', "node_id");
            if (nodeList.status == 200) {
                res.status(200).json({ "nodes": nodeList.data }); // if response is OK return data
            } else {
                res.status(nodeList.status).json({ message: nodeList.data }); // else return error
            }
        } catch (error) {
            // console.log(error)
            logDebugInfo('error', 'list_nodes', 'nodes', error.message, error.stack);
            res.status(500).json({ message: "Server Error " + error.message });
        }
    }

    // search nodes based on filter object provided
    searchNodes = async (req, res) => {
        try {
            const nodeAddress = req.query.address;
            const pageNumber = req.query.pageNumber;
            if (!nodeAddress) { // validate if filter data is in correct format
                res.status(400).json({ message: "Invalid Data" })
            } else {
                const nodeList = await queryFilter('nodes', nodeAddress, pageNumber); // insert in database
                if (nodeList.status == 200) { // error handling
                    if (nodeList.data.length == 0) {
                        res.status(200).json({ message: "No node found" });
                    } else {
                        res.status(200).json({ 'nodes': nodeList.data });
                    }
                } else {
                    res.status(nodeList.status).json({ message: nodeList.data });
                }
            }
        } catch (error) {
            logDebugInfo('error', 'searchNodes', 'nodes', error.message, error.stack);
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
                { id: 'zip_postal_code', title: 'Zip/Postal Code' },
                { id: 'long', title: 'Logitude' },
                { id: 'lat', title: 'latitude' },
                { id: 'locid', title: 'Location ID' },
                { id: 'transit_time', title: 'Transit Time' },
            ],
        });

        const csvContent = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(data);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="Nodes List.csv"');

        res.send(csvContent);
    }

    getNearestNode = async (req, res) => {
        try {
            // console.log("here")
            let searchCoordinates = req.body.searchCoordinates;
            // console.log(req.query.pageNumber)
            const nodeList = await queryAll('nodes', '', null, null, null);
            let smallest = { distance: "", coordinates: {} }
            nodeList.data.some((element) => {
                if (!element.lat || !element.long) { } else {
                    let distance = calculateDistanceBetweenPoints({ latitude: element.lat, longitude: element.long }, { latitude: searchCoordinates.lat, longitude: searchCoordinates.long })
                    if (distance == 0) {
                        // console.log(distance, " ", { lat: element.lat, long: element.long })
                        smallest.distance = distance;
                        smallest.coordinates = { lat: element.lat, long: element.long }
                        return true; // Break the loop
                    }
                    else if (smallest.distance == "") {
                        smallest.distance = distance;
                        smallest.coordinates = { lat: element.lat, long: element.long }
                    }
                    else if (distance <= smallest.distance) {
                        smallest.distance = distance;
                        smallest.coordinates = { lat: element.lat, long: element.long }
                    }
                }
            });
            res.status(200).json(smallest);
        } catch (error) {
        }
    }

    getAllStates = async (req, res) => {
        try {
            let statesList = await queryAll('nodes', '', null, null, ['state_province AS state'], true);
            // statesList = statesList.data.map(state => state.state);

            statesList = statesList.data.filter(state => state.state != null).map((state) => {
                state.state = state.state.trim();
                return state
            });
            res.status(200).json({ stateList: statesList });
        } catch (error) {
            res.status(500).json({ message: "Server Error " + error.message });
        }
    }

    getStateCityNodes = async (req, res) => {
        try {
            if (!req.query.state || req.query.state == '') {
                res.send(400).json({ message: 'Invalid data' });
            } else {
                let stateCityNodeCount = await queryAll('nodes', 'state_province', req.query.state, null, ['city', 'COUNT(node_id) AS nodes'], false, ['city']);
                res.status(stateCityNodeCount.status).json({
                    stateCityNodeCount: stateCityNodeCount.data.map((stateCityNodeCount) => {
                        stateCityNodeCount.city = stateCityNodeCount.city.trim();
                        return stateCityNodeCount;
                    })
                });
            }
        } catch (error) {
            // console.log(error);
            res.status(500).json({ message: "Server Error " + error.message });
        }
    }

    getLogsList = async (req, res) => {
        fs.readdir("./utilities/logfiles/")
            .then((files) => {
                // Filter out any non-CSV files if needed
                const csvFiles = files.filter((file) => path.extname(file) === '.csv');
                return res.status(200).json({ fileNameList: csvFiles })
            })
            .catch((err) => {
                // console.error('Error reading directory:', err);
            });
    }

    downloadLogFile = async (req, res) => {
        try {
            fss.readdir("./utilities/logfiles/", (err, files) => {
                if (err) {

                    res.status(500).send('Internal Server Error');
                    return;
                }
                let csvFiles;

                if (req.query.logFileName === "allFiles") {
                    csvFiles = files.filter((file) => path.extname(file) === '.csv');
                } else {
                    csvFiles = files.filter((file) => path.extname(file) === '.csv' && path.basename(file) === req.query.logFileName);
                }
                if (csvFiles.length === 0) {

                    res.status(404).send('No CSV files found in the directory');
                    return;
                }

                res.setHeader('Content-Type', 'application/zip');
                res.setHeader('Content-Disposition', 'attachment; filename="logfiles.zip"');

                const zip = archiver('zip');
                zip.pipe(res);
                csvFiles.forEach((file) => {
                    const filePath = path.join("./utilities/logfiles/", file);
                    zip.append(fss.createReadStream(filePath), { name: file });
                });
                zip.finalize();
            });
        } catch (error) {
            // console.log(error)
        }
    }

    deleteLogFile = async (req, res) => {
        const fileName = req.query.fileName;

        try {
            await fs.unlink(`./utilities/logfiles/${fileName}`);
            return res.status(200).json({ message: 'File deleted successfully' });
        } catch (error) {
            // console.log(error)
            return res.status(404).json({ message: 'File not found' });
        }
    }

    deleteNodeById = async (req, res) => {
        const nodeId = req.params.nodeId;
        try {
            if (!nodeId) { // validate route id 
                res.status(400).json({ message: "Invalid Data" }) // return if error
            } else {
                const retRes = await deleteWhereById('nodes', nodeId); // execute fetch query

                if (retRes.status != 400) {
                    res.status(retRes.status).json({ message: retRes.message }); // if no error occured return Ok
                } else {
                    res.status(retRes.status).json({ message: retRes.data }); // return error
                }
            }
        } catch (error) {
            logDebugInfo('error', 'delete_node', 'nodes', error.message, error.stack);
            res.status(500).json({ message: "Server Error " + error.message });
        }
    }

    createNode = async (req, res) => {
        try {
            const nodeData = req.body;

            if (Object.keys(nodeData).length < 7 || !nodeData.address || !nodeData.city || !nodeData.state_province) {
                res.status(400).json({ message: "Invalid data" });
            } else {

                let latLong = await fetchCoordinatesDataFromApi(`https://nominatim.openstreetmap.org/search?q=${querystring.escape(nodeData.address.trim().concat(' ').concat(nodeData.city.trim()).concat(', ').concat(nodeData.state_province.trim()))}&format=json&addressdetails=1`, 0, 25);

                if (!latLong.lat || !latLong.long) {
                    res.status(400).json({ message: "Invalid address or city" });
                } else {
                    nodeData.lat = latLong.lat;
                    nodeData.long = latLong.long;

                    Object.keys(nodeData).forEach((data) => {
                        if (nodeData[data] == '') {
                            nodeData[data] = null
                        }
                    });

                    const retResult = await queryCreate("nodes", nodeData); // insert data in databse
                    if (retResult.status == 200) { // error handling
                        res.status(201).json({ message: "Node created successfully" });
                    } else {
                        res.status(retResult.status).json({ message: retResult.data });
                    }
                }
            }
        } catch (error) {
            // console.log(error);
            logDebugInfo('error', 'create_rider_profile', 'riders', error.message, error.stack);
            res.status(500).json({ message: "Server Error " + error.message });
        }
    }

    updateNode = async (req, res) => {
        try {
            const nodeId = req.params.nodeId;
            const nodeData = req.body;

            if (!nodeId || !nodeData || Object.keys(nodeData).length < 7 || !nodeData.address || !nodeData.city || !nodeData.state_province) { // validate filters and user id if invalid return error
                res.status(400).json({ message: "Invalid Data" })
            } else {
                const oldNodeData = await queryAll("nodes", "node_id", nodeId, null, null, false, null, '');

                if (oldNodeData.data.length == 0) {
                    res.status(404).json({ message: "Node does not exist" });
                } else {
                    if (oldNodeData.data[0].address != nodeData.address || oldNodeData.data[0].city != nodeData.city) {
                        let latLong = await fetchCoordinatesDataFromApi(`https://nominatim.openstreetmap.org/search?q=${querystring.escape(nodeData.address.trim().concat(' ').concat(nodeData.city.trim()).concat(', ').concat(nodeData.state_province.trim()))}&format=json&addressdetails=1`, 0, 25);

                        if (!latLong.lat || !latLong.long) {
                            return res.status(400).json({ message: "Unable to update. Invalid address or city" });
                        } else {
                            nodeData.lat = latLong.lat;
                            nodeData.long = latLong.long;
                        }
                    }
                    Object.keys(nodeData).forEach((data) => {
                        if (nodeData[data] == '') {
                            nodeData[data] = null
                        }
                    });
                    const retRes = await modifyProfile('nodes', nodeId, nodeData); // execute patch query
                    if (retRes.status == 200) {
                        res.status(200).json({ mesage: "Node updated" }); // if OK return status
                    } else {
                        res.status(retRes.status).json({ message: retRes.data }); //else return error
                    }
                }
            }
        } catch (error) {
            // console.log(error)
            logDebugInfo('error', 'update_node', 'nodes', error.message, error.stack);
            res.status(500).json({ message: "Server Error " + error.message });
        }
    }
}
module.exports = NodeAdmin;