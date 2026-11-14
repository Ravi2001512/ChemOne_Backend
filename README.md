# Backend payment configuration

The student payment page uses PayHere hosted checkout. Card details are entered on PayHere's site; this API creates signed checkout requests and only records a payment after validating PayHere's server-to-server notification.

Copy `.env.example` to `.env` and configure:

- `PAYHERE_MERCHANT_ID` and `PAYHERE_MERCHANT_SECRET`: from the PayHere merchant portal. Register the website domain and use the secret associated with that domain.
- `PAYHERE_MODE`: `sandbox` for testing (default for any value other than `live`); set to `live` only after successful sandbox testing.
- `FRONTEND_URL` and `BACKEND_URL`: public website/API base URLs. PayHere must be able to reach `BACKEND_URL/api/payments/payhere/notify`.
- `CLASS_FEE_LKR`: initial monthly fee in LKR; defaults to `2500`. Admins can update the fee and bank-transfer account later from **Admin → Payment Settings**; those settings are stored in MongoDB and shown on the student payment page.

Online checkout remains disabled until the merchant credentials and both base URLs are configured. Never expose the merchant secret in frontend variables or source control. Use PayHere's sandbox account and test cards before enabling live checkout.

PayHere payments are recorded separately from the Theory/Revision/Paper class-payment flags used by the QR scanner.
