import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  createOperationOutcome,
  transformOrganizationFromDB,
  transformOrganizationToDB,
  createBundle,
} from "../utils/fhir.js";
import { FHIROrganization } from "../types/fhir.js";

export default async function organizationRoutes(server: FastifyInstance) {
  // GET /api/user/organizations - Get user's accessible organizations
  server.get(
    "/api/user/organizations",
    {
      schema: {
        tags: ["Organizations"],
        description: "Get user accessible organizations",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              organizations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    type: { type: "string" },
                    identifier: { type: "object" },
                    role: { type: "string" },
                    permissions: { type: "object" },
                    isPrimary: { type: "boolean" },
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
        server.log.info(`🔍 Getting user organizations for: ${request.user?.email}`);
        
        const { id: userId } = request.user;

        const userAccess = await server.prisma.userOrganizationAccess.findMany({
          where: {
            userId,
            status: "active",
          },
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                type: true,
                active: true,
                identifier: true,
              },
            },
          },
        });

        server.log.info(`📊 Found ${userAccess.length} organization access records`);

        const organizations = userAccess.map((access) => ({
          id: access.organization.id,
          name: access.organization.name,
          type: access.organization.type,
          identifier: access.organization.identifier,
          role: access.role,
          permissions: access.permissions,
          isPrimary:
            access.organizationId === request.user.primaryOrganizationId,
        }));

        server.log.info(`✅ Returning ${organizations.length} organizations`);
        reply.send({ organizations });
      } catch (error) {
        server.log.error("Get user organizations error:", {
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
              `Failed to get user organizations: ${error.message}`,
            ),
          );
      }
    },
  );

  // POST /api/user/switch-organization - Switch current organization context
  server.post<{ Body: { organizationId: string } }>(
    "/api/user/switch-organization",
    {
      schema: {
        tags: ["Organizations"],
        description: "Switch current organization context",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["organizationId"],
          properties: {
            organizationId: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              message: { type: "string" },
              currentOrganization: { type: "string" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { organizationId: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const { organizationId } = request.body;
        const { organizationIds } = request.user;

        if (!organizationIds.includes(organizationId)) {
          return reply
            .code(403)
            .send(
              createOperationOutcome(
                "error",
                "forbidden",
                "No access to specified organization",
              ),
            );
        }

        reply.send({
          message: "Organization context switched successfully",
          currentOrganization: organizationId,
        });
      } catch (error) {
        server.log.error("Switch organization error:", {
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
              `Failed to switch organization: ${error.message}`,
            ),
          );
      }
    },
  );

  // GET /fhir/Organization - Search organizations
  server.get(
    "/fhir/Organization",
    {
      schema: {
        tags: ["Organizations"],
        description: "Search organizations (FHIR)",
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              resourceType: { type: "string" },
              type: { type: "string" },
              total: { type: "number" },
              entry: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    fullUrl: { type: "string" },
                    resource: { type: "object" },
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
        server.log.info(`🏥 Organization search request from: ${request.user?.email}`);
        server.log.info(`📋 User organization IDs: [${request.user?.organizationIds?.join(', ')}]`);

        const { organizationIds } = request.user;

        if (!organizationIds || organizationIds.length === 0) {
          server.log.warn(`⚠️ User has no organization access: ${request.user?.email}`);
          const bundle = createBundle("searchset", []);
          return reply.send(bundle);
        }

        server.log.info(`🔍 Searching organizations with IDs: [${organizationIds.join(', ')}]`);

        const organizations = await server.prisma.organization.findMany({
          where: {
            id: { in: organizationIds },
          },
        });

        server.log.info(`📊 Found ${organizations.length} organizations`);

        const entries = organizations.map((org) => ({
          fullUrl: `${request.protocol}://${request.hostname}/fhir/Organization/${org.id}`,
          resource: transformOrganizationFromDB(org),
        }));

        const bundle = createBundle("searchset", entries);
        server.log.info(`✅ Returning bundle with ${entries.length} entries`);
        reply.send(bundle);
      } catch (error) {
        server.log.error("Search organizations error:", {
          error: error.message,
          stack: error.stack,
          user: request.user?.email,
          organizationIds: request.user?.organizationIds
        });
        reply
          .code(500)
          .send(
            createOperationOutcome(
              "error",
              "exception",
              `Failed to search organizations: ${error.message}`,
            ),
          );
      }
    },
  );

  // GET /fhir/Organization/:id - Get organization by ID
  server.get<{ Params: { id: string } }>(
    "/fhir/Organization/:id",
    {
      schema: {
        tags: ["Organizations"],
        description: "Get organization by ID (FHIR)",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              resourceType: { type: "string" },
              id: { type: "string" },
              name: { type: "string" },
              active: { type: "boolean" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const { id } = request.params;
        const { organizationIds } = request.user;

        if (!organizationIds.includes(id)) {
          return reply
            .code(403)
            .send(
              createOperationOutcome(
                "error",
                "forbidden",
                "No access to specified organization",
              ),
            );
        }

        const organization = await server.prisma.organization.findUnique({
          where: { id },
        });

        if (!organization) {
          return reply
            .code(404)
            .send(
              createOperationOutcome(
                "error",
                "not-found",
                "Organization not found",
              ),
            );
        }

        reply.send(transformOrganizationFromDB(organization));
      } catch (error) {
        server.log.error("Get organization error:", {
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
              `Failed to get organization: ${error.message}`,
            ),
          );
      }
    },
  );

  // POST /fhir/Organization - Create organization (super admin only)
  server.post<{ Body: FHIROrganization }>(
    "/fhir/Organization",
    {
      schema: {
        tags: ["Organizations"],
        description: "Create organization (FHIR) - Super admin only",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["resourceType", "name"],
          properties: {
            resourceType: { type: "string", enum: ["Organization"] },
            name: { type: "string" },
            active: { type: "boolean" },
            type: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                },
              },
            },
            telecom: { type: "array" },
            address: { type: "array" },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              resourceType: { type: "string" },
              id: { type: "string" },
              name: { type: "string" },
              active: { type: "boolean" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: FHIROrganization }>,
      reply: FastifyReply,
    ) => {
      try {
        if (request.user.role !== "super_admin") {
          return reply
            .code(403)
            .send(
              createOperationOutcome(
                "error",
                "forbidden",
                "Insufficient permissions",
              ),
            );
        }

        const organizationData = transformOrganizationToDB(request.body);

        const organization = await server.prisma.organization.create({
          data: organizationData,
        });

        reply.code(201).send(transformOrganizationFromDB(organization));
      } catch (error) {
        server.log.error("Create organization error:", {
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
              `Failed to create organization: ${error.message}`,
            ),
          );
      }
    },
  );

  // PUT /fhir/Organization/:id - Update organization
  server.put<{ Params: { id: string }; Body: FHIROrganization }>(
    "/fhir/Organization/:id",
    {
      schema: {
        tags: ["Organizations"],
        description: "Update organization (FHIR)",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
        body: {
          type: "object",
          required: ["resourceType", "name"],
          properties: {
            resourceType: { type: "string", enum: ["Organization"] },
            name: { type: "string" },
            active: { type: "boolean" },
            type: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                },
              },
            },
            telecom: { type: "array" },
            address: { type: "array" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              resourceType: { type: "string" },
              id: { type: "string" },
              name: { type: "string" },
              active: { type: "boolean" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: FHIROrganization;
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const { id } = request.params;
        const { organizationIds } = request.user;

        // Check if user has admin access to this organization
        const hasAdminAccess = request.user.organizationAccess.some(
          (access) =>
            access.organizationId === id &&
            ["admin", "super_admin"].includes(access.role),
        );

        if (!hasAdminAccess) {
          return reply
            .code(403)
            .send(
              createOperationOutcome(
                "error",
                "forbidden",
                "Insufficient permissions",
              ),
            );
        }

        const organizationData = transformOrganizationToDB(request.body);

        const organization = await server.prisma.organization.update({
          where: { id },
          data: organizationData,
        });

        reply.send(transformOrganizationFromDB(organization));
      } catch (error) {
        server.log.error("Update organization error:", {
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
              `Failed to update organization: ${error.message}`,
            ),
          );
      }
    },
  );
}