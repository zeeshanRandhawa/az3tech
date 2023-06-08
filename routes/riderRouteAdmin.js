
const { queryInsertRiderRoute, queryRRoutesFilter, queryAll } = require('../utilities/query');
const { logDebugInfo } = require('../utilities/logger');

const createRiderRoute = async (req, res) => {
    try {
        if (!req.body.row || Object.keys(req.body.row).length < 12 || (Object.keys(req.body.row).filter(col_name => !['origin_address', 'origin_city', 'origin_state_province', 'origin_zip_postal_code', 'destination_address', 'destination_city', 'destination_state_province', 'destination_zip_postal_code', 'rider_id', 'departure_time', 'time_flexibility', 'rroute_dbm_tag'].includes(col_name))).length != 0) {
            return res.status(400).json({ message: 'Invalid Data' });
        } else {
            const riderRouteData = req.body.row;
            // const riderRouteData = { ...req.body.row, "rroute_dbm_tag": req.body.tag };
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
            if (qRes.status == 200) {
                res.status(qRes.status).json({ message: qRes.data });
            } else {
                res.status(qRes.status).json({ message: qRes.data }); // error handling
            }
        }
    } catch (error) {
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




module.exports = { createRiderRoute, filterRRouteByANodeTW, listRRouteNodes };