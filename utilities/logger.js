const { Pool } = require('pg');

const pool = new Pool({
    // user: 'postgres',
    // password: '1234',
    // host: 'localhost',
    // port: 5432,
    // database: 'test-transport'
    user: 'postgres',
    password: '123456',
    host: 'localhost',
    port: 5432,
    database: 'test-local'
    // user: 'doadmin',
    // password: 'AVNS_MHGwE5WNGWUy_wvn_-l',
    // host: 'db-postgresql-sfo2-32856-do-user-13737111-0.b.db.ondigitalocean.com',
    // port: 25060,
    // database: 'local-test',
    // ssl: {
    //   rejectUnauthorized: false,
    //   require: true
    // }
});

const queryInsertLog = async (logEntry) => {
    try {
        const logQuery = `INSERT INTO "debug_logs"(activity_time, "level", "table_name", trace, "message", activity_type) VALUES ('${logEntry.activityTime}', '${logEntry.level}', '${logEntry.tableName}', '${logEntry.trace}', '${logEntry.message}', '${logEntry.activityType}')`;
        await pool.query(logQuery);
    }
    catch (error) {
    }
}

const logDebugInfo = async (level, activityType, tableName, message, trace) => {
    const logEntry = {
        level,
        activityTime: new Date().toISOString(),
        activityType,
        tableName,
        message,
        trace
    };
    try {
        await queryInsertLog(logEntry);
    } catch (error) {
        console.error('Failed to log to PostgreSQL:', error);
    }
};

module.exports = { logDebugInfo }
