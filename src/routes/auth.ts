import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcryptjs";
import { createOperationOutcome } from "../utils/fhir.js";
import { LoginRequest, RegisterRequest } from "../types/auth.js";
import { config } from "../config/environment.js";

export default async function authRoutes(server: FastifyInstance) {
  // POST /api/auth/register
  server.post<{ Body: RegisterRequest }>(
    "/register",
    {
      schema: {
        tags: ["Authentication"],
        description: "Register a new user",
        body: {
          type: "object",
          required: ["email", "password", "role"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string", minLength: 8 },
            role: {
              type: "string",
              enum: [
                "super_admin",
                "org_admin",
                "practitioner",
                "staff",
                "readonly",
              ],
            },
            organizationId: { type: "string" },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              resourceType: { type: "string" },
              issue: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    severity: { type: "string" },
                    code: { type: "string" },
                    diagnostics: { type: "string" },
                  },
                },
              },
            },
          },
          409: {
            type: "object",
            properties: {
              resourceType: { type: "string" },
              issue: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    severity: { type: "string" },
                    code: { type: "string" },
                    diagnostics: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: RegisterRequest }>,
      reply: FastifyReply,
    ) => {
      try {
        const { email, password, role, organizationId } = request.body;

        server.log.info(`Registration attempt for email: ${email}`);

        // Check if user already exists
        const existingUser = await server.prisma.user.findUnique({
          where: { email },
        });

        if (existingUser) {
          server.log.warn(
            `Registration failed - user already exists: ${email}`,
          );
          return reply
            .code(409)
            .send(
              createOperationOutcome(
                "error",
                "conflict",
                "User already exists",
              ),
            );
        }

        // Hash password
        const passwordHash = await bcrypt.hash(
          password,
          config.security.bcryptRounds,
        );

        // Create user
        const user = await server.prisma.user.create({
          data: {
            email,
            passwordHash,
            role,
            primaryOrganizationId: organizationId || null,
            active: true,
          },
        });

        server.log.info(`User created successfully: ${user.id}`);

        // If organization specified, create access
        if (organizationId) {
          try {
            await server.prisma.userOrganizationAccess.create({
              data: {
                userId: user.id,
                organizationId,
                role: role === "super_admin" ? "admin" : role,
                status: "active",
              },
            });
            server.log.info(
              `User organization access created for: ${user.id} -> ${organizationId}`,
            );
          } catch (orgError) {
            server.log.warn(
              `Failed to create organization access: ${orgError}`,
            );
            // Continue without failing registration
          }
        }

        reply.code(201).send({
          resourceType: "OperationOutcome",
          issue: [
            {
              severity: "information",
              code: "informational",
              diagnostics: "User registered successfully",
            },
          ],
        });
      } catch (error) {
        server.log.error("Registration error:", error);
        reply
          .code(500)
          .send(
            createOperationOutcome(
              "error",
              "exception",
              "Internal server error",
            ),
          );
      }
    },
  );

  // POST /api/auth/login
  server.post<{ Body: LoginRequest }>(
    "/login",
    {
      schema: {
        tags: ["Authentication"],
        description: "Login user",
        body: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email" },
            password: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              token: { type: "string" },
              user: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  email: { type: "string" },
                  role: { type: "string" },
                  primaryOrganizationId: { type: "string" },
                  organizations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        role: { type: "string" },
                        permissions: { type: "object" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: LoginRequest }>,
      reply: FastifyReply,
    ) => {
      try {
        const { email, password } = request.body;

        server.log.info(`Login attempt for email: ${email}`);

        // Find user with organization access
        const user = await server.prisma.user.findUnique({
          where: { email },
          include: {
            organizationAccess: {
              where: { status: "active" },
              include: {
                organization: {
                  select: { id: true, name: true, active: true },
                },
              },
            },
          },
        });

        if (!user || !user.active) {
          server.log.warn(`Login failed - invalid user: ${email}`);
          return reply
            .code(401)
            .send(
              createOperationOutcome(
                "error",
                "unauthorized",
                "Invalid credentials",
              ),
            );
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(
          password,
          user.passwordHash,
        );
        if (!isValidPassword) {
          server.log.warn(`Login failed - invalid password: ${email}`);
          return reply
            .code(401)
            .send(
              createOperationOutcome(
                "error",
                "unauthorized",
                "Invalid credentials",
              ),
            );
        }

        // Update last login
        await server.prisma.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() },
        });

        // Generate JWT token
        const token = server.jwt.sign(
          {
            userId: user.id,
            email: user.email,
            role: user.role,
          },
          { expiresIn: config.jwt.expiresIn },
        );

        server.log.info(`Login successful for user: ${user.id}`);

        // Return user info and token
        reply.send({
          token,
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            primaryOrganizationId: user.primaryOrganizationId,
            organizations: user.organizationAccess.map((access) => ({
              id: access.organization.id,
              name: access.organization.name,
              role: access.role,
              permissions: access.permissions,
            })),
          },
        });
      } catch (error) {
        server.log.error("Login error:", error);
        reply
          .code(500)
          .send(
            createOperationOutcome(
              "error",
              "exception",
              "Internal server error",
            ),
          );
      }
    },
  );

  // POST /api/auth/refresh
  server.post(
    "/refresh",
    {
      schema: {
        tags: ["Authentication"],
        description: "Refresh authentication token",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              token: { type: "string" },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user;

        // Generate new token
        const token = server.jwt.sign(
          {
            userId: user.id,
            email: user.email,
            role: user.role,
          },
          { expiresIn: config.jwt.expiresIn },
        );

        server.log.info(`Token refreshed for user: ${user.id}`);

        reply.send({ token });
      } catch (error) {
        server.log.error("Token refresh error:", {
          error: error.message,
          stack: error.stack,
          user: request.user?.email
        });
        reply
          .code(500)
          .send(
            createOperationOutcome(
              "error",
              "exception",
              `Token refresh failed: ${error.message}`,
            ),
          );
      }
    },
  );

  // GET /api/auth/me - Get current user info
  server.get(
    "/me",
    {
      schema: {
        tags: ["Authentication"],
        description: "Get current user information",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "string" },
              email: { type: "string" },
              role: { type: "string" },
              primaryOrganizationId: { type: "string" },
              currentOrganizationId: { type: "string" },
              organizations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    role: { type: "string" },
                    permissions: { type: "object" },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        server.log.info(`🔍 Getting user info for: ${request.user?.email || 'unknown'}`);
        
        const user = request.user;
        if (!user) {
          server.log.error('❌ No user found in request context');
          return reply
            .code(401)
            .send(
              createOperationOutcome("error", "unauthorized", "User not authenticated"),
            );
        }

        server.log.info(`📊 Fetching fresh user data for: ${user.id}`);

        // Get fresh user data with organizations
        const userData = await server.prisma.user.findUnique({
          where: { id: user.id },
          include: {
            organizationAccess: {
              where: { status: "active" },
              include: {
                organization: {
                  select: { id: true, name: true, active: true },
                },
              },
            },
          },
        });

        if (!userData) {
          server.log.error(`❌ User not found in database: ${user.id}`);
          return reply
            .code(404)
            .send(
              createOperationOutcome("error", "not-found", "User not found"),
            );
        }

        server.log.info(`✅ User data retrieved successfully for: ${userData.email}`);

        const response = {
          id: userData.id,
          email: userData.email,
          role: userData.role,
          primaryOrganizationId: userData.primaryOrganizationId,
          currentOrganizationId: user.currentOrganizationId,
          organizations: userData.organizationAccess.map((access) => ({
            id: access.organization.id,
            name: access.organization.name,
            role: access.role,
            permissions: access.permissions,
          })),
        };

        server.log.info(`📤 Sending user info response for: ${userData.email}`);
        reply.send(response);
      } catch (error) {
        server.log.error("Get user info error:", {
          error: error.message,
          stack: error.stack,
          user: request.user?.email,
          userId: request.user?.id
        });
        reply
          .code(500)
          .send(
            createOperationOutcome(
              "error",
              "exception",
              `Failed to get user info: ${error.message}`,
            ),
          );
      }
    },
  );

  // POST /api/auth/logout
  server.post(
    "/logout",
    {
      schema: {
        tags: ["Authentication"],
        description: "Logout user (client-side token invalidation)",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              resourceType: { type: "string" },
              issue: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    severity: { type: "string" },
                    code: { type: "string" },
                    diagnostics: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user;
        server.log.info(`User logged out: ${user.id}`);

        reply.send({
          resourceType: "OperationOutcome",
          issue: [
            {
              severity: "information",
              code: "informational",
              diagnostics: "User logged out successfully",
            },
          ],
        });
      } catch (error) {
        server.log.error("Logout error:", {
          error: error.message,
          stack: error.stack,
          user: request.user?.email
        });
        reply
          .code(500)
          .send(
            createOperationOutcome(
              "error",
              "exception",
              `Logout failed: ${error.message}`,
            ),
          );
      }
    },
  );
}