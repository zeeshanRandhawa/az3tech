const { Pool } = require('pg');
const pgp = require('pg-promise')();

const { logDebugInfo } = require('../utilities/logger');

const pool = new Pool({

  // user: 'postgres',
  // password: '1234',
  // host: 'localhost',
  // port: 5432,
  // database: 'test-transport'

  // user: 'postgres',
  // password: '123456',
  // host: 'localhost',
  // port: 5432,
  // database: 'test-transport'

  user: 'doadmin',
  password: 'AVNS_MHGwE5WNGWUy_wvn_-l',
  host: 'db-postgresql-sfo2-32856-do-user-13737111-0.b.db.ondigitalocean.com',
  port: 25060,
  database: 'az3_deployment',
  ssl: {
    rejectUnauthorized: false,
    require: true
  }
});



// make pg pool it is much better option than pg.connect
// as it maintain a list of connections and closes them automatically f not needed
// const pool = new Pool({
//   user: 'postgres',
//   password: '1234',
//   host: 'localhost',
//   port: 5432,
//   database: 'test-transport'
// });



// used in case of batch file upload
const db = pgp({
  // user: 'postgres',
  // password: '1234',
  // host: 'localhost',
  // port: 5432,
  // database: 'test-transport'

  // user: 'postgres',
  // password: '123456',
  // host: 'localhost',
  // port: 5432,
  // database: 'test-transport'

  user: 'doadmin',
  password: 'AVNS_MHGwE5WNGWUy_wvn_-l',
  host: 'db-postgresql-sfo2-32856-do-user-13737111-0.b.db.ondigitalocean.com',
  port: 25060,
  database: 'az3_deployment',
  ssl: {
    rejectUnauthorized: false,
    require: true
  }

});

const getAllNodes = async () => {
  try {
    const data = await pool.query('SELECT * FROM nodes');
    return data.rows;
  } catch (error) {
  }
}


const qBatchInsertDriverRoutes = async (driverRouteData) => {
  try {

    const routeColumns = Object.keys(driverRouteData[0]).map((str) => str.trim()).filter(str => str != 'route_nodes');
    const routeSetTable = new pgp.helpers.ColumnSet(routeColumns, { table: 'droutes' });

    const routeNodeColumns = Object.keys(driverRouteData[0].route_nodes.final[0]).map((str) => str.trim());
    const routeNodeSetTable = new pgp.helpers.ColumnSet(routeNodeColumns, { table: 'droutenodes' });

    for (const driverRoute of driverRouteData) {

      let insertData = pgp.helpers.insert(driverRoute, routeSetTable);

      await db.tx(async (t) => {
        try {
          let driverRouteId = await t.one(`${insertData} RETURNING droute_id`);

          for (let dRouteNode of driverRoute.route_nodes.final) {
            dRouteNode.droute_id = driverRouteId.droute_id;
            let insertData = pgp.helpers.insert(dRouteNode, routeNodeSetTable);
            await t.none(insertData);
          }

        } catch (error) {
        }
      });
    }
    return { status: 200, message: 'Bulk data inserted successfully' };
  } catch (error) {
    logDebugInfo('error', 'insert_batch_transit_droutes', 'droutes', error.message, error.stack);
    return { status: 500, message: error.message };
  }
}


// check by cookie if user is super admin
const queryGetRole = async (session_token = '', email = '') => {
  try {
    if (session_token != '') {
      const emailData = await pool.query(`SELECT email FROM sessions WHERE session_token='${session_token}'`);
      const data = await pool.query(`SELECT role_type FROM "users" INNER JOIN "roles" ON users.role_id=roles.role_id WHERE users.email='${emailData.rows[0].email}'`);
      return { status: 200, data: data.rows }
    } else {
      const data = await pool.query(`SELECT role_type FROM "users" INNER JOIN "roles" ON users.role_id=roles.role_id WHERE users.email='${email}'`);
      return { status: 200, data: data.rows }
    }
  } catch (error) {
    logDebugInfo('error', 'query_get_role', 'users/roles', error.message, error.stack);
    return { status: 500, data: error.message };
  }
}


const countRows = async (tableName) => {
  const countQuery = `SELECT COUNT(*) FROM "${tableName}"`;
  const count = await pool.query(countQuery);
  return count.rows[0].count;
}

// generic query to query data from tables
// it can have one column in where condition
// for more than one column custom queries are made
const queryAll = async (tableName, columnName = '', columnValue = null, pagination = null, columns = null, distinct = false, groupBy = null, customWhere = '', orderBY = null) => {
  try {
    //make query depends on data type also
    const query = `SELECT ${distinct ? `DISTINCT` : ``} ${columns == null ? `*` : columns.map(col => col).join(',')} FROM "${tableName}"${columnName !== '' ? ' WHERE '.concat(columnName).concat(typeof (columnValue) == 'object' ? ' IN' : '=').concat(typeof (columnValue) == 'string' ? `'${columnValue}'` : typeof (columnValue) == 'object' ? ' ('.concat(columnValue.map(route => `\'${route}\'`).join(', ')).concat(')') : columnValue) : ''} ${customWhere} ${groupBy == null ? `` : `GROUP BY `.concat(groupBy.map(col => col).join(','))}${orderBY != null ? ` ORDER BY ${orderBY} ASC ` : ''}${pagination != null ? ` LIMIT 10 OFFSET ${(pagination - 1) * 10}` : ''}`;
    const data = await pool.query(query); // execute query
    return { status: 200, data: data.rows } // return data
  } catch (error) {
    return { status: 500, data: error.message }; // if error return error message
  }
}


