const { logDebugInfo } = require('../utilities/logger');
const { queryTablesName, queryTableRows, queryTableUsage, purgeTable, truncFilteredData } = require('../utilities/query');
const { isAuthenticated, isSuperAdmin } = require('./middleware');

const express = require('express'); //main package for server
const databaseManagement = express.Router();


const getTableNames = async () => {
    const tableNames = (await queryTablesName()).data;
    return tableNames;
}

const getTableRowCount = async (tableName) => {
    const rowsCount = (await queryTableRows(tableName)).data;
    return rowsCount;
}

const getTableUsage = async (tableName) => {
    const usage = (await queryTableUsage(tableName)).data;
    return usage;
}

// list table stats (rowCount/Usage/names)
databaseManagement.get('/api/v1/database/table-stats', isAuthenticated, async (req, res) => {
    try {
        let stats = []
        const listTableNames = await getTableNames(); // get table names in databse
        const listTableCount = await Promise.all(listTableNames.map(table => getTableRowCount(table.table_name))); // bsed on above tables get row count of each table
        const listTbleUsage = await Promise.all(listTableNames.map(table => getTableUsage(table.table_name))); // get usage of each table
        for (let i = 0; i < listTableNames.length; ++i) { // iterate over data and prepare zipped data structure
            stats.push({ 'name': listTableNames[i].table_name, 'count': listTableCount[i], 'usage': listTbleUsage[i] })
        }

        const sortOrder = ['riders', 'drivers', 'nodes', 'n2n', 'n2nwp', 'rroutes', 'rroutenodes', 'droutes', 'droutenodes', 'users', 'sessions', 'roles', 'debug_logs'];

        stats.sort((dataSetA, dataSetB) => {
            const indexA = sortOrder.indexOf(dataSetA.name);
            const indexB = sortOrder.indexOf(dataSetB.name);
            return indexA - indexB;
        });

        res.status(200).json({ stats: stats }); //return data
    } catch (error) {
        logDebugInfo('error', 'get_table_stats', 'users/roles', error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }

});


// purge/drop tables based on list provided 
databaseManagement.post('/api/v1/database/purge-tables', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        const purgeList = req.body.purgeTableList;
        if (!purgeList || purgeList.length < 1 || !purgeList[0]) { // validate purge table list 
            res.status(400).json({ message: "Invalid Data" }) // return error if invalid data 
        } else {
            const dropRes = await Promise.all(purgeList.map(table => purgeTable(table))); // execute purge query on list of tables
            if (dropRes[0].status == 200) {
                res.sendStatus(200); // return 200 if OK
            } else {
                res.status(dropRes[0].status).json({ message: dropRes[0].data }); // else return error message
            }
        }
    } catch (error) {
        logDebugInfo('error', 'purge_table', purgeList[0], error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
});


// generic filter to purge either riders or driver routes
databaseManagement.post('/api/v1/truncate/selected-filter', isAuthenticated, isSuperAdmin, async (req, res) => {
    try {
        const purgeList = req.body.Data.filterList;
        const tableName = req.body.Data.tableName;
        const id = req.body.Data.id;
        // console.log(purgeList);
        if (!purgeList || !tableName || purgeList.length < 1 || !['rroutes', 'droutes'].includes(tableName)) { // validate filter list and check if table names re correct
            res.status(400).json({ message: "Invalid filters or table name" }) // return error if invalid data
        } else {
            const truncRes = await truncFilteredData(purgeList, tableName, id); //esle execute trunc data query
            if (truncRes.status == 200) {
                res.status(200).json({ rowCount: truncRes.rows }); // if 200 send rows effected
            } else {
                res.status(truncRes.status).json({ message: truncRes.data }); // else return error message
            }
        }
    } catch (error) {
        logDebugInfo('error', 'trunc_by_filter', tableName, error.message, error.stack);
        res.status(500).json({ message: "Server Error " + error.message });
    }
});


// module.exports = { getAllTablesStats, purgeSelected, purgeByFilter };
module.exports = databaseManagement;

