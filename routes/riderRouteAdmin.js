
const { queryInsertRiderRoute, queryBulkInsertRiderRoute, queryRRoutesFilter, queryAll, findPointsOfInterestBetweenPolygon, qGetWaypointDistance, updateRouteIntermediateNodes } = require('../utilities/query');
const { logDebugInfo } = require('../utilities/logger');
const { getRouteInfo, findParallelLines, getDistances, hasSignificantCurve, formatNodeData } = require('../utilities/utilities')

const axios = require('axios');
const querystring = require('querystring');

const createRiderRoute = async (req, res) => {
    try {
        if (!req.body.row || Object.keys(req.body.row).length < 12 || (Object.keys(req.body.row).filter(col_name => !['origin_address', 'origin_city', 'origin_state_province', 'origin_zip_postal_code', 'destination_address', 'destination_city', 'destination_state_province', 'destination_zip_postal_code', 'rider_id', 'departure_time', 'time_flexibility', 'rroute_dbm_tag'].includes(col_name))).length != 0) {
            return res.status(400).json({ message: 'Invalid Data' });
        } else {
            const riderRouteData = req.body.row;

            let originLatLong = await axios.get(`https://nominatim.openstreetmap.org/search?q=${querystring.escape((riderRouteData.origin_address.trim()).concat(', ').concat(riderRouteData.origin_city.trim()).concat(', ').concat(riderRouteData.origin_state_province.trim()))}&format=json&addressdetails=1`)
            riderRouteData.origin_lat = originLatLong.data.length > 0 ? originLatLong.data[0].lat : null;
            riderRouteData.origin_long = originLatLong.data.length > 0 ? originLatLong.data[0].lon : null;

            await new Promise(resolve => setTimeout(resolve, 50));
            let destinationLatLong = await axios.get(`https://nominatim.openstreetmap.org/search?q=${querystring.escape((riderRouteData.destination_address.trim()).concat(', ').concat(riderRouteData.destination_city.trim()).concat(', ').concat(riderRouteData.destination_state_province.trim()))}&format=json&addressdetails=1`)
            riderRouteData.destination_lat = destinationLatLong.data.length > 0 ? destinationLatLong.data[0].lat : null;
            riderRouteData.destination_long = destinationLatLong.data.length > 0 ? destinationLatLong.data[0].lon : null;

            const qRes = await queryInsertRiderRoute(riderRouteData); // query routes with generic function filter by tags
            if (qRes.status == 201) {
                res.sendStatus(201);
            } else {
                res.status(qRes.status).json({ message: qRes.data }); // error handling
            }
        }
    } catch (error) {
        logDebugInfo('error', 'batch_insert', 'rider_route', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}

const filterRRouteByANodeTW = async (req, res) => {
    try {
        if (!req.query.nodeId || !req.query.nodeStartDepartureTime || !req.query.nodeEndDepartureTime) {
            return res.status(400).json({ message: 'Invalid Data' });
        } else {
            const qRes = await queryRRoutesFilter({ "nodeId": req.query.nodeId, "startTimeWindow": req.query.nodeStartDepartureTime, "endTimeWindow": req.query.nodeEndDepartureTime }); // query routes with generic function filter by tags

            for (let rroute of qRes.data) {

                let waypointNodes = [];
                let dataPoints = [];
                dataPoints.push([rroute.origin_node.long, rroute.origin_node.lat]);
                dataPoints.push([rroute.destination_node.long, rroute.destination_node.lat]);

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

                // const routeInfo = await getRouteInfo([rroute.origin_node.long, rroute.origin_node.lat], [rroute.destination_node.long, rroute.destination_node.lat]);
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

                rroute.intermediate_nodes_list = intermediateNodes.map(iNode => iNode.node_id).join(',');

                await updateRouteIntermediateNodes('rroutes', rroute.intermediate_nodes_list, rroute.rroute_id);


                rroute.intermediateNodes = intermediateNodes.filter((iNode) => {
                    return (rroute.origin_node.lat != iNode.lat && rroute.origin_node.long != iNode.long) && (rroute.destination_node.lat != iNode.lat && rroute.destination_node.long != iNode.long)
                });

                // console.log(rroute.intermediateNodes)

                rroute.WaypointsGIS = waypointNodes;
                rroute.geometry = routeInfo.routes[0].geometry.coordinates;
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
        logDebugInfo('error', 'filter_rroutes_tw', 'rider_route', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}

const listRRouteNodes = async (req, res) => {
    try {
        if (!req.query.routeId) {
            return res.status(400).json({ message: 'Invalid Data' });
        } else {
            const rRouteNodeList = await queryAll('rroutenodes', columnName = 'rroute_id', columnvalue = parseInt(req.query.routeId), pagination = req.query.pageNumber); // execute rider fetch query
            if (rRouteNodeList.status == 200) {
                res.status(rRouteNodeList.status).json({ rRouteNodes: rRouteNodeList.data });
            } else {
                res.status(rRouteNodeList.status).json({ message: rRouteNodeList.data }); // error handling
            }
        }
    } catch (error) {
        logDebugInfo('error', 'query_rroute_nodes', 'rroutenodes', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}

prepareBulkData = async (fileBuffer) => {
    try {
        const results = []; // list to store file data structure
        await fileBuffer
            .toString() // convert buffer to string
            .split('\r\n') // split each line of string
            .slice(1) // trunc first line as it is header containing columns
            .forEach((line) => {
                const [rroute_dbm_tag, origin_city, destination_city, number_of_routes, mean_departure_time, sigma_departure_time] = line.split(','); // for each line split strig by , delimeter
                results.push({ rroute_dbm_tag: rroute_dbm_tag, origin_city: origin_city, destination_city: destination_city, number_of_routes: number_of_routes, mean_departure_time: mean_departure_time, sigma_departure_time: sigma_departure_time, status: 'REQUESTED' });
            }); // push the data as dict in list
        return { status: 200, data: results }; //return data
    } catch (error) {
        // console.log(error)
        logDebugInfo('error', 'prepare_bulk_data', '', error.message, error.stack);
        return { status: 500, message: "Server Error " + error.message };
    }
}

const bulkImportRiderRoutes = async (req, res) => {
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

        if (header.length != 6 ||
            (header.filter(col_name => !['rroute_dbm_tag', 'origin_city', 'destination_city', 'number_of_routes', 'mean_departure_time', 'sigma_departure_time'].includes(col_name))).length != 0) {
            return res.status(400).json({ message: 'Invalid column length' });
        }
        const metaRiderRouteData = await prepareBulkData(req.files[0].buffer);

        const riders = await queryAll('riders', '', null, null, ['rider_id'], false, null);

        for (const riderRoute of metaRiderRouteData.data) {
            let originCityNodes = await queryAll('nodes', 'city', riderRoute.origin_city, null, ['node_id'], false, null);
            let destinationCityNodes = await queryAll('nodes', 'city', riderRoute.destination_city, null, ['node_id'], false, null);

            const distributedTime = generateUniformRandomTime(riderRoute.mean_departure_time, riderRoute.sigma_departure_time, riderRoute.number_of_routes);

            if (originCityNodes.data.length == 0 || destinationCityNodes.data.length == 0) {
                return res.status(400).json({ message: 'Invalid origin or destination city name' });
            }

            for (let i = 0; i < riderRoute.number_of_routes; ++i) {
                let randomOriginCity = originCityNodes.data[Math.floor(Math.random() * originCityNodes.data.length)];
                let randomDestinationCity = originCityNodes.data[Math.floor(Math.random() * originCityNodes.data.length)];
                await queryBulkInsertRiderRoute(
                    {
                        rider_id: riders.data[Math.floor(Math.random() * riders.data.length)].rider_id,
                        origin_node: randomOriginCity.node_id,
                        destination_node: randomDestinationCity.node_id,
                        departure_time: distributedTime[i],
                        time_flexibility: Math.floor(Math.random() * 7),
                        rroute_dbm_tag: riderRoute.rroute_dbm_tag,
                        status: riderRoute.status
                    });
            }
        }
        return res.sendStatus(200);
    } catch (error) {
        // console.log(error);
    }
}

// https://nominatim.openstreetmap.org/search/?q=3225%20Danville%20Boulevard%20Alamo%20california&format=json&addressdetails=1

const generateUniformRandomTime = (meanTime, sigmaTime, datasetCount) => {

    const stdMilliseconds = sigmaTime * 60 * 1000; // Convert standard deviation to milliseconds

    const randomDatetimes = [];

    for (let i = 0; i < datasetCount; i++) {
        let u = 0;
        let v = 0;
        let s = 0;

        do {
            u = Math.random() * 2 - 1;
            v = Math.random() * 2 - 1;
            s = u * u + v * v;
        } while (s >= 1 || s === 0);

        const multiplier = Math.sqrt(-2 * Math.log(s) / s);
        const randomOffset = u * multiplier * stdMilliseconds;

        const randomDatetime = new Date((new Date(meanTime)).getTime() + randomOffset);
        randomDatetimes.push(randomDatetime.toISOString().replace('T', ' ').split('.')[0]);
    }
    return randomDatetimes;
}

module.exports = { createRiderRoute, filterRRouteByANodeTW, listRRouteNodes, bulkImportRiderRoutes };