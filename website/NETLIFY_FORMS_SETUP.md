# Netlify Forms Setup Guide

## ✅ Changes Made

### 1. Pricing Page Hidden/Disabled
- ✅ Removed "Pricing" link from all navigation menus
- ✅ Removed pricing section from homepage (index.html)
- ✅ Updated all pricing links to point to contact page
- ✅ Removed pricing from all footer sections
- ✅ Replaced with "Contact for Pricing" links

### 2. Forms Integrated with Netlify
All forms have been updated to work with Netlify Forms:

- ✅ **Contact Form** (`contact.html`) - Form name: `contact`
- ✅ **Demo Request Form** (`demo.html`) - Form name: `demo-request`
- ✅ **Trial Signup Form** (`download.html`) - Form name: `trial-signup`
- ✅ **Newsletter Form** (`blog.html`) - Form name: `newsletter`

## 🚀 How to Set Up Netlify Forms

### Step 1: Deploy to Netlify

1. **Push your website to GitHub**
   ```bash
   git add .
   git commit -m "Website with Netlify Forms integration"
   git push origin main
   ```

2. **Deploy to Netlify**
   - Go to [netlify.com](https://netlify.com)
   - Sign up/Login
   - Click "Add new site" → "Import an existing project"
   - Connect your GitHub repository
   - Configure build settings:
     - **Base directory**: `website` (or leave empty if website is root)
     - **Build command**: (leave empty - static site)
     - **Publish directory**: `website` (or `.` if website is root)
   - Click "Deploy site"

### Step 2: Configure Form Notifications

1. **Go to Netlify Dashboard**
   - Click on your site
   - Go to **Site settings** → **Forms**

2. **Enable Form Notifications**
   - Scroll to "Form notifications"
   - Click "Add notification"
   - Select "Email notification"
   - Enter your email address
   - Click "Save"

3. **Configure Each Form** (Optional)
   - You can set up different email addresses for different forms
   - Go to Forms → [Form name] → Notifications

### Step 3: Test Your Forms

1. **Visit your deployed site**
2. **Fill out and submit each form**
3. **Check your email** - You should receive notifications
4. **Check Netlify Dashboard** - Forms → Submissions

## 📋 Form Details

### Contact Form
- **Form Name**: `contact`
- **Fields**: name, email, phone, subject, message
- **Location**: `contact.html`

### Demo Request Form
- **Form Name**: `demo-request`
- **Fields**: name, email, phone, company, role, properties, preferred-date, preferred-time, message
- **Location**: `demo.html`

### Trial Signup Form
- **Form Name**: `trial-signup`
- **Fields**: name, email, phone, company, role, newsletter, terms
- **Location**: `download.html`

### Newsletter Form
- **Form Name**: `newsletter`
- **Fields**: email
- **Location**: `blog.html`

## 🎨 Custom Success Pages (Optional)

You can create custom success pages for each form:

1. **Create success pages**:
   - `contact-success.html`
   - `demo-success.html`
   - `download-success.html`
   - `newsletter-success.html`

2. **Add to form action**:
   ```html
   <form name="contact" method="POST" netlify action="/contact-success.html">
   ```

## 🔒 Spam Protection

Netlify Forms includes built-in spam protection:
- **Honeypot fields** (automatically added)
- **reCAPTCHA** (can be enabled in settings)
- **Akismet** (can be enabled in settings)

To enable additional spam protection:
1. Go to Site settings → Forms
2. Enable "Spam filter"
3. Configure reCAPTCHA or Akismet if needed

## 📊 Viewing Form Submissions

1. **In Netlify Dashboard**:
   - Go to Forms → [Form name]
   - View all submissions
   - Export as CSV
   - Set up webhooks for integrations

2. **Email Notifications**:
   - Receive email for each submission
   - Configure notification settings per form

## 🔧 Advanced Configuration

### Custom Email Templates

You can customize email notifications:
1. Go to Site settings → Forms → Notifications
2. Click "Edit" on notification
3. Customize email subject and body
4. Use form field variables: `{{name}}`, `{{email}}`, etc.

### Webhooks

Set up webhooks to send form data to other services:
1. Go to Forms → [Form name] → Settings
2. Add webhook URL
3. Configure webhook events

### Form Limits

- **Free tier**: 100 submissions/month per form
- **Pro tier**: 1,000 submissions/month per form
- **Business tier**: 10,000 submissions/month per form

## 🐛 Troubleshooting

### Forms Not Working?

1. **Check form attributes**:
   - Ensure `netlify` attribute is present
   - Ensure `name` attribute matches form name
   - Ensure hidden `form-name` input is present

2. **Check Netlify deployment**:
   - Verify site is deployed successfully
   - Check build logs for errors

3. **Test locally**:
   - Forms won't work on `file://` protocol
   - Use local server or deploy to test

### Not Receiving Emails?

1. **Check spam folder**
2. **Verify email in Netlify settings**
3. **Check form notification settings**
4. **Verify form submissions in dashboard**

## 📝 Form HTML Structure

Each form follows this structure:

```html
<form name="form-name" method="POST" netlify>
    <input type="hidden" name="form-name" value="form-name">
    
    <!-- Form fields -->
    <input type="text" name="field-name" required>
    
    <button type="submit">Submit</button>
</form>
```

## ✅ Checklist

- [ ] Website deployed to Netlify
- [ ] Forms configured in Netlify dashboard
- [ ] Email notifications set up
- [ ] Tested all forms
- [ ] Verified email delivery
- [ ] Checked spam protection settings
- [ ] Customized email templates (optional)
- [ ] Set up webhooks (optional)

## 📞 Support

If you need help:
- Netlify Documentation: https://docs.netlify.com/forms/setup/
- Netlify Support: https://www.netlify.com/support/

---

**Last Updated**: 2024  
**Forms Status**: ✅ Ready for Netlify deployment

