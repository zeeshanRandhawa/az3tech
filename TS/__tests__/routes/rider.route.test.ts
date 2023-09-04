
import request from 'supertest';
import App from "../../app"; // Import your Express app instance



describe("Rider Routes", () => {

    let app: App;

    beforeAll(() => {
        app = new App();
        app.start(); // Start the Express server
    });

    afterAll(() => {
        app.stop(); // Stop the server after tests have finished
    });

    test("List Riders by pageNumber", async () => {

        // Test case 1: Valid request
        const resValid = await request(app.exposeExpress())
            .get(`/api/rider?pageNumber=${1}`);
        expect(resValid.status).toBe(200);
        expect(Array.isArray(resValid.body.riders)).toBe(true);
        expect(resValid.body.riders.length).toBeGreaterThan(0);


        // // Test case 2: Invalid data (missing fields)
        // const invalidRequestBodyMissingFields: NodeForm = {
        //     location: "Bay Fair",
        //     description: "BART",
        //     address: '',
        //     city: '',
        //     stateProvince: ''
        // };

        // const resInvalidMissingFields = await request(app)
        //   .patch(`/api/node/${nodeId}`)
        //   .send(invalidRequestBodyMissingFields);

        // expect(resInvalidMissingFields.status).toBe(422);
        // expect(resInvalidMissingFields.body).toHaveProperty('status', 422);
        // expect(resInvalidMissingFields.body).toHaveProperty('data.message', "Invalid Data");

        // // Test case 3: Missing required columns
        // const invalidRequestBodyMissingColumns: NodeForm = {
        //     location: "Bay Fair",
        //     description: "BART",
        //     address: "15242 Hesperian Boulevard",
        //     city: '',
        //     stateProvince: ''
        // };

        // const resInvalidMissingColumns = await request(app)
        //   .patch(`/api/node/${nodeId}`)
        //   .send(invalidRequestBodyMissingColumns);

        // expect(resInvalidMissingColumns.status).toBe(422);
        // expect(resInvalidMissingColumns.body).toHaveProperty('status', 422);
        // expect(resInvalidMissingColumns.body).toHaveProperty('data.message', "Missing Required Columns");

        // // Test case 4: Custom error from NodeService
        // const resCustomError = await request(app)
        //   .patch(`/api/node/${nodeId}`)
        //   .send(validRequestBody);

        // expect(resCustomError.status).toBe(500); // Assuming CustomError is handled with a 500 status
        // expect(resCustomError.body).toHaveProperty('status', 500);
        // expect(resCustomError.body).toHaveProperty('data.message'); // Assuming the response format includes an error message
    });
});