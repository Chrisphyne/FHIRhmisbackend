import { z } from "zod";

// Environment validation schema with proper optional handling
const envSchema = z
  .object({
    // Database
    DATABASE_URL: z.string().url(),

    // JWT
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default("24h"),
    REFRESH_TOKEN_EXPIRES_IN: z.string().default("7d"),

    // Server
    PORT: z.string().transform(Number).default("3005"),
    HOST: z.string().default("0.0.0.0"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),

    // CORS
    ALLOWED_ORIGINS: z.string().transform((str) => str.split(",")),
    ENABLE_CORS: z
      .string()
      .transform((val) => val === "true")
      .default("true"),

    // API
    API_VERSION: z.string().default("v1"),
    API_BASE_PATH: z.string().default("/api"),
    FHIR_BASE_PATH: z.string().default("/fhir"),

    // Security
    BCRYPT_ROUNDS: z.string().transform(Number).default("12"),
    MAX_LOGIN_ATTEMPTS: z.string().transform(Number).default("5"),
    LOCKOUT_TIME: z.string().default("15m"),

    // Rate Limiting
    RATE_LIMIT_MAX: z.string().transform(Number).default("1000"),
    RATE_LIMIT_WINDOW: z.string().default("15m"),

    // File Upload
    MAX_FILE_SIZE: z.string().default("10MB"),
    UPLOAD_PATH: z.string().default("./uploads"),
    ALLOWED_FILE_TYPES: z.string().default("pdf,jpg,jpeg,png,doc,docx"),

    // Audit and Compliance
    AUDIT_RETENTION_DAYS: z.string().transform(Number).default("2555"),
    ENABLE_AUDIT_LOGGING: z
      .string()
      .transform((val) => val === "true")
      .default("true"),
    ENABLE_PERFORMANCE_MONITORING: z
      .string()
      .transform((val) => val === "true")
      .default("true"),

    // Development
    ENABLE_SWAGGER: z
      .string()
      .transform((val) => val === "true")
      .default("true"),
    ENABLE_REQUEST_LOGGING: z
      .string()
      .transform((val) => val === "true")
      .default("true"),
    MOCK_EXTERNAL_SERVICES: z
      .string()
      .transform((val) => val === "true")
      .default("false"),

    // Health Check
    HEALTH_CHECK_INTERVAL: z.string().default("30s"),
    DATABASE_HEALTH_CHECK_TIMEOUT: z.string().default("5s"),
    EXTERNAL_SERVICE_TIMEOUT: z.string().default("10s"),

    // Backup
    BACKUP_SCHEDULE: z.string().default("0 2 * * *"),
    BACKUP_RETENTION_DAYS: z.string().transform(Number).default("30"),
    BACKUP_LOCATION: z.string().default("./backups"),

    // AWS
    AWS_REGION: z.string().default("us-east-1"),

    // Optional fields - only validate if present
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.string().transform(Number).optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    FROM_EMAIL: z.string().email().optional(),
    FROM_NAME: z.string().optional(),

    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PUBLISHABLE_KEY: z.string().optional(),

    EXTERNAL_FHIR_BASE_URL: z.string().url().optional(),
    EXTERNAL_FHIR_AUTH_TOKEN: z.string().optional(),

    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    AWS_S3_BUCKET: z.string().optional(),

    REDIS_URL: z.string().optional(),
    REDIS_PASSWORD: z.string().optional(),

    SENTRY_DSN: z.string().optional(),
    GOOGLE_ANALYTICS_ID: z.string().optional(),

    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_PHONE_NUMBER: z.string().optional(),

    FIREBASE_PROJECT_ID: z.string().optional(),
    FIREBASE_PRIVATE_KEY: z.string().optional(),
    FIREBASE_CLIENT_EMAIL: z.string().email().optional(),
  })
  .refine(
    (data) => {
      // Custom validation: if any Firebase field is provided, all required Firebase fields must be provided
      const firebaseFields = [
        data.FIREBASE_PROJECT_ID,
        data.FIREBASE_PRIVATE_KEY,
        data.FIREBASE_CLIENT_EMAIL,
      ];
      const providedFirebaseFields = firebaseFields.filter(
        (field) => field !== undefined,
      );

      if (
        providedFirebaseFields.length > 0 &&
        providedFirebaseFields.length < 3
      ) {
        return false;
      }

      return true;
    },
    {
      message:
        "If Firebase is configured, all Firebase fields (PROJECT_ID, PRIVATE_KEY, CLIENT_EMAIL) must be provided",
      path: ["firebase"],
    },
  )
  .refine(
    (data) => {
      // Custom validation: if any AWS S3 field is provided, all required AWS fields must be provided
      const awsFields = [
        data.AWS_ACCESS_KEY_ID,
        data.AWS_SECRET_ACCESS_KEY,
        data.AWS_S3_BUCKET,
      ];
      const providedAwsFields = awsFields.filter(
        (field) => field !== undefined,
      );

      if (providedAwsFields.length > 0 && providedAwsFields.length < 3) {
        return false;
      }

      return true;
    },
    {
      message:
        "If AWS S3 is configured, all AWS fields (ACCESS_KEY_ID, SECRET_ACCESS_KEY, S3_BUCKET) must be provided",
      path: ["aws"],
    },
  )
  .refine(
    (data) => {
      // Custom validation: if any SMTP field is provided, all required SMTP fields must be provided
      const smtpFields = [
        data.SMTP_HOST,
        data.SMTP_PORT,
        data.SMTP_USER,
        data.SMTP_PASS,
      ];
      const providedSmtpFields = smtpFields.filter(
        (field) => field !== undefined,
      );

      if (providedSmtpFields.length > 0 && providedSmtpFields.length < 4) {
        return false;
      }

      return true;
    },
    {
      message:
        "If SMTP is configured, all SMTP fields (HOST, PORT, USER, PASS) must be provided",
      path: ["smtp"],
    },
  );