const qSetWaypointDistance = async (sessionToken, waypointDistance) => {
  const email = await queryAll('sessions', 'session_token', sessionToken, null, ['email']);
  const updatequery = `UPDATE users SET waypoint_distance=${waypointDistance} WHERE email='${email.data[0].email}'`;
  await pool.query(updatequery);
  return { status: 200, data: 'configuration updated' };
}
const qGetWaypointDistance = async (sessionToken) => {
  const email = await queryAll('sessions', 'session_token', sessionToken, null, ['email']);
  const waypointDistance = await queryAll('users', 'email', email.data[0].email, null, ['waypoint_distance']);
  return { status: 200, data: waypointDistance.data[0].waypoint_distance };
}


const findPointsOfInterestBetweenPolygon = async (dataPoints) => {
  // const pointQuery = `SELECT lat, long FROM nodes WHERE ((lat - ${dataPoints[0][1]})*(${dataPoints[1][0]} - ${dataPoints[0][0]}) - (long - ${dataPoints[0][0]}) * (${dataPoints[1][1]} - ${dataPoints[0][1]})) >= 0 AND ((lat - ${dataPoints[1][1]}) * (${dataPoints[2][0]} - ${dataPoints[1][0]}) - (long - ${dataPoints[1][0]}) * (${dataPoints[2][1]} - ${dataPoints[1][1]})) >= 0 AND ((lat - ${dataPoints[2][1]}) * (${dataPoints[3][0]} - ${dataPoints[2][0]}) - (long - ${dataPoints[2][0]}) * (${dataPoints[3][1]} - ${dataPoints[2][1]})) >= 0 AND ((lat - ${dataPoints[3][1]}) * (${dataPoints[0][0]} - ${dataPoints[3][0]}) - (long - ${dataPoints[3][0]}) * (${dataPoints[0][1]} - ${dataPoints[3][1]})) >= 0`;
  try {
    const pointQuery = `SELECT * FROM nodes WHERE 
    (((${dataPoints[1][0]} - ${dataPoints[0][0]}) * (long - ${dataPoints[0][0]})) + ((${dataPoints[1][1]} - ${dataPoints[0][1]}) * (lat - ${dataPoints[0][1]}))) >= 0
     AND (((${dataPoints[1][0]} - ${dataPoints[0][0]}) * (long - ${dataPoints[0][0]})) + ((${dataPoints[1][1]} - ${dataPoints[0][1]}) * (lat - ${dataPoints[0][1]}))) <= (((${dataPoints[1][0]} - ${dataPoints[0][0]}) * (${dataPoints[1][0]} - ${dataPoints[0][0]})) + ((${dataPoints[1][1]} - ${dataPoints[0][1]}) * (${dataPoints[1][1]} - ${dataPoints[0][1]})))
      AND (((${dataPoints[2][0]} - ${dataPoints[1][0]}) * (long - ${dataPoints[1][0]})) + ((${dataPoints[2][1]} - ${dataPoints[1][1]}) * (lat - ${dataPoints[1][1]}))) >= 0
       AND (((${dataPoints[2][0]} - ${dataPoints[1][0]}) * (long - ${dataPoints[1][0]})) + ((${dataPoints[2][1]} - ${dataPoints[1][1]}) * (lat - ${dataPoints[1][1]}))) <= (((${dataPoints[2][0]} - ${dataPoints[1][0]}) * (${dataPoints[2][0]} - ${dataPoints[1][0]})) + ((${dataPoints[2][1]} - ${dataPoints[1][1]}) * (${dataPoints[2][1]} - ${dataPoints[1][1]})))`

    const data = await pool.query(pointQuery); // execute query

    return { status: 200, data: data.rows } // return data

  } catch (error) {
    return { status: 500, data: error.message }; // if error return error message
  }
}


