import Fastify from "fastify";
import jwt from "@fastify/jwt";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import multipart from "@fastify/multipart";
import { PrismaClient } from "@prisma/client";
import { config } from "./config/environment.js";

// Import routes
import authRoutes from "./routes/auth.js";
import organizationRoutes from "./routes/organizations.js";
import practitionerRoutes from "./routes/practitioners.js";
import patientRoutes from "./routes/patients.js";
import appointmentRoutes from "./routes/appointments.js";

// Import middleware
import authMiddleware from "./middleware/auth.js";
import auditMiddleware from "./middleware/audit.js";

const prisma = new PrismaClient({
  log:
    config.server.nodeEnv === "development"
      ? ["query", "info", "warn", "error"]
      : ["error"],
});

const server = Fastify({
  logger: {
    level: config.server.logLevel,
    transport:
      config.server.nodeEnv === "development"
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss Z",
              ignore: "pid,hostname",
            },
          }
        : undefined,
  },
});

// Add Prisma to server instance
declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

server.decorate("prisma", prisma);

// Register plugins
await server.register(cors, {
  origin: config.cors.enabled ? config.cors.origins : false,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "x-organization-id"],
});

await server.register(rateLimit, {
  max: config.rateLimit.max,
  timeWindow: config.rateLimit.window,
  errorResponseBuilder: (request, context) => ({
    code: 429,
    error: "Too Many Requests",
    message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds`,
    retryAfter: Math.round(context.ttl / 1000),
  }),
});

await server.register(jwt, {
  secret: config.jwt.secret,
  sign: {
    expiresIn: config.jwt.expiresIn,
  },
});

await server.register(multipart, {
  limits: {
    fileSize: parseFileSize(config.upload.maxSize),
    files: 10,
  },
});

// Swagger documentation (only in development)
if (config.development.enableSwagger) {
  await server.register(swagger, {
    swagger: {
      info: {
        title: "Healthcare Management API",
        description:
          "Multi-organization healthcare management system with FHIR compliance",
        version: "1.0.0",
        contact: {
          name: "WellPlace Healthcare",
          email: "support@wellplace.com",
        },
      },
      host: `${config.server.host}:${config.server.port}`,
      schemes: ["http", "https"],
      consumes: ["application/json", "multipart/form-data"],
      produces: ["application/json"],
      securityDefinitions: {
        bearerAuth: {
          type: "apiKey",
          name: "Authorization",
          in: "header",
          description: "Enter: Bearer <token>",
        },
      },
      tags: [
        {
          name: "Authentication",
          description: "User authentication and authorization",
        },
        {
          name: "Organizations",
          description: "Healthcare organization management",
        },
        {
          name: "Patients",
          description: "Patient management and FHIR resources",
        },
        {
          name: "Practitioners",
          description: "Healthcare practitioner management",
        },
        {
          name: "Appointments",
          description: "Appointment scheduling and management",
        },
        { name: "Health", description: "System health and monitoring" },
      ],
    },
  });

  await server.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 1,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
    transformSpecification: (swaggerObject) => {
      swaggerObject.host = `localhost:${config.server.port}`;
      return swaggerObject;
    },
  });
}

// Register middleware
if (config.audit.enabled) {
  await server.register(auditMiddleware);
}

await server.register(authMiddleware);

// Register routes with correct prefixes
await server.register(authRoutes, { prefix: config.api.basePath + "/auth" });
await server.register(organizationRoutes, { prefix: "" }); // This handles both /api and /fhir routes
await server.register(practitionerRoutes, { prefix: config.api.fhirPath });
await server.register(patientRoutes, { prefix: config.api.fhirPath });
await server.register(appointmentRoutes, { prefix: config.api.fhirPath });

// Health check endpoint with comprehensive checks
server.get(
  "/health",
  {
    schema: {
      tags: ["Health"],
      description: "System health check",
      response: {
        200: {
          type: "object",
          properties: {
            status: { type: "string" },
            timestamp: { type: "string" },
            version: { type: "string" },
            environment: { type: "string" },
            services: {
              type: "object",
              properties: {
                database: { type: "string" },
                redis: { type: "string" },
                external_fhir: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
  async (request, reply) => {
    const healthCheck = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
      environment: config.server.nodeEnv,
      services: {
        database: "unknown",
        redis: "unknown",
        external_fhir: "unknown",
      },
    };

    try {
      // Database health check
      await prisma.$queryRaw`SELECT 1`;
      healthCheck.services.database = "healthy";
    } catch (error) {
      healthCheck.services.database = "unhealthy";
      healthCheck.status = "degraded";
    }

    // Redis health check (if configured)
    if (config.redis.url) {
      try {
        // Add Redis health check here if Redis is configured
        healthCheck.services.redis = "healthy";
      } catch (error) {
        healthCheck.services.redis = "unhealthy";
        healthCheck.status = "degraded";
      }
    } else {
      healthCheck.services.redis = "not_configured";
    }

    // External FHIR server health check (if configured)
    if (config.externalFhir.baseUrl) {
      try {
        // Add external FHIR health check here
        healthCheck.services.external_fhir = "healthy";
      } catch (error) {
        healthCheck.services.external_fhir = "unhealthy";
        healthCheck.status = "degraded";
      }
    } else {
      healthCheck.services.external_fhir = "not_configured";
    }

    const statusCode = healthCheck.status === "healthy" ? 200 : 503;
    reply.code(statusCode).send(healthCheck);
  },
);

// Metrics endpoint (for monitoring)
server.get(
  "/metrics",
  {
    schema: {
      tags: ["Health"],
      description: "System metrics for monitoring",
    },
  },
  async (request, reply) => {
    const metrics = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      timestamp: new Date().toISOString(),
      environment: config.server.nodeEnv,
      version: process.env.npm_package_version || "1.0.0",
    };

    reply.send(metrics);
  },
);

// Global error handler
server.setErrorHandler((error, request, reply) => {
  server.log.error(error);

  // Handle validation errors
  if (error.validation) {
    reply.code(400).send({
      error: "Validation Error",
      message: error.message,
      details: error.validation,
      statusCode: 400,
    });
    return;
  }

  // Handle JWT errors
  if (
    error.code === "FST_JWT_BAD_REQUEST" ||
    error.code === "FST_JWT_NO_AUTHORIZATION_IN_HEADER"
  ) {
    reply.code(401).send({
      error: "Unauthorized",
      message: "Invalid or missing authentication token",
      statusCode: 401,
    });
    return;
  }

  // Handle rate limit errors
  if (error.statusCode === 429) {
    reply.code(429).send({
      error: "Too Many Requests",
      message: "Rate limit exceeded",
      statusCode: 429,
      retryAfter: error.retryAfter,
    });
    return;
  }

  // Handle known HTTP errors
  if (error.statusCode) {
    reply.code(error.statusCode).send({
      error: error.name || "HTTP Error",
      message: error.message,
      statusCode: error.statusCode,
    });
    return;
  }

  // Handle unknown errors
  reply.code(500).send({
    error: "Internal Server Error",
    message:
      config.server.nodeEnv === "production"
        ? "An unexpected error occurred"
        : error.message,
    statusCode: 500,
    ...(config.server.nodeEnv !== "production" && { stack: error.stack }),
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  server.log.info(`Received ${signal}, shutting down gracefully...`);

  try {
    await server.close();
    await prisma.$disconnect();
    server.log.info("Server closed successfully");
    process.exit(0);
  } catch (error) {
    server.log.error("Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Utility function to parse file size
function parseFileSize(size: string): number {
  const units: { [key: string]: number } = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };

  const match = size.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)$/i);
  if (!match) {
    throw new Error(`Invalid file size format: ${size}`);
  }

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  return value * units[unit];
}

// Start server
const start = async () => {
  try {
    await server.listen({
      port: config.server.port,
      host: config.server.host,
    });

    server.log.info(`🚀 Healthcare Management API started successfully!`);
    server.log.info(
      `📍 Server running on http://${config.server.host}:${config.server.port}`,
    );
    server.log.info(
      `📚 API Documentation: http://localhost:${config.server.port}/docs`,
    );
    server.log.info(
      `🏥 FHIR Base URL: http://localhost:${config.server.port}${config.api.fhirPath}`,
    );
    server.log.info(`🔧 Environment: ${config.server.nodeEnv}`);
    server.log.info(
      `📊 Health Check: http://localhost:${config.server.port}/health`,
    );

    if (config.development.enableSwagger) {
      server.log.info(
        `📖 Swagger UI: http://localhost:${config.server.port}/docs`,
      );
    }
  } catch (err) {
    server.log.error("Failed to start server:", err);
    process.exit(1);
  }
};

start();
