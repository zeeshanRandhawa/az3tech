import { UserRepository } from "../repository/user.repository";
import { CustomError, UserDto, LoginForm, RiderDriverForm, SignupForm } from "../util/interface.utility";
import { generatePasswordHash, comparePasswordHash, generateRandomToken } from "../util/helper.utility";
import { SessionService } from "./session.service";
import { SessionRepository } from "../repository/session.repository";

export class UserService {

    private userRepository: UserRepository;
    private sessionService: SessionService;

    constructor() {
        this.userRepository = new UserRepository();
        this.sessionService = new SessionService();
    }

    async createRiderWithUser(signUpFormData: SignupForm): Promise<void> {
        const existingUser: UserDto | null = await this.userRepository.findUser(
            {
                where: {
                    email: signUpFormData.email,
                    roleId: 3
                }
            });
        if (existingUser) {
            throw new CustomError("User already exists", 409);
        } else {
            await this.userRepository.createUser({
                email: signUpFormData.email,
                password: await generatePasswordHash(signUpFormData.password),
                roleId: 3,
                rider: {
                    phoneNumber: signUpFormData.countryCode.concat(signUpFormData.mobileNumber),
                    firstName: signUpFormData.firstName,
                    lastName: signUpFormData.lastName,
                    profilePicture: signUpFormData.profilePicture,
                }
            }, {
                include: [{
                    association: "rider"
                }],
                fields: ["email", "password", "roleId"]
            });

            const existingUser: UserDto | null = await this.userRepository.findUser(
                {
                    where: {
                        email: signUpFormData.email,
                        roleId: 4
                    }
                });
            if (!existingUser) {
                await this.userRepository.createUser({
                    email: signUpFormData.email,
                    password: await generatePasswordHash(signUpFormData.password),
                    roleId: 4,
                    driver: {
                        phoneNumber: signUpFormData.countryCode.concat(signUpFormData.mobileNumber),
                        firstName: signUpFormData.firstName,
                        lastName: signUpFormData.lastName,
                        profilePicture: signUpFormData.profilePicture,
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
    }

    async authenticateRider(loginFormData: LoginForm): Promise<Record<string, any>> {
        try {
            await this.sessionService.destroyExpiredSessions();
        } catch (error: any) { }

        const user: UserDto | null = await this.userRepository.findUser({
            where: {
                email: loginFormData.email
            },
            include: [{
                association: "role"
            }]
        });
        if (!user) {
            throw new CustomError("Email not found", 404);
        }
        if (["Admin", "SuperAdmin"].includes(user.role?.roleType.trim() as string)) {
            throw new CustomError("User not found with expected role", 401);
        }
        if (!await comparePasswordHash(loginFormData.password, user.password)) {
            throw new CustomError("Invalid password", 401);
        }
        const sessionExpireAt: Date = new Date(Date.now() + 3600000);
        const sessionToken: string = generateRandomToken(32);

        await this.sessionService.createSession({
            userId: user.userId,
            sessionToken: sessionToken,
            sessionExpireTimestamp: sessionExpireAt
        }, {
            fields: ["userId", "sessionToken", "sessionExpireTimestamp"]
        });

        return { status: 200, data: { message: "Login successful", sessionToken: { token: sessionToken, expireTime: sessionExpireAt } } };
    }

    async logoutRider(sessionToken: string): Promise<Record<string, any>> {
        try {
            await this.sessionService.destroyExpiredSessions();
        } catch (error: any) { }

        if (await (new SessionRepository()).deleteSession({
            where: {
                sessionToken: sessionToken
            }
        })) {
            return { status: 200, data: { message: "User logged out" } };
        }
        throw new CustomError("User not logged in", 401);
    }

    async authenticateAdmin(loginFormData: LoginForm, userSessionToken?: string): Promise<Record<string, any>> {
        try {
            await this.sessionService.destroyExpiredSessions();
        } catch (error: any) { }

        if (userSessionToken !== null && (await (new SessionRepository()).findSession({
            where: {
                sessionToken: userSessionToken ? userSessionToken : ""
            }
        })) !== null) {
            throw new CustomError("Already authorized", 400);
        }

        const admin: UserDto | null = await this.userRepository.findUser({
            where: {
                email: loginFormData.email
            },
            include: [{
                association: "role"
            }]
        });
        if (!admin) {
            throw new CustomError("Email not found", 404);
        }
        if (["Rider", "Driver"].includes(admin.role?.roleType.trim() as string)) {
            throw new CustomError("Admin not found with expected role", 401);
        }
        if (!await comparePasswordHash(loginFormData.password, admin.password)) {
            throw new CustomError("Invalid password", 401);
        }
        const sessionExpireAt: Date = new Date(Date.now() + 21600000);
        const sessionToken: string = generateRandomToken(32);

        await this.sessionService.createSession({
            userId: admin.userId,
            sessionToken: sessionToken,
            sessionExpireTimestamp: sessionExpireAt
        }, {
            fields: ["userId", "sessionToken", "sessionExpireTimestamp"]
        });

        return { status: 200, data: { message: "Login successful", sessionToken: { token: sessionToken, expireTime: sessionExpireAt } } };
    }

    async logoutAdmin(sessionToken?: string): Promise<any> {
        try {
            await this.sessionService.destroyExpiredSessions();
        } catch (error: any) { }

        if (await (new SessionRepository()).deleteSession({
            where: {
                sessionToken: sessionToken
            }
        })) {
            return { status: 200, data: { message: "User logged out" } };
        }
        throw new CustomError("User not logged in", 401)
    }
}