// get all table names made by user
const queryTablesName = async () => {
  try {
    const data = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`);
    return { status: 200, data: data.rows };
  } catch (error) {
    logDebugInfo('error', 'get_table_names', 'information_schema.tables', error.message, error.stack);
    return { status: 500, data: error.message };
  }
}


// get rowCount of table
const queryTableRows = async (tableName) => {
  try {
    const data = await pool.query(`SELECT count(*) FROM ${tableName}`);
    return { status: 200, data: data.rows[0].count };
  } catch (error) {
    logDebugInfo('error', 'get_table_row_count', tableName, error.message, error.stack);
    return { status: 500, data: error.message };
  }
}


// return usage (sapce) taken by a table in bytes
const queryTableUsage = async (tableName) => {
  try {
    const data = await pool.query(`SELECT pg_total_relation_size('${tableName}')`);
    return { status: 200, data: data.rows[0].pg_total_relation_size };
  } catch (error) {
    logDebugInfo('error', 'get_table_usage', tableName, error.message, error.stack);
    return { status: 500, data: error.message };
  }
}


// drop specific table if table dropped return OK
const purgeTable = async (tableName) => {
  try {
    if (['sessions', 'users', 'roles'].includes(tableName)) {
      return { status: 400, data: "Cannot delete primary table" };
    }
    await pool.query('BEGIN');
    if (tableName === "riders") {
      await pool.query(`DELETE FROM"${tableName}"`);
    }
    await pool.query(`TRUNCATE TABLE "${tableName}" CASCADE`);

    // if (!['droutenodes', 'rroutenodes'].includes(tableName)) {
    //   await pool.query(`SELECT setval('${tableName}_${tableName.slice(0, -1)}_id_seq', coalesce(max(${tableName.slice(0, -1)}_id), 1), false) FROM "${tableName}";`)
    // }
    await pool.query('COMMIT');
    return { status: 200 };
  } catch (error) {
    await pool.query('ROLLBACK');
    logDebugInfo('error', 'purge_table', tableName, error.message, error.stack);
    return { status: 400, data: error.message };
  }
}


//truncates data based on filters provided
const truncFilteredData = async (purgeList, tableName, id = null) => {
  try {
    const processedQuery = await makeTruncFilterQuery(purgeList, tableName, id); // make trunc query (takes tableName and filter list)
    const truncRes = await pool.query(processedQuery); // execute query
    return { status: 200, rows: truncRes.rowCount !== null ? truncRes.rowCount : 0 }; // if query executed return row count if no row effectd it will return 0
  } catch (error) {
    logDebugInfo('error', 'trunc_filtere_list', tableName, error.message, error.stack);
    return { status: 500, data: error.message };
  }
}

// process trunc filter query (takes list of objects and table name)
const makeTruncFilterQuery = async (filters, tableName, id) => {
  try {
    // let filter_conditions = filters.map(filter => { return ((filter.d_type == 'datetime' && filter.start != undefined) || (filter.d_type != 'datetime' && filter.value != null)) ? filter.name.concat(filter.d_type == 'varchar' ? ' ILIKE ' : '=').concat(filter.d_type == 'datetime' ? `'${filter.value}'` : filter.d_type === 'boolean' ? filter.value === true ? 1 : 0 : filter.d_type == 'varchar' ? `'%${filter.value}%'` : `${filter.value}`) : undefined }).filter(value => value !== null && value !== undefined).join(` and `);
    let filter_conditions = '';
    filters.forEach((fltr) => {
      if ((fltr.d_type === 'datetime' && (fltr.start !== null && fltr.end !== null)) || (fltr.d_type !== 'datetime' && fltr.value !== null)) {
        if (filter_conditions !== '') {
          filter_conditions = filter_conditions.concat(' AND');
        }
        if (fltr.d_type === 'datetime') {
          filter_conditions = filter_conditions.concat(` ${fltr.name}>=\'${fltr.start}:00\' AND ${fltr.name}<=\'${fltr.end}:00\'`);
        } else if (fltr.d_type === 'varchar') {
          filter_conditions = filter_conditions.concat(` ${fltr.name} ILIKE \'%${fltr.value}%\'`);
        } else if (fltr.d_type === 'boolean') {
          filter_conditions = filter_conditions.concat(` ${fltr.name} = `.concat(fltr.value === 'true' ? 1 : 0));
        } else {
          filter_conditions = filter_conditions.concat(` ${fltr.name} = ${fltr.value}`);
        }
      }
    });
    if (filter_conditions !== '') {
      filter_conditions = `DELETE FROM "${tableName}" WHERE `.concat(filter_conditions);
      if (id != null) {
        filter_conditions = filter_conditions.concat(` AND `).concat(tableName === 'rroutes' ? `rider_id=${id}` : `driver_id=${id}`);
      }
      return filter_conditions;
    }
    return '';
  } catch (error) {
    logDebugInfo('error', 'make_trunc_filter_query', tableName, error.message, error.stack);
    return '';
  }
}

// generic query to create either rider or driver
const queryCreate = async (tableName, bioData) => {
  try {
    const bioQuery = `INSERT INTO "${tableName}"(${((Object.keys(bioData)).filter(bioDataKey => bioData[bioDataKey] != null)).join(', ')}) VALUES(${((Object.keys(bioData)).filter(bioDataKey => bioData[bioDataKey] != null)).map(_key => `'${bioData[_key]}'`).join(', ')})`;

    await pool.query(bioQuery);
    const qRes = await pool.query(`SELECT LASTVAL();`) // if data inserted get last row id. It is persistant it will give correct id even if more rows are inserted in other sessions
    return { status: 200, data: qRes.rows[0] };
  }
  catch (error) {
    logDebugInfo('error', 'create_entity', tableName, error.message, error.stack);
    return { status: 500, data: error.message };
  }
}

