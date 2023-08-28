// both moment and moment time zone library is used to normalize time conversion issue betweeen server<->frontend<->database
const moment = require('moment');
require('moment-timezone');

const { logDebugInfo } = require('../utilities/logger');
const { queryAll, queryCreate, queryFilter, modifyProfile, queryRemove, deleteWhereById, queryBatchInsert, queryInsertPic, queryDistinctRoutes, queryDeleteRoutesByTag } = require('../utilities/query');


// create driver profile
const createDriverProfile = async (req, res) => {
    try {
        const driverBio = req.body;
        if (!driverBio || Object.keys(driverBio).length === 0) { // validate rider data if invalid return bad request
            res.status(400).json({ message: "Invalid Data" })
        } else {
            const retResult = await queryCreate('drivers', driverBio); // insert query data in database
            if (retResult.status == 200) {
                res.status(200).json({ 'created_record_id': retResult.data }); // if status is OK return record id
            } else {
                res.status(retResult.status).json({ message: retResult.data }); //else return error data
            }
        }
    } catch (error) {
        logDebugInfo('error', 'create_driver_profile', 'drivers', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}


// search drivers based on filter object provided
const searchDrivers = async (req, res) => {
    try {
        const driverName = req.query.name;
        const pageNumber = req.query.pageNumber;
        if (!driverName) { // validate if filter data is in correct format
            res.status(400).json({ message: "Invalid Data" })
        } else {
            const driverList = await queryFilter('drivers', driverName, pageNumber); // insert in database
            if (driverList.status == 200) { // error handling
                if (driverList.data.length == 0) {
                    res.status(200).json({ message: "No rider found" });
                } else {
                    res.status(200).json({ 'drivers': driverList.data });
                }
            } else {
                res.status(driverList.status).json({ message: driverList.data });
            }
        }
    } catch (error) {
        logDebugInfo('error', 'searchDriver', 'drivers', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}


// update driver based on provided data
const patchDriver = async (req, res) => {
    try {
        const driverId = req.body.id;
        const driverDetails = req.body.data;
        if (!driverId || !driverDetails) { // validate filters and user id if invalid return error
            res.status(400).json({ message: "Invalid Data" })
        } else {
            const retRes = await modifyProfile('drivers', driverId, driverDetails); // execute patch query
            if (retRes.status == 200) {
                res.sendStatus(200); // if OK return status
            } else {
                res.status(retRes.status).json({ message: retRes.data }); //else return error
            }
        }
    } catch (error) {
        logDebugInfo('error', 'update_driver', 'drivers', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}

// delete driver based on id
const deleteDriver = async (req, res) => {
    try {
        const driverId = req.query.driver_id;
        if (!driverId) { //validate driver id
            res.status(400).json({ message: "Invalid Data" }) // if invalid return error
        } else {
            const retRes = await queryRemove('drivers', driverId); // execute remove query

            if (retRes.status != 400) { // if OK return status
                res.sendStatus(retRes.status);
            } else {
                res.status(retRes.status).json({ message: retRes.data }); // else return error
            }
        }
    } catch (error) {
        logDebugInfo('error', 'delete_driver', 'drivers', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}


// list available drivers
const listDrivers = async (req, res) => {
    try {
        const driverList = await queryAll('drivers', columnName = '', columnvalue = null, pagination = req.query.pageNumber); // execute list query
        if (driverList.status == 200) {
            res.status(200).json({ "drivers": driverList.data }); // if response is OK return data
        } else {
            res.status(driverList.status).json({ message: driverList.data }); // else return error
        }
    } catch (error) {
        logDebugInfo('error', 'list_drivers', 'drivers', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}


// list all driver routes 
const listDriverRoutes = async (req, res) => {
    try {
        const driverId = req.query.driver_id;
        const RouteTags = (req.query.tagsList != null && req.query.tagsList != '') ? req.query.tagsList.split(',') : [];

        // if (!driverId) { // validate rider id
        //     res.status(400).json({ message: "Invalid Data" })
        // } else {
        const driverRouteList = await queryAll('droutes', !driverId ? RouteTags.length > 0 ? 'droute_dbm_tag' : '' : 'driver_id', !driverId ? RouteTags.length > 0 ? RouteTags : null : driverId, req.query.pageNumber); // if not valid return error else execute fetch query
        if (driverRouteList.status == 200) {
            // there is problem of date conversion from local to UTC. 
            const convertedData = await Promise.all(driverRouteList.data.map(async (obj) => {  // iterate over returned data and normalize the dates.
                const convertedTimestamp = obj.departure_time ? (await normalizeTimeZone(obj.departure_time)) : obj.departure_time;
                return { ...obj, departure_time: convertedTimestamp };  // return updated object with new value
            }));
            res.status(200).json({ "driver_routes": convertedData });   // return converted data
        } else {
            res.status(driverRouteList.status).json({ message: driverRouteList.data }); // error handling
        }
        // }
    } catch (error) {
        logDebugInfo('error', 'list_driver_routes_driverid', 'droutes', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}


// takes iso standard datetime string and normalizes it
normalizeTimeZone = async (datetimestamp) => {
    const serverTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;  // get server time zone offset to either add/subtract from date
    const convertedTimestamp = moment(datetimestamp) // convert the date in "YYYY-MM-DD HH:MM:SS" format
        .tz(serverTimezone)

    if (convertedTimestamp.clone().format("YYYY-MM-DD HH:mm:ss").indexOf("1970-01-01") !== -1) {
        return convertedTimestamp.clone().format("HH:mm");
    }
    return convertedTimestamp.clone().format("YYYY-MM-DD HH:mm");
}


const getDRouteTags = async (req, res) => {
    try {
        const routeTagList = await queryDistinctRoutes('droutes'); // query routes tags with generic function
        if (routeTagList.status == 200) {
            res.status(200).json({ "route_tags": await routeTagList.data.map(item => item.droute_dbm_tag !== null ? item.droute_dbm_tag.trim() : null).filter(f => f != null) }); // return data
        } else {
            res.status(routeTagList.status).json({ message: routeTagList.data }); // error handling
        }
    } catch (error) {
        logDebugInfo('error', 'get_droute_tags', 'droutes', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}


const filterDRouteByTags = async (req, res) => {
    try {
        const dRouteTags = (req.query.tagsList).split(',');
        if (!dRouteTags || dRouteTags.length < 1) { // validate if file uploaded
            return res.status(400).json({ message: 'Invalid Data' });
        } else {
            const routeList = await queryAll('droutes', 'droute_dbm_tag', dRouteTags); // query routes with generic function filter by tags
            if (routeList.status == 200) {
                const convertedData = await Promise.all(routeList.data.map(async (obj) => { // if status is 200. process data
                    // there is problem of date conversion from local to UTC. 
                    const convertedTimestamp = await normalizeTimeZone(obj.departure_time); // iterate over returned data and normalize the dates.
                    return { ...obj, departure_time: convertedTimestamp }; // retuen updated object with new value
                }));
                res.status(200).json({ "driver_routes": convertedData });  // return converted data
            } else {
                res.status(routeList.status).json({ message: routeList.data }); // error handling
            }
        }
    } catch (error) {
        logDebugInfo('error', 'batch_insert', 'riders', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}



const deleteDRouteByTags = async (req, res) => {
    try {
        const dRouteTags = (req.query.tagsList).split(',');
        if (!dRouteTags || dRouteTags.length < 1) { // validate if file uploaded
            return res.status(400).json({ message: 'Invalid Data' });
        } else {
            const routeList = await queryDeleteRoutesByTag('droutes', dRouteTags); // query routes with generic function filter by tags
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



// delete particular driver route 
const deleteDriverRoute = async (req, res) => {
    try {
        const dRouteId = req.query.droute_id;
        if (!dRouteId) {  // validate route id 
            res.status(400).json({ message: "Invalid Data" }) // return if error
        } else {
            const retRes = await deleteWhereById('droutes', dRouteId); // execute fetch query

            if (retRes.status != 400) {
                res.sendStatus(retRes.status);  // if no error occured return Ok
            } else {
                res.status(retRes.status).json({ message: retRes.data }); // return error
            }
        }
    } catch (error) {
        logDebugInfo('error', 'delete_driver_route_drouteid', 'droutes', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}

// take file buffer
const prepareBulkData = async (fileBuffer) => {
    try {
        const results = [];  // list to store file data structure
        await fileBuffer
            .toString() // convert buffer to string
            .split('\r\n') // split each line of string
            .slice(1) // trunc first line as it is header containing columns
            .forEach((line) => {
                const [firstName, lastName, description, address, city, stateProvince, zipPostalCode, capacity] = line.split(','); // for each line split strig by , delimeter
                results.push({ first_name: firstName, last_name: lastName, description: description, address: address, city: city, state_province: stateProvince, zip_postal_code: zipPostalCode, capacity: capacity, });
            }); // push the data as dict in list
        return { status: 200, data: results }; //return data
    } catch (error) {
        logDebugInfo('error', 'prepare_bulk_data', '', error.message, error.stack);
        return { status: 500, message: "Server Error " + error.message };
    }
}


// upload drivers using single csv file
// takes file converts it into stream
// process data and convert into object readable form
// it inserts data row by row
// log is maintained for any possible errord
const batchImportDrivers = async (req, res) => {
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

        if (header.length != 8 ||
            (header.filter(col_name => !['first_name', 'last_name', 'description', 'address', 'city', 'state_province', 'zip_postal_code', 'capacity'].includes(col_name))).length != 0) {
            return res.status(400).json({ message: 'Invalid column length' });
        }

        const batchDriverdata = await prepareBulkData(req.files[0].buffer); // prepare data to insert

        if (batchDriverdata.status == 200) {
            const retRes = await queryBatchInsert('drivers', batchDriverdata.data); // execute batch query if data prepared

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
            //         }
            //     });
            //     res.status(200).json({ message: 'Bulk data inserted successfully' });
            // } catch (error) {
            //     res.status(500).json({ message: 'Error inserting bulk data', error: error.message });
            // }
        } else {
            res.status(batchDriverdata.status).json({ message: batchDriverdata.data }); // batch data processing failed return error
        }
    } catch (error) {
        logDebugInfo('error', 'batch_insert', 'drivers', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}


const uploadDriverProfilePic = async (req, res) => {
    try {
        const driverId = req.body.driver_id;

        if (!req.files[0] || !driverId) { // validate if file uploaded
            return res.status(400).json({ message: 'No file uploaded' });
        }
        if (req.files[0].mimetype.split('/')[0] != 'image') { // check if file mimetype is image
            return res.status(400).json({ message: 'Unsupported file type' });
        }
        // const retResult = await queryInsertPic(driverId, 'dprofiles', `data:${req.files[0].mimetype};base64,`.concat((req.files[0].buffer).toString('base64')), 'driver_id');
        const retResult = await queryInsertPic(driverId, 'drivers', `data:${req.files[0].mimetype};base64,`.concat((req.files[0].buffer).toString('base64')), 'driver_id');
        if (retResult.status == 200) {
            res.sendStatus(200);
        } else {
            res.status(retResult.status).json({ message: retResult.data })
        }
    } catch (error) {
        logDebugInfo('error', 'upload_profile_pic', 'drivers', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
}


module.exports = { listDrivers, createDriverProfile, searchDrivers, patchDriver, deleteDriver, deleteDriverRoute, batchImportDrivers, listDriverRoutes, uploadDriverProfilePic, getDRouteTags, filterDRouteByTags, deleteDRouteByTags };