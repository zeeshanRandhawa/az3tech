const { getNodeCoordinates, queryDRoutesFilter, queryAll, findPointsOfInterestBetweenPolygon, qGetWaypointDistance, updateRouteIntermediateNodes, qBatchInsertDriverRoutes } = require('../utilities/query');
const { logDebugInfo } = require('../utilities/logger');
const { sortRouteNodeList, getOrigDestNode, getRouteInfo, findParallelLines, getDistances, hasSignificantCurve, formatNodeData, fetchDistanceDurationFromCoordinates } = require('../utilities/utilities');
const moment = require('moment');
const { readFile, writeFile } = require('node:fs/promises');
const { fork } = require('child_process');


class DriverRoute {
    constructor(io) {
        this.processList = {}
        this.io = io
        this.initializeSocket();
    }

    initializeSocket() {
        try {
            this.io.on('connect', (socket) => {
                socket.on('sessionTokenDriverRouteBatch', async (message) => {
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
                socket.on("poolStatusDriverRouteBatch", async (message) => {
                    const email = await queryAll('sessions', 'session_token', message, null, ['email']);
                    if (email.data[0].email in this.processList) {
                        let currentMessage = this.processList[email.data[0].email].message
                        socket.emit("uploadStatusDriverRouteBatch", { 'message': currentMessage })
                    }
                });
            });
        } catch (error) {
        }
    }

    startChildProcess(authToken) {
        try {
            const forked = fork('./utilities/driverroutebatch.js', [authToken]);

            forked.on('close', (code) => {
                const currentPid = forked.pid;
                let keyToDelete = null;
                for (let key in this.processList) {
                    if (this.processList[key].childProcess.pid == currentPid) {
                        keyToDelete = key;
                        this.processList[key].sockets.forEach((sckt) => {
                            sckt.emit('uploadStatusDriverRouteBatch', { 'message': 'completed' });
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
                                sckt.emit('uploadStatusDriverRouteBatch', { 'message': message.split(':')[1] });
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


    writeJsonToFile = async (jsonStr) => {
        await writeFile(`./utilities/uploadfiles/driverroutebatch.json`, jsonStr, 'utf8', (err) => {
            if (err) {
                return;
            }
        });
    }


    prepareDriverRouteBatchMetaData = (fileData) => {
        try {
            // group routes by name
            const routeGroup = {}
            for (let line of fileData) { // iterate over data
                if (line.trim() !== '' && !line.split(',').every((column) => column.trim() === '')) { //excluse empty line
                    // take data from line after splitting
                    let [droute_name, origin_node, destination_node, departure_time, departure_flexibility, driver_id, capacity, max_wait, fixed_route, droute_dbm_tag] = line.split(',');
                    // correct format of date time to be used in time calculation for arrival and departure time
                    departure_time = moment.utc(departure_time, 'M/D/YYYY H:mm').format('YYYY-MM-DD HH:mm')

                    // if droute_name not in list add it and its corresponding data
                    if (!Object.keys(routeGroup).includes(droute_name)) {
                        // holds data of droute table for sinfle entry
                        // status: NEW
                        //contains route_nodes dict
                        // meta route node dat is in route_nodes.initial
                        // calculated route_nodes will go in route_nodes.final
                        routeGroup[droute_name] = { origin_node: null, destination_node: null, departure_time: departure_time, capacity: capacity, max_wait: max_wait, status: "NEW", driver_id: driver_id, droute_dbm_tag: droute_dbm_tag, droute_name: droute_name, departure_flexibility: departure_flexibility, scheduled_weekdays: null, intermediate_nodes_list: null, fixed_route: fixed_route === '1' ? true : false, route_nodes: { initial: [], final: [] } }

                        // of it is first index then need to manual;y set up initial adn final
                        routeGroup[droute_name].route_nodes.initial.push({ origin_node: parseInt(origin_node, 10), destination_node: parseInt(destination_node, 10) });
                        routeGroup[droute_name].route_nodes.final = []
                    } else {
                        // else insert nodes pairs
                        routeGroup[droute_name].route_nodes.initial.push({ origin_node: parseInt(origin_node, 10), destination_node: parseInt(destination_node, 10) });
                        // routeGroup[droute_name].destination_node = destination_node
                    }
                }
            };
            return { status: 200, data: routeGroup };
        } catch (error) {
            return { status: 500, message: "Server Error " + error.message };
        }
    }

    batchImportDriverRoutes = async (req, res) => {
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
                .split('\r\n') // split each line of string
                .slice(0, 1)[0] // trunc first line as it is header containing columns)
                .split(',');


            if (header.length != 10 ||
                (header.filter(col_name => !['droute_name', 'origin_node', 'destination_node', 'departure_time', 'departure_flexibility', 'driver_id', 'capacity', 'max_wait', 'fixed_route', 'droute_dbm_tag'
                ].includes(col_name))).length != 0) {
                return res.status(400).json({ message: 'Invalid column length' });
            }

            //prepare meta data for nodes generation
            // it takes string of file buffer and splits the variables
            let riderRoutesMetaBatchData = this.prepareDriverRouteBatchMetaData(req.files[0].buffer.toString().split('\r\n').slice(1));
            if (riderRoutesMetaBatchData.status == 200) {

                await this.writeJsonToFile(JSON.stringify({ 'routeNodes': riderRoutesMetaBatchData.data }));
                const email = await queryAll('sessions', 'session_token', req.headers.cookies, null, ['email']);

                const childP = this.startChildProcess(req.headers.cookies);

                if (email.data[0].email in this.processList) {
                    this.processList[email.data[0].email].childProcess = childP;
                    this.processList[email.data[0].email].status = 'running'
                } else {
                    this.processList[email.data[0].email] = { message: '', childProcess: childP, op_type: '', status: 'running', sockets: [] };
                }

                this.processList[email.data[0].email].childProcess = childP;
                this.processList[email.data[0].email].status = 'running'

                res.sendStatus(200);
            } else {
                return res.status(500).json({ message: "Internal server error" })
            }
            // if (riderRoutesMetaBatchData.status == 200) {
            //     riderRoutesMetaBatchData = riderRoutesMetaBatchData.data;

            //     // if batch Meta Data available then calculate route nodes
            //     let generatedDrouteNodes = await generateDrouteNodeFromDrouteBatch(Object.values(riderRoutesMetaBatchData), req.headers.cookies);


            //     // assert if routeNodes are correct in length
            //     generatedDrouteNodes = generatedDrouteNodes.map((dRouteNode) => {
            //         if (dRouteNode.fixed_route && dRouteNode.route_nodes.initial.length == dRouteNode.route_nodes.final.length - 1) {
            //             return dRouteNode;
            //         } else if (!dRouteNode.fixed_route && dRouteNode.route_nodes.initial.length + 1 <= dRouteNode.route_nodes.final.length) {
            //             return dRouteNode
            //         } else {
            //             return
            //         }
            //     }).filter(Boolean);

            //     await qBatchInsertDriverRoutes(generatedDrouteNodes);
            // }
            // res.sendStatus(200)
        } catch (error) {
            logDebugInfo('error', 'batch_insert', 'drivers_route', error.message, error.stack);
            res.status(500).json({ message: "Server Error " + error.message });
        }

    }

    // take file buffer
    prepareTransitRouteMetaBatchData = (fileData, scheduled_wd, schedule_start, schedule_end) => {
        try {
            const routeGroup = {}
            // let oldTime = null;
            for (let line of fileData) { // iterate over data
                if (line.trim() !== '' && !line.split(',').every((column) => column.trim() === '')) { //excluse empty line
                    let [droute_name, origin_node, destination_node, arrival_time, departure_time, driver_id, capacity, droute_dbm_tag] = line.split(',');

                    arrival_time = !arrival_time.trim() ? null : moment.utc(arrival_time, 'H:mm');
                    departure_time = !departure_time.trim() ? null : moment.utc(departure_time, 'H:mm');

                    if (!Object.keys(routeGroup).includes(droute_name)) {
                        routeGroup[droute_name] = {
                            origin_node: null, destination_node: null, departure_time: departure_time,
                            capacity: capacity, status: "NEW", driver_id: driver_id, droute_dbm_tag: droute_dbm_tag, droute_name: droute_name,
                            intermediate_nodes_list: null, fixed_route: true, route_nodes: { initial: [], final: [] }
                        }
                        // if (scheduled_wd == '') {
                        routeGroup[droute_name].schedule_start = schedule_start;
                        routeGroup[droute_name].schedule_end = schedule_end;
                        // } else {
                        routeGroup[droute_name].scheduled_weekdays = scheduled_wd;
                        // }

                        routeGroup[droute_name].route_nodes.initial.push({
                            origin_node: parseInt(origin_node, 10), destination_node: parseInt(destination_node, 10),
                            arrival_time: arrival_time, departure_time: departure_time
                        });
                        // routeGroup[droute_name].route_nodes.final = []
                    } else {
                        routeGroup[droute_name].route_nodes.initial.push({
                            origin_node: parseInt(origin_node, 10), destination_node: parseInt(destination_node, 10),
                            arrival_time: arrival_time, departure_time: departure_time
                        });
                    }
                    // oldTime = moment(arrival_time)
                }
            };
            return { status: 200, data: routeGroup };
        } catch (error) {
            console.log(error);
            return { status: 500, message: "Server Error " + error.message };
        }
    }

    importDriverTransitScheduleRoutes = async (req, res) => {
        try {
            if (!req.body.scheduled_weekdays && (!req.body.scheduled_start && !req.body.scheduled_end)) {
                return res.status(400).json({ message: 'Invalid Data' });
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

            if (header.length != 8 ||
                (header.filter(col_name => !['droute_dbm_tag', 'droute_name', 'origin_node', 'destination_node', 'arrival_time', 'departure_time', 'driver_id', 'capacity'].includes(col_name))).length != 0) {
                return res.status(400).json({ message: 'Invalid column length' });
            }

            const batchTransitMetaData = this.prepareTransitRouteMetaBatchData(req.files[0].buffer.toString().split('\n').slice(1), req.body.scheduled_weekdays, req.body.scheduled_start, req.body.scheduled_end); // prepare data to insert

            // console.log(batchTransitMetaData.data)
            // console.log(batchTransitMetaData.data['BART SF SHORT'].route_nodes)

            let finalTransitRoutes = await this.generateDrouteNodeFromDrouteTransit(Object.values(batchTransitMetaData.data), req.header.cookies);

            finalTransitRoutes = finalTransitRoutes.map((dRouteNode) => {
                if (dRouteNode.fixed_route && dRouteNode.route_nodes.initial.length == dRouteNode.route_nodes.final.length - 1) {
                    return dRouteNode;
                } else {
                    return
                }
            }).filter(Boolean);

            console.log(finalTransitRoutes);

            await qBatchInsertDriverRoutes(finalTransitRoutes);

            res.sendStatus(200)
        } catch (error) {
            console.log(error);
            logDebugInfo('error', 'batch_transit_insert', 'driver_routes', error.message, error.stack);
            res.status(500).json({ message: "Server Error " + error.message });
        }
    }

    generateDrouteNodeFromDrouteTransit = async (routeNodesMeta, authToken) => {
        try {
            // itertae over routeNodesMeta
            // here we will calculate route_nodes.final from route_nodes.initial
            routeNodesMeta = (await Promise.all(routeNodesMeta.map(async (rNodeMeta) => {
                // Now we have the very first orig node and lst destination Node
                // Have to check if it is true
                let origDestNode = getOrigDestNode(rNodeMeta.route_nodes.initial);

                if (!origDestNode.origNode || !origDestNode.destNode) {
                    return;
                }

                // Sort route nodes at first
                rNodeMeta.route_nodes.initial = sortRouteNodeList(rNodeMeta.route_nodes.initial, origDestNode.origNode);

                // we have forst and last node of route
                rNodeMeta.origin_node = origDestNode.origNode;
                rNodeMeta.destination_node = origDestNode.destNode;


                let departure_time = rNodeMeta.departure_time;
                let arrival_time = null;


                // insert first node as origin node having cum_time adn cum_distance as 0
                // capacity_used randomly generated
                let temprouteNode = {
                    droute_id: null, outb_driver_id: rNodeMeta.driver_id, node_id: origDestNode.origNode, arrival_time: arrival_time,
                    departure_time: '1970-01-01 '.concat(departure_time.clone().format('HH:mm')), rank: 0, capacity: rNodeMeta.capacity,
                    capacity_used: Math.floor(Math.random() * rNodeMeta.capacity), cum_distance: 0, cum_time: 0, status: 'ORIGIN'
                };
                rNodeMeta.route_nodes.final.push(temprouteNode);

                let cum_time = 0;
                let cum_distance = 0;

                // itertae over other nodes from initial and calculate route_nodes
                for (let [index, rNode] of rNodeMeta.route_nodes.initial.entries()) {
                    // get long lat from data base
                    let origNodeC = (await getNodeCoordinates(rNodeMeta.route_nodes.initial[index].origin_node)).data;
                    let destNodeC = (await getNodeCoordinates(rNode.destination_node)).data;

                    // calculate distance and duration from api
                    let calculatedDistDur = await fetchDistanceDurationFromCoordinates(`http://143.110.152.222:5000/route/v1/driving/${origNodeC.long},${origNodeC.lat};${destNodeC.long},${destNodeC.lat}?geometries=geojson&overview=false`);

                    // if dist dur not found then return empty object
                    if (!calculatedDistDur.distance || !calculatedDistDur.duration) {
                        return;
                    }

                    if (index !== rNodeMeta.route_nodes.initial.length - 1) {
                        arrival_time = rNodeMeta.route_nodes.initial[index + 1].arrival_time;
                        cum_time += (moment.duration(rNodeMeta.route_nodes.initial[index + 1].departure_time.diff(rNodeMeta.route_nodes.initial[index].departure_time))).asMinutes();
                    } else {
                        cum_time += (moment.duration(rNode.arrival_time.diff(rNodeMeta.route_nodes.initial[index].departure_time))).asMinutes();
                    }

                    cum_distance += calculatedDistDur.distance

                    // if last node then status DESTINARION
                    if (index == rNodeMeta.route_nodes.initial.length - 1) {
                        temprouteNode = {
                            droute_id: null, outb_driver_id: rNodeMeta.driver_id, node_id: rNode.destination_node, arrival_time: '1970-01-01 '.concat(rNode.arrival_time.format('HH:mm')),
                            departure_time: null, rank: index + 1, capacity: rNodeMeta.capacity,
                            capacity_used: Math.floor(Math.random() * rNodeMeta.capacity), cum_distance: cum_distance, cum_time: cum_time, status: 'DESTINATON'
                        };
                        rNodeMeta.destination_node = rNode.origin_node;
                    } else {
                        arrival_time = rNodeMeta.route_nodes.initial[index + 1].arrival_time;

                        // if intermediate node then status POTENTIAL
                        temprouteNode = {
                            droute_id: null, outb_driver_id: rNodeMeta.driver_id, node_id: rNode.destination_node, arrival_time: '1970-01-01 '.concat(rNode.arrival_time.format('HH:mm')),
                            departure_time: '1970-01-01 '.concat(rNodeMeta.route_nodes.initial[index + 1].departure_time.format('HH:mm')), rank: index + 1, capacity: rNodeMeta.capacity,
                            capacity_used: Math.floor(Math.random() * rNodeMeta.capacity), cum_distance: cum_distance, cum_time: cum_time, status: 'POTENTIAL'
                        };
                    }
                    rNodeMeta.route_nodes.final.push(temprouteNode);
                }
                return rNodeMeta;
            }))).filter(Boolean);

            return routeNodesMeta;
        } catch (error) {
            console.log(error);
        }
    }

    filterDRouteByDNodeTW = async (req, res) => {
        try {
            if (!req.query.nodeId || !req.query.nodeStartArrivalTime || !req.query.nodeEndArrivalTime) {
                return res.status(400).json({ message: 'Invalid Data' });
            } else {
                const qRes = await queryDRoutesFilter({ "nodeId": req.query.nodeId, "startTimeWindow": req.query.nodeStartArrivalTime, "endTimeWindow": req.query.nodeEndArrivalTime }); // query routes with generic function filter by tags

                for (let droute of qRes.data) {

                    let waypointNodes = [];
                    let dataPoints = [];
                    dataPoints.push([droute.origin_node.long, droute.origin_node.lat]);
                    dataPoints.push([droute.destination_node.long, droute.destination_node.lat]);

                    // calculate edges of square polygon
                    // takes two long;lat points
                    // return 4 points of polygon
                    let source = dataPoints[0];
                    let destination = dataPoints[1];
                    dataPoints = findParallelLines(dataPoints);

                    // return nodes of interest in polygon
                    let nodesData = await findPointsOfInterestBetweenPolygon(dataPoints);

                    //gets osrm route complete details
                    let routeInfo = await getRouteInfo(source, destination);

                    // const routeInfo = await getRouteInfo([droute.origin_node.long, droute.origin_node.lat], [droute.destination_node.long, droute.destination_node.lat]);
                    for (let j = 0; j < nodesData.data.length; j++) {

                        for (let i = 0; i < routeInfo.routes[0].legs[0].steps.length - 1; i++) {

                            let waypointStart = routeInfo.routes[0].legs[0].steps[i].geometry.coordinates[0];
                            let waypointEnd = routeInfo.routes[0].legs[0].steps[i].geometry.coordinates[routeInfo.routes[0].legs[0].steps[i].geometry.coordinates.length - 1];
                            waypointNodes.push({ 'waypointStart': waypointStart, 'waypointEnd': waypointEnd });

                            let allPoints = routeInfo.routes[0].legs[0].steps[i].geometry.coordinates

                            let calculatedintermediateNode = getDistances(waypointStart, waypointEnd, nodesData.data[j], hasSignificantCurve(allPoints), allPoints);

                            if (calculatedintermediateNode.intercepted == true) {
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
                    let intermediateNodes = formatNodeData(nodesData.data, (await qGetWaypointDistance(req.headers.cookies)).data).map((wp_node) => {
                        if (wp_node.isWaypoint) {
                            return wp_node;
                        }
                    }).filter(Boolean);

                    droute.intermediate_nodes_list = intermediateNodes.map(iNode => iNode.node_id).join(',');

                    await updateRouteIntermediateNodes('droutes', droute.intermediate_nodes_list, droute.droute_id);

                    droute.intermediateNodes = intermediateNodes.filter((iNode) => {
                        return (droute.origin_node.lat != iNode.lat && droute.origin_node.long != iNode.long) && (droute.destination_node.lat != iNode.lat && droute.destination_node.long != iNode.long)
                    });
                    droute.WaypointsGIS = waypointNodes;
                    droute.geometry = routeInfo.routes[0].geometry.coordinates;
                }

                if (qRes.status == 200) {
                    if (qRes.data.length == 0) {
                        res.status(qRes.status).json({ message: "No data found" });
                    } else {
                        res.status(qRes.status).json({ routeData: qRes.data });
                    }
                } else {
                    res.status(qRes.status).json({ message: qRes.data }); // error handling
                }
            }
        } catch (error) {
            logDebugInfo('error', 'filter_droutes_tw', 'driver_route', error.message, error.stack);
            res.status(500).json({ message: "Server Error " + error.message });
        }
    }

    listDRouteNodes = async (req, res) => {
        try {
            if (!req.query.routeId) {
                return res.status(400).json({ message: 'Invalid Data' });
            } else {
                const dRouteNodeList = await queryAll('droutenodes', columnName = 'droute_id', columnvalue = parseInt(req.query.routeId), pagination = req.query.pageNumber); // execute rider fetch query
                if (dRouteNodeList.status == 200) {
                    res.status(dRouteNodeList.status).json({ dRouteNodes: dRouteNodeList.data });
                } else {
                    res.status(dRouteNodeList.status).json({ message: dRouteNodeList.data }); // error handling
                }
            }
        } catch (error) {
            logDebugInfo('error', 'query_droute_nodes', 'droutenodes', error.message, error.stack);
            res.status(500).json({ message: "Server Error " + error.message });
        }
    }
}


module.exports = DriverRoute;