// return data based on filters provided for riders or drivers
const queryFilter = async (tableName, name, pageNumber) => {
  try {
    // const searchQuery = await makeSearchFilterQuery(tableName, riderSearchFilters); // process filter query
    const qRes = await pool.query(`SELECT * FROM "${tableName}" WHERE first_name ILIKE '%${name}%' OR last_name ILIKE '%${name}%' OR (first_name || ' ' || last_name) ILIKE '%${name}%' LIMIT 10 OFFSET ${(pageNumber - 1) * 10}`); // execute query
    return { status: 200, data: qRes.rows }; // if OK return data
  }
  catch (error) {
    logDebugInfo('error', 'search_data_by_filter', tableName, error.message, error.stack);
    return { status: 500, data: error.message };
  }
}

// process filter query
const makeSearchFilterQuery = async (tableName, SearchFilters) => {
  const query = `SELECT * FROM "${tableName}" WHERE ${SearchFilters.map(filter => filter.name.concat(typeof (filter.value) == 'number' ? filter.operator : filter.operator === '=' ? ' ILIKE ' : ' NOT ILIKE ').concat(typeof (filter.value) == 'number' ? `${filter.value}` : `'%${filter.value}%'`)).join(` and `)}`;
  return query;
}


// update rider or driver 
const modifyProfile = async (tableName, id, details) => {
  try {
    const modifyQuery = await makeUpdateQuery(tableName, id, details); // process update query
    await pool.query(modifyQuery); //execute modify patch query
    return { status: 200 };
  }
  catch (error) {
    logDebugInfo('error', 'update_profile_query', tableName, error.message, error.stack);
    return { status: 400, data: error.message };
  }
}

// process update query
const makeUpdateQuery = async (tableName, uniqueId, details) => { // slicing table name and appending _id based on column
  try {
    const query = `UPDATE "${tableName}" SET ${Object.keys(details).map(column_key => `${column_key}=`.concat(details[column_key] != null ? `'${details[column_key]}'` : 'NULL'))} WHERE ${tableName.slice(0, -1)}_id=${uniqueId}`;
    return query;
  } catch (error) {
    logDebugInfo('error', 'make_update_profile_query', tableName, error.message, error.stack);
    return ''
  }
}


const queryBatchInsert = async (tableName, batchdata) => {
  try {
    let failedData = [];
    // await db.tx(async (t) => {

    const columns = Object.keys(batchdata[0]).map((str) => str.trim());
    const setTable = new pgp.helpers.ColumnSet(columns, { table: tableName });

    for (const data of batchdata) {
      let insertData = pgp.helpers.insert(data, setTable);
      try {
        await db.none(insertData);
      } catch (error) {
        failedData.push({ data: data, message: error.message });
      }
    }
    // });
    if (failedData.length === 0) {
      return { status: 200, message: 'Bulk data inserted successfully' };
    } else {
      return { status: 500, message: 'Error inserting bulk data', data: failedData };
    }
  } catch (error) {
    logDebugInfo('error', 'insert_batch_data', tableName, error.message, error.stack);
    return { status: 500, message: error.message };
  }
}


const queryRemove = async (tableName, uniqueId) => {
  try {
    const delQuery = `DELETE FROM "${tableName}" WHERE ${tableName.slice(0, -1)}_id=${uniqueId}`;
    qRes = await pool.query(delQuery);
    return qRes.rowCount === 0 ? { status: 204 } : { status: 200 };
  }
  catch (error) {
    logDebugInfo('error', 'delete_data_by_id', tableName, error.message, error.stack);
    return { status: 400, data: error.message };
  }
}


const deleteWhereById = async (tableName, routeId) => {
  try {
    const delQuery = `DELETE FROM "${tableName}" WHERE ${tableName.slice(0, -1)}_id=${routeId}`;
    const qRes = await pool.query(delQuery);
    return qRes.rowCount === 0 ? { status: 404, message: "Node does not exists" } : { status: 200, message: "Node removed" };
  }
  catch (error) {
    logDebugInfo('error', 'purge_routes_by_id', tableName, error.message, error.stack);
    return { status: 400, data: error.message };
  }
}


const queryInsertSessionCookie = async (sessionCookie = '', user_email) => {
  try {
    const query = `INSERT INTO "sessions" (session_expire_timestamp, session_token, email) VALUES (LOCALTIMESTAMP(0) + INTERVAL \'1 hour\',\'${sessionCookie}\', \'${user_email}\')`;
    await pool.query(query);
    return { status: 200 };
  } catch (error) {
    logDebugInfo('error', 'update_session_cookie', '', error.message, error.stack);
    return { status: 500, data: error.message };
  }
}


const updateRouteIntermediateNodes = async (tableName, intermediateNodes, route_id) => {
  try {
    const query = `UPDATE ${tableName} SET intermediate_nodes_list='${intermediateNodes}' WHERE ${tableName.slice(0, -1)}_id=${route_id}`;
    await pool.query(query);
    return { status: 200 };
  } catch (error) {
    logDebugInfo('error', 'update_route_intermediate nodes', '', error.message, error.stack);
    return { status: 500, data: error.message };
  }
}

const queryRemoveSessionCookie = async (sessionCookie) => {
  try {
    const query = `DELETE FROM "sessions" WHERE session_token='${sessionCookie}'`;
    await pool.query(query);
    return { status: 200 };
  } catch (error) {
    logDebugInfo('error', 'remove_session_cookie', '', error.message, error.stack);
    return { status: 500, data: error.message };
  }
}

