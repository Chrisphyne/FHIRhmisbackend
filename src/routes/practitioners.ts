import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createOperationOutcome, transformPractitionerFromDB, transformPractitionerToDB, createBundle } from '../utils/fhir.js';
import { FHIRPractitioner } from '../types/fhir.js';

export default async function practitionerRoutes(server: FastifyInstance) {

  // GET /fhir/Practitioner - Search practitioners
  server.get<{ Querystring: { organization?: string, name?: string, specialty?: string } }>(
    '/Practitioner', 
    {
      schema: {
        tags: ["Practitioners"],
        description: "Search practitioners (FHIR)",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            organization: { type: "string" },
            name: { type: "string" },
            specialty: { type: "string" }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Querystring: { organization?: string, name?: string, specialty?: string } }>, reply: FastifyReply) => {
    try {
      const { organizationIds, currentOrganizationId } = request.user;
      const query = request.query;

      let where: any = {
        organizations: {
          some: {
            organizationId: query.organization || currentOrganizationId,
            status: 'active'
          }
        }
      };

      // Name filtering
      if (query.name) {
        where.name = {
          path: '$[*].family',
          string_contains: query.name
        };
      }

      // Specialty filtering
      if (query.specialty) {
        where.specialty = {
          path: '$[*].coding[*].code',
          array_contains: query.specialty
        };
      }

      const practitioners = await server.prisma.practitioner.findMany({
        where,
        include: {
          organizations: {
            include: {
              organization: {
                select: { id: true, name: true }
              }
            }
          }
        }
      });

      const entries = practitioners.map(practitioner => ({
        fullUrl: `${request.protocol}://${request.hostname}/fhir/Practitioner/${practitioner.id}`,
        resource: transformPractitionerFromDB(practitioner, { includeOrganizations: true })
      }));

      const bundle = createBundle("searchset", entries);
      reply.send(bundle);

    } catch (error) {
      server.log.error('Search practitioners error:', error);
      reply.code(500).send(createOperationOutcome('error', 'exception', 'Internal server error'));
    }
  });

  // GET /fhir/Practitioner/:id - Get practitioner by ID
  server.get<{ Params: { id: string } }>(
    '/Practitioner/:id',
    {
      schema: {
        tags: ["Practitioners"],
        description: "Get practitioner by ID (FHIR)",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string" }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { organizationIds } = request.user;

      const practitioner = await server.prisma.practitioner.findFirst({
        where: {
          id,
          organizations: {
            some: {
              organizationId: { in: organizationIds },
              status: 'active'
            }
          }
        },
        include: {
          organizations: {
            include: {
              organization: {
                select: { id: true, name: true }
              }
            }
          }
        }
      });

      if (!practitioner) {
        return reply.code(404).send(createOperationOutcome('error', 'not-found', 'Practitioner not found'));
      }

      reply.send(transformPractitionerFromDB(practitioner, { includeOrganizations: true }));

    } catch (error) {
      server.log.error('Get practitioner error:', error);
      reply.code(500).send(createOperationOutcome('error', 'exception', 'Internal server error'));
    }
  });

  // POST /fhir/Practitioner - Create practitioner
  server.post<{ Body: FHIRPractitioner }>(
    '/Practitioner',
    {
      schema: {
        tags: ["Practitioners"],
        description: "Create practitioner (FHIR)",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["resourceType", "name"],
          properties: {
            resourceType: { type: "string", enum: ["Practitioner"] },
            name: { type: "array" },
            active: { type: "boolean" },
            identifier: { type: "array" },
            telecom: { type: "array" },
            gender: { type: "string" },
            birthDate: { type: "string" }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: FHIRPractitioner }>, reply: FastifyReply) => {
    try {
      const { currentOrganizationId } = request.user;
      const practitionerData = transformPractitionerToDB(request.body);

      const practitioner = await server.prisma.practitioner.create({
        data: practitionerData
      });

      // Assign to current organization
      if (currentOrganizationId) {
        await server.prisma.practitionerOrganization.create({
          data: {
            practitionerId: practitioner.id,
            organizationId: currentOrganizationId,
            role: 'primary'
          }
        });
      }

      reply.code(201).send(transformPractitionerFromDB(practitioner));

    } catch (error) {
      server.log.error('Create practitioner error:', error);
      reply.code(500).send(createOperationOutcome('error', 'exception', 'Internal server error'));
    }
  });

  // PUT /fhir/Practitioner/:id - Update practitioner
  server.put<{ Params: { id: string }, Body: FHIRPractitioner }>(
    '/Practitioner/:id',
    {
      schema: {
        tags: ["Practitioners"],
        description: "Update practitioner (FHIR)",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string" }
          }
        },
        body: {
          type: "object",
          required: ["resourceType", "name"],
          properties: {
            resourceType: { type: "string", enum: ["Practitioner"] },
            name: { type: "array" },
            active: { type: "boolean" },
            identifier: { type: "array" },
            telecom: { type: "array" },
            gender: { type: "string" },
            birthDate: { type: "string" }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Params: { id: string }, Body: FHIRPractitioner }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { organizationIds } = request.user;

      // Check if practitioner exists and user has access
      const existingPractitioner = await server.prisma.practitioner.findFirst({
        where: {
          id,
          organizations: {
            some: {
              organizationId: { in: organizationIds },
              status: 'active'
            }
          }
        }
      });

      if (!existingPractitioner) {
        return reply.code(404).send(createOperationOutcome('error', 'not-found', 'Practitioner not found'));
      }

      const practitionerData = transformPractitionerToDB(request.body);
      
      const practitioner = await server.prisma.practitioner.update({
        where: { id },
        data: practitionerData
      });

      reply.send(transformPractitionerFromDB(practitioner));

    } catch (error) {
      server.log.error('Update practitioner error:', error);
      reply.code(500).send(createOperationOutcome('error', 'exception', 'Internal server error'));
    }
  });

  // POST /fhir/Practitioner/:id/assign-organization - Assign practitioner to organization
  server.post<{ Params: { id: string }, Body: { organizationId: string, role?: string, permissions?: any } }>(
    '/Practitioner/:id/assign-organization',
    {
      schema: {
        tags: ["Practitioners"],
        description: "Assign practitioner to organization",
        security: [{ bearerAuth: [] }],
        params: {
          type: "object",
          properties: {
            id: { type: "string" }
          }
        },
        body: {
          type: "object",
          required: ["organizationId"],
          properties: {
            organizationId: { type: "string" },
            role: { type: "string" },
            permissions: { type: "object" }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Params: { id: string }, Body: { organizationId: string, role?: string, permissions?: any } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { organizationId, role = 'consulting', permissions } = request.body;
      const { organizationIds } = request.user;

      if (!organizationIds.includes(organizationId)) {
        return reply.code(403).send(createOperationOutcome("error", "forbidden", "No access to target organization"));
      }

      // Check if assignment already exists
      const existing = await server.prisma.practitionerOrganization.findUnique({
        where: {
          practitionerId_organizationId: {
            practitionerId: id,
            organizationId
          }
        }
      });

      if (existing) {
        return reply.code(409).send(createOperationOutcome("error", "conflict", "Practitioner already assigned to organization"));
      }

      await server.prisma.practitionerOrganization.create({
        data: {
          practitionerId: id,
          organizationId,
          role,
          permissions
        }
      });

      reply.code(201).send({
        resourceType: "OperationOutcome",
        issue: [{
          severity: "information",
          code: "informational",
          diagnostics: "Practitioner successfully assigned to organization"
        }]
      });

    } catch (error) {
      server.log.error('Assign practitioner to organization error:', error);
      reply.code(500).send(createOperationOutcome('error', 'exception', 'Internal server error'));
    }
  });
}