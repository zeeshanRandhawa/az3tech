import { AnyTxtRecord } from "dns";
import { User } from "../util/db.config"
import { UserAttributes } from "../util/interface.utility";

export class UserRepository {


    constructor() {
    }

    async findUser(whereCondition: Record<string, any>): Promise<UserAttributes | null> {

        const user: User | null = await User.findOne(whereCondition);

        return user?.toJSON() as UserAttributes ?? null;
    }

    async createUser(userToCreate: Record<string, any>, associations: Record<string, any>): Promise<UserAttributes> {
        const createdUser: User | null = await User.create(userToCreate, associations);
        return createdUser?.toJSON() as UserAttributes ?? null;
    }

    async updateUser(userToUpdate: Record<string, any>, whereCondition: Record<string, any>): Promise<void> {
        await User.update(userToUpdate, { where: whereCondition });
    }

    async deleteUser(destroyCondition: Record<string, any>): Promise<number> {
        return await User.destroy(destroyCondition)
    }

    async batchImportUsers(userBatchData: Array<Record<string, any>>, options: Record<any, any>): Promise<void> {
        await User.bulkCreate(userBatchData, options);
    }
}