const queryRemoveExpiredSessions = async () => {
  try {
    const query = `DELETE FROM "sessions" WHERE session_expire_timestamp<LOCALTIMESTAMP(0)`;
    await pool.query(query);
    return { status: 200 };
  } catch (error) {
    logDebugInfo('error', 'remove_expired_sessions', 'sessions', error.message, error.stack);
    return { status: 500, data: error.message };
  }
}

const queryDistinctRoutes = async (tableName) => {
  try {
    const data = await pool.query(`SELECT DISTINCT ${tableName.slice(0, 1)}route_dbm_tag FROM "${tableName}" ORDER BY ${tableName.slice(0, 1)}route_dbm_tag ASC`);
    return { status: 200, data: data.rows };
  } catch (error) {
    logDebugInfo('error', 'get_table_usage', tableName, error.message, error.stack);
    return { status: 500, data: error.message };
  }
}


const queryDeleteRoutesByTag = async (tableName, tagsList) => {
  try {
    const query = `DELETE FROM "${tableName}" WHERE ${tableName.slice(0, 1)}route_dbm_tag IN (${tagsList.map(tag => `'${tag}'`).join(', ')})`;
    await pool.query(query);
    return { status: 200 };
  } catch (error) {
    logDebugInfo('error', 'delete_routes_by_tags', 'dr_routes', error.message, error.stack);
    return { status: 500, data: error.message };
  }
}


const queryInsertPic = async (id, tableName, fileBuffer, reference) => {
  try {
    // const query = `INSERT INTO "${tableName}" (${reference}, profile_picture) VALUES (${id}, '${fileBuffer}')`;
    const query = `UPDATE "${tableName}" SET profile_picture='${fileBuffer}' WHERE ${reference}=${id}`;
    await pool.query(query);
    return { status: 200 };
  } catch (error) {
    logDebugInfo('error', 'insert_user_pic', tableName, error.message, error.stack);
    return { status: 500, data: error.message };
  }
}


const queryInsertRiderRoute = async (riderRouteData) => {
  try {
    await pool.query('BEGIN');

    let origin_node_id = await queryInsertNode('origin', { "origin_address": riderRouteData.origin_address, "origin_city": riderRouteData.origin_city, "origin_state_province": riderRouteData.origin_state_province, "origin_zip_postal_code": riderRouteData.origin_zip_postal_code, origin_lat: riderRouteData.origin_lat, origin_long: riderRouteData.origin_long });
    // origin_node_id = (await pool.query(`SELECT LASTVAL()`)).rows[0].lastval  // if data inserted get last row id. It is persistant it will give correct id even if more rows are inserted in other sessions

    let destination_node_id = await queryInsertNode('destination', { "destination_address": riderRouteData.destination_address, "destination_city": riderRouteData.destination_city, "destination_state_province": riderRouteData.destination_state_province, "destination_zip_postal_code": riderRouteData.destination_zip_postal_code, destination_lat: riderRouteData.destination_lat, destination_long: riderRouteData.destination_long });
    // destination_node_id = (await pool.query(`SELECT LASTVAL()`)).rows[0].lastval  // if data inserted get last row id. It is persistant it will give correct id even if more rows are inserted in other sessions

    const insertQuery = `INSERT INTO "rroutes" (rider_id, origin_node, destination_node, departure_time, time_flexibility, rroute_dbm_tag, status) VALUES(\'${riderRouteData.rider_id}\', ${origin_node_id.node_id}, ${destination_node_id.node_id}, \'${riderRouteData.departure_time}\', ${riderRouteData.time_flexibility}, \'${riderRouteData.rroute_dbm_tag}\', \'REQUESTED\')`;
    await pool.query(insertQuery);
    await pool.query('COMMIT');
    return { status: 201 };
  } catch (error) {
    await pool.query('ROLLBACK');
    logDebugInfo('error', 'insert_route', 'rroutes', error.message, error.stack);
    return { status: 500, data: error.message };
  }
}


const queryBulkInsertRiderRoute = async (riderRouteData) => {
  try {
    const insertQuery = `INSERT INTO "rroutes" (rider_id, origin_node, destination_node, departure_time, time_flexibility, rroute_dbm_tag, status) VALUES(\'${riderRouteData.rider_id}\', ${riderRouteData.origin_node}, ${riderRouteData.destination_node}, \'${riderRouteData.departure_time}\', ${riderRouteData.time_flexibility}, \'${riderRouteData.rroute_dbm_tag}\', \'${riderRouteData.status}\')`;
    await pool.query(insertQuery);
    return { status: 201 };
  } catch (error) {
    return { status: 500, data: error.message };
  }
}



