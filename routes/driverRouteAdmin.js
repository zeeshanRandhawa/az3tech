
const { queryInsertDriverRoute, queryBatchInsertTransitRoute, queryDRoutesFilter, queryAll } = require('../utilities/query');
const { logDebugInfo } = require('../utilities/logger');

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
const prepareBulkData = async (fileBuffer, scheduled_wd) => {
    try {
        const results = []; // list to store file data structure
        await fileBuffer
            .toString() // convert buffer to string
            .split('\r\n') // split each line of string
            .slice(1) // trunc first line as it is header containing columns
            .forEach((line) => {
                const [droute_dbm_tag, droute_name, origin_node, destination_node, arrival_time, departure_time, driver_id, capacity] = line.split(','); // for each line split strig by , delimeter
                results.push({ droute_dbm_tag: droute_dbm_tag, droute_name: droute_name, origin_node: origin_node, destination_node: destination_node, arrival_time: arrival_time, departure_time: departure_time, driver_id: driver_id, capacity: capacity, fixed_route: 1, scheduled_weekdays: scheduled_wd });
            }); // push the data as dict in list
        return { status: 200, data: results }; //return data
    } catch (error) {
        logDebugInfo('error', 'prepare_bulk_data', '', error.message, error.stack);
        return { status: 500, message: "Server Error " + error.message };
    }
}



const importDriverTransitScheduleRoutes = async (req, res) => {
    try {
        if (!req.body.scheduled_weekdays) {
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
            .split('\r\n') // split each line of string
            .slice(0, 1)[0] // trunc first line as it is header containing columns)
            .split(',');
        if (header.length != 8 ||
            (header.filter(col_name => !['droute_dbm_tag', 'droute_name', 'origin_node', 'destination_node', 'arrival_time', 'departure_time', 'driver_id', 'capacity'].includes(col_name))).length != 0) {
            return res.status(400).json({ message: 'Invalid column length' });
        }
        const batchTransitData = await prepareBulkData(req.files[0].buffer, req.body.scheduled_weekdays); // prepare data to insert

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
        if (!req.query.nodeId || !req.query.nodeStartArrivalTime || !req.query.nodeEndDepartureTime) {
            return res.status(400).json({ message: 'Invalid Data' });
        } else {
            const qRes = await queryDRoutesFilter({ "nodeId": req.query.nodeId, "startTimeWindow": req.query.nodeStartArrivalTime, "endTimeWindow": req.query.nodeEndDepartureTime }); // query routes with generic function filter by tags
            if (qRes.status == 200) {
                res.status(qRes.status).json({ message: qRes.data });
            } else {
                res.status(qRes.status).json({ message: qRes.data }); // error handling
            }
        }
    } catch (error) {
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