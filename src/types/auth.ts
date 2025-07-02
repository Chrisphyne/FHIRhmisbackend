export interface User {
  id: string;
  email: string;
  role: string;
  organizationIds: string[];
  primaryOrganizationId?: string;
  currentOrganizationId?: string;
  organizationAccess: UserOrganizationAccess[];
}

export interface UserOrganizationAccess {
  id: string;
  organizationId: string;
  role: string;
  permissions?: any;
  status: string;
  organization: {
    id: string;
    name: string;
    active: boolean;
  };
}

export interface AuthenticatedRequest {
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  role: string;
  organizationId?: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}