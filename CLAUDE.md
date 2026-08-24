# CLAUDE.md

## Project Context
* Build a healthcare appointment platform with separate portals for patients, doctors, and an admin[cite: 1].
* Core evaluation focuses on problem-solving for slot conflicts, leave management, notification reliability, and API design[cite: 1].

## Tech Stack Requirements
* Frontend & Backend: Next.js frontend with Node.js backend API[cite: 1].
* Database: PostgreSQL with Prisma (enforcing role-based auth for patient/doctor/admin)[cite: 1].
* Background Jobs: Background worker for medication reminders and email retries[cite: 1].
* Integrations: Google Gemini API (LLM), Google Calendar API (OAuth 2.0), and an email service (SendGrid, Mailgun, or Nodemailer)[cite: 1].

## Strict Submission Constraints
* Do not generate or commit `node_modules`, `.env`, build artifacts (`dist/`, `.next/`, `out/`), or temporary/editor-specific files[cite: 2].
* No extra modules or package files should be added; keep dependencies minimal and native whenever possible[cite: 2].
* Commit all code directly to the `main` branch[cite: 2].

## Core Implementation Rules
* Implement a slot hold mechanism and prevent simultaneous double-booking attempts safely[cite: 1].
* When a doctor is marked on leave, the system must detect existing bookings and notify affected patients[cite: 1].
* Handle LLM failures gracefully so the system does not break[cite: 1].
* Pre-visit AI summary must return: urgency level (Low/Medium/High), chief complaint, and three suggested questions for the doctor[cite: 1].
* Post-visit AI summary must convert clinical notes into a patient-friendly summary with a medication schedule and follow-up steps[cite: 1].