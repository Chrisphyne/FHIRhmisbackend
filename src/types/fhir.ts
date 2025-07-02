// FHIR Resource Types
export interface FHIRResource {
  resourceType: string;
  id?: string;
  meta?: {
    lastUpdated?: string;
    versionId?: string;
  };
}

export interface FHIRIdentifier {
  use?: string;
  type?: FHIRCodeableConcept;
  system?: string;
  value?: string;
}

export interface FHIRCodeableConcept {
  coding?: FHIRCoding[];
  text?: string;
}

export interface FHIRCoding {
  system?: string;
  version?: string;
  code?: string;
  display?: string;
}

export interface FHIRHumanName {
  use?: string;
  family?: string;
  given?: string[];
  prefix?: string[];
  suffix?: string[];
}

export interface FHIRContactPoint {
  system?: string;
  value?: string;
  use?: string;
  rank?: number;
}

export interface FHIRAddress {
  use?: string;
  type?: string;
  line?: string[];
  city?: string;
  district?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface FHIRPatient extends FHIRResource {
  resourceType: "Patient";
  identifier?: FHIRIdentifier[];
  active?: boolean;
  name?: FHIRHumanName[];
  telecom?: FHIRContactPoint[];
  gender?: string;
  birthDate?: string;
  address?: FHIRAddress[];
  maritalStatus?: FHIRCodeableConcept;
  contact?: any[];
  extension?: any[];
}

export interface FHIRPractitioner extends FHIRResource {
  resourceType: "Practitioner";
  identifier?: FHIRIdentifier[];
  active?: boolean;
  name?: FHIRHumanName[];
  telecom?: FHIRContactPoint[];
  address?: FHIRAddress[];
  gender?: string;
  birthDate?: string;
  qualification?: any[];
  extension?: any[];
}

export interface FHIROrganization extends FHIRResource {
  resourceType: "Organization";
  identifier?: FHIRIdentifier[];
  active?: boolean;
  type?: FHIRCodeableConcept[];
  name?: string;
  telecom?: FHIRContactPoint[];
  address?: FHIRAddress[];
}

export interface FHIRAppointment extends FHIRResource {
  resourceType: "Appointment";
  identifier?: FHIRIdentifier[];
  status: string;
  serviceType?: FHIRCodeableConcept[];
  specialty?: FHIRCodeableConcept[];
  appointmentType?: FHIRCodeableConcept;
  reasonCode?: FHIRCodeableConcept[];
  description?: string;
  start?: string;
  end?: string;
  minutesDuration?: number;
  comment?: string;
  participant?: any[];
}

export interface FHIRBundle extends FHIRResource {
  resourceType: "Bundle";
  type: string;
  total?: number;
  entry?: FHIRBundleEntry[];
}

export interface FHIRBundleEntry {
  fullUrl?: string;
  resource?: FHIRResource;
  search?: {
    mode?: string;
    score?: number;
  };
}

export interface FHIROperationOutcome extends FHIRResource {
  resourceType: "OperationOutcome";
  issue: FHIROperationOutcomeIssue[];
}

export interface FHIROperationOutcomeIssue {
  severity: string;
  code: string;
  diagnostics?: string;
  details?: FHIRCodeableConcept;
}