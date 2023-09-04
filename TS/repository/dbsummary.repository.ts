import { QueryTypes } from "sequelize";
import { sequelize } from "../util/db.config";

export class DBSummaryRepository {
    constructor() {
    }

    async getTableNames(): Promise<Array<Record<string, string>> | null> {
        const tableNameList: Array<Record<string, string>> | null = await sequelize.query(`SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema='public'`, { type: QueryTypes.SELECT });
        return tableNameList;
    }

    async getdbTableRowCount(tableName: string): Promise<Array<Record<string, string>>> {
        const tableRowCount: Array<Record<string, string>> = await sequelize.query(`SELECT count(*) FROM "${tableName}"`, { type: QueryTypes.SELECT });
        return tableRowCount;
    }

    async getdbTableUsage(tableName: string): Promise<Array<Record<string, string>>> {
        const tableUsage: any = await sequelize.query(`SELECT pg_total_relation_size('${tableName}')`, { type: QueryTypes.SELECT });
        return tableUsage
    }

    async deleteDBTable(tableName: string): Promise<void> {
        if (tableName === "riders") {
            await sequelize.query(`DELETE FROM"${tableName}"`);
        }
        await sequelize.query(`TRUNCATE TABLE "${tableName}" CASCADE`);
    }
}