// Parse and validate environment variables
function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    console.error("❌ Invalid environment variables:", error);
    process.exit(1);
  }
}

export const env = validateEnv();

// Export commonly used configurations
export const config = {
  server: {
    port: env.PORT,
    host: env.HOST,
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
  },

  database: {
    url: env.DATABASE_URL,
    healthCheckTimeout: env.DATABASE_HEALTH_CHECK_TIMEOUT,
  },

  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshExpiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
  },

  cors: {
    origins: env.ALLOWED_ORIGINS,
    enabled: env.ENABLE_CORS,
  },

  api: {
    version: env.API_VERSION,
    basePath: env.API_BASE_PATH,
    fhirPath: env.FHIR_BASE_PATH,
  },

  security: {
    bcryptRounds: env.BCRYPT_ROUNDS,
    maxLoginAttempts: env.MAX_LOGIN_ATTEMPTS,
    lockoutTime: env.LOCKOUT_TIME,
  },

  rateLimit: {
    max: env.RATE_LIMIT_MAX,
    window: env.RATE_LIMIT_WINDOW,
  },

  upload: {
    maxSize: env.MAX_FILE_SIZE,
    path: env.UPLOAD_PATH,
    allowedTypes: env.ALLOWED_FILE_TYPES.split(","),
  },

  email: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.FROM_EMAIL,
    fromName: env.FROM_NAME,
    enabled: !!(
      env.SMTP_HOST &&
      env.SMTP_PORT &&
      env.SMTP_USER &&
      env.SMTP_PASS
    ),
  },

  stripe: {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    publishableKey: env.STRIPE_PUBLISHABLE_KEY,
    enabled: !!env.STRIPE_SECRET_KEY,
  },

  externalFhir: {
    baseUrl: env.EXTERNAL_FHIR_BASE_URL,
    authToken: env.EXTERNAL_FHIR_AUTH_TOKEN,
    enabled: !!env.EXTERNAL_FHIR_BASE_URL,
  },

  aws: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: env.AWS_REGION,
    s3Bucket: env.AWS_S3_BUCKET,
    enabled: !!(
      env.AWS_ACCESS_KEY_ID &&
      env.AWS_SECRET_ACCESS_KEY &&
      env.AWS_S3_BUCKET
    ),
  },

  redis: {
    url: env.REDIS_URL,
    password: env.REDIS_PASSWORD,
    enabled: !!env.REDIS_URL,
  },

  monitoring: {
    sentryDsn: env.SENTRY_DSN,
    googleAnalyticsId: env.GOOGLE_ANALYTICS_ID,
    sentryEnabled: !!env.SENTRY_DSN,
    analyticsEnabled: !!env.GOOGLE_ANALYTICS_ID,
  },

  twilio: {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    phoneNumber: env.TWILIO_PHONE_NUMBER,
    enabled: !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN),
  },

  firebase: {
    projectId: env.FIREBASE_PROJECT_ID,
    privateKey: env.FIREBASE_PRIVATE_KEY,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    enabled: !!(
      env.FIREBASE_PROJECT_ID &&
      env.FIREBASE_PRIVATE_KEY &&
      env.FIREBASE_CLIENT_EMAIL
    ),
  },

  audit: {
    retentionDays: env.AUDIT_RETENTION_DAYS,
    enabled: env.ENABLE_AUDIT_LOGGING,
    performanceMonitoring: env.ENABLE_PERFORMANCE_MONITORING,
  },

  development: {
    enableSwagger: env.ENABLE_SWAGGER,
    enableRequestLogging: env.ENABLE_REQUEST_LOGGING,
    mockExternalServices: env.MOCK_EXTERNAL_SERVICES,
  },

  backup: {
    schedule: env.BACKUP_SCHEDULE,
    retentionDays: env.BACKUP_RETENTION_DAYS,
    location: env.BACKUP_LOCATION,
  },

  healthCheck: {
    interval: env.HEALTH_CHECK_INTERVAL,
    externalServiceTimeout: env.EXTERNAL_SERVICE_TIMEOUT,
  },
};

// Helper function to check if a service is enabled
export const isServiceEnabled = {
  email: () => config.email.enabled,
  stripe: () => config.stripe.enabled,
  aws: () => config.aws.enabled,
  redis: () => config.redis.enabled,
  firebase: () => config.firebase.enabled,
  twilio: () => config.twilio.enabled,
  sentry: () => config.monitoring.sentryEnabled,
  analytics: () => config.monitoring.analyticsEnabled,
  externalFhir: () => config.externalFhir.enabled,
};

// Environment-specific configurations
export const isDevelopment = config.server.nodeEnv === "development";
export const isProduction = config.server.nodeEnv === "production";
export const isTest = config.server.nodeEnv === "test";

// Validation helpers
export const validateConfig = () => {
  const errors: string[] = [];

  if (isProduction) {
    if (config.jwt.secret.length < 64) {
      errors.push("JWT_SECRET should be at least 64 characters in production");
    }

    if (config.server.logLevel === "debug") {
      errors.push("LOG_LEVEL should not be debug in production");
    }

    if (config.development.enableSwagger) {
      errors.push("ENABLE_SWAGGER should be false in production");
    }
  }

  if (errors.length > 0) {
    console.warn("⚠️  Configuration warnings:");
    errors.forEach((error) => console.warn(`   - ${error}`));
  }

  return errors.length === 0;
};

// Initialize configuration validation
validateConfig();
