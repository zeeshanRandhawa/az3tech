import { Op, literal } from "sequelize";
import { RiderRepository } from "../repository/rider.repository";
import { generatePasswordHash, isValidFileHeader, prepareBatchBulkImportData } from "../util/helper.utility";
import { CustomError, RiderAttributes, RiderDriverForm, UserAttributes } from "../util/interface.utility";
import { DriverRepository } from "../repository/driver.repository";
import { UserRepository } from "../repository/user.repository";

export class RiderService {

    private riderRepository: RiderRepository;
    private driverRepository: DriverRepository;
    private userRepository: UserRepository;
    constructor() {
        this.riderRepository = new RiderRepository();
        this.driverRepository = new DriverRepository();
        this.userRepository = new UserRepository();
    }

    async listRiders(pageNumber: number): Promise<Record<string, any>> {
        const riderList: RiderAttributes[] = await this.riderRepository.findRiders({
            attributes: ["riderId", "firstName", "lastName", "address", "city", "stateProvince", "zipPostalCode", "profilePicture", "phoneNumber"],
            order: [["riderId", "ASC"]],
            limit: 10,
            offset: (pageNumber - 1) * 10,
            include: [{
                association: "user",
                required: true,
                attributes: ["email"]
            }]
        });

        if (riderList.length < 1) {
            throw new CustomError("No Rider Found", 404);
        }
        const riderListWithEmail: Array<Record<string, any>> = await Promise.all(riderList.map(async (rider: Record<string, any>) => {
            rider.email = rider.user?.email;
            delete rider["user"];
            return rider;
        }));

        return { status: 200, data: { riders: riderListWithEmail } };
    }

    async createRider(riderBio: RiderDriverForm): Promise<Record<string, any>> {

        let existingUser: UserAttributes | null = await this.userRepository.findUser({
            where: {
                email: riderBio.email,
                roleId: 3
            }
        });

        if (existingUser) {
            throw new CustomError("User already exists", 409);
        } else {
            await this.userRepository.createUser({
                email: riderBio.email,
                password: await generatePasswordHash(riderBio.password),
                roleId: 3,
                rider: {
                    phoneNumber: riderBio.countryCode.concat(riderBio.mobileNumber),
                    firstName: riderBio.firstName,
                    lastName: riderBio.lastName,
                    address: riderBio.address,
                    city: riderBio.city,
                    stateProvince: riderBio.stateProvince,
                    zipPostalCode: riderBio.zipPostalCode,
                    profilePicture: riderBio.profilePicture,
                }
            }, {
                include: [{
                    association: "rider"
                }],
                fields: ["email", "password", "roleId"]
            });

            existingUser = await this.userRepository.findUser({
                where: {
                    email: riderBio.email,
                    roleId: 4
                }
            });
            if (!existingUser) {
                await this.userRepository.createUser({
                    email: riderBio.email,
                    password: await generatePasswordHash(riderBio.password),
                    roleId: 4,
                    driver: {
                        phoneNumber: riderBio.countryCode.concat(riderBio.mobileNumber),
                        firstName: riderBio.firstName,
                        lastName: riderBio.lastName,
                        address: riderBio.address,
                        city: riderBio.city,
                        stateProvince: riderBio.stateProvince,
                        zipPostalCode: riderBio.zipPostalCode,
                        profilePicture: riderBio.profilePicture,
                        capacity: Math.floor(Math.random() * 5) + 1
                    }
                }, {
                    include: [{
                        association: "driver"
                    }],
                    fields: ["email", "password", "roleId"]
                });
            }
        }

        return { status: 201, data: { message: "Rider Created Successfully" } }
    }

    async updateRider(riderId: number, riderBio: RiderDriverForm): Promise<Record<string, any>> {
        const rider: RiderAttributes | null = await this.riderRepository.findRiderByPK(riderId);

        if (!rider) {
            throw new CustomError("Rider does not exist", 404);
        }

        await this.riderRepository.updateRider({
            firstName: riderBio.firstName,
            lastName: riderBio.lastName,
            address: riderBio.address,
            city: riderBio.city,
            stateProvince: riderBio.stateProvince,
            zipPostalCode: riderBio.zipPostalCode,
            profilePicture: riderBio.profilePicture,
            phoneNumber: riderBio.mobileNumber
        }, {
            riderId: riderId
        });

        return { status: 200, data: { message: "Rider Updated Successfully" } };
    }

