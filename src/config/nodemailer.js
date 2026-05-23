import nodemailer from "nodemailer";

export const getTransporter = async () => {
  const gmailUser = (process.env.GMAIL_USER || "").trim();
  const gmailAppPassword = (process.env.GMAIL_APP_PASSWORD || "").trim();

  if (!gmailUser || !gmailAppPassword) {
    console.warn("⚠️ Gmail credentials missing!");
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    family: 4,

    auth: {
      user: gmailUser,
      pass: gmailAppPassword,
    },
  });

  return transporter;
};