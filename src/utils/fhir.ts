import { v4 as uuidv4 } from 'uuid';
import { 
  FHIROperationOutcome, 
  FHIRBundle, 
  FHIRBundleEntry, 
  FHIRPatient, 
  FHIRPractitioner, 
  FHIROrganization,
  FHIRAppointment
} from '../types/fhir.js';

// FHIR Operation Outcome utility
export function createOperationOutcome(
  severity: string, 
  code: string, 
  diagnostics: string, 
  details?: any
): FHIROperationOutcome {
  return {
    resourceType: "OperationOutcome",
    id: uuidv4(),
    meta: {
      lastUpdated: new Date().toISOString()
    },
    issue: [{
      severity,
      code,
      diagnostics,
      ...(details && { details })
    }]
  };
}

// FHIR Bundle utility
export function createBundle(type: string, entries: FHIRBundleEntry[], total?: number): FHIRBundle {
  return {
    resourceType: "Bundle",
    id: uuidv4(),
    meta: {
      lastUpdated: new Date().toISOString()
    },
    type,
    total: total !== null ? total : entries.length,
    entry: entries
  };
}

// Transform Database Patient to FHIR Patient
export function transformPatientFromDB(dbPatient: any, options: { includeOrganizations?: boolean } = {}): FHIRPatient {
  const patient: FHIRPatient = {
    resourceType: "Patient",
    id: dbPatient.id,
    meta: {
      lastUpdated: dbPatient.updatedAt.toISOString(),
      versionId: "1"
    },
    identifier: dbPatient.identifier,
    active: dbPatient.active,
    name: dbPatient.name,
    telecom: dbPatient.telecom,
    gender: dbPatient.gender,
    birthDate: dbPatient.birthDate?.toISOString().split("T")[0],
    address: dbPatient.address,
    maritalStatus: dbPatient.maritalStatus,
    contact: dbPatient.contact
  };

  // Include organization information if requested
  if (options.includeOrganizations && dbPatient.organizations) {
    patient.extension = [
      {
        url: "http://wellplace.com/fhir/StructureDefinition/patient-organizations",
        extension: dbPatient.organizations.map((org: any) => ({
          url: "organization",
          valueReference: {
            reference: `Organization/${org.organizationId}`,
            display: org.organization?.name
          },
          extension: [
            {
              url: "relationship",
              valueString: org.relationship
            },
            {
              url: "primaryCare",
              valueBoolean: org.primaryCare
            },
            {
              url: "status",
              valueString: org.status
            }
          ]
        }))
      }
    ];
  }

  return patient;
}

// Transform FHIR Patient to Database format
export function transformPatientToDB(fhirPatient: FHIRPatient): any {
  return {
    identifier: fhirPatient.identifier || [],
    active: fhirPatient.active ?? true,
    name: fhirPatient.name || [],
    telecom: fhirPatient.telecom || [],
    gender: fhirPatient.gender,
    birthDate: fhirPatient.birthDate ? new Date(fhirPatient.birthDate) : null,
    address: fhirPatient.address || [],
    maritalStatus: fhirPatient.maritalStatus,
    contact: fhirPatient.contact || []
  };
}

// Transform Database Practitioner to FHIR Practitioner
export function transformPractitionerFromDB(dbPractitioner: any, options: { includeOrganizations?: boolean } = {}): FHIRPractitioner {
  const practitioner: FHIRPractitioner = {
    resourceType: "Practitioner",
    id: dbPractitioner.id,
    meta: {
      lastUpdated: dbPractitioner.updatedAt.toISOString(),
      versionId: "1"
    },
    identifier: dbPractitioner.identifier,
    active: dbPractitioner.active,
    name: dbPractitioner.name,
    telecom: dbPractitioner.telecom,
    address: dbPractitioner.address,
    gender: dbPractitioner.gender,
    birthDate: dbPractitioner.birthDate?.toISOString().split("T")[0],
    qualification: dbPractitioner.qualification
  };

  // Include organization affiliations
  if (options.includeOrganizations && dbPractitioner.organizations) {
    practitioner.extension = [
      {
        url: "http://wellplace.com/fhir/StructureDefinition/practitioner-organizations",
        extension: dbPractitioner.organizations.map((org: any) => ({
          url: "organization",
          valueReference: {
            reference: `Organization/${org.organizationId}`,
            display: org.organization?.name
          },
          extension: [
            {
              url: "role",
              valueString: org.role
            },
            {
              url: "status",
              valueString: org.status
            },
            {
              url: "startDate",
              valueDate: org.startDate.toISOString().split("T")[0]
            }
          ]
        }))
      }
    ];
  }

  return practitioner;
}

