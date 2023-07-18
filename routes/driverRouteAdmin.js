
const { queryInsertDriverRoute, queryBatchInsertTransitRoute, queryDRoutesFilter, queryAll, findPointsOfInterestBetweenPolygon, qGetWaypointDistance, updateRouteIntermediateNodes } = require('../utilities/query');
const { logDebugInfo } = require('../utilities/logger');
const { getRouteInfo, findParallelLines, getDistances, hasSignificantCurve, formatNodeData } = require('../utilities/utilities')

const createDriverRoute = async (req, res) => {
    try {
        if (!req.body.row || Object.keys(req.body.row).length < 10 || (Object.keys(req.body.row).filter(col_name => !['droute_name', 'origin_node', 'destination_node', 'departure_time', 'departure_flexibility', 'driver_id', 'capacity', 'max_wait', 'fixed_route', 'droute_dbm_tag'].includes(col_name))).length != 0) {
            return res.status(400).json({ message: 'Invalid Data' });
        } else {
            // const driverRouteData = { ...req.body.row, "droute_dbm_tag": req.body.tag };
            const driverRouteData = req.body.row;
            const qRes = await queryInsertDriverRoute(driverRouteData); // query routes with generic function filter by tags
            if (qRes.status == 201) {
                res.sendStatus(201);
            } else {
                res.status(qRes.status).json({ message: qRes.data }); // error handling
            }
        }
    } catch (error) {
        logDebugInfo('error', 'batch_insert', 'drivers_route', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }

}



// take file buffer
const prepareBulkData = async (fileBuffer, scheduled_wd, schedule_start, schedule_end) => {
    try {
        const results = []; // list to store file data structure
        await fileBuffer
            .toString() // convert buffer to string
            .split('\n') // split each line of string
            .slice(1) // trunc first line as it is header containing columns
            .forEach((line) => {
                const [droute_dbm_tag, droute_name, origin_node, destination_node, arrival_time, departure_time, driver_id, capacity] = line.split(','); // for each line split strig by , delimeter
                if (scheduled_wd == '') {
                    results.push({ droute_dbm_tag: droute_dbm_tag, droute_name: droute_name, origin_node: origin_node, destination_node: destination_node, arrival_time: arrival_time, departure_time: departure_time, driver_id: driver_id, capacity: capacity, fixed_route: 1, schedule_start: schedule_start, schedule_end: schedule_end });
                } else {
                    results.push({ droute_dbm_tag: droute_dbm_tag, droute_name: droute_name, origin_node: origin_node, destination_node: destination_node, arrival_time: arrival_time, departure_time: departure_time, driver_id: driver_id, capacity: capacity, fixed_route: 1, scheduled_weekdays: scheduled_wd });
                }
            }); // push the data as dict in list
        return { status: 200, data: results }; //return data
    } catch (error) {
        logDebugInfo('error', 'prepare_bulk_data', '', error.message, error.stack);
        return { status: 500, message: "Server Error " + error.message };
    }
}



const importDriverTransitScheduleRoutes = async (req, res) => {
    try {
        // console.log(typeof (req.body.scheduled_weekdays), req.body.scheduled_weekdays);

        if (!req.body.scheduled_weekdays && !req.body.scheduled_start && !req.body.scheduled_end) {
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
        const batchTransitData = await prepareBulkData(req.files[0].buffer, req.body.scheduled_weekdays, req.body.scheduled_start, req.body.scheduled_end); // prepare data to insert

        if (batchTransitData.status == 200) {
            const retRes = await queryBatchInsertTransitRoute(batchTransitData.data); // execute batch query if data prepared

            if (retRes.status != 500) {
                res.sendStatus(retRes.status); // if no error occured then return 200
            } else {
                res.status(retRes.status).json({ message: retRes.data ? retRes.data : null }); // else return log file
            }
        } else {
            res.status(batchTransitData.status).json({ message: batchTransitData.data }); // batch data processing failed return error
        }
    } catch (error) {
        logDebugInfo('error', 'batch_transit_insert', 'driver_routes', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}

const filterDRouteByDNodeTW = async (req, res) => {
    try {
        if (!req.query.nodeId || !req.query.nodeStartArrivalTime || !req.query.nodeEndArrivalTime) {
            return res.status(400).json({ message: 'Invalid Data' });
        } else {
            const qRes = await queryDRoutesFilter({ "nodeId": req.query.nodeId, "startTimeWindow": req.query.nodeStartArrivalTime, "endTimeWindow": req.query.nodeEndArrivalTime }); // query routes with generic function filter by tags

            // for (let rroute of qRes.data) {
            //     const routeInfo = await getRouteInfo([rroute.origin_node.long, rroute.origin_node.lat], [rroute.destination_node.long, rroute.destination_node.lat]);
            //     let waypointNodes = [];
            //     for (let i = 0; i < routeInfo.routes[0].legs[0].steps.length - 1; i++) {
            //         let waypointStart = routeInfo.routes[0].legs[0].steps[i].geometry.coordinates[0];
            //         let waypointEnd = routeInfo.routes[0].legs[0].steps[i].geometry.coordinates[routeInfo.routes[0].legs[0].steps[i].geometry.coordinates.length - 1];
            //         waypointNodes.push({ 'waypointStart': waypointStart, 'waypointEnd': waypointEnd });
            //     }
            //     rroute.WaypointsGIS = waypointNodes;
            //     rroute.geometry = routeInfo.routes[0].geometry.coordinates;
            // }


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
                let inter = []

                // const routeInfo = await getRouteInfo([droute.origin_node.long, droute.origin_node.lat], [droute.destination_node.long, droute.destination_node.lat]);
                for (let j = 0; j < nodesData.data.length; j++) {

                    for (let i = 0; i < routeInfo.routes[0].legs[0].steps.length - 1; i++) {

                        let waypointStart = routeInfo.routes[0].legs[0].steps[i].geometry.coordinates[0];
                        let waypointEnd = routeInfo.routes[0].legs[0].steps[i].geometry.coordinates[routeInfo.routes[0].legs[0].steps[i].geometry.coordinates.length - 1];
                        waypointNodes.push({ 'waypointStart': waypointStart, 'waypointEnd': waypointEnd });

                        let allPoints = routeInfo.routes[0].legs[0].steps[i].geometry.coordinates

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
                let intermediateNodes = formatNodeData(nodesData.data, (await qGetWaypointDistance(req.headers.cookies)).data).map((wp_node) => {
                    if (wp_node.isWaypoint) {
                        return wp_node;
                    }
                }).filter(Boolean);

                droute.intermediate_nodes_list = intermediateNodes.map(iNode => iNode.node_id).join(',');

                await updateRouteIntermediateNodes('droutes', droute.intermediate_nodes_list, droute.droute_id);

                droute.intermediateNodes = intermediateNodes;
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
        // console.log(error)
        logDebugInfo('error', 'filter_droutes_tw', 'driver_route', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}


const listDRouteNodes = async (req, res) => {
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


module.exports = { createDriverRoute, importDriverTransitScheduleRoutes, filterDRouteByDNodeTW, listDRouteNodes };