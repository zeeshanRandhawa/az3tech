import request, { Response } from 'supertest';
import App from "../../app"; // Import your Express app instance

describe("User Routes", () => {

    let app: App;

    beforeAll(() => {
        app = new App();
        app.start(); // Start the Express server
    });

    afterAll(() => {
        app.stop(); // Stop the server after tests have finished
    });

    const randomEmail: string = generateRandomEmail();

    let sessionToken: string;

    //================================================================================//
    //============================Signup Rider Test Cases=============================//
    //================================================================================//
    test("Signup Rider", async () => {

        const requestSignupBody: Record<string, any> = {
            "email": randomEmail,
            "password": "AZ3@Demo",
            "mobileNumber": "3315256123",
            "name": "Ahsan",
            "countryCode": "+92",
            "image": "data:image/png;base64,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"
        };

        //********************************************************************************//
        // Test case 1: Valid request (email is unique)
        //********************************************************************************//
        let resValid: Response = await request(app.exposeExpress())
            .post(`/api/user/rider/signup`).send(requestSignupBody);
        expect(resValid.status).toBe(201);
        expect(resValid.body.message).toBe("Rider account created successfully");

        //********************************************************************************//
        // Test case 2: Invalid request (email is not unique)
        //********************************************************************************//
        resValid = await request(app.exposeExpress())
            .post(`/api/user/rider/signup`).send(requestSignupBody);
        expect(resValid.status).toBe(409);
        expect(resValid.body.message).toBe("User already exists");

        //********************************************************************************//
        // Test case 3: Invalid request (mobile number present but code is empty)
        //********************************************************************************//
        resValid = await request(app.exposeExpress())
            .post(`/api/user/rider/signup`).send({ ...requestSignupBody, countryCode: "" });
        expect(resValid.status).toBe(422);
        expect(resValid.body.message).toBe("Invalid phone number");

        //********************************************************************************//
        // Test case 4: Invalid request (mobile code is present but number is empty)
        //********************************************************************************//
        resValid = await request(app.exposeExpress())
            .post(`/api/user/rider/signup`).send({ ...requestSignupBody, mobileNumber: "" });
        expect(resValid.status).toBe(422);
        expect(resValid.body.message).toBe("Invalid phone number");

        //********************************************************************************//
        // Test case 6: Invalid request (no email given)
        //********************************************************************************//
        resValid = await request(app.exposeExpress())
            .post(`/api/user/rider/signup`).send({ ...requestSignupBody, email: null });
        expect(resValid.status).toBe(422);
        expect(resValid.body.message).toBe("Invalid email or password");

    });

    const requestLoginBody: Record<string, any> = {
        "password": "AZ3@Demo",
        "email": randomEmail
    }

    //================================================================================//
    //=============================Login Rider Test Cases=============================//
    //================================================================================//
    test("Login Rider", async () => {
        //********************************************************************************//
        // Test case 1: Valid request
        //********************************************************************************//
        let resValid = await request(app.exposeExpress())
            .post(`/api/user/rider/login`).send(requestLoginBody);
        expect(resValid.status).toBe(200);
        expect(resValid.body.message).toBe("Login successful");
        expect(resValid.body.sessionToken).toBeDefined();
        expect(resValid.body.sessionToken.token).toBeTruthy(); // Ensure token is present
        expect(resValid.body.sessionToken.expireTime).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/);

        sessionToken = resValid.body.sessionToken.token;

        //********************************************************************************//
        // Test case 2: Invalid request (using admin email of rider login)
        //********************************************************************************//
        resValid = await request(app.exposeExpress())
            .post(`/api/user/rider/login`).send({ ...requestLoginBody, email: "admin@az3tech.com" });
        expect(resValid.status).toBe(401);
        expect(resValid.body.message).toBe("User not found with expected role");

        //********************************************************************************//
        // Test case 3: Invalid request (email does not exist)
        //********************************************************************************//
        resValid = await request(app.exposeExpress())
            .post(`/api/user/rider/login`).send({ ...requestLoginBody, email: "some@email.com" });
        expect(resValid.status).toBe(404);
        expect(resValid.body.message).toBe("Email not found");

        //********************************************************************************//
        // Test case 4: Invalid request (invalid password)
        //********************************************************************************//
        resValid = await request(app.exposeExpress())
            .post(`/api/user/rider/login`).send({ ...requestLoginBody, password: "****" });
        expect(resValid.status).toBe(401);
        expect(resValid.body.message).toBe("Invalid password");

    });

    //================================================================================//
    //============================Logout Rider Test Cases=============================//
    //================================================================================//
    test("Logout Rider", async () => {
        //********************************************************************************//
        // Test case 1: Valid request
        //********************************************************************************//
        const requestLogoutBody: Record<string, any> = {
            "sessionToken": sessionToken
        }

        let resValid = await request(app.exposeExpress())
            .post(`/api/user/rider/logout`).send(requestLogoutBody);
        expect(resValid.status).toBe(200);
        expect(resValid.body.message).toBe("User logged out");

        //********************************************************************************//
        // Test case 2: Invalid request (invalid token)
        //********************************************************************************//
        resValid = await request(app.exposeExpress())
            .post(`/api/user/rider/logout`).send(requestLogoutBody);
        expect(resValid.status).toBe(401);
        expect(resValid.body.message).toBe("User not logged in");

        //********************************************************************************//
        // Test case 2: Invalid request (no body given)
        //********************************************************************************//
        resValid = await request(app.exposeExpress())
            .post(`/api/user/rider/logout`).send({});
        expect(resValid.status).toBe(422);
        expect(resValid.body.message).toBe("Invalid Data");

    });

    //================================================================================//
    //=============================Login Admin Test Cases=============================//
    //================================================================================//
    test("Login Admin", async () => {
        //********************************************************************************//
        // Test case 1: Valid request
        //********************************************************************************//
        requestLoginBody.email = "admin@az3tech.com";

        let resValid = await request(app.exposeExpress())
            .post(`/api/user/admin/login`)
            .set('Cookie', [`sessionToken=${sessionToken}`])
            .send(requestLoginBody);
        expect(resValid.status).toBe(200);
        expect(resValid.body.message).toBe("Login successful");
        expect(resValid.body.sessionToken).toBeDefined();
        expect(resValid.body.sessionToken.token).toBeTruthy(); // Ensure token is present
        expect(resValid.body.sessionToken.expireTime).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/);

        sessionToken = resValid.body.sessionToken.token;

        //********************************************************************************//
        // Test case 2: Invalid request (now admin is already authenticated)
        //********************************************************************************//
        resValid = await request(app.exposeExpress())
            .post(`/api/user/admin/login`)
            .set('Cookie', [`sessionToken=${sessionToken}`])
            .send(requestLoginBody);
        expect(resValid.status).toBe(400);
        expect(resValid.body.message).toBe("Already authorized");

        //********************************************************************************//
        // Test case 3: Invalid request (email does not exist in data base)
        //********************************************************************************//
        resValid = await request(app.exposeExpress())
            .post(`/api/user/admin/login`)
            .set('Cookie', [`sessionToken="gyuhgfhj"`])
            .send({ ...requestLoginBody, email: "emailnotexist@az3tech.com" });
        expect(resValid.status).toBe(404);
        expect(resValid.body.message).toBe("Email not found");

        //********************************************************************************//
        // Test case 4: Invalid request (email exist in data base but type is not admin)
        //********************************************************************************//
        resValid = await request(app.exposeExpress())
            .post(`/api/user/admin/login`)
            .set('Cookie', [`sessionToken="gyuhgfhj"`])
            .send({ ...requestLoginBody, email: randomEmail });
        expect(resValid.status).toBe(401);
        expect(resValid.body.message).toBe("Admin not found with expected role");

        //*********************************************************************************************//
        // Test case 5: Invalid request (email exist in data base role is not admin but wrong password)
        //********************************************************************************************//
        resValid = await request(app.exposeExpress())
            .post(`/api/user/admin/login`)
            .set('Cookie', [`sessionToken="gyuhgfhj"`])
            .send({ ...requestLoginBody, password: "***" });
        expect(resValid.status).toBe(401);
        expect(resValid.body.message).toBe("Invalid password");

    });

    //================================================================================//
    //=============================Logout Admin Test Cases=============================//
    //================================================================================//
    test("Logout Admin", async () => {
        //********************************************************************************//
        // Test case 1: Valid request
        //********************************************************************************//
        let resValid = await request(app.exposeExpress())
            .get(`/api/user/admin/logout`)
            .set('Cookie', [`sessionToken=${sessionToken}`])
        expect(resValid.status).toBe(200);
        expect(resValid.body.message).toBe("User logged out");

        //********************************************************************************//
        // Test case 2: Invalid request (empty token)
        //********************************************************************************//
        resValid = await request(app.exposeExpress())
            .get(`/api/user/admin/logout`)
            .set('Cookie', [`sessionToken=""`])
        expect(resValid.status).toBe(422);
        expect(resValid.body.message).toBe("Invalid Data");

        //********************************************************************************//
        // Test case 2: Invalid request (token not given)
        //********************************************************************************//
        resValid = await request(app.exposeExpress())
            .get(`/api/user/admin/logout`)
        expect(resValid.status).toBe(422);
        expect(resValid.body.message).toBe("Invalid Data");

        //********************************************************************************//
        // Test case 2: Invalid request (token given but not in database)
        //********************************************************************************//
        resValid = await request(app.exposeExpress())
            .get(`/api/user/admin/logout`)
            .set('Cookie', [`sessionToken="***"`])
        expect(resValid.status).toBe(401);
        expect(resValid.body.message).toBe("User not logged in");
    });
});

function generateRandomEmail() {
    const domains = ['az3tech.com'];
    const usernameLength = Math.floor(Math.random() * 10) + 5; // Random username length between 5 and 15
    const domainIndex = Math.floor(Math.random() * domains.length);
    const username = Array.from({ length: usernameLength }, () =>
        String.fromCharCode(Math.floor(Math.random() * 26) + 97)
    ).join('');

    return `${username}@${domains[domainIndex]}`;
}