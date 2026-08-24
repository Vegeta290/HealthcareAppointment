// Seed data for local development: one Admin, three Doctors (each with a
// DoctorProfile, a specialisation, and Mon–Fri DoctorWorkingHours), and one
// Patient. Enough to exercise role-based access control and doctor search
// locally — not fixture data for appointments/holds, which are better created
// through the booking flow itself.
//
// Requires `bcryptjs` (already a dependency — see package.json). Run with
// `npx prisma db seed`, configured via `"prisma": { "seed": "..." }` in
// package.json.

import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SEED_PASSWORD = "ChangeMe123!"; // local dev only — never used outside seeding

const MON_TO_FRI_9_TO_5 = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startTime: "09:00",
  endTime: "17:00",
}));

interface SeedDoctor {
  fullName: string;
  email: string;
  specialisation: string;
  bio: string;
  slotDurationMinutes: number;
}

const SEED_DOCTORS: SeedDoctor[] = [
  {
    fullName: "Elena Vasquez",
    email: "cardiology@clinic.test",
    specialisation: "Cardiology",
    bio: "Seed doctor for local testing — Cardiology.",
    slotDurationMinutes: 30,
  },
  {
    fullName: "Marcus Chen",
    email: "generalpractice@clinic.test",
    specialisation: "General Practice",
    bio: "Seed doctor for local testing — General Practice.",
    slotDurationMinutes: 20,
  },
  {
    fullName: "Priya Sharma",
    email: "dermatology@clinic.test",
    specialisation: "Dermatology",
    bio: "Seed doctor for local testing — Dermatology.",
    slotDurationMinutes: 15,
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@clinic.test" },
    update: {},
    create: {
      email: "admin@clinic.test",
      passwordHash,
      role: Role.ADMIN,
    },
  });

  const doctors = [];
  for (const doctor of SEED_DOCTORS) {
    // Working hours are create-only (tied 1:1 to the profile via onDelete:
    // Cascade), so a re-run against an already-seeded database won't touch
    // them for an existing doctor. fullName IS backfilled on re-run though —
    // useful for the 3 doctors seeded before that field existed.
    const doctorUser = await prisma.user.upsert({
      where: { email: doctor.email },
      update: {
        doctorProfile: { update: { fullName: doctor.fullName } },
      },
      create: {
        email: doctor.email,
        passwordHash,
        role: Role.DOCTOR,
        doctorProfile: {
          create: {
            fullName: doctor.fullName,
            specialisation: doctor.specialisation,
            bio: doctor.bio,
            slotDurationMinutes: doctor.slotDurationMinutes,
            workingHours: { create: MON_TO_FRI_9_TO_5 },
          },
        },
      },
      include: { doctorProfile: true },
    });
    doctors.push(doctorUser);
  }

  const patientUser = await prisma.user.upsert({
    where: { email: "patient@clinic.test" },
    update: {},
    create: {
      email: "patient@clinic.test",
      passwordHash,
      role: Role.PATIENT,
      patientProfile: {
        create: {
          fullName: "Seed Patient",
          phone: "+10000000000",
          dateOfBirth: new Date("1990-01-01"),
        },
      },
    },
    include: { patientProfile: true },
  });

  console.log("Seeded:");
  console.log(`  Admin:   ${admin.email}`);
  for (const doctorUser of doctors) {
    console.log(`  Doctor:  ${doctorUser.email} (${doctorUser.doctorProfile?.specialisation})`);
  }
  console.log(`  Patient: ${patientUser.email}`);
  console.log(`  Password (all accounts): ${SEED_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
