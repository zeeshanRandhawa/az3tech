import { UserService } from "../service/user.service"
import { SignupForm, CustomError, LoginForm } from "../util/interface.utility"


export class UserController {

    private userService: UserService;

    constructor() {
        this.userService = new UserService();
    }

    async signupRider(signupFormData: SignupForm): Promise<Record<string, any>> {
        try {
            const requiredFields: (keyof SignupForm)[] = ["firstName", "lastName", "address", "email", "password", "mobileNumber", "countryCode", "profilePicture"];
            const missingFields = requiredFields.filter(field => !(field in signupFormData));

            if (missingFields.length > 0) {
                return { status: 422, data: { message: "Invalid Data" } };
            }
            if (!signupFormData.password || !signupFormData.email || !signupFormData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
                return { status: 422, data: { message: "Invalid email or password" } };
            }
            if ((!signupFormData.countryCode || !signupFormData.mobileNumber) &&
                (signupFormData.countryCode || signupFormData.mobileNumber)) {
                return { status: 422, data: { message: "Invalid phone number" } };
            }
            if (signupFormData.profilePicture && !signupFormData.profilePicture.includes("data:image/")) {
                if (signupFormData.profilePicture.startsWith("/9j/")) {
                    signupFormData.profilePicture = "data:image/jpeg;base64,".concat(signupFormData.profilePicture);
                } else {
                    signupFormData.profilePicture = "data:image/png;base64,".concat(signupFormData.profilePicture);
                }
            }
            try {
                await this.userService.createRiderWithUser(signupFormData);
            } catch (error: any) {
                if (error instanceof CustomError) {
                    return { status: error.statusCode, data: { message: error.message } };
                }
            }
            return { status: 201, data: { message: "Rider account created successfully" } };
        } catch (error: any) {
            return { status: 500, data: { message: error.message } };
        }
    }

    async loginRider(loginFormData: LoginForm): Promise<any> {
        try {
            const requiredFields: (keyof LoginForm)[] = ["email", "password"];
            const missingFields = requiredFields.filter(field => !(field in loginFormData));

            if (missingFields.length > 0) {
                return { status: 422, data: { message: "Invalid Data" } };
            } else if (!loginFormData.password || !loginFormData.email || !loginFormData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
                return { status: 422, data: { message: "Invalid email or password format" } };
            } else {
                try {
                    return (await this.userService.authenticateRider(loginFormData));
                } catch (error: any) {
                    if (error instanceof CustomError) {
                        return { status: error.statusCode, data: { message: error.message } };
                    }
                }
            }
        } catch (error: any) {
            return { status: 500, data: { message: error.message } };
        }
    }

    async logoutRider(sessionToken: string): Promise<any> {
        try {
            if (!sessionToken || sessionToken.length == 0) {
                return { status: 422, data: { message: "Invalid Data" } };
            }
            try {
                return await this.userService.logoutRider(sessionToken);
            } catch (error: any) {
                if (error instanceof CustomError) {
                    return { status: error.statusCode, data: { message: error.message } };
                }
            }
        } catch (error: any) {
            return { status: 500, data: { message: error.message } };
        }
    }

    async loginAdmin(loginFormData: LoginForm, userSessionToken?: string | undefined): Promise<any> {
        const requiredFields: (keyof LoginForm)[] = ["email", "password"];
        const missingFields = requiredFields.filter(field => !(field in loginFormData));

        if (missingFields.length > 0) {
            return { status: 422, data: { message: "Invalid Data" } };
        }
        // else if (!userSessionToken) {
        //     return { status: 422, data: { message: "Invalid Session Token" } };
        // }
        else if (!loginFormData.password || !loginFormData.email || !loginFormData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            return { status: 422, data: { message: "Invalid email or password format" } };
        } else {
            try {
                return await this.userService.authenticateAdmin(loginFormData, userSessionToken);
            } catch (error: any) {

                if (error instanceof CustomError) {
                    return { status: error.statusCode, data: { message: error.message } };
                }
            }
        }
    }

    async logoutAdmin(sessionToken?: string): Promise<any> {
        try {
            if (!sessionToken || sessionToken.length == 0) {
                return { status: 422, data: { message: "Invalid Data" } };
            }
            try {
                return await this.userService.logoutAdmin(sessionToken);
            } catch (error: any) {
                if (error instanceof CustomError) {
                    return { status: error.statusCode, data: { message: error.message } };
                }
            }
        } catch (error: any) {
            return { status: 500, data: { message: error.message } };
        }
    }

    // async getRoleByEmail(email?: string): Promise<any> {
    //     try {
    //         if (!email || email.length == 0) {
    //             return { status: 422, data: { message: "Invalid Data" } };
    //         }
    //         try {
    //             return await this.userService.getRoleByEmail(email);
    //         } catch (error: any) {
    //             if (error instanceof CustomError) {
    //                 return { status: error.statusCode, data: { message: error.message } };
    //             }
    //         }
    //     } catch (error: any) {
    //         return { status: 500, data: { message: error.message } };
    //     }
    // }
}