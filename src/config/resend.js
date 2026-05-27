import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

// Initialize Resend only if the API key is present to avoid startup crashes
const resend = apiKey ? new Resend(apiKey) : null;

export default resend;