const { getNodeCoordinates, queryDRoutesFilter, queryAll, findPointsOfInterestBetweenPolygon, qGetWaypointDistance, updateRouteIntermediateNodes, qBatchInsertDriverRoutes } = require('../utilities/query');
const { sortRouteNodeList, getOrigDestNode, getRouteInfo, findParallelLines, getDistances, hasSignificantCurve, formatNodeData, fetchDistanceDurationFromCoordinates } = require('../utilities/utilities');
const moment = require('moment');
const { readFile, writeFile } = require('node:fs/promises');


const importGeneratedRouteNodes = async () => {
    try {
        let authToken = process.argv[2];
        console.log(process.argv)

        let riderRoutesMetaBatchData;

        process.send('status:Preparing data from bulk file');

        try {
            let contents = await readFile('./utilities/uploadfiles/driverroutebatch.json', { encoding: 'utf8' });
            contents = JSON.parse(contents);
            riderRoutesMetaBatchData = contents.routeNodes;
        } catch (err) {
            process.send('status:Error');
        }


        process.send('status:Generating cummulative distance duration from node pairs');

        // if batch Meta Data available then calculate route nodes
        let generatedDrouteNodes = await generateDrouteNodeFromDrouteBatch(Object.values(riderRoutesMetaBatchData), authToken);

        process.send('status:Asserting datagenerated');


        // assert if routeNodes are correct in length
        generatedDrouteNodes = generatedDrouteNodes.map((dRouteNode) => {
            if (dRouteNode.fixed_route && dRouteNode.route_nodes.initial.length == dRouteNode.route_nodes.final.length - 1) {
                return dRouteNode;
            } else if (!dRouteNode.fixed_route && dRouteNode.route_nodes.initial.length + 1 <= dRouteNode.route_nodes.final.length) {
                return dRouteNode
            } else {
                return
            }
        }).filter(Boolean);


        await qBatchInsertDriverRoutes(generatedDrouteNodes);

        process.send('status:Batch data insertion completed');
    } catch (error) {
        console.log(error)
        process.send('status:Error');
    }
}

