import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createOperationOutcome, transformPatientFromDB, transformPatientToDB, createBundle } from '../utils/fhir.js';
import { FHIRPatient } from '../types/fhir.js';

export default async function patientRoutes(server: FastifyInstance) {

  // GET /fhir/Patient - Search patients across user's organizations
  server.get<{ Querystring: { organization?: string, name?: string, birthdate?: string } }>(
    '/Patient',
    {
      schema: {
        tags: ["Patients"],
        description: "Search patients (FHIR)",
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            organization: { type: "string" },
            name: { type: "string" },
            birthdate: { type: "string" }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Querystring: { organization?: string, name?: string, birthdate?: string } }>, reply: FastifyReply) => {
    try {
      server.log.info('Patient search request', { 
        user: request.user.email, 
        organizationIds: request.user.organizationIds,
        query: request.query 
      });

      const { organizationIds, currentOrganizationId } = request.user;
      const query = request.query;

      // Simple approach - get all patients for user's organizations first
      let where: any = {
        organizations: {
          some: {
            organizationId: { in: organizationIds },
            status: 'active'
          }
        }
      };

      // Birth date filtering (simple date match)
      if (query.birthdate) {
        where.birthDate = new Date(query.birthdate);
      }

      server.log.info('Patient query where clause', { where });

      const patients = await server.prisma.patient.findMany({
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

      server.log.info('Found patients', { count: patients.length });

      // Filter by name in memory if needed (to avoid complex JSON queries)
      let filteredPatients = patients;
      if (query.name) {
        filteredPatients = patients.filter(patient => {
          const names = patient.name as any[];
          return names.some(name => 
            name.family?.toLowerCase().includes(query.name!.toLowerCase()) ||
            name.given?.some((given: string) => given.toLowerCase().includes(query.name!.toLowerCase()))
          );
        });
      }

      const entries = filteredPatients.map(patient => ({
        fullUrl: `${request.protocol}://${request.hostname}/fhir/Patient/${patient.id}`,
        resource: transformPatientFromDB(patient, { includeOrganizations: true })
      }));

      const bundle = createBundle("searchset", entries);
      reply.send(bundle);

    } catch (error) {
      server.log.error('Search patients error:', error);
      reply.code(500).send(createOperationOutcome('error', 'exception', 'Internal server error'));
    }
  });

  // GET /fhir/Patient/:id - Get patient by ID
  server.get<{ Params: { id: string } }>(
    '/Patient/:id',
    {
      schema: {
        tags: ["Patients"],
        description: "Get patient by ID (FHIR)",
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

      const patient = await server.prisma.patient.findFirst({
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

      if (!patient) {
        return reply.code(404).send(createOperationOutcome('error', 'not-found', 'Patient not found'));
      }

      reply.send(transformPatientFromDB(patient, { includeOrganizations: true }));

    } catch (error) {
      server.log.error('Get patient error:', error);
      reply.code(500).send(createOperationOutcome('error', 'exception', 'Internal server error'));
    }
  });

  // POST /fhir/Patient - Create patient with organization assignment
  server.post<{ Body: FHIRPatient }>(
    '/Patient',
    {
      schema: {
        tags: ["Patients"],
        description: "Create patient (FHIR)",
        security: [{ bearerAuth: [] }],
        body: {
          type: "object",
          required: ["resourceType", "name"],
          properties: {
            resourceType: { type: "string", enum: ["Patient"] },
            name: { type: "array" },
            active: { type: "boolean" },
            identifier: { type: "array" },
            telecom: { type: "array" },
            gender: { type: "string" },
            birthDate: { type: "string" },
            address: { type: "array" }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: FHIRPatient }>, reply: FastifyReply) => {
    try {
      const { currentOrganizationId } = request.user;
      const patientData = transformPatientToDB(request.body);

      const patient = await server.prisma.patient.create({
        data: patientData
      });

      // Assign to current organization
      await server.prisma.patientOrganization.create({
        data: {
          patientId: patient.id,
          organizationId: currentOrganizationId!,
          relationship: 'primary',
          primaryCare: true
        }
      });

      reply.code(201).send(transformPatientFromDB(patient));

    } catch (error) {
      server.log.error('Create patient error:', error);
      reply.code(500).send(createOperationOutcome('error', 'exception', 'Internal server error'));
    }
  });

  // PUT /fhir/Patient/:id - Update patient
  server.put<{ Params: { id: string }, Body: FHIRPatient }>(
    '/Patient/:id',
    {
      schema: {
        tags: ["Patients"],
        description: "Update patient (FHIR)",
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
            resourceType: { type: "string", enum: ["Patient"] },
            name: { type: "array" },
            active: { type: "boolean" },
            identifier: { type: "array" },
            telecom: { type: "array" },
            gender: { type: "string" },
            birthDate: { type: "string" },
            address: { type: "array" }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Params: { id: string }, Body: FHIRPatient }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { organizationIds } = request.user;

      // Check if patient exists and user has access
      const existingPatient = await server.prisma.patient.findFirst({
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

      if (!existingPatient) {
        return reply.code(404).send(createOperationOutcome('error', 'not-found', 'Patient not found'));
      }

      const patientData = transformPatientToDB(request.body);
      
      const patient = await server.prisma.patient.update({
        where: { id },
        data: patientData
      });

      reply.send(transformPatientFromDB(patient));

    } catch (error) {
      server.log.error('Update patient error:', error);
      reply.code(500).send(createOperationOutcome('error', 'exception', 'Internal server error'));
    }
  });

  // POST /fhir/Patient/:id/assign-organization - Assign patient to additional organization
  server.post<{ Params: { id: string }, Body: { organizationId: string, relationship?: string } }>(
    '/Patient/:id/assign-organization',
    {
      schema: {
        tags: ["Patients"],
        description: "Assign patient to organization",
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
            relationship: { type: "string" }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Params: { id: string }, Body: { organizationId: string, relationship?: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { organizationId, relationship = 'specialist' } = request.body;
      const { organizationIds } = request.user;

      // Verify user has access to target organization
      if (!organizationIds.includes(organizationId)) {
        return reply.code(403).send(createOperationOutcome("error", "forbidden", "No access to target organization"));
      }

      // Check if assignment already exists
      const existing = await server.prisma.patientOrganization.findUnique({
        where: {
          patientId_organizationId: {
            patientId: id,
            organizationId
          }
        }
      });

      if (existing) {
        return reply.code(409).send(createOperationOutcome("error", "conflict", "Patient already assigned to organization"));
      }

      // Create assignment
      await server.prisma.patientOrganization.create({
        data: {
          patientId: id,
          organizationId,
          relationship,
          primaryCare: false
        }
      });

      reply.code(201).send({
        resourceType: "OperationOutcome",
        issue: [{
          severity: "information",
          code: "informational",
          diagnostics: "Patient successfully assigned to organization"
        }]
      });

    } catch (error) {
      server.log.error('Assign patient to organization error:', error);
      reply.code(500).send(createOperationOutcome('error', 'exception', 'Internal server error'));
    }
  });
}