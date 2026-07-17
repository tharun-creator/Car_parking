# Google Sheets & OAuth Configuration Setup Guide

Follow these steps to set up the Google Sheets database and Google OAuth credentials for this application.

## Part 1: Google Sheet Setup

1. Create a new Google Sheet named **Event Parking Data**.
2. Create three tabs in the sheet, naming them exactly:
   - `Registrations`
   - `Staff`
   - `ScanLog`

3. In the **first row (Header Row)** of each tab, add the following column headers exactly:

### Tab 1: `Registrations`
| Column A | Column B | Column C | Column D | Column E | Column F | Column G | Column H | Column I | Column J | Column K | Column L | Column M |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `row_id` | `user_email` | `name` | `phone_number` | `role` | `role_other_detail` | `qr_token` | `backup_code` | `status` | `checked_in_at` | `checked_in_by` | `created_at` | `password_hash` |

*Note: The script matches these column names exactly (case-sensitive).*

### Tab 2: `Staff`
| Column A |
|---|
| `email` |

Add the Google emails of the staff members who should have access to the `/scan` route in this column (e.g. `staff-member@gmail.com`).

### Tab 3: `ScanLog`
| Column A | Column B | Column C | Column D | Column E | Column F |
|---|---|---|---|---|---|
| `timestamp` | `input_method` | `raw_input` | `result` | `matched_email` | `scanned_by` |

4. Copy the **Spreadsheet ID** from the URL of your Google Sheet. It is the long string of characters between `/d/` and `/edit` in the URL:
   `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_IS_HERE/edit`
   Save this for your `.env` file under `GOOGLE_SHEET_ID`.

---

## Part 2: Google Cloud Service Account Setup

To access the sheet server-side, you need a Service Account key:

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., `Event Parking System`).
3. Search for the **Google Sheets API** and click **Enable**.
4. Go to **APIs & Services > Credentials**.
5. Click **Create Credentials** and select **Service Account**.
6. Follow the prompt to name the service account (e.g., `sheets-backend`) and click **Create and Continue**, then click **Done**.
7. In the credentials list, find the service account you just created. Click the edit (pencil) icon or click on the service account email.
8. Go to the **Keys** tab, click **Add Key > Create new key**, select **JSON**, and click **Create**.
9. A JSON file will download to your computer. Open it and extract:
   - `client_email` -> Set as `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` -> Set as `GOOGLE_PRIVATE_KEY` (make sure it includes the BEGIN and END lines, and escape any newlines as `\n`).
10. **CRITICAL STEP**: Open your Google Sheet, click **Share** in the top right, paste the service account email (e.g., `sheets-backend@...iam.gserviceaccount.com`), assign it **Editor** access, and click **Share**.

---

## Part 3: Google OAuth Setup (NextAuth.js)

To allow users to sign in with Google:

1. In the Google Cloud Console, go to **APIs & Services > OAuth consent screen**.
2. Choose **External** user type, fill out the application name/support email, and save.
3. Go to the **Credentials** page.
4. Click **Create Credentials** and select **OAuth client ID**.
5. Set Application type to **Web application**.
6. Add **Authorized JavaScript origins**:
   - `http://localhost:3000` (for local development)
   - `https://your-app.vercel.app` (for production)
7. Add **Authorized redirect URIs**:
   - `http://localhost:3000/api/auth/callback/google` (for local development)
   - `https://your-app.vercel.app/api/auth/callback/google` (for production)
8. Click **Create** and copy the client ID and client secret to set as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
