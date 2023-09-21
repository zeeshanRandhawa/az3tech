import swaggerUi from 'swagger-ui-express';
import { Application, Request, Response } from 'express';
import swaggerJsdoc, { Options } from 'swagger-jsdoc';

export const setupSwagger = (app: Application) => {
  const options: Options = {
    swaggerDefinition: {
      openapi: '3.0.0',
      info: {
        title: 'AZ3 MVP API Documentation',
        version: '1.0.0',
        description: 'All routes and operations defined here',
      },
    },
    apis: ['**/*.ts'],
  };

  const specs = swaggerJsdoc(options);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
};
