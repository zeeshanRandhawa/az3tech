import { Op, literal } from "sequelize";
import { RiderRepository } from "../repository/rider.repository";
import { isValidFileHeader, prepareBatchBulkImportData } from "../util/helper.utility";
import { CustomError, RiderAttributes, RiderDriverForm } from "../util/interface.utility";

export class RiderService {

    private riderRepository: RiderRepository;
    constructor() {
        this.riderRepository = new RiderRepository();
    }

    async listRiders(pageNumber: number): Promise<Record<string, any>> {
        const riderList: RiderAttributes[] = await this.riderRepository.findRiders({
            order: [["riderId", "ASC"]],
            limit: 10,
            offset: (pageNumber - 1) * 10,
        });

        if (riderList.length < 1) {
            throw new CustomError("No Rider Found", 404);
        }
        return { status: 200, data: { riders: riderList } };
    }

    async createRider(riderBio: RiderDriverForm): Promise<Record<string, any>> {
        await this.riderRepository.createRider({
            firstName: riderBio.firstName,
            lastName: riderBio.lastName,
            address: riderBio.address,
            city: riderBio.city,
            stateProvince: riderBio.stateProvince,
            zipPostalCode: riderBio.zipPostalCode,
            profilePicture: riderBio.profilePicture,
            phoneNumber: riderBio.countryCode && riderBio.mobileNumber ? riderBio.countryCode.trim().concat(riderBio.mobileNumber.trim()) : null
        }, {
            fields: ["firstName", "lastName", "address", "city", "stateProvince", "zipPostalCode", "profilePicture", "phoneNumber"]
        });

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
            profilePicture: riderBio.profilePicture
        }, {
            riderId: riderId
        });

        return { status: 200, data: { message: "Rider Updated Successfully" } };
    }

    async batchImportRiders(fileToImport: Express.Multer.File): Promise<Record<string, any>> {
        if (!isValidFileHeader(fileToImport.buffer, ["First Name", "Last Name", "Address", "City", "State/Province", "Zip/Postal Code"])) {
            throw new CustomError("Invalid columns or column length", 422);
        }
        const riderBatchData: Array<Record<string, any>> = prepareBatchBulkImportData(fileToImport.buffer, ["firstName", "lastName", "address", "city", "stateProvince", "zipPostalCode"]);

        await this.riderRepository.batchImportRiders(riderBatchData);

        return { status: 200, data: { message: "Riders data successfully imported" } };
    }

    async listRidersByName(riderName: string, pageNumber: number): Promise<Record<string, any>> {
        const riderList: RiderAttributes[] = await this.riderRepository.findRiders({
            where: {
                [Op.or]: [
                    { firstName: { [Op.iLike]: `%${riderName}%` } },
                    { lastName: { [Op.iLike]: `%${riderName}%` } },
                    literal(`CONCAT(first_name, ' ', last_name) ILIKE '%${riderName}%'`)
                ]
            },
            order: [["riderId", "ASC"]],
            limit: 10,
            offset: (pageNumber - 1) * 10,
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