const queryInsertDriverRoute = async (driverRouteData) => {
  try {
    const insertQuery = `INSERT INTO "droutes" (driver_id, origin_node, destination_node, departure_time, departure_flexibility, droute_dbm_tag, droute_name, capacity, max_wait, fixed_route) VALUES(${driverRouteData.driver_id}, ${driverRouteData.origin_node}, ${driverRouteData.destination_node}, \'${driverRouteData.departure_time}\', ${driverRouteData.departure_flexibility}, \'${driverRouteData.droute_dbm_tag}\', \'${driverRouteData.droute_name}\', ${driverRouteData.capacity}, ${driverRouteData.max_wait}, ${driverRouteData.fixed_route})`;
    await pool.query(insertQuery);
    return { status: 201 };
  } catch (error) {
    logDebugInfo('error', 'insert_route', 'droutes', error.message, error.stack);
    return { status: 500, data: error.message };
  }
}


const queryInsertNode = async (node_type, nodeData) => {
  try {
    const insertQuery = `INSERT INTO "nodes" (${Object.keys(nodeData).map(d_key => `${d_key.split(node_type.concat('_'))[1]}`).join(',')}) VALUES (${Object.keys(nodeData).map(d_key => {
      return ['origin_lat', 'origin_long', 'destination_lat', 'destination_long'].includes(d_key) ? `${nodeData[d_key]}` : `\'${nodeData[d_key]}\'`
    }).join(',')
      }) RETURNING node_id`
    const node_id = await pool.query(insertQuery);
    return { status: 200, node_id: node_id.rows[0].node_id };
  }
  catch (error) {
    logDebugInfo('error', 'create_node', 'nodes', error.message, error.stack);
    return { status: 500, data: error.message };
  }
}


const queryTableCount = async (tableName, id, tagsList, name) => {
  try {
    let query = null;
    if (['riders', 'drivers'].includes(tableName) && name != null) {
      query = `SELECT COUNT(*) FROM "${tableName}" WHERE first_name ILIKE '%${name}%' OR last_name ILIKE '%${name}%' OR (first_name || ' ' || last_name) ILIKE '%${name}%'`;
    } else {
      query = `SELECT COUNT(*) FROM "${tableName}"${id != null ? tableName == 'rroutes' ? ` WHERE rider_id=${id}` : tableName == 'droutenodes' ? ` WHERE droute_id=${id}` : tableName == 'rroutenodes' ? ` WHERE rroute_id=${id}` : ` WHERE driver_id=${id}` : ''}${tagsList != null ? ` ${id != null ? `AND` : `WHERE`} ${tableName == 'rroutes' ? 'r' : 'd'}route_dbm_tag IN (${tagsList.map(tag => `\'${tag}\'`).join(',')})` : ''}`;
    }
    const countRes = await pool.query(query);

    return { status: 200, data: countRes.rows[0] };
  }
  catch (error) {
    logDebugInfo('error', 'create_node', '', error.message, error.stack);
    return { status: 500, data: error.message };
  }
}


const queryRRoutesFilter = async (filterData) => {
  try {
    const searchQuery = `SELECT * FROM "rroutes" WHERE origin_node=${filterData.nodeId} AND departure_time>=\'${filterData.startTimeWindow}\' AND departure_time<=\'${filterData.endTimeWindow}\'`
    let searchRes = (await pool.query(searchQuery)).rows;

    searchRes = await Promise.all(searchRes.map(async (rrouteData) => {

      rrouteData.origin_node = (await pool.query(`SELECT lat, long FROM nodes WHERE node_id=${rrouteData.origin_node}`)).rows[0];
      rrouteData.destination_node = (await pool.query(`SELECT lat, long FROM nodes WHERE node_id=${rrouteData.destination_node}`)).rows[0];

      let rNodesRes = (await pool.query(`SELECT droute_id, node_id, permutation_id, arrival_time, departure_time, rank, cum_distance, cum_time, status from rroutenodes WHERE rroute_id=${rrouteData.rroute_id} AND rider_id=${rrouteData.rider_id}`)).rows;

      rNodesRes = await Promise.all(rNodesRes.map(async (rrouteNodeData) => {
        let nodesRes = (await pool.query(`SELECT lat, long from nodes WHERE node_id=${rrouteNodeData.node_id}`)).rows;
        return { ...rrouteNodeData, cordinates: nodesRes };
      }));
      return { ...rrouteData, route_nodes: rNodesRes }
    }));

    return { status: 200, data: searchRes };
  }
  catch (error) {
    logDebugInfo('error', 'filter_routes', 'rroutes', error.message, error.stack);
    return { status: 500, data: error.message };
  }
}


