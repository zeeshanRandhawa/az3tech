import { Op, literal } from "sequelize";
import { DriverRepository } from "../repository/driver.repository";
import { generatePasswordHash, isValidFileHeader, prepareBatchBulkImportData } from "../util/helper.utility";
import { CustomError, DriverAttributes, RiderDriverForm, UserAttributes } from "../util/interface.utility";
import { UserRepository } from "../repository/user.repository";
import { promiseHooks } from "v8";

export class DriverService {

    private driverRepository: DriverRepository;
    private userRepository: UserRepository;
    constructor() {
        this.driverRepository = new DriverRepository();
        this.userRepository = new UserRepository();
    }

    async listDrivers(pageNumber: number): Promise<any> {
        const driverList: DriverAttributes[] = await this.driverRepository.findDrivers({
            attributes: ["driverId", "firstName", "lastName", "address", "city", "stateProvince", "zipPostalCode", "profilePicture", "phoneNumber", "capacity", "description"],
            order: [["driverId", "ASC"]],
            limit: 10,
            offset: (pageNumber - 1) * 10,
            include: [{
                association: "user",
                required: true,
                attributes: ["email"]
            }]
        });

        if (driverList.length < 1) {
            throw new CustomError("No Driver Found", 404);
        }

        const driverListWithEmail: Array<Record<string, any>> = await Promise.all(driverList.map(async (driver: Record<string, any>) => {
            driver.email = driver.user?.email;
            delete driver["user"];
            return driver;
        }));

        return { status: 200, data: { drivers: driverListWithEmail } };
    }

    async createDriver(driverBio: RiderDriverForm): Promise<Record<string, any>> {

        let existingUser: UserAttributes | null = await this.userRepository.findUser({
            where: {
                email: driverBio.email,
                roleId: 4
            }
        });

        if (existingUser) {
            throw new CustomError("User already exists", 409);
        } else {
            await this.userRepository.createUser({
                email: driverBio.email,
                password: await generatePasswordHash(driverBio.password),
                roleId: 4,
                driver: {
                    phoneNumber: driverBio.countryCode.concat(driverBio.mobileNumber),
                    firstName: driverBio.firstName,
                    lastName: driverBio.lastName,
                    address: driverBio.address,
                    city: driverBio.city,
                    stateProvince: driverBio.stateProvince,
                    zipPostalCode: driverBio.zipPostalCode,
                    profilePicture: driverBio.profilePicture,
                    capacity: driverBio.capacity ? driverBio.capacity : Math.floor(Math.random() * 5) + 1,
                    description: driverBio.description
                }
            }, {
                include: [{
                    association: "driver"
                }],
                fields: ["email", "password", "roleId"]
            });
        }
        return { status: 201, data: { message: "Driver Created Successfully" } }
    }

    async updateDriver(driverId: number, driverBio: RiderDriverForm): Promise<any> {
        const driver: DriverAttributes | null = await this.driverRepository.findDriverByPK(driverId);

        if (!driver) {
            throw new CustomError("Driver does not exist", 404);
        }

        await this.driverRepository.updateDriver({
            firstName: driverBio.firstName,
            lastName: driverBio.lastName,
            address: driverBio.address,
            city: driverBio.city,
            stateProvince: driverBio.stateProvince,
            zipPostalCode: driverBio.zipPostalCode,
            profilePicture: driverBio.profilePicture,
            capacity: driverBio.capacity,
            description: driverBio.description,
            phoneNumber: driverBio.mobileNumber
        }, {
            driverId: driverId
        });

        return { status: 200, data: { message: "Driver Updated Successfully" } }
    }