const generateDrouteNodeFromDrouteBatch = async (routeNodesMeta, authToken) => {
    try {
        // itertae over routeNodesMeta
        // here we will calculate route_nodes.final from route_nodes.initial
        routeNodesMeta = (await Promise.all(routeNodesMeta.map(async (rNodeMeta) => {
            // first we iterate for fixed route
            if (rNodeMeta.fixed_route) {
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

                // insert first node as origin node having cum_time adn cum_distance as 0
                // capacity_used randomly generated
                let temprouteNode = {
                    droute_id: null, outb_driver_id: rNodeMeta.driver_id, node_id: origDestNode.origNode, arrival_time: null,
                    departure_time: rNodeMeta.departure_time, max_wait: rNodeMeta.max_wait, rank: 0, capacity: rNodeMeta.capacity,
                    capacity_used: Math.floor(Math.random() * rNodeMeta.capacity), cum_distance: 0, cum_time: 0, status: 'ORIGIN'
                };
                rNodeMeta.route_nodes.final.push(temprouteNode);

                let cum_time = 0;
                let cum_distance = 0;

                // itertae over other nodes from initial and calculate route_nodes
                for (let [index, rNode] of rNodeMeta.route_nodes.initial.entries()) {

                    // get long lat from data base
                    let origNodeC = (await getNodeCoordinates(rNode.origin_node)).data;
                    let destNodeC = (await getNodeCoordinates(rNode.destination_node)).data

                    if (!origNodeC || !destNodeC) {
                        return;
                    }

                    // calculate distance and duration from api
                    let calculatedDistDur = await fetchDistanceDurationFromCoordinates(`http://143.110.152.222:5000/route/v1/driving/${origNodeC.long},${origNodeC.lat};${destNodeC.long},${destNodeC.lat}?geometries=geojson&overview=false`);

                    // if dist sur not found then return empty object
                    if (!calculatedDistDur.distance || !calculatedDistDur.duration) {
                        return;
                    }

                    // calulate arrival time and departure time of node using transit time
                    let arrival_time = (moment.utc(rNodeMeta.departure_time, 'YYYY-MM-DD HH:mm').add(calculatedDistDur.duration, 'seconds'));
                    let departure_time = arrival_time.clone().add(destNodeC.transit_time, 'minutes');

                    // add time and dist
                    cum_time += calculatedDistDur.duration / 60;
                    cum_distance += calculatedDistDur.distance;

                    // if last node then status DESTINARION
                    if (index == rNodeMeta.route_nodes.initial.length - 1) {
                        temprouteNode = {
                            droute_id: null, outb_driver_id: rNodeMeta.driver_id, node_id: rNode.destination_node, arrival_time: arrival_time.format('YYYY-MM-DD HH:mm'),
                            departure_time: null, max_wait: rNodeMeta.max_wait, rank: index + 1, capacity: rNodeMeta.capacity,
                            capacity_used: Math.floor(Math.random() * rNodeMeta.capacity), cum_distance: cum_distance, cum_time: cum_time, status: 'DESTINATON'
                        };
                    } else {
                        // if intermediate node then status POTENTIAL
                        temprouteNode = {
                            droute_id: null, outb_driver_id: rNodeMeta.driver_id, node_id: rNode.destination_node, arrival_time: arrival_time.format('YYYY-MM-DD HH:mm'),
                            departure_time: departure_time.format('YYYY-MM-DD HH:mm'), max_wait: rNodeMeta.max_wait, rank: index + 1, capacity: rNodeMeta.capacity,
                            capacity_used: Math.floor(Math.random() * rNodeMeta.capacity), cum_distance: cum_distance, cum_time: cum_time, status: 'POTENTIAL'
                        };
                    }
                    rNodeMeta.route_nodes.final.push(temprouteNode);
                }
            }
            return rNodeMeta;
        }))).filter(Boolean);

        // repeat process for no fixed route
        routeNodesMeta = (await Promise.all(routeNodesMeta.map(async (rNodeMeta) => {

            if (!rNodeMeta.fixed_route) {
                let origDestNode = getOrigDestNode(rNodeMeta.route_nodes.initial);

                if (!origDestNode.origNode || !origDestNode.destNode) {
                    return;
                }

                // Sort route nodes at first
                rNodeMeta.route_nodes.initial = sortRouteNodeList(rNodeMeta.route_nodes.initial, origDestNode.origNode);

                rNodeMeta.origin_node = origDestNode.origNode;
                rNodeMeta.destination_node = origDestNode.destNode;

                // insert first node as origin node having cum_time adn cum_distance as 0
                // capacity_used randomly generated
                let temprouteNode = {
                    droute_id: null, outb_driver_id: rNodeMeta.driver_id, node_id: origDestNode.origNode, arrival_time: null,
                    departure_time: rNodeMeta.departure_time, max_wait: rNodeMeta.max_wait, rank: 0, capacity: rNodeMeta.capacity,
                    capacity_used: Math.floor(Math.random() * rNodeMeta.capacity), cum_distance: 0, cum_time: 0, status: 'ORIGIN'
                };

                rNodeMeta.route_nodes.final.push(temprouteNode);

                // let cum_time = 0;
                // let cum_distance = 0;

                // insert last node of non fixed route
                let origNodeC = (await getNodeCoordinates(rNodeMeta.route_nodes.initial[0].origin_node)).data;
                let destNodeC = (await getNodeCoordinates(rNodeMeta.route_nodes.initial[0].destination_node)).data

                if (!origNodeC || !destNodeC) {
                    return;
                }

                let calculatedDistDur = await fetchDistanceDurationFromCoordinates(`http://143.110.152.222:5000/route/v1/driving/${origNodeC.long},${origNodeC.lat};${destNodeC.long},${destNodeC.lat}?geometries=geojson&overview=false`);

                if (!calculatedDistDur.distance || !calculatedDistDur.duration) {
                    return;
                }

                let arrival_time = (moment.utc(rNodeMeta.departure_time, 'YYYY-MM-DD HH:mm').add(calculatedDistDur.duration, 'seconds'));

                temprouteNode = {
                    droute_id: null, outb_driver_id: rNodeMeta.driver_id, node_id: rNodeMeta.route_nodes.initial[0].destination_node, arrival_time: arrival_time.format('YYYY-MM-DD HH:mm'),
                    departure_time: null, max_wait: rNodeMeta.max_wait, rank: 1, capacity: rNodeMeta.capacity,
                    capacity_used: Math.floor(Math.random() * rNodeMeta.capacity), cum_distance: calculatedDistDur.distance, cum_time: calculatedDistDur.duration / 60, status: 'DESTINATON'
                };
                rNodeMeta.route_nodes.final.push(temprouteNode);


                // now calculate intermediate nodes
                let intermediateNodes = await findIntermediateNodes(origNodeC, destNodeC, authToken);

                // itertae intermediate node and calculate distance duration 
                for (let interNode of intermediateNodes) {
                    if (interNode.node_id != rNodeMeta.origin_node && interNode.node_id != rNodeMeta.destination_node) {
                        let calculatedDistDur = await fetchDistanceDurationFromCoordinates(`http://143.110.152.222:5000/route/v1/driving/${origNodeC.long},${origNodeC.lat};${interNode.long},${interNode.lat}?geometries=geojson&overview=false`);

                        let arrival_time = (moment.utc(rNodeMeta.departure_time, 'YYYY-MM-DD HH:mm').add(calculatedDistDur.duration, 'seconds'));

                        let temprouteNode = {
                            droute_id: null, outb_driver_id: rNodeMeta.driver_id, node_id: interNode.node_id, arrival_time: arrival_time.format('YYYY-MM-DD HH:mm'),
                            departure_time: null, max_wait: rNodeMeta.max_wait, rank: 1, capacity: rNodeMeta.capacity,
                            capacity_used: Math.floor(Math.random() * rNodeMeta.capacity), cum_distance: calculatedDistDur.distance, cum_time: calculatedDistDur.duration / 60,
                            status: 'DESTINATON'
                        };
                        rNodeMeta.route_nodes.final.push(temprouteNode);
                    }
                }
            }
            return rNodeMeta;

        }))).filter(Boolean);

        return routeNodesMeta;
    } catch (error) {
        console.log(error)
    }
}

findIntermediateNodes = async (origNodeC, destNodeC, authToken) => {

    try {

        let dataPoints = [];
        dataPoints.push([origNodeC.long, origNodeC.lat]);
        dataPoints.push([destNodeC.long, destNodeC.lat]);

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
        let intermediateNodes = formatNodeData(nodesData.data, (await qGetWaypointDistance(authToken)).data).map((wp_node) => {
            if (wp_node.isWaypoint) {
                return wp_node;
            }
        }).filter(Boolean);

        return intermediateNodes;
    } catch (error) {
        console.log(error)
    }
}



importGeneratedRouteNodes()