const queryDRoutesFilter = async (filterData) => {
  try {
    let searchQuery = `SELECT * FROM "droutes" WHERE destination_node=${filterData.nodeId}`;
    let searchRes = (await pool.query(searchQuery)).rows;


    searchRes = await Promise.all(searchRes.map(async (drouteData) => {
      drouteData.origin_node = (await pool.query(`SELECT lat, long FROM nodes WHERE node_id=${drouteData.origin_node}`)).rows[0];
      drouteData.destination_node = (await pool.query(`SELECT lat, long FROM nodes WHERE node_id=${drouteData.destination_node}`)).rows[0];

      let rNodesRes = (await pool.query(`SELECT droute_id, node_id, permutation_id, arrival_time, departure_time, rank, cum_distance, cum_time,capacity_used, status from droutenodes WHERE droute_id=${drouteData.droute_id} AND outb_driver_id=${drouteData.driver_id} AND arrival_time>=\'${filterData.startTimeWindow}\' AND arrival_time<=\'${filterData.endTimeWindow}\'`)).rows;
      if (rNodesRes.length > 0) {
        rNodesRes = await Promise.all(rNodesRes.map(async (drouteNodeData) => {
          let nodesRes = (await pool.query(`SELECT lat, long from nodes WHERE node_id=${drouteNodeData.node_id}`)).rows;
          return { ...drouteNodeData, cordinates: nodesRes };
        }));
        return { ...drouteData, route_nodes: rNodesRes };
      } else {
        return {};
      }
    }));
    searchRes = searchRes.filter(obj => Object.keys(obj).length != 0);


    if (searchRes.length) {
      let intersecting_routes = (await pool.query(`SELECT droute_id, node_id,outb_driver_id, permutation_id, arrival_time, departure_time, rank, cum_distance, cum_time,capacity_used, status from droutenodes WHERE ((arrival_time>=\'${filterData.startTimeWindow}\' AND arrival_time<=\'${filterData.endTimeWindow}\') OR (departure_time>=\'${filterData.startTimeWindow}\' AND departure_time<=\'${filterData.endTimeWindow}\')) AND node_id=${filterData.nodeId}`)).rows;

      intersecting_routes = (await Promise.all(intersecting_routes.map(async (iRoute) => {
        for (let drouteData of searchRes) {
          if (iRoute.outb_driver_id == drouteData.driver_id && iRoute.droute_id == drouteData.droute_id) {
            return;
          }
        }
        let nodesRes = (await pool.query(`SELECT lat, long from nodes WHERE node_id=${iRoute.node_id}`)).rows;

        iRoute = { ...iRoute, cordinates: nodesRes };

        searchQuery = `SELECT * FROM "droutes" WHERE droute_id=${iRoute.droute_id} AND driver_id=${iRoute.outb_driver_id}`;

        let searchRess = (await pool.query(searchQuery)).rows;

        if (searchRess.length == 0) {
          return;
        } else {
          searchRess[0].route_nodes = [iRoute];
          searchRess[0].origin_node = (await pool.query(`SELECT lat, long FROM nodes WHERE node_id=${searchRess[0].origin_node}`)).rows[0];
          searchRess[0].destination_node = (await pool.query(`SELECT lat, long FROM nodes WHERE node_id=${searchRess[0].destination_node}`)).rows[0];
        }
        return searchRess[0]
      }))).filter(Boolean);
      return { status: 200, data: intersecting_routes.concat(searchRes) };

    } else {
      return { status: 200, data: [].concat(searchRes) };
    }
  }
  catch (error) {
    logDebugInfo('error', 'filter_routes', 'rroutes', error.message, error.stack);
    return { status: 500, data: error.message };
  }
}


const queryBatchInsertTransitRoute = async (batchTransitData) => {
  try {
    let failedData = [];

    const columns = Object.keys(batchTransitData[0]).map((str) => str.trim()).filter(str => str != 'arrival_time');
    const setTable = new pgp.helpers.ColumnSet(columns, { table: 'droutes' });

    await db.tx(async (t) => {
      for (const data of batchTransitData) {
        let insertData = pgp.helpers.insert(data, setTable);
        try {
          const droute_id = (await t.one(`${insertData} RETURNING droute_id`)).droute_id;
          await t.none(`INSERT INTO "droutenodes" (droute_id, outb_driver_id, node_id, departure_time, capacity) VALUES(${droute_id}, ${data.driver_id}, ${data.origin_node}, \'${data.departure_time}\', ${data.capacity})`);
          await t.none(`INSERT INTO "droutenodes" (droute_id, outb_driver_id, node_id, arrival_time, capacity) VALUES(${droute_id}, ${data.driver_id}, ${data.destination_node}, \'${data.arrival_time}\', ${data.capacity})`);
        } catch (error) {
          failedData.push({ data: data, message: error.message });
        }
      }
    });

    if (failedData.length === 0) {
      return { status: 200, message: 'Bulk data inserted successfully' };
    } else {
      return { status: 500, message: 'Error inserting bulk data', data: failedData };
    }
  } catch (error) {
    logDebugInfo('error', 'insert_batch_transit_droutes', 'droutes', error.message, error.stack);
    return { status: 500, message: error.message };
  }
}


const queryBatchInsertNodes = async (batchNodeData) => {
  try {
    let failedData = [];
    let insertedNodeIds = [];

    const columns = Object.keys(batchNodeData[0]).map((str) => str.trim()).filter(str => str != 'arrival_time');
    const setTable = new pgp.helpers.ColumnSet(columns, { table: 'nodes' });

    for (const data of batchNodeData) {
      let insertData = pgp.helpers.insert(data, setTable);
      await db.tx(async (t) => {
        try {
          if (data.long != null && data.lat != null) {
            insertedNodeIds.push({ node_id: (await t.one(`${insertData} RETURNING node_id`)).node_id, long: data.long, lat: data.lat });
          } else {
            t.none(insertData);
          }
          // await t.none(insertData)
        } catch (error) {
          failedData.push({ data: data, message: error.message });
        }
      });
    }
    if (failedData.length === 0) {
      return { status: 200, message: 'Bulk data inserted successfully', data: insertedNodeIds };
      // return { status: 200, message: 'Bulk data inserted successfully'};
    } else {
      return { status: 500, message: 'Error inserting bulk data', data: failedData };
    }
  } catch (error) {
    logDebugInfo('error', 'insert_batch_transit_droutes', 'droutes', error.message, error.stack);
    return { status: 500, message: error.message };
  }
}



