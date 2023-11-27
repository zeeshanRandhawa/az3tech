import { DBSummaryRepository } from "../repository/dbsummary.repository";
import { CustomError } from "../util/interface.utility";
export class DBSummaryService {

    private dbSummaryRepository: DBSummaryRepository;

    constructor() {
        this.dbSummaryRepository = new DBSummaryRepository();
    }

    async listDBTableStatistics(): Promise<any> {
        let dbTableStats: Array<Record<string, any>> = [];

        const dbTableNameList: Array<Record<string, string>> | null = await this.dbSummaryRepository.getTableNames();
        if (!dbTableNameList) {
            throw new CustomError("No table found", 500);
        }

        const dbTableRowCountList: any = await Promise.all(dbTableNameList.map(async (tableName) => {
            return (await this.dbSummaryRepository.getdbTableRowCount(tableName.tablename))[0]["count"];
        }));
        const dbTableUsage: any = await Promise.all(dbTableNameList.map(async (tableName) => {
            return (await this.dbSummaryRepository.getdbTableUsage(tableName.tablename))[0]["pg_total_relation_size"];
        }));


        dbTableStats = dbTableNameList.map((tableName, index) => {
            return { "name": tableName.tablename, "count": dbTableRowCountList[index], "usage": dbTableUsage[index] };
        });

        const sortOrder = ["riders", "drivers", "nodes", "n2n", "nodetypes", "n2nwp", "rroutes", "rroutenodes", "droutes", "droutenodes", "droutepassengers", "users", "sessions", "roles", "user_role"];
        dbTableStats.sort((dataSetA, dataSetB) => {
            const indexA = sortOrder.indexOf(dataSetA.name);
            const indexB = sortOrder.indexOf(dataSetB.name);
            return indexA - indexB;
        });

        return { status: 200, data: { dbTableStatistics: dbTableStats } };
    }

    async purgeTable(tableName: string): Promise<Record<string, any> | void> {
        await this.dbSummaryRepository.deleteDBTable(tableName);
        return { status: 200, data: { message: "Table truncated successfully" } };
    }
}