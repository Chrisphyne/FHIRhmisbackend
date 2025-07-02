import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createOperationOutcome, transformAppointmentFromDB, transformAppointmentToDB, createBundle } from '../utils/fhir.js';
import { FHIRAppointment } from '../types/fhir.js';

export default async function appointmentRoutes(server: FastifyInstance) {

  // GET /fhir/Appointment - Search appointments
  server.get<{ Querystring: { patient?: string, practitioner?: string, date?: string, status?: string } }>('/fhir/Appointment', async (request: FastifyRequest<{ Querystring: { patient?: string, practitioner?: string, date?: string, status?: string } }>, reply: FastifyReply) => {
    try {
      const { organizationIds, currentOrganizationId } = request.user;
      const query = request.query;

      let where: any = {
        organizationId: { in: organizationIds }
      };

      // Patient filtering
      if (query.patient) {
        where.patientId = query.patient;
      }

      // Practitioner filtering
      if (query.practitioner) {
        where.practitionerId = query.practitioner;
      }

      // Date filtering
      if (query.date) {
        const startDate = new Date(query.date);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
        
        where.start = {
          gte: startDate,
          lt: endDate
        };
      }

      // Status filtering
      if (query.status) {
        where.status = query.status;
      }

      const appointments = await server.prisma.appointment.findMany({
        where,
        include: {
          patient: {
            select: { id: true, name: true }
          },
          practitioner: {
            select: { id: true, name: true }
          },
          organization: {
            select: { id: true, name: true }
          }
        }
      });

      const entries = appointments.map(appointment => ({
        fullUrl: `${request.protocol}://${request.hostname}/fhir/Appointment/${appointment.id}`,
        resource: transformAppointmentFromDB(appointment)
      }));

      const bundle = createBundle("searchset", entries);
      reply.send(bundle);

    } catch (error) {
      server.log.error('Search appointments error:', error);
      reply.code(500).send(createOperationOutcome('error', 'exception', 'Internal server error'));
    }
  });

  // GET /fhir/Appointment/:id - Get appointment by ID
  server.get<{ Params: { id: string } }>('/fhir/Appointment/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { organizationIds } = request.user;

      const appointment = await server.prisma.appointment.findFirst({
        where: {
          id,
          organizationId: { in: organizationIds }
        },
        include: {
          patient: {
            select: { id: true, name: true }
          },
          practitioner: {
            select: { id: true, name: true }
          },
          organization: {
            select: { id: true, name: true }
          }
        }
      });

      if (!appointment) {
        return reply.code(404).send(createOperationOutcome('error', 'not-found', 'Appointment not found'));
      }

      reply.send(transformAppointmentFromDB(appointment));

    } catch (error) {
      server.log.error('Get appointment error:', error);
      reply.code(500).send(createOperationOutcome('error', 'exception', 'Internal server error'));
    }
  });

  // POST /fhir/Appointment - Create appointment
  server.post<{ Body: FHIRAppointment & { patientId: string, practitionerId: string } }>('/fhir/Appointment', async (request: FastifyRequest<{ Body: FHIRAppointment & { patientId: string, practitionerId: string } }>, reply: FastifyReply) => {
    try {
      const { currentOrganizationId } = request.user;
      const { patientId, practitionerId, ...appointmentData } = request.body;

      // Validate patient and practitioner access
      const patient = await server.prisma.patient.findFirst({
        where: {
          id: patientId,
          organizations: {
            some: {
              organizationId: currentOrganizationId,
              status: 'active'
            }
          }
        }
      });

      if (!patient) {
        return reply.code(404).send(createOperationOutcome('error', 'not-found', 'Patient not found or no access'));
      }

      const practitioner = await server.prisma.practitioner.findFirst({
        where: {
          id: practitionerId,
          organizations: {
            some: {
              organizationId: currentOrganizationId,
              status: 'active'
            }
          }
        }
      });

      if (!practitioner) {
        return reply.code(404).send(createOperationOutcome('error', 'not-found', 'Practitioner not found or no access'));
      }

      const dbAppointmentData = transformAppointmentToDB(appointmentData, patientId, practitionerId, currentOrganizationId!);

      const appointment = await server.prisma.appointment.create({
        data: dbAppointmentData
      });

      reply.code(201).send(transformAppointmentFromDB(appointment));

    } catch (error) {
      server.log.error('Create appointment error:', error);
      reply.code(500).send(createOperationOutcome('error', 'exception', 'Internal server error'));
    }
  });

  // PUT /fhir/Appointment/:id - Update appointment
  server.put<{ Params: { id: string }, Body: FHIRAppointment }>('/fhir/Appointment/:id', async (request: FastifyRequest<{ Params: { id: string }, Body: FHIRAppointment }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { organizationIds } = request.user;

      // Check if appointment exists and user has access
      const existingAppointment = await server.prisma.appointment.findFirst({
        where: {
          id,
          organizationId: { in: organizationIds }
        }
      });

      if (!existingAppointment) {
        return reply.code(404).send(createOperationOutcome('error', 'not-found', 'Appointment not found'));
      }

      const updateData = {
        status: request.body.status,
        description: request.body.description,
        start: request.body.start ? new Date(request.body.start) : undefined,
        end: request.body.end ? new Date(request.body.end) : undefined,
        minutesDuration: request.body.minutesDuration,
        comment: request.body.comment
      };

      // Remove undefined values
      Object.keys(updateData).forEach(key => 
        updateData[key as keyof typeof updateData] === undefined && delete updateData[key as keyof typeof updateData]
      );

      const appointment = await server.prisma.appointment.update({
        where: { id },
        data: updateData
      });

      reply.send(transformAppointmentFromDB(appointment));

    } catch (error) {
      server.log.error('Update appointment error:', error);
      reply.code(500).send(createOperationOutcome('error', 'exception', 'Internal server error'));
    }
  });

  // DELETE /fhir/Appointment/:id - Cancel appointment
  server.delete<{ Params: { id: string } }>('/fhir/Appointment/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { organizationIds } = request.user;

      const appointment = await server.prisma.appointment.findFirst({
        where: {
          id,
          organizationId: { in: organizationIds }
        }
      });

      if (!appointment) {
        return reply.code(404).send(createOperationOutcome('error', 'not-found', 'Appointment not found'));
      }

      await server.prisma.appointment.update({
        where: { id },
        data: { status: 'cancelled' }
      });

      reply.code(204).send();

    } catch (error) {
      server.log.error('Cancel appointment error:', error);
      reply.code(500).send(createOperationOutcome('error', 'exception', 'Internal server error'));
    }
  });
}