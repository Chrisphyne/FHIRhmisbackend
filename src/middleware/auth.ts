import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createOperationOutcome } from "../utils/fhir.js";
import { User } from "../types/auth.js";
import { config } from "../config/environment.js";

declare module "fastify" {
  interface FastifyRequest {
    user: User;
  }
}

export default async function authMiddleware(server: FastifyInstance) {
  server.addHook(
    "preHandler",
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Skip auth for certain routes
      const publicRoutes = [
        "/health",
        "/metrics",
        "/test",
        "/debug",
        `${config.api.basePath}/auth/login`,
        `${config.api.basePath}/auth/register`,
        "/docs",
        "/docs/static",
        "/docs/json",
        "/docs/yaml",
        "/docs/uiConfig",
        "/docs/initOAuth",
      ];

      const isPublicRoute = publicRoutes.some(
        (route) => request.url.startsWith(route) || request.url === route,
      );

      // Also skip auth for Swagger UI static files and debug routes
      if (request.url.includes("/docs/") || request.url.includes("/static/") || request.url.startsWith("/debug")) {
        return;
      }

      if (isPublicRoute) {
        return;
      }

      try {
        server.log.info(`Auth check for ${request.method} ${request.url}`);

        // Extract token from Authorization header
        const authorization = request.headers.authorization;
        if (!authorization) {
          server.log.warn(`Missing authorization header for ${request.url}`);
          reply
            .code(401)
            .send(
              createOperationOutcome(
                "error",
                "unauthorized",
                "Missing authorization header",
              ),
            );
          return;
        }

        const token = authorization.replace("Bearer ", "");
        if (!token) {
          server.log.warn(`Invalid authorization format for ${request.url}`);
          reply
            .code(401)
            .send(
              createOperationOutcome(
                "error",
                "unauthorized",
                "Invalid authorization format",
              ),
            );
          return;
        }

        // Verify JWT token
        const decoded = server.jwt.verify(token) as {
          userId: string;
          email: string;
          role: string;
        };

        server.log.info(`Token decoded for user: ${decoded.email}`);

        // Get user with organization access
        const user = await server.prisma.user.findUnique({
          where: { id: decoded.userId },
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
          server.log.warn(`Invalid or inactive user: ${decoded.userId}`);
          reply
            .code(401)
            .send(
              createOperationOutcome(
                "error",
                "unauthorized",
                "Invalid or inactive user",
              ),
            );
          return;
        }

        server.log.info(`User found: ${user.email}, organization access count: ${user.organizationAccess.length}`);

        // Set user context
        let organizationIds = user.organizationAccess.map(
          (access) => access.organizationId,
        );
        
        // If user has no organization access, create access to all organizations for super_admin
        if (organizationIds.length === 0 && user.role === 'super_admin') {
          server.log.info(`Super admin ${user.email} has no organization access, granting access to all organizations`);
          
          try {
            // Get all organizations
            const allOrganizations = await server.prisma.organization.findMany({
              where: { active: true },
              select: { id: true, name: true }
            });

            server.log.info(`Found ${allOrganizations.length} organizations to grant access to`);

            // Create access for all organizations
            for (const org of allOrganizations) {
              try {
                await server.prisma.userOrganizationAccess.create({
                  data: {
                    userId: user.id,
                    organizationId: org.id,
                    role: 'admin',
                    status: 'active'
                  }
                });
                server.log.info(`Created access for ${user.email} to ${org.name}`);
              } catch (error) {
                server.log.warn(`Failed to create organization access for ${org.id}: ${error.message}`);
              }
            }

            // Update primary organization if not set
            if (!user.primaryOrganizationId && allOrganizations.length > 0) {
              await server.prisma.user.update({
                where: { id: user.id },
                data: { primaryOrganizationId: allOrganizations[0].id }
              });
              server.log.info(`Set primary organization for ${user.email} to ${allOrganizations[0].name}`);
            }

            // Update organizationIds for this request
            organizationIds = allOrganizations.map(org => org.id);
          } catch (error) {
            server.log.error(`Failed to grant organization access to super admin: ${error}`);
          }
        }

        const currentOrganizationId =
          (request.headers["x-organization-id"] as string) ||
          user.primaryOrganizationId ||
          organizationIds[0];

        // Validate current organization access
        if (
          currentOrganizationId &&
          !organizationIds.includes(currentOrganizationId)
        ) {
          server.log.warn(`No access to organization: ${currentOrganizationId} for user: ${user.id}`);
          reply
            .code(403)
            .send(
              createOperationOutcome(
                "error",
                "forbidden",
                "No access to specified organization",
              ),
            );
          return;
        }

        request.user = {
          id: user.id,
          email: user.email,
          role: user.role,
          organizationIds,
          primaryOrganizationId: user.primaryOrganizationId || undefined,
          currentOrganizationId,
          organizationAccess: user.organizationAccess,
        };

        server.log.info(`Authenticated user: ${user.email} for ${request.url} with orgs: [${organizationIds.join(', ')}], current: ${currentOrganizationId}`);
      } catch (error) {
        server.log.error("Auth middleware error:", error);

        // Handle specific JWT errors
        if (error.code === "FAST_JWT_INVALID_SIGNATURE") {
          reply
            .code(401)
            .send(
              createOperationOutcome(
                "error",
                "unauthorized",
                "Invalid token signature",
              ),
            );
          return;
        }

        if (error.code === "FAST_JWT_EXPIRED") {
          reply
            .code(401)
            .send(
              createOperationOutcome("error", "unauthorized", "Token expired"),
            );
          return;
        }

        reply
          .code(500)
          .send(
            createOperationOutcome("error", "exception", `Authentication error: ${error.message}`),
          );
      }
    },
  );
}