// const { Readable } = require('stream');
// const csv = require('csv-parser');

// both moment and moment time zone library is used to normalize time conversion issue betweeen server<->frontend<->database
const moment = require('moment');
require('moment-timezone');

const { logDebugInfo } = require('../utilities/logger');
const { queryCreate, queryFilter, modifyProfile, queryRemove, queryAll, purgeRoutes, queryBatchInsert, queryInsertPic, queryDistinctRoutes, queryDeleteRoutesByTag } = require('../utilities/query');


// create rider profile takes rider details as dict object and inserts into database
const createRiderProfile = async (req, res) => {
    try {
        const riderBio = req.body;
        if (!riderBio || Object.keys(riderBio).length === 0) { // check if data is valid
            res.status(400).json({ message: "Invalid Data" })
        } else {
            const retResult = await queryCreate('riders', riderBio); // insert data in databse
            if (retResult.status == 200) { // error handling
                res.status(200).json({ 'created_record_id': retResult.data });
            } else {
                res.status(retResult.status).json({ message: retResult.data });
            }
        }
    } catch (error) {
        logDebugInfo('error', 'create_rider_profile', 'riders', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}


// search riders based on filter object provided
const searchRiders = async (req, res) => {
    try {
        const searchFilters = req.body.filterList
        if (!searchFilters || searchFilters.length < 1) { // validate if filter data is in correct format
            res.status(400).json({ message: "Invalid Data" })
        } else {
            const riderList = await queryFilter('riders', searchFilters); // insert in database
            if (riderList.status == 200) { // error handling
                res.status(200).json({ 'riders': riderList.data });
            } else {
                res.status(riderList.status).json({ message: riderList.data });
            }
        }
    } catch (error) {
        logDebugInfo('error', 'searchRider', 'riders', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}


// update rider based on dict and rider id provided
const patchRider = async (req, res) => {
    try {
        const riderId = req.body.id;
        const riderDetails = req.body.data;
        if (!riderId || !riderDetails) { // check if rider_id and rider data is valid
            res.status(400).json({ message: "Invalid Data" })
        } else {
            const retRes = await modifyProfile('riders', riderId, riderDetails); // insert into database
            if (retRes.status == 200) { // error handling
                res.sendStatus(200);
            } else {
                res.status(retRes.status).json({ message: retRes.data });
            }
        }
    } catch (error) {
        logDebugInfo('error', 'update_rider', 'riders', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}

4
// delete rider based on id. Still return ok even if no rider deleted
const deleteRider = async (req, res) => {
    try {
        const riderId = req.query.rider_id;
        if (!riderId) { // validate rider id
            res.status(400).json({ message: "Invalid Data" })
        } else {
            const retRes = await queryRemove('riders', riderId); // execute query
            if (retRes.status != 400) { // error handling
                res.sendStatus(retRes.status);
            } else {
                res.status(retRes.status).json({ message: retRes.data });
            }
        }
    } catch (error) {
        logDebugInfo('error', 'delete_rider', 'riders', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}


// list available riders 
const listRiders = async (req, res) => {
    try {
        const riderList = await queryAll('riders', columnName = '', columnvalue = null, pagination = req.query.pageNumber); // execute rider fetch query
        if (riderList.status == 200) {
            res.status(200).json({ "riders": riderList.data }); // if response ok return data
        } else {
            res.status(riderList.status).json({ message: riderList.data }); // else return error
        }
    } catch (error) {
        logDebugInfo('error', 'list_riders', 'riders', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}


// list rider routes takes rider id and return routes
const listRiderRoutes = async (req, res) => {
    try {
        const riderId = req.query.rider_id;
        const RouteTags = (req.query.tagsList!=null && req.query.tagsList!='') ? req.query.tagsList.split(',') : [];
        // if (!riderId) { // validate rider id
        //     res.status(400).json({ message: "Invalid Data" })
        // } else {
        const riderRouteList = await queryAll('rroutes', !riderId ? RouteTags.length > 0 ? 'rroute_dbm_tag' : '' : 'rider_id', !riderId ? RouteTags.length > 0 ? RouteTags : null : riderId, req.query.pageNumber); // query rider routes with generic function
        if (riderRouteList.status == 200) {
            const convertedData = await Promise.all(riderRouteList.data.map(async (obj) => { // if status is 200. process data
                // there is problem of date conversion from local to UTC. 
                const convertedTimestamp = await normalizeTimeZone(obj.departure_time); // iterate over returned data and normalize the dates.
                return { ...obj, departure_time: convertedTimestamp }; // retuen updated object with new value
            }));
            res.status(200).json({ "rider_routes": convertedData });  // return converted data
        } else {
            res.status(riderRouteList.status).json({ message: riderRouteList.data }); // error handling
        }
    } catch (error) {
        logDebugInfo('error', 'list_rider_routes_riderid', 'droutes', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}


// takes iso standard datetime string and normalizes it
const normalizeTimeZone = async (datetimestamp) => {
    const serverTimezone = await Intl.DateTimeFormat().resolvedOptions().timeZone; // get server time zone offset to either add/subtract from date
    const convertedTimestamp = await moment(datetimestamp) // convert the date in "YYYY-MM-DD HH:MM:SS" format
        .tz(serverTimezone)
        .format("YYYY-MM-DD HH:mm:ss");
    return convertedTimestamp;
}


// delete particular rider route 
const deleteRiderRoute = async (req, res) => {
    const rRouteId = req.query.rroute_id;
    try {
        if (!rRouteId) { // validate route id 
            res.status(400).json({ message: "Invalid Data" }) // return if error
        } else {
            const retRes = await purgeRoutes('rroutes', rRouteId); // execute fetch query

            if (retRes.status != 400) {
                res.sendStatus(retRes.status); // if no error occured return Ok
            } else {
                res.status(retRes.status).json({ message: retRes.data }); // return error
            }
        }
    } catch (error) {
        logDebugInfo('error', 'delete_rider_route_rrouteid', 'rroutes', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}


const getRRouteTags = async (req, res) => {
    try {
        const routeTagList = await queryDistinctRoutes('rroutes'); // query routes tags with generic function
        if (routeTagList.status == 200) {
            res.status(200).json({ "route_tags": await routeTagList.data.map(item => item.rroute_dbm_tag !== null ? item.rroute_dbm_tag.trim() : null).filter(f => f != null) }); // return data
        } else {
            res.status(routeTagList.status).json({ message: routeTagList.data }); // error handling
        }
    } catch (error) {
        logDebugInfo('error', 'get_rroute_tags', 'rroutes', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}


const filterRRouteByTags = async (req, res) => {
    try {
        const rRouteTags = (req.query.tagsList).split(',');
        if (!rRouteTags || rRouteTags.length < 1) { // validate if file uploaded
            return res.status(400).json({ message: 'Invalid Data' });
        } else {
            const routeList = await queryAll('rroutes', 'rroute_dbm_tag', rRouteTags); // query routes with generic function filter by tags
            if (routeList.status == 200) {
                const convertedData = await Promise.all(routeList.data.map(async (obj) => { // if status is 200. process data
                    // there is problem of date conversion from local to UTC. 
                    const convertedTimestamp = await normalizeTimeZone(obj.departure_time); // iterate over returned data and normalize the dates.
                    return { ...obj, departure_time: convertedTimestamp }; // retuen updated object with new value
                }));
                res.status(200).json({ "rider_routes": convertedData });  // return converted data
            } else {
                res.status(routeList.status).json({ message: routeList.data }); // error handling
            }
        }
    } catch (error) {
        logDebugInfo('error', 'batch_insert', 'riders', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}


const deleteRRouteByTags = async (req, res) => {
    try {
        const rRouteTags = (req.query.tagsList).split(',');
        if (!rRouteTags || rRouteTags.length < 1) { // validate if file uploaded
            return res.status(400).json({ message: 'Invalid Data' });
        } else {
            const routeList = await queryDeleteRoutesByTag('rroutes', rRouteTags); // query routes with generic function filter by tags
            if (routeList.status == 200) {
                res.sendStatus(204);
            } else {
                res.status(routeList.status).json({ message: routeList.data }); // error handling
            }
        }
    } catch (error) {
        // logDebugInfo('error', 'batch_insert', 'riders', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}


// take file buffer
const prepareBulkData = async (fileBuffer) => {
    try {
        const results = []; // list to store file data structure
        await fileBuffer
            .toString() // convert buffer to string
            .split('\r\n') // split each line of string
            .slice(1) // trunc first line as it is header containing columns
            .forEach((line) => {
                const [firstName, lastName, address, city, stateProvince, zipPostalCode] = line.split(','); // for each line split strig by , delimeter
                results.push({ first_name: firstName, last_name: lastName, address: address, city: city, state_province: stateProvince, zip_postal_code: zipPostalCode });
            }); // push the data as dict in list
        return { status: 200, data: results }; //return data
    } catch (error) {
        logDebugInfo('error', 'prepare_bulk_data', '', error.message, error.stack);
        return { status: 500, message: "Server Error " + error.message };
    }
}


// upload riders using single csv file
// takes file converts it into stream
// process data and convert into object readable form
// it inserts data row by row
// log is maintained for any possible errord
const batchImportRiders = async (req, res) => {
    try {
        if (!req.files[0]) { // validate if file uploaded
            return res.status(400).json({ message: 'No file uploaded' });
        }
        console.log(req.files[0].mimetype);
        if (!(['text/csv', 'application/vnd.ms-excel'].includes(req.files[0].mimetype))) { // check if file mimetype is csv
            return res.status(400).json({ message: 'Unsupported file type' });
        }
        const header = req.files[0].buffer
            .toString() // convert buffer to string
            .split('\r\n') // split each line of string
            .slice(0, 1)[0] // trunc first line as it is header containing columns)
            .split(',');

        if (header.length != 6 ||
            (header.filter(col_name => !['first_name', 'last_name', 'address', 'city', 'state_province', 'zip_postal_code'].includes(col_name))).length != 0) {
            return res.status(400).json({ message: 'Invalid column length' });
        }
        const batchRiderdata = await prepareBulkData(req.files[0].buffer); // prepare data to insert

        if (batchRiderdata.status == 200) {
            const retRes = await queryBatchInsert('riders', batchRiderdata.data); // execute batch query if data prepared

            if (retRes.status != 500) {
                res.sendStatus(retRes.status); // if no error occured then return 200
            } else {
                res.status(retRes.status).json({ message: retRes.data ? retRes.data : null }); // else return log file
            }
            // try {
            //     await db.tx(async (t) => {
            //         for (const item of batchRiderdata) {
            //             const query = 'INSERT INTO "riders" (first_name,last_name,address,city,state_province,zip_postal_code) VALUES ($1, $2, $3, $4, $5, $6)';
            //             const values = [item.first_name, item.last_name, item.address, item.city, item.state_province, item.zip_postal_code,];
            //             await t.none(query, values);
            //             console.log(new Date());
            //         }
            //     });
            //     console.log(new Date());
            //     res.status(200).json({ message: 'Bulk data inserted successfully' });
            // } catch (error) {
            //     console.log(new Date());
            //     res.status(500).json({ message: 'Error inserting bulk data', error: error.message });
            // }
        } else {
            res.status(batchRiderdata.status).json({ message: batchRiderdata.data }); // batch data processing failed return error
        }
    } catch (error) {
        logDebugInfo('error', 'batch_insert', 'riders', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}


const uploadRiderProfilePic = async (req, res) => {
    try {
        const riderId = req.body.rider_id;

        if (!req.files[0] || !riderId) { // validate if file uploaded
            return res.status(400).json({ message: 'No file uploaded' });
        }
        if (req.files[0].mimetype.split('/')[0] != 'image') { // check if file mimetype is image
            return res.status(400).json({ message: 'Unsupported file type' });
        }
        // const retResult = await queryInsertPic(riderId, 'rprofiles', `data:${req.files[0].mimetype};base64,`.concat((req.files[0].buffer).toString('base64')), 'rider_id');
        const retResult = await queryInsertPic(riderId, 'riders', `data:${req.files[0].mimetype};base64,`.concat((req.files[0].buffer).toString('base64')), 'rider_id');
        if (retResult.status == 200) {
            res.sendStatus(200);
        } else {
            res.status(retResult.status).json({ message: retResult.data })
        }
    } catch (error) {
        logDebugInfo('error', 'upload_profile_pic', 'riders', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}


module.exports = { createRiderProfile, searchRiders, patchRider, deleteRider, listRiders, deleteRiderRoute, batchImportRiders, listRiderRoutes, uploadRiderProfilePic, getRRouteTags, filterRRouteByTags, deleteRRouteByTags };