const queryBatchInsertN2N = async (batchDataN2N) => {
  try {
    const columns = Object.keys(batchDataN2N[0]).map((str) => str.trim());
    const setTable = new pgp.helpers.ColumnSet(columns, { table: 'n2n' });
    for (const data of batchDataN2N) {
      let insertData = pgp.helpers.insert(data, setTable);
      await db.tx(async (t) => {
        try {
          await t.none(insertData);
        } catch (error) {
        }
      });
    }
    // await db.tx(async (t) => {
    // try {
    //   await db.none(insertData);
    // } catch (error) {
    //   return { status: 500, message: error.message };
    // }
    // });
  } catch (error) {
    // logDebugInfo('error', 'insert_batch_transit_droutes', 'droutes', error.message, error.stack);
  }
}


const insertNode = async (nodes) => {
  const values = nodes.flatMap(node => [
    node.Location.slice(0, 50),
    node.Description.slice(0, 50),
    node.Address.slice(0, 50),
    node.City.slice(0, 50),
    node.State.slice(0, 50),
    node.Zip.slice(0, 50),
    node.Long.slice(0, 50),
    node.Lat.slice(0, 50),
  ]);


  const placeholders = [];
  for (let i = 1; i <= nodes.length; i++) {
    placeholders.push(`($${(i - 1) * 8 + 1}, $${(i - 1) * 8 + 2}, $${(i - 1) * 8 + 3}, $${(i - 1) * 8 + 4}, $${(i - 1) * 8 + 5}, $${(i - 1) * 8 + 6}, $${(i - 1) * 8 + 7}, $${(i - 1) * 8 + 8})`);
  }
  const query = `INSERT INTO nodes (location, description, address, city, state_province, zip_postal_code, long, lat) VALUES ${placeholders.join(', ')}`;

  return pool.query(query, values);
}


const getNodeCoordinates = async (nodeId) => {
  try {
    const nodeData = (await pool.query(`SELECT lat, long, transit_time FROM nodes WHERE node_id=${nodeId}`));
    return { status: 200, data: nodeData.rows[0] };
  } catch (error) {
    logDebugInfo('error', 'insert_route', 'droutes', error.message, error.stack);
    return { status: 500, data: error.message };
  }
}


const correctLocIDValues = async () => {
  const query = `
      UPDATE nodes AS n
      SET locID = (
        SELECT lpad(floor(random() * 10000)::text, 4, '0') || '-' || lpad(floor(random() * 100000)::text, 5, '0') AS new_locID
        WHERE NOT EXISTS (
          SELECT 1 FROM nodes n2 WHERE n2.locID = (
            SELECT lpad(floor(random() * 10000)::text, 4, '0') || '-' || lpad(floor(random() * 100000)::text, 5, '0')
            WHERE NOT EXISTS (
              SELECT 1 FROM nodes n3 WHERE n3.locID = n2.locID AND n3.node_id != n2.node_id
            )
          ) AND n2.node_id = n.node_id
        ) AND (n.locID !~ '^[0-9]{4}-[0-9]{5}$' OR n.locID IS NULL)
        LIMIT 1
      )
      WHERE n.locID !~ '^[0-9]{4}-[0-9]{5}$' OR n.locID IS NULL OR EXISTS (
        SELECT 1 FROM nodes n2 WHERE n2.locID = n.locID AND n2.node_id != n.node_id
      )
    `;
  return pool.query(query);
}

module.exports = {
  getAllNodes,
  insertNode,
  correctLocIDValues,
  queryTablesName,
  queryTableRows,
  queryTableUsage,
  purgeTable,
  truncFilteredData,
  queryCreate,
  queryFilter,
  modifyProfile,
  queryRemove,
  queryAll,
  deleteWhereById,
  queryBatchInsert,
  queryInsertSessionCookie,
  queryRemoveExpiredSessions,
  queryGetRole,
  queryRemoveSessionCookie,
  queryInsertPic,
  queryDistinctRoutes,
  queryDeleteRoutesByTag,
  queryInsertRiderRoute,
  queryInsertDriverRoute,
  queryTableCount,
  queryRRoutesFilter,
  queryBatchInsertTransitRoute,
  queryDRoutesFilter,
  queryBatchInsertNodes,
  findPointsOfInterestBetweenPolygon,
  queryBatchInsertN2N,
  qSetWaypointDistance,
  qGetWaypointDistance,
  countRows,
  queryBulkInsertRiderRoute,
  updateRouteIntermediateNodes,
  getNodeCoordinates,
  qBatchInsertDriverRoutes
};