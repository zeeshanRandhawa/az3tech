import { DBSummaryService } from "../service/dbsummary.service"
import { CustomError } from "../util/interface.utility"


export class DBSummaryController {

    private dbSummaryService: DBSummaryService;

    constructor() {
        this.dbSummaryService = new DBSummaryService();
    }

    async listDBTableStatistics(): Promise<any> {
        try {
            return await this.dbSummaryService.listDBTableStatistics();
        } catch (error: any) {
            if (error instanceof CustomError) {
                return { status: error.statusCode, data: { message: error.message } };
            }
            return { status: 500, data: { message: error.message } };
        }
    }

    async purgeTable(tableName: string): Promise<any> {
        if (!tableName || tableName === "") {
            return { status: 400, data: { message: "Invalid data" } };
        }
        if (["sessions", "users", "roles"].includes(tableName)) {
            return { status: 400, data: { message: "Can not purge primary tables" } };
        }
        try {
            return await this.dbSummaryService.purgeTable(tableName);
        } catch (error: any) {
            return { status: 500, data: { message: error.message } };
        }
    }
}