import nodemailer from "nodemailer";

export const getTransporter = async () => {
  const gmailUser = (process.env.GMAIL_USER || "").trim();
  const gmailAppPassword = (process.env.GMAIL_APP_PASSWORD || "").trim();

  if (!gmailUser || !gmailAppPassword) {
    console.warn("⚠️ Gmail credentials (GMAIL_USER / GMAIL_APP_PASSWORD) are missing!");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailAppPassword,
    },
  });

  return transporter;
};
