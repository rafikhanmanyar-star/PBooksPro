# WhatsApp API Registration & Setup Guide

This guide explains how to register for the WhatsApp Business API and configure it in your application.

For a detailed step-by-step guide with screenshots and in-depth explanations, please refer to:
👉 [**Detailed Meta WhatsApp Setup Guide**](doc/META_WHATSAPP_SETUP_GUIDE.md)

## Quick Summary

### 1. Register with Meta (Facebook)
To get the API credentials, you need to set up a Meta Business Account and App.

1.  **Create Meta Business Account**: Go to [business.facebook.com](https://business.facebook.com) and create an account.
2.  **Create an App**: Go to [developers.facebook.com](https://developers.facebook.com), create a "Business" app.
3.  **Add WhatsApp Product**: Add "WhatsApp" to your app.
4.  **Get Credentials**:
    *   **Phone Number ID**: Found in WhatsApp > API Setup.
    *   **Access Token**:
        *   For testing: Use the temporary token in API Setup.
        *   For production: Create a System User in Business Settings and generate a permanent token.
5.  **Add Phone Number**: Add your real business phone number in the API Setup section.

### 2. Configure the Application
Once you have the credentials, you can configure the application directly in the UI.

1.  Log in to the application as an **Admin**.
2.  Go to **Settings**.
3.  Navigate to the **Preferences** section (default view).
4.  Select the **Communication** tab.
5.  Click on **WhatsApp Integration**.
6.  Enter the credentials you obtained from Meta:
    *   **Access Token**
    *   **Phone Number ID**
    *   **Webhook Verify Token** (Create a random secure string or generate one in the UI)
7.  **Webhook Setup**:
    *   Copy the **Webhook URL** displayed in the app settings.
    *   Go to your Meta App Dashboard > WhatsApp > Configuration.
    *   Click "Edit" on Webhook.
    *   Paste the Webhook URL and the Verify Token.
    *   Verify and Save.
8.  **Test Connection**: Click "Test Connection" in the app settings to verify everything is working.

## Troubleshooting

*   **Token Expired**: If using a temporary token, it expires in 24 hours. Follow the [Detailed Guide](doc/META_WHATSAPP_SETUP_GUIDE.md#part-5-generate-permanent-access-token) to generate a permanent one.
*   **Webhook Verification Failed**: Ensure your app is deployed to a public HTTPS URL (not localhost) or use a tunneling service like ngrok for local testing.

---
*For full details, please read [doc/META_WHATSAPP_SETUP_GUIDE.md](doc/META_WHATSAPP_SETUP_GUIDE.md)*
