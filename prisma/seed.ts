import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create a super admin user
  const adminEmail = 'admin@hospital.com';
  const adminPassword = 'SecurePassword123!';
  
  console.log('👤 Creating super admin user...');
  
  // Check if admin user already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail }
  });

  let adminUser;
  if (existingAdmin) {
    console.log('✅ Admin user already exists');
    adminUser = existingAdmin;
  } else {
    const hashedPassword = await bcrypt.hash(adminPassword, 12);
    
    adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: hashedPassword,
        role: 'super_admin',
        active: true
      }
    });
    console.log('✅ Super admin user created');
  }

  // Create sample organizations
  console.log('🏥 Creating sample organizations...');
  
  const organizations = [
    {
      identifier: 'general-hospital-001',
      name: 'General Hospital',
      type: 'hospital',
      active: true,
      address: [{
        use: 'work',
        line: ['123 Hospital Drive'],
        city: 'Medical City',
        state: 'CA',
        postalCode: '90210',
        country: 'USA'
      }],
      telecom: [{
        system: 'phone',
        value: '+1-555-123-4567',
        use: 'work'
      }, {
        system: 'email',
        value: 'info@generalhospital.com',
        use: 'work'
      }]
    },
    {
      identifier: 'family-clinic-002',
      name: 'Family Health Clinic',
      type: 'clinic',
      active: true,
      address: [{
        use: 'work',
        line: ['456 Wellness Street'],
        city: 'Health Town',
        state: 'CA',
        postalCode: '90211',
        country: 'USA'
      }],
      telecom: [{
        system: 'phone',
        value: '+1-555-987-6543',
        use: 'work'
      }]
    },
    {
      identifier: 'specialty-center-003',
      name: 'Specialty Medical Center',
      type: 'clinic',
      active: true,
      address: [{
        use: 'work',
        line: ['789 Specialist Avenue'],
        city: 'Expert City',
        state: 'CA',
        postalCode: '90212',
        country: 'USA'
      }],
      telecom: [{
        system: 'phone',
        value: '+1-555-456-7890',
        use: 'work'
      }]
    }
  ];

  const createdOrgs = [];
  for (const orgData of organizations) {
    const existingOrg = await prisma.organization.findUnique({
      where: { identifier: orgData.identifier }
    });

    if (existingOrg) {
      console.log(`✅ Organization ${orgData.name} already exists`);
      createdOrgs.push(existingOrg);
    } else {
      const org = await prisma.organization.create({
        data: orgData
      });
      console.log(`✅ Created organization: ${org.name}`);
      createdOrgs.push(org);
    }
  }

  // Assign admin to all organizations (force recreate to ensure access)
  console.log('🔗 Ensuring admin has access to all organizations...');
  
  // Delete existing access first
  await prisma.userOrganizationAccess.deleteMany({
    where: { userId: adminUser.id }
  });

  // Create fresh access for all organizations
  for (const org of createdOrgs) {
    await prisma.userOrganizationAccess.create({
      data: {
        userId: adminUser.id,
        organizationId: org.id,
        role: 'admin',
        status: 'active'
      }
    });
    console.log(`✅ Admin assigned to ${org.name}`);
  }

  // Update admin's primary organization
  await prisma.user.update({
    where: { id: adminUser.id },
    data: { primaryOrganizationId: createdOrgs[0].id }
  });
  console.log('✅ Set primary organization for admin');

  // Create sample practitioners
  console.log('👨‍⚕️ Creating sample practitioners...');
  
  const practitioners = [
    {
      identifier: [{ use: 'official', system: 'http://hl7.org/fhir/sid/us-npi', value: '1234567890' }],
      active: true,
      name: [{ use: 'official', family: 'Johnson', given: ['Dr. Sarah'], prefix: ['Dr.'] }],
      telecom: [
        { system: 'phone', value: '+1-555-123-9876', use: 'work' },
        { system: 'email', value: 'dr.johnson@hospital.com', use: 'work' }
      ],
      gender: 'female',
      birthDate: new Date('1975-08-22'),
      qualification: [{
        code: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/v2-0360',
            code: 'MD',
            display: 'Doctor of Medicine'
          }]
        },
        issuer: { display: 'Medical University' }
      }],
      specialty: [{
        coding: [{
          system: 'http://snomed.info/sct',
          code: '419772000',
          display: 'Family Practice'
        }]
      }]
    },
    {
      identifier: [{ use: 'official', system: 'http://hl7.org/fhir/sid/us-npi', value: '0987654321' }],
      active: true,
      name: [{ use: 'official', family: 'Smith', given: ['Dr. Michael'], prefix: ['Dr.'] }],
      telecom: [
        { system: 'phone', value: '+1-555-456-1234', use: 'work' },
        { system: 'email', value: 'dr.smith@hospital.com', use: 'work' }
      ],
      gender: 'male',
      birthDate: new Date('1980-12-15'),
      qualification: [{
        code: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/v2-0360',
            code: 'MD',
            display: 'Doctor of Medicine'
          }]
        },
        issuer: { display: 'Medical University' }
      }],
      specialty: [{
        coding: [{
          system: 'http://snomed.info/sct',
          code: '394814009',
          display: 'General Practice'
        }]
      }]
    }
  ];

  const createdPractitioners = [];
  for (const practData of practitioners) {
    // Check by NPI value instead of complex JSON query
    const npiValue = practData.identifier[0].value;
    const existingPract = await prisma.practitioner.findFirst({
      where: {
        identifier: {
          path: '$[*].value',
          array_contains: npiValue
        }
      }
    });

    if (existingPract) {
      console.log(`✅ Practitioner ${practData.name[0].given[0]} ${practData.name[0].family} already exists`);
      createdPractitioners.push(existingPract);
    } else {
      const practitioner = await prisma.practitioner.create({
        data: practData
      });
      console.log(`✅ Created practitioner: ${practData.name[0].given[0]} ${practData.name[0].family}`);
      createdPractitioners.push(practitioner);
    }
  }

  // Assign practitioners to organizations
  console.log('🔗 Assigning practitioners to organizations...');
  for (let i = 0; i < createdPractitioners.length; i++) {
    const practitioner = createdPractitioners[i];
    const org = createdOrgs[i % createdOrgs.length]; // Distribute across organizations

    const existingAssignment = await prisma.practitionerOrganization.findUnique({
      where: {
        practitionerId_organizationId: {
          practitionerId: practitioner.id,
          organizationId: org.id
        }
      }
    });

    if (!existingAssignment) {
      await prisma.practitionerOrganization.create({
        data: {
          practitionerId: practitioner.id,
          organizationId: org.id,
          role: 'primary',
          status: 'active'
        }
      });
      console.log(`✅ Assigned practitioner to ${org.name}`);
    }
  }

  // Create sample patients
  console.log('👥 Creating sample patients...');
  
  const patients = [
    {
      identifier: [{ use: 'usual', system: 'http://hospital.com/patient-id', value: 'PAT001' }],
      active: true,
      name: [{ use: 'official', family: 'Smith', given: ['John', 'William'] }],
      telecom: [
        { system: 'phone', value: '+1-555-987-6543', use: 'home' },
        { system: 'email', value: 'john.smith@email.com', use: 'home' }
      ],
      gender: 'male',
      birthDate: new Date('1985-03-15'),
      address: [{
        use: 'home',
        line: ['456 Patient Street'],
        city: 'Patient City',
        state: 'CA',
        postalCode: '90211',
        country: 'USA'
      }],
      maritalStatus: {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v3-MaritalStatus',
          code: 'M',
          display: 'Married'
        }]
      }
    },
    {
      identifier: [{ use: 'usual', system: 'http://hospital.com/patient-id', value: 'PAT002' }],
      active: true,
      name: [{ use: 'official', family: 'Johnson', given: ['Emily', 'Rose'] }],
      telecom: [
        { system: 'phone', value: '+1-555-123-7890', use: 'home' },
        { system: 'email', value: 'emily.johnson@email.com', use: 'home' }
      ],
      gender: 'female',
      birthDate: new Date('1990-07-22'),
      address: [{
        use: 'home',
        line: ['789 Wellness Road'],
        city: 'Health City',
        state: 'CA',
        postalCode: '90213',
        country: 'USA'
      }],
      maritalStatus: {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v3-MaritalStatus',
          code: 'S',
          display: 'Single'
        }]
      }
    },
    {
      identifier: [{ use: 'usual', system: 'http://hospital.com/patient-id', value: 'PAT003' }],
      active: true,
      name: [{ use: 'official', family: 'Davis', given: ['Robert', 'James'] }],
      telecom: [
        { system: 'phone', value: '+1-555-456-0123', use: 'home' }
      ],
      gender: 'male',
      birthDate: new Date('1978-11-08'),
      address: [{
        use: 'home',
        line: ['321 Care Avenue'],
        city: 'Medical Town',
        state: 'CA',
        postalCode: '90214',
        country: 'USA'
      }]
    }
  ];

  const createdPatients = [];
  for (const patientData of patients) {
    // Check by patient ID value
    const patientIdValue = patientData.identifier[0].value;
    const existingPatient = await prisma.patient.findFirst({
      where: {
        identifier: {
          path: '$[*].value',
          array_contains: patientIdValue
        }
      }
    });

    if (existingPatient) {
      console.log(`✅ Patient ${patientData.name[0].given[0]} ${patientData.name[0].family} already exists`);
      createdPatients.push(existingPatient);
    } else {
      const patient = await prisma.patient.create({
        data: patientData
      });
      console.log(`✅ Created patient: ${patientData.name[0].given[0]} ${patientData.name[0].family}`);
      createdPatients.push(patient);
    }
  }

  // Assign patients to organizations
  console.log('🔗 Assigning patients to organizations...');
  for (let i = 0; i < createdPatients.length; i++) {
    const patient = createdPatients[i];
    const org = createdOrgs[i % createdOrgs.length]; // Distribute across organizations

    const existingAssignment = await prisma.patientOrganization.findUnique({
      where: {
        patientId_organizationId: {
          patientId: patient.id,
          organizationId: org.id
        }
      }
    });

    if (!existingAssignment) {
      await prisma.patientOrganization.create({
        data: {
          patientId: patient.id,
          organizationId: org.id,
          relationship: 'primary',
          status: 'active',
          primaryCare: true
        }
      });
      console.log(`✅ Assigned patient to ${org.name}`);
    }
  }

  // Create sample appointments
  console.log('📅 Creating sample appointments...');
  
  const appointments = [
    {
      status: 'booked',
      serviceType: [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/service-type',
          code: '124',
          display: 'General Practice'
        }]
      }],
      appointmentType: {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v2-0276',
          code: 'ROUTINE',
          display: 'Routine appointment'
        }]
      },
      reasonCode: [{
        coding: [{
          system: 'http://snomed.info/sct',
          code: '162673000',
          display: 'General examination of patient'
        }]
      }],
      description: 'Annual physical examination',
      start: new Date('2024-02-15T09:00:00Z'),
      end: new Date('2024-02-15T09:30:00Z'),
      minutesDuration: 30,
      comment: 'Patient requesting annual checkup'
    },
    {
      status: 'booked',
      serviceType: [{
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/service-type',
          code: '124',
          display: 'General Practice'
        }]
      }],
      description: 'Follow-up consultation',
      start: new Date('2024-02-20T14:00:00Z'),
      end: new Date('2024-02-20T14:30:00Z'),
      minutesDuration: 30,
      comment: 'Follow-up for previous treatment'
    }
  ];

  for (let i = 0; i < appointments.length && i < createdPatients.length && i < createdPractitioners.length; i++) {
    const appointmentData = {
      ...appointments[i],
      patientId: createdPatients[i].id,
      practitionerId: createdPractitioners[i % createdPractitioners.length].id,
      organizationId: createdOrgs[i % createdOrgs.length].id
    };

    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        patientId: appointmentData.patientId,
        practitionerId: appointmentData.practitionerId,
        start: appointmentData.start
      }
    });

    if (!existingAppointment) {
      await prisma.appointment.create({
        data: appointmentData
      });
      console.log(`✅ Created appointment for patient ${i + 1}`);
    } else {
      console.log(`✅ Appointment already exists for patient ${i + 1}`);
    }
  }

  // Create sample staff
  console.log('👨‍💼 Creating sample staff...');
  
  const staff = [
    {
      employeeId: 'EMP001',
      name: [{ use: 'official', family: 'Wilson', given: ['Jennifer'] }],
      position: 'receptionist',
      department: 'Front Desk',
      email: 'jennifer.wilson@hospital.com',
      phone: '+1-555-111-2222',
      hireDate: new Date('2023-01-15'),
      status: 'active',
      organizationId: createdOrgs[0].id
    },
    {
      employeeId: 'EMP002',
      name: [{ use: 'official', family: 'Brown', given: ['David'] }],
      position: 'technician',
      department: 'Laboratory',
      email: 'david.brown@hospital.com',
      phone: '+1-555-333-4444',
      hireDate: new Date('2023-03-20'),
      status: 'active',
      organizationId: createdOrgs[0].id
    }
  ];

  for (const staffData of staff) {
    const existingStaff = await prisma.staff.findUnique({
      where: { employeeId: staffData.employeeId }
    });

    if (!existingStaff) {
      await prisma.staff.create({
        data: staffData
      });
      console.log(`✅ Created staff: ${staffData.name[0].given[0]} ${staffData.name[0].family}`);
    } else {
      console.log(`✅ Staff ${staffData.name[0].given[0]} ${staffData.name[0].family} already exists`);
    }
  }

  console.log('🎉 Database seed completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`- Organizations: ${createdOrgs.length}`);
  console.log(`- Practitioners: ${createdPractitioners.length}`);
  console.log(`- Patients: ${createdPatients.length}`);
  console.log(`- Admin User: ${adminEmail}`);
  console.log(`- Admin Password: ${adminPassword}`);
  console.log('\n🚀 You can now run the API tests!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });