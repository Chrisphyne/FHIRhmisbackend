export default async function auditMiddleware(server) {
  server.addHook('onSend', async (request, reply, payload) => {
    // Skip audit for certain routes
    const skipAuditRoutes = ['/health', '/docs'];
    const shouldSkip = skipAuditRoutes.some(route => 
      request.url.startsWith(route)
    );
    
    if (shouldSkip || !request.user) {
      return payload;
    }

    try {
      // Determine action based on HTTP method
      const methodToAction = {
        'GET': 'READ',
        'POST': 'CREATE',
        'PUT': 'UPDATE',
        'PATCH': 'UPDATE',
        'DELETE': 'DELETE'
      };

      const action = methodToAction[request.method] || 'UNKNOWN';
      
      // Extract resource info from URL
      const urlParts = request.url.split('/');
      let resourceType = 'Unknown';
      let resourceId = null;

      if (urlParts.includes('fhir')) {
        const fhirIndex = urlParts.indexOf('fhir');
        if (fhirIndex + 1 < urlParts.length) {
          resourceType = urlParts[fhirIndex + 1];
          if (fhirIndex + 2 < urlParts.length) {
            resourceId = urlParts[fhirIndex + 2];
          }
        }
      } else if (urlParts.includes('api')) {
        const apiIndex = urlParts.indexOf('api');
        if (apiIndex + 1 < urlParts.length) {
          resourceType = urlParts[apiIndex + 1];
          if (apiIndex + 2 < urlParts.length) {
            resourceId = urlParts[apiIndex + 2];
          }
        }
      }

      // Create audit log entry
      await server.prisma.auditLog.create({
        data: {
          userId: request.user.id,
          organizationId: request.user.currentOrganizationId,
          resourceType,
          resourceId: resourceId || 'bulk',
          action,
          changes: request.method !== 'GET' ? request.body : null,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent']
        }
      }).catch(error => {
        server.log.error('Audit logging failed:', error);
      });

    } catch (error) {
      server.log.error('Audit middleware error:', error);
    }

    return payload;
  });
}