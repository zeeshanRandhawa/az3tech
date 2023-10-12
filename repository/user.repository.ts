import { AnyTxtRecord } from "dns";
import { User } from "../util/db.config"
import { UserDto } from "../util/interface.utility";

export class UserRepository {


    constructor() {
    }

    async findUsers(whereConditionPaginatedDtod: Record<string, any>): Promise<Array<UserDto>> {
        const userList: Array<User> = await User.findAll(whereConditionPaginatedDtod);
        const plainUserList: Array<UserDto> = userList.map((user: User) => user.toJSON());
        return plainUserList;
    }

    async findUser(whereCondition: Record<string, any>): Promise<UserDto | null> {

        const user: User | null = await User.findOne(whereCondition);

        return user?.toJSON() as UserDto ?? null;
    }

    async createUser(userToCreate: Record<string, any>, associations: Record<string, any>): Promise<UserDto> {
        const createdUser: User | null = await User.create(userToCreate, associations);
        return createdUser?.toJSON() as UserDto ?? null;
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