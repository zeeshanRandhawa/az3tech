
import request from 'supertest';
import App from "../../app"; // Import your Express app instance
import { NodeForm } from "../../util/interface.utility"



describe("Node Routes tests", () => {

  let app: App;

  beforeAll(() => {
    app = new App();
    app.start(); // Start the Express server
  });

  afterAll(() => {
    app.stop(); // Stop the server after tests have finished
  });

  test("Update node by ID", async () => {
    const nodeId = 2508;
    const validRequestBody: NodeForm = {
      location: "Bay Fair",
      description: "BART",
      address: "15242 Hesperian Boulevard",
      city: "San Leandro",
      stateProvince: "CA",
      zipPostalCode: "94578",
      transitTime: "11"
    };

    // Test case 1: Valid request
    const resValid = await request(app.exposeExpress())
      .patch(`/api/node/${nodeId}`)
      .send(validRequestBody);
    expect(resValid.status).toBe(200);
    expect(resValid.body.message).toBe('Node Updated Successfully'); 


    // Test case 2: Invalid data (missing fields)
    const invalidRequestBodyMissingFields: NodeForm = {
        location: "Bay Fair",
        description: "BART",
        address: '15242 Hesperian Boulevard',
        city: 'San Leandro',
        stateProvince: ''
    };

    const resInvalidMissingFields = await request(app.exposeExpress())
      .patch(`/api/node/${nodeId}`)
      .send(invalidRequestBodyMissingFields);

    expect(resInvalidMissingFields.status).toBe(422);
    expect(resInvalidMissingFields.body).toHaveProperty('data.message', "Invalid Data");

    // Test case 3: Missing required columns
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
