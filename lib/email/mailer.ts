import nodemailer, { Transporter } from "nodemailer";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;
    if (!host || !port || !user || !pass) {
      throw new Error("SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD are not configured");
    }
    transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Number(port) === 465,
      auth: { user, pass },
    });
  }
  return transporter;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

// Thin wrapper, deliberately without its own retry logic — retrying belongs to
// the BullMQ job that calls this (see workers/notificationWorker.ts), which can
// distinguish "retry later" from "give up and mark FAILED" using job attempts.
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const from = process.env.SMTP_FROM ?? "no-reply@clinic.test";
  await getTransporter().sendMail({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
}
