import { createOperationOutcome } from '../utils/fhir.js';

export default async function authMiddleware(server) {
  server.addHook('preHandler', async (request, reply) => {
    // Skip auth for certain routes
    const publicRoutes = [
      '/health',
      '/api/auth/login',
      '/api/auth/register',
      '/docs'
    ];
    
    const isPublicRoute = publicRoutes.some(route => 
      request.url.startsWith(route)
    );
    
    if (isPublicRoute) {
      return;
    }

    try {
      // Extract token from Authorization header
      const authorization = request.headers.authorization;
      if (!authorization) {
        reply.code(401).send(createOperationOutcome('error', 'unauthorized', 'Missing authorization header'));
        return;
      }

      const token = authorization.replace('Bearer ', '');
      if (!token) {
        reply.code(401).send(createOperationOutcome('error', 'unauthorized', 'Invalid authorization format'));
        return;
      }

      // Verify JWT token
      const decoded = server.jwt.verify(token);
      
      // Get user with organization access
      const user = await server.prisma.user.findUnique({
        where: { id: decoded.userId },
        include: {
          organizationAccess: {
            where: { status: 'active' },
            include: {
              organization: {
                select: { id: true, name: true, active: true }
              }
            }
          }
        }
      });

      if (!user || !user.active) {
        reply.code(401).send(createOperationOutcome('error', 'unauthorized', 'Invalid or inactive user'));
        return;
      }

      // Set user context
      const organizationIds = user.organizationAccess.map(access => access.organizationId);
      const currentOrganizationId = request.headers['x-organization-id'] || 
                                   user.primaryOrganizationId || 
                                   organizationIds[0];

      // Validate current organization access
      if (currentOrganizationId && !organizationIds.includes(currentOrganizationId)) {
        reply.code(403).send(createOperationOutcome('error', 'forbidden', 'No access to specified organization'));
        return;
      }

      request.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationIds,
        primaryOrganizationId: user.primaryOrganizationId,
        currentOrganizationId,
        organizationAccess: user.organizationAccess
      };

    } catch (error) {
      server.log.error('Auth middleware error:', error);
      reply.code(401).send(createOperationOutcome('error', 'unauthorized', 'Invalid token'));
    }
  });
}