    async batchImportRiders(fileToImport: Express.Multer.File): Promise<Record<string, any>> {
        let failedRiderImportData: Array<Record<string, any>> = []

        if (!isValidFileHeader(fileToImport.buffer, ["First Name", "Last Name", "Email", "Address", "City", "State/Province", "Zip/Postal Code", "Country Code", "Mobile Number"])) {
            throw new CustomError("Invalid columns or column length", 422);
        }
        let riderBatchData: Array<Record<string, any>> = prepareBatchBulkImportData(fileToImport.buffer, ["firstName", "lastName", "email", "address", "city", "stateProvince", "zipPostalCode", "countryCode", "mobileNumber"]);

        const duplicateRiders: Array<Record<string, any>> = riderBatchData.filter(
            (rider, index, self) =>
                index !== self.findIndex((d) => d.email === rider.email)
        );
        const duplicateRiderEmailList: Array<string> = Array.from(new Set(await Promise.all(duplicateRiders.map(d => d.email))));

        riderBatchData = (await Promise.all(riderBatchData.map(async (riderData: Record<string, any>) => {
            if (!riderData.email || !riderData.firstName || !riderData.lastName || !riderData.mobileNumber || !riderData.countryCode) {
                failedRiderImportData.push({ ...riderData, message: "Invalid Data" });
                return {};
            }
            else if (duplicateRiderEmailList.includes(riderData.email)) {
                failedRiderImportData.push({ ...riderData, message: "Duplicate email in batch data" });
                return {};
            } else {
                return riderData;
            }
        }))).filter(rider => Object.keys(rider).length > 0);

        if (riderBatchData.length) {

            const existingRiderList: string[] = await Promise.all(
                (await this.userRepository.findUsers({
                    where: {
                        email: (await Promise.all(riderBatchData.map(async (rider: Record<string, any>) => rider.email))),
                        roleId: 3
                    }
                })).map(async (user: UserAttributes) => {
                    return user.email;
                }));
            riderBatchData = (await Promise.all(riderBatchData.map(async (riderData: Record<string, any>) => {
                if (existingRiderList.includes(riderData.email)) {
                    failedRiderImportData.push({ ...riderData, message: "Email already exists" });
                    return {};
                }
                return riderData
            }))).filter(rider => Object.keys(rider).length > 0);


            const userBatchDataWithRider: Array<Record<string, any>> = await Promise.all(riderBatchData.map(async (riderData: Record<string, any>) => {
                // if (riderData.email && riderData.firstName && riderData.lastName && riderData.mobileNumber && riderData.countryCode) {

                return {
                    email: riderData.email,
                    password: await generatePasswordHash(riderData.firstName),
                    roleId: 3,
                    rider: {
                        phoneNumber: riderData.countryCode.concat(riderData.mobileNumber),
                        firstName: riderData.firstName,
                        lastName: riderData.lastName,
                        address: riderData.address,
                        city: riderData.city,
                        stateProvince: riderData.stateProvince,
                        zipPostalCode: riderData.zipPostalCode,
                    }
                }
            }
                // return {};
                // }
            ))
            // ).filter(rider => Object.keys(rider).length > 0);
            if (userBatchDataWithRider.length) {
                await this.userRepository.batchImportUsers(userBatchDataWithRider, {
                    include: [{
                        association: "rider"
                    }],
                    fields: ["email", "password", "roleId"]
                });

                const userBatchDataWithDriver: Array<Record<string, any>> = await Promise.all(riderBatchData.map(async (riderData: Record<string, any>) => {
                    // if (riderData.email && riderData.firstName && riderData.lastName && riderData.mobileNumber && riderData.countryCode) {

                    return {
                        email: riderData.email,
                        password: await generatePasswordHash(riderData.firstName),
                        roleId: 4,
                        driver: {
                            phoneNumber: !riderData.countryCode || !riderData.mobileNumber ? null : riderData.countryCode.concat(riderData.mobileNumber),
                            firstName: riderData.firstName,
                            lastName: riderData.lastName,
                            address: riderData.address,
                            city: riderData.city,
                            stateProvince: riderData.stateProvince,
                            zipPostalCode: riderData.zipPostalCode,
                            capacity: Math.floor(Math.random() * 5) + 1
                        }
                    }
                }
                    // return {}
                    // }
                ))
                // ).filter(driver => Object.keys(driver).length > 0);
                if (userBatchDataWithDriver.length) {
                    this.userRepository.batchImportUsers(userBatchDataWithDriver, {
                        include: [{
                            association: "driver"
                        }],
                        fields: ["email", "password", "roleId"]
                    });

                    return { status: 200, data: { message: "Riders data successfully imported" } };
                }
                return { status: 200, data: { message: "No Driver data found to import" } }
            }
        }
        return { status: 200, data: { message: "No Rider data found  to import" } }
    }

    async listRidersByName(riderName: string, pageNumber: number): Promise<Record<string, any>> {
        const riderList: RiderAttributes[] = await this.riderRepository.findRiders({
            attributes: ["riderId", "firstName", "lastName", "address", "city", "stateProvince", "zipPostalCode", "profilePicture", "phoneNumber"],
            where: {
                [Op.or]: [
                    { firstName: { [Op.iLike]: `%${riderName}%` } },
                    { lastName: { [Op.iLike]: `%${riderName}%` } },
                    literal(`CONCAT(first_name, ' ', last_name) ILIKE '%${riderName}%'`)
                ]
            },
            include: [{
                association: "user",
                required: true,
                attributes: ["email"]
            }],
            order: [["riderId", "ASC"]],
            limit: 10,
            offset: (pageNumber - 1) * 10
        });

        if (riderList.length < 1) {
            throw new CustomError("No Rider Found", 404);
        }
        return { status: 200, data: { riders: riderList } };
    }

    async getRiderPageCount(riderName: string): Promise<Record<string, any>> {
        let ridersCount: number;

        if (!riderName) {
            ridersCount = await this.riderRepository.countRiders({});
        } else {
            ridersCount = await this.riderRepository.countRiders({
                where: {
                    [Op.or]: [
                        { firstName: { [Op.iLike]: `%${riderName}%` } },
                        { lastName: { [Op.iLike]: `%${riderName}%` } },
                        literal(`CONCAT(first_name, ' ', last_name) ILIKE '%${riderName}%'`)
                    ]
                }
            });
        }
        return { status: 200, data: { ridersCount: Math.ceil(ridersCount) } };
    }
}