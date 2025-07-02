import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { PrismaClient } from '@prisma/client';

// Import routes
import authRoutes from './routes/auth.js';
import organizationRoutes from './routes/organizations.js';
import practitionerRoutes from './routes/practitioners.js';
import patientRoutes from './routes/patients.js';
import appointmentRoutes from './routes/appointments.js';
import encounterRoutes from './routes/encounters.js';
import medicationRoutes from './routes/medications.js';
import inventoryRoutes from './routes/inventory.js';
import equipmentRoutes from './routes/equipment.js';
import staffRoutes from './routes/staff.js';
import fhirRoutes from './routes/fhir.js';

// Import middleware
import authMiddleware from './middleware/auth.js';
import auditMiddleware from './middleware/audit.js';

const prisma = new PrismaClient();

const server = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty'
    }
  }
});

// Register plugins
await server.register(cors, {
  origin: true,
  credentials: true
});

await server.register(jwt, {
  secret: process.env.JWT_SECRET || 'healthcare-secret-key-change-in-production'
});

// Swagger documentation
await server.register(swagger, {
  swagger: {
    info: {
      title: 'Healthcare Management API',
      description: 'Multi-organization healthcare management system with FHIR compliance',
      version: '1.0.0'
    },
    host: 'localhost:3000',
    schemes: ['http', 'https'],
    consumes: ['application/json'],
    produces: ['application/json'],
    securityDefinitions: {
      bearerAuth: {
        type: 'apiKey',
        name: 'Authorization',
        in: 'header',
        description: 'Enter: Bearer <token>'
      }
    }
  }
});

await server.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'full',
    deepLinking: false
  }
});

// Add Prisma to server instance
server.decorate('prisma', prisma);

// Register middleware
await server.register(auditMiddleware);

// Register routes
await server.register(authRoutes, { prefix: '/api/auth' });
await server.register(organizationRoutes, { prefix: '/api/organizations' });
await server.register(practitionerRoutes, { prefix: '/api/practitioners' });
await server.register(patientRoutes, { prefix: '/api/patients' });
await server.register(appointmentRoutes, { prefix: '/api/appointments' });
await server.register(encounterRoutes, { prefix: '/api/encounters' });
await server.register(medicationRoutes, { prefix: '/api/medications' });
await server.register(inventoryRoutes, { prefix: '/api/inventory' });
await server.register(equipmentRoutes, { prefix: '/api/equipment' });
await server.register(staffRoutes, { prefix: '/api/staff' });
await server.register(fhirRoutes, { prefix: '/fhir' });

// Health check endpoint
server.get('/health', async (request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy', timestamp: new Date().toISOString() };
  } catch (error) {
    reply.code(503);
    return { status: 'unhealthy', error: error.message };
  }
});

// Global error handler
server.setErrorHandler((error, request, reply) => {
  server.log.error(error);
  
  if (error.validation) {
    reply.code(400).send({
      error: 'Validation Error',
      message: error.message,
      details: error.validation
    });
  } else if (error.statusCode) {
    reply.code(error.statusCode).send({
      error: error.name,
      message: error.message
    });
  } else {
    reply.code(500).send({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred'
    });
  }
});

// Start server
const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    const host = process.env.HOST || '0.0.0.0';
    
    await server.listen({ port, host });
    server.log.info(`Healthcare Management API started on http://${host}:${port}`);
    server.log.info(`API Documentation available at http://${host}:${port}/docs`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();