    async batchImportDrivers(fileToImport: Express.Multer.File): Promise<Record<string, any>> {
        let failedDriverImportData: Array<Record<string, any>> = [];

        if (!isValidFileHeader(fileToImport.buffer, ["First Name", "Last Name", "Email", "Description", "Address", "City", "State Province", "Zip Postal Code", "Capacity", "Country Code", "Mobile Number"])) {
            throw new CustomError("Invalid columns or column length", 422);
        }
        let driverBatchData: Array<Record<string, any>> = prepareBatchBulkImportData(fileToImport.buffer, ["firstName", "lastName", "email", "description", "address", "city", "stateProvince", "zipPostalCode", "capacity", "countryCode", "mobileNumber"]);

        const duplicateDrivers: Array<Record<string, any>> = driverBatchData.filter(
            (driver, index, self) =>
                index !== self.findIndex((d) => d.email === driver.email)
        );
        const duplicateDriverEmailList: Array<string> = Array.from(new Set(await Promise.all(duplicateDrivers.map(d => d.email))));

        driverBatchData = (await Promise.all(driverBatchData.map(async (driverData: Record<string, any>) => {
            if (!driverData.email || !driverData.firstName || !driverData.lastName || !driverData.mobileNumber || !driverData.countryCode) {
                failedDriverImportData.push({ ...driverData, message: "Invalid Data" });
                return {};
            }
            else if (duplicateDriverEmailList.includes(driverData.email)) {
                failedDriverImportData.push({ ...driverData, message: "Duplicate email in batch data" });
                return {};
            } else {
                return driverData;
            }
        }))).filter(driver => Object.keys(driver).length > 0);

        if (driverBatchData.length) {

            const existingDriverList: string[] = await Promise.all(
                (await this.userRepository.findUsers({
                    where: {
                        email: (await Promise.all(driverBatchData.map(async (driver: Record<string, any>) => driver.email))),
                        roleId: 4
                    }
                })).map(async (user: UserAttributes) => {
                    return user.email;
                }));
            driverBatchData = (await Promise.all(driverBatchData.map(async (driverData: Record<string, any>) => {
                if (existingDriverList.includes(driverData.email)) {
                    failedDriverImportData.push({ ...driverData, message: "Email already exists" });
                    return {};
                }
                return driverData
            }))).filter(driver => Object.keys(driver).length > 0);

            const userBatchDataWithDriver: Array<Record<string, any>> = await Promise.all(driverBatchData.map(async (driverData: Record<string, any>) => {
                // if (driverData.email && driverData.firstName && driverData.lastName && driverData.mobileNumber && driverData.countryCode) {
                return {
                    email: driverData.email,
                    password: await generatePasswordHash(driverData.firstName),
                    roleId: 4,
                    driver: {
                        phoneNumber: driverData.countryCode.concat(driverData.mobileNumber),
                        firstName: driverData.firstName,
                        lastName: driverData.lastName,
                        address: driverData.address,
                        city: driverData.city,
                        stateProvince: driverData.stateProvince,
                        zipPostalCode: driverData.zipPostalCode,
                        description: driverData.description,
                        capacity: !driverData.capacity ? Math.floor(Math.random() * 5) + 1 : driverData.capacity
                    }
                }
                // }
                // return {};
            }))
            // ).filter(driver => Object.keys(driver).length > 0);

            if (userBatchDataWithDriver.length) {

                await this.userRepository.batchImportUsers(userBatchDataWithDriver, {
                    include: [{
                        association: "driver"
                    }],
                    fields: ["email", "password", "roleId"]
                });

                return { status: 200, data: { message: "Drivers data successfully imported" } };
            }
        }
        return { status: 200, data: { message: "No Driver data found to import" } };

    }

    async listDriversByName(driverName: string, pageNumber: number): Promise<Record<string, any>> {
        const driverList: DriverAttributes[] = await this.driverRepository.findDrivers({
            attributes: ["driverId", "firstName", "lastName", "address", "city", "stateProvince", "zipPostalCode", "profilePicture", "phoneNumber", "capacity", "description"],
            where: {
                [Op.or]: [
                    { firstName: { [Op.iLike]: `%${driverName}%` } },
                    { lastName: { [Op.iLike]: `%${driverName}%` } },
                    literal(`CONCAT(first_name, ' ', last_name) ILIKE '%${driverName}%'`)
                ]
            },
            order: [["driverId", "ASC"]],
            limit: 10,
            offset: (pageNumber - 1) * 10,
            include: [{
                association: "user",
                required: true,
                attributes: ["email"]
            }]
        });

        if (driverList.length < 1) {
            throw new CustomError("No Driver Found", 404);
        }

        const driverListWithEmail: Array<Record<string, any>> = await Promise.all(driverList.map(async (driver: Record<string, any>) => {
            driver.email = driver.user?.email;
            delete driver["user"];
            return driver;
        }));

        return { status: 200, data: { drivers: driverListWithEmail } };
    }

    async getDriverPageCount(driverName: string): Promise<Record<string, any>> {
        let driversCount: number;

        if (!driverName) {
            driversCount = await this.driverRepository.countDrivers({});
        } else {
            driversCount = await this.driverRepository.countDrivers({
                where: {
                    [Op.or]: [
                        { firstName: { [Op.iLike]: `%${driverName}%` } },
                        { lastName: { [Op.iLike]: `%${driverName}%` } },
                        literal(`CONCAT(first_name, ' ', last_name) ILIKE '%${driverName}%'`)
                    ]
                }
            });
        }
        return { status: 200, data: { driversCount: Math.ceil(driversCount) } };
    }
}