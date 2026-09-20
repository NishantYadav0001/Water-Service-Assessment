# Jal Seva Aankalan (Drinking Water Service Assessment)

A comprehensive Gram Panchayat Portal for assessing and monitoring drinking water services across various states, districts, and gram panchayats. This platform allows for role-based data collection, assessment tracking, and proof management.

## 🌟 Key Features

*   **Role-Based Access Control (RBAC):** Hierarchical access for GP Users (data entry), District Admins, State Admins, and Super Admins.
*   **Multi-language Support:** Full UI localization across 15+ Indian languages to ensure accessibility at the grassroots level.
*   **Secure Authentication:** Powered by Supabase, featuring email/password login, secure registration, and an 8-digit OTP-based password recovery pipeline.
*   **Assessment Management:** Structured forms for tracking water service quality, including document/image proof uploads.
*   **Row Level Security (RLS):** Strict database-level security ensuring users can only access data relevant to their assigned jurisdiction.
*   **Vanilla SPA Architecture:** Lightweight, fast, and entirely client-side rendered Single Page Application (SPA) without the overhead of heavy frontend frameworks.

## 🛠️ Technology Stack

*   **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+)
*   **Backend & Database:** [Supabase](https://supabase.com/) (PostgreSQL)
*   **Authentication:** Supabase Auth (with Custom SMTP via Resend)
*   **Storage:** Supabase Storage (for assessment proofs)

## 📁 Project Structure

```text
jal-seva-aankalan/
├── frontend/
│   ├── index.html              # Main application entry point & UI templates
│   ├── verified.html           # Success page post-registration/verification
│   ├── styles.css              # Global styles and responsive design
│   ├── translations.json       # Dictionary for 15+ language localizations
│   ├── assets/                 # Images, icons, and static assets
│   └── js/
│       ├── auth.js             # Authentication logic (login, register, OTP flow)
│       ├── navigation.js       # SPA routing and view transitions
│       ├── translations.js     # Logic for applying multi-language strings
│       └── supabaseClient.js   # Supabase initialization and API helpers
└── README.md                   # Project documentation
```

## 🚀 Local Setup & Installation

### 1. Prerequisites
*   A modern web browser
*   A local web server extension (e.g., VS Code "Live Server")
*   A [Supabase](https://supabase.com) Account

### 2. Clone the Repository
```bash
git clone https://github.com/your-username/jal-seva-aankalan.git
cd jal-seva-aankalan/frontend
```

### 3. Environment Configuration
Open `frontend/js/supabaseClient.js` and update it with your Supabase project credentials:
```javascript
const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_KEY = 'YOUR_ANON_PUBLIC_KEY';
```

### 4. Supabase Backend Setup
To ensure the application functions correctly, you must configure your Supabase backend. 
1.  **Authentication:** Enable Email authentication.
2.  **Custom SMTP:** Set up a custom SMTP provider (like Resend) in Supabase `Authentication -> Configuration -> SMTP` to ensure OTP emails are delivered successfully.
3.  **Database & RLS:** Create the required tables (`profiles`, `assessments`) and enable Row Level Security (RLS) policies.
4.  **Storage:** Create a public bucket named `assessment-proofs` for uploading images/documents.

*(Note: See the included internal guide or consult the database schema documentation for exact RLS SQL queries).*

### 5. Run the Application
Start a local web server in the `frontend` directory. If using VS Code, right-click `index.html` and select **"Open with Live Server"**. The app will be available at `http://127.0.0.1:5500`.

## 🔒 Security Notes

*   **API Keys:** The `SUPABASE_KEY` used in the frontend is the `anon` (anonymous) public key. It is safe to expose in the browser **only because** Row Level Security (RLS) is enabled on the database.
*   **Never** place the `service_role` secret key in the frontend code.
*   **OTP Security:** The platform utilizes 8-digit OTPs for password recovery to prevent brute-force attacks.

## 🤝 Contributing
1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request
