import { QueryTypes } from "sequelize";
import { sequelize } from "../util/db.config";
import { UserRepository } from "./user.repository";

export class DBSummaryRepository {
    private userRepository: UserRepository;

    constructor() {
        this.userRepository = new UserRepository();
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
        if (tableName.trim() === "riders") {
            await this.userRepository.deleteUser({
                where: {
                    roleId: 3
                },
                cascade: true
            })
        } else if (tableName === "drivers") {
            await this.userRepository.deleteUser({
                where: {
                    roleId: 4
                },
                cascade: true
            })
        }
        await sequelize.query(`TRUNCATE TABLE "${tableName.trim()}" RESTART IDENTITY CASCADE `);
    }
}