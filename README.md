# Payment slip setup

Students submit bank-transfer payment slips through the authenticated payment page. The API checks that the submitted name and index number match the signed-in student, stores the file in private Cloud Storage, and leaves the payment pending until an admin approves or rejects it.

## Storage configuration

Set `PAYMENT_SLIPS_BUCKET_NAME` to a dedicated Google Cloud Storage bucket. Configure the bucket with uniform bucket-level access and public access prevention, and grant the backend service account permission to create/read/delete objects. Payment slips are never made public; admins open them through short-lived signed URLs.

The backend also needs its existing Google Cloud Storage credentials (`GCS_CREDENTIALS` or the service account key file) and `GCS_PROJECT_ID`. Copy `.env.example` to `.env` and set:

- `PAYMENT_SLIPS_BUCKET_NAME`: the private bucket for uploaded receipts.
- `GCS_CREDENTIALS` or `serviceAccountKey.json`: credentials with permission to create, read, and delete objects in the private bucket.
- `GCS_PROJECT_ID`: the Google Cloud project containing the bucket.

Set these variables in the backend hosting environment and restart the backend. The payment-slip bucket must be configured before students can submit slips.

Admins can update the Theory, Revision, and Paper fees and bank-transfer account from **Admin → Payment Settings**. Those settings are stored in MongoDB and displayed to students.

## Payment review

Only authenticated student accounts can upload a slip, and the entered student name and index number must match the account. JPG, PNG, WebP, and PDF files up to 5 MB are accepted. Admins can view submissions under **Admin → Payment Slips**; approving a slip marks its selected months paid, while rejecting it allows the student to submit again.
