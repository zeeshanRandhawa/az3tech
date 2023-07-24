const { queryInsertDriverRoute, queryBatchInsertTransitRoute, queryDRoutesFilter, queryAll, findPointsOfInterestBetweenPolygon, qGetWaypointDistance, updateRouteIntermediateNodes } = require('../utilities/query');
const { logDebugInfo } = require('../utilities/logger');
const { getRouteInfo, findParallelLines, getDistances, hasSignificantCurve, formatNodeData } = require('../utilities/utilities');
const { destination } = require('@turf/turf');


const prepareMetaBatchData = (fileData) => {
    try {
        const routeGroup = {}
        for (let line of fileData) {
            if (line.trim() !== '') {
                const [droute_name, origin_node, destination_node, departure_time, departure_flexibility, driver_id, capacity, max_wait, fixed_route, droute_dbm_tag] = line.split(',');

                if (!Object.keys(routeGroup).includes(droute_name)) {
                    routeGroup[droute_name] = { origin_node: parseInt(origin_node, 10), destination_node: null, arrival_time: null, departure_time: departure_time, capacity: capacity, max_wait: max_wait, status: "NEW", driver_id: driver_id, droute_dbm_tag: droute_dbm_tag, droute_name: droute_name, departure_flexibility: departure_flexibility, scheduled_weekdays: null, intermediateNodes: null, fixed_route: fixed_route === '1' ? true : false, route_nodes: [] }
                    routeGroup[droute_name].route_nodes.push({ origin_node: parseInt(origin_node, 10), destination_node: parseInt(destination_node, 10) });
                } else {
                    routeGroup[droute_name].route_nodes.push({ origin_node: parseInt(origin_node, 10), destination_node: parseInt(destination_node, 10) });
                    routeGroup[droute_name].destination_node = destination_node
                }
            }
        };
        return { status: 200, data: routeGroup };
    } catch (error) {
        console.log(error)

        return { status: 500, message: "Server Error " + error.message };
    }
}

const generateDrouteNodeFromDroute = async (routeNodesMeta) => {
    routeNodesMeta = await Promise.all(routeNodesMeta.map(async (rNodeMeta) => {
        if (rNodeMeta.fixed_route) {
            checkRouteNodesContinuty(rNodeMeta.route_nodes)
            console.log("\n\n")
            rNodeMeta = await Promise.all(rNodeMeta.route_nodes.map(async (rNode, index) => {
                if (index === 0) {

                } else {
                }
                return rNode;
            }));
            return rNodeMeta;
        }
    }));
}




const checkRouteNodesContinuty = (rNodes) => {

    const originNodeList = rNodes.map(rNode => rNode.origin_node);
    const destinationNodeList = rNodes.map(rNode => rNode.destination_node);

    let actualOriginNodes = [];
    let actualDestinationNodes = [];

    rNodes.forEach((rNode) => {
        if (destinationNodeList.filter(item => item !== rNode.origin_node).length === destinationNodeList.length) {
            actualOriginNodes.push(rNode.origin_node)
        }
        if (originNodeList.filter(item => item !== rNode.destination_node).length === originNodeList.length) {
            actualDestinationNodes.push(rNode.destination_node)
        }
    });
    if (originNodeList.length == 1 && destinationNodeList.length == 1) {
        return true;
    }
    return false;
}

function sortAndReorderList(list) {
    function reorderList(list, startNode) {
        const reorderedList = [];

        let nextNode = startNode;

        while (list.length > 0) {
            const nextIndex = list.findIndex((item) => item.origin_node === nextNode);
            if (nextIndex === -1) {
                break;
            }

            const nextDict = list.splice(nextIndex, 1)[0];
            reorderedList.push(nextDict);
            nextNode = nextDict.destination_node;
        }

        return reorderedList;
    }

    // Sort the list initially based on the origin_node and destination_node.
    const sortedList = list.sort((a, b) => {
        if (a.origin_node !== b.destination_node) {
            return a.origin_node.localeCompare(b.destination_node);
        }
        return a.destination_node.localeCompare(b.origin_node);
    });

    // Find the starting node based on the sorted list.
    const startNode = sortedList[0].origin_node;

    // Reorder the list based on the starting node.
    const reorderedList = reorderList(sortedList, startNode);

    return reorderedList;
}



const batchImportDriverRoutes = async (req, res) => {
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


        if (header.length != 10 ||
            (header.filter(col_name => !['droute_name', 'origin_node', 'destination_node', 'departure_time', 'departure_flexibility', 'driver_id', 'capacity', 'max_wait', 'fixed_route', 'droute_dbm_tag'
            ].includes(col_name))).length != 0) {
            return res.status(400).json({ message: 'Invalid column length' });
        }

        const riderRoutesMetaBatchData = prepareMetaBatchData(req.files[0].buffer.toString().split('\r\n').slice(1));

        if (riderRoutesMetaBatchData.status == 200) {

            const generatedDrouteNodes = generateDrouteNodeFromDroute(Object.values(riderRoutesMetaBatchData.data));
            // console.log(riderRoutesMetaBatchData.data['Morgan-Alameda'].route_nodes[0]);
        }

        res.sendStatus(200)


    } catch (error) {
        console.log(error)
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

                droute.intermediateNodes = droute.intermediateNodes = intermediateNodes.filter((iNode) => {
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

module.exports = { batchImportDriverRoutes, importDriverTransitScheduleRoutes, filterDRouteByDNodeTW, listDRouteNodes };