// Transform FHIR Practitioner to Database format
export function transformPractitionerToDB(fhirPractitioner: FHIRPractitioner): any {
  return {
    identifier: fhirPractitioner.identifier || [],
    active: fhirPractitioner.active ?? true,
    name: fhirPractitioner.name || [],
    telecom: fhirPractitioner.telecom || [],
    address: fhirPractitioner.address || [],
    gender: fhirPractitioner.gender,
    birthDate: fhirPractitioner.birthDate ? new Date(fhirPractitioner.birthDate) : null,
    qualification: fhirPractitioner.qualification || []
  };
}

// Transform Database Organization to FHIR Organization
export function transformOrganizationFromDB(dbOrganization: any): FHIROrganization {
  return {
    resourceType: "Organization",
    id: dbOrganization.id,
    meta: {
      lastUpdated: dbOrganization.updatedAt.toISOString(),
      versionId: "1"
    },
    identifier: dbOrganization.identifier ? [{ value: dbOrganization.identifier }] : [],
    active: dbOrganization.active,
    name: dbOrganization.name,
    type: dbOrganization.type ? [{ text: dbOrganization.type }] : [],
    telecom: dbOrganization.telecom || [],
    address: dbOrganization.address || []
  };
}

// Transform FHIR Organization to Database format
export function transformOrganizationToDB(fhirOrganization: FHIROrganization): any {
  return {
    identifier: fhirOrganization.identifier?.[0]?.value || uuidv4(),
    active: fhirOrganization.active ?? true,
    name: fhirOrganization.name || '',
    type: fhirOrganization.type?.[0]?.text,
    telecom: fhirOrganization.telecom || [],
    address: fhirOrganization.address || []
  };
}

// Transform Database Appointment to FHIR Appointment
export function transformAppointmentFromDB(dbAppointment: any): FHIRAppointment {
  return {
    resourceType: "Appointment",
    id: dbAppointment.id,
    meta: {
      lastUpdated: dbAppointment.updatedAt.toISOString(),
      versionId: "1"
    },
    identifier: dbAppointment.identifier || [],
    status: dbAppointment.status,
    serviceType: dbAppointment.serviceType || [],
    specialty: dbAppointment.specialty || [],
    appointmentType: dbAppointment.appointmentType,
    reasonCode: dbAppointment.reasonCode || [],
    description: dbAppointment.description,
    start: dbAppointment.start.toISOString(),
    end: dbAppointment.end.toISOString(),
    minutesDuration: dbAppointment.minutesDuration,
    comment: dbAppointment.comment,
    participant: [
      {
        actor: {
          reference: `Patient/${dbAppointment.patientId}`
        },
        status: "accepted"
      },
      {
        actor: {
          reference: `Practitioner/${dbAppointment.practitionerId}`
        },
        status: "accepted"
      }
    ]
  };
}

// Transform FHIR Appointment to Database format
export function transformAppointmentToDB(fhirAppointment: FHIRAppointment, patientId: string, practitionerId: string, organizationId: string): any {
  return {
    identifier: fhirAppointment.identifier || [],
    status: fhirAppointment.status,
    serviceType: fhirAppointment.serviceType || [],
    specialty: fhirAppointment.specialty || [],
    appointmentType: fhirAppointment.appointmentType,
    reasonCode: fhirAppointment.reasonCode || [],
    description: fhirAppointment.description,
    start: fhirAppointment.start ? new Date(fhirAppointment.start) : new Date(),
    end: fhirAppointment.end ? new Date(fhirAppointment.end) : new Date(),
    minutesDuration: fhirAppointment.minutesDuration,
    comment: fhirAppointment.comment,
    patientId,
    practitionerId,
    organizationId
  };
}