# Event Parking Registration & QR Verification Web App

This is a production-ready Next.js web application for managing car parking access at an event. It supports real-time registration of vehicles, instant QR ticket generation, and a camera-based/manual-entry gate verification interface for event staff.

---

## ⚡ Features

1. **Registrant Flow**: Sign in with Google, fill out a short vehicle registration form, and receive an instant QR code pass + a unique 4-character alphanumeric backup code.
2. **Staff Scanner Flow**: Authorized staff members can scan QR codes via their phone cameras or enter 4-character codes manually. The screen displays large, high-contrast, color-coded status overlays:
   - **🟢 VERIFIED** (Green, showing Name/Role)
   - **🟡 ALREADY IN** (Amber, showing duplicate checks and time/staff check-in log)
   - **🔴 NOT REGISTERED** (Red, invalid code)
3. **Google Sheets Backend**: Relational-like schema with in-memory caching for sub-100ms lookups and background refresh, along with re-read before write safety to prevent race conditions.
4. **Audit Trail**: Every verification and check-in attempt is logged automatically to a `ScanLog` sheet.

---

## 🛠️ Setup Instructions

For step-by-step guidance on creating the spreadsheet and configuring credentials, refer to the [Google Sheets Setup Guide](SETUP.md).

### 1. Environment Variables

Create a `.env` file in the root directory (based on `.env.example`):

```bash
# NextAuth Config
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret_minimum_32_characters

# Google OAuth Credentials (for users to sign-in)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Google Sheets Backend Config (Service Account)
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account-email@project-id.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEET_ID=your_google_sheet_spreadsheet_id
```

### 2. Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 👥 Adding Staff Members

1. Open your **Event Parking Data** Google Sheet.
2. Navigate to the `Staff` tab.
3. Add a new row containing the Google account email address of the staff member (under the `email` header).
4. Save the changes. The Next.js server will automatically refresh its staff cache in the background (within 5 seconds).

---

## 🚀 Deploying to Vercel

1. Create a new project on [Vercel](https://vercel.com).
2. Connect your Git repository.
3. In the project settings, add the environment variables from your `.env` file.
   - **⚠️ IMPORTANT**: When pasting `GOOGLE_PRIVATE_KEY` on Vercel, paste it exactly as it is, including the quotation marks and the newline characters (`\n`), or replace `\n` with actual linebreaks depending on how Vercel processes it. Our codebase handles escaped newlines (`\n`) automatically.
4. Click **Deploy**.

---

## 🔒 Security & Concurrency Design

- **Race Conditions**: Because Google Sheets lacks transactional locks, the server re-reads the specific cell status directly from the Google Sheets API immediately prior to performing a check-in write, rather than relying solely on the in-memory cache.
- **Brute Force Defense**: The manual code entry API incorporates a server-side in-memory rate limiter restricted to 15 manual requests per minute per verifier.
- **Data Protection**: Only the opaque `qr_token` is encoded in the QR code. All lookups and checks are resolved server-side; no PII (email, phone, name) is sent to the client QR payload.
- **Staff Verification**: Access to the `/scan` page is gated by checking session emails against the `Staff` sheet on the server for every single request.
