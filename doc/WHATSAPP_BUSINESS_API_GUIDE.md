# WhatsApp Business API Integration Guide

This guide will help you integrate WhatsApp Business API into your application, allowing automated message sending without opening WhatsApp Web/Desktop.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Overview](#overview)
3. [Step 1: Get WhatsApp Business API Credentials](#step-1-get-whatsapp-business-api-credentials)
4. [Step 2: Extend WhatsApp Service](#step-2-extend-whatsapp-service)
5. [Step 3: Add Settings UI](#step-3-add-settings-ui)
6. [Step 4: Update App State](#step-4-update-app-state)
7. [Step 5: Implement API Methods](#step-5-implement-api-methods)
8. [Step 6: Error Handling & Testing](#step-6-error-handling--testing)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### 1. WhatsApp Business API Account
You need one of the following:
- **Meta Business Account** with WhatsApp Business API access
- **WhatsApp Business API Provider** (like Twilio, MessageBird, etc.)
- **Self-hosted WhatsApp Business API** (using official or unofficial solutions)

### 2. Required Credentials
- **API Endpoint URL** (e.g., `https://graph.facebook.com/v18.0`)
- **Access Token** (Permanent or Temporary)
- **Phone Number ID** (Your WhatsApp Business phone number ID)
- **Business Account ID** (Optional, for some providers)

### 3. API Access Methods

#### Option A: Meta Official API (Recommended for Production)
- Requires Meta Business verification
- More reliable and official
- Costs per conversation
- [Meta WhatsApp Business API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api)

#### Option B: Third-Party Providers
- **Twilio**: `https://api.twilio.com`
- **MessageBird**: `https://rest.messagebird.com`
- **360dialog**: `https://waba-api.360dialog.io`

#### Option C: Self-Hosted (Unofficial)
- Using libraries like `whatsapp-web.js` or `baileys`
- Requires running your own server
- Not officially supported by Meta

---

## Overview

The integration will:
1. Extend the existing `WhatsAppService` to support Business API
2. Add configuration settings in the Settings page
3. Store credentials securely (encrypted in database)
4. Automatically fallback to `wa.me` if API fails
5. Support both methods (wa.me and Business API) simultaneously

---

## Step 1: Get WhatsApp Business API Credentials

### For Meta Official API:

1. **Create Meta Business Account**
   - Go to [business.facebook.com](https://business.facebook.com)
   - Create or select a business account

2. **Set up WhatsApp Business Account**
   - Go to [developers.facebook.com](https://developers.facebook.com)
   - Create a new app or use existing
   - Add "WhatsApp" product
   - Get your Phone Number ID and Access Token

3. **Get Credentials**
   ```
   API Endpoint: https://graph.facebook.com/v18.0
   Phone Number ID: [From WhatsApp Dashboard]
   Access Token: [Generate from App Dashboard]
   ```

### For Twilio:

1. **Sign up for Twilio**
   - Create account at [twilio.com](https://www.twilio.com)
   - Get WhatsApp Sandbox or Production number

2. **Get Credentials**
   ```
   API Endpoint: https://api.twilio.com/2010-04-01
   Account SID: [From Twilio Console]
   Auth Token: [From Twilio Console]
   Phone Number: [Your Twilio WhatsApp Number]
   ```

---

## Step 2: Extend WhatsApp Service

Update `services/whatsappService.ts` to support Business API:

```typescript
// Add these interfaces at the top
export interface WhatsAppBusinessAPIConfig {
  enabled: boolean;
  provider: 'meta' | 'twilio' | 'messagebird' | 'custom';
  apiEndpoint: string;
  apiToken: string;
  phoneNumberId?: string;
  accountSid?: string; // For Twilio
  fromNumber?: string; // For Twilio
  verifyToken?: string; // For webhook verification
  appSecret?: string; // For Meta webhook verification
}

export interface WhatsAppAPIResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: number;
}

// Update the WhatsAppConfig interface
export interface WhatsAppConfig {
  useBusinessAPI: boolean;
  businessAPI?: WhatsAppBusinessAPIConfig;
  apiEndpoint?: string;
  apiToken?: string;
  phoneNumberId?: string;
}

// Add new methods to WhatsAppService class:

/**
 * Initialize WhatsApp Business API configuration
 */
static initializeBusinessAPI(config: WhatsAppBusinessAPIConfig): void {
  this.config.useBusinessAPI = config.enabled;
  this.config.businessAPI = config;
  this.config.apiEndpoint = config.apiEndpoint;
  this.config.apiToken = config.apiToken;
  this.config.phoneNumberId = config.phoneNumberId;
}

/**
 * Test WhatsApp Business API connection
 */
static async testConnection(): Promise<{ success: boolean; message: string }> {
  if (!this.config.useBusinessAPI || !this.config.businessAPI) {
    return { success: false, message: 'Business API not configured' };
  }

  try {
    const config = this.config.businessAPI;
    
    if (config.provider === 'meta') {
      // Test Meta API
      const response = await fetch(
        `${config.apiEndpoint}/${config.phoneNumberId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${config.apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        return { success: true, message: 'Connection successful' };
      } else {
        const error = await response.json();
        return { success: false, message: error.error?.message || 'Connection failed' };
      }
    } else if (config.provider === 'twilio') {
      // Test Twilio API
      const credentials = btoa(`${config.accountSid}:${config.apiToken}`);
      const response = await fetch(
        `${config.apiEndpoint}/Accounts/${config.accountSid}.json`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        return { success: true, message: 'Connection successful' };
      } else {
        return { success: false, message: 'Connection failed' };
      }
    }

    return { success: false, message: 'Unknown provider' };
  } catch (error) {
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Connection error' 
    };
  }
}

/**
 * Send message via WhatsApp Business API
 */
private static async sendViaBusinessAPI(
  phoneNumber: string, 
  message: string
): Promise<WhatsAppAPIResponse> {
  if (!this.config.useBusinessAPI || !this.config.businessAPI) {
    throw new Error('WhatsApp Business API not configured');
  }

  const config = this.config.businessAPI;
  const formattedPhone = this.formatPhoneNumber(phoneNumber);
  
  if (!formattedPhone) {
    throw new Error('Invalid phone number format');
  }

  try {
    if (config.provider === 'meta') {
      return await this.sendViaMetaAPI(formattedPhone, message, config);
    } else if (config.provider === 'twilio') {
      return await this.sendViaTwilioAPI(formattedPhone, message, config);
    } else {
      throw new Error(`Unsupported provider: ${config.provider}`);
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 500
    };
  }
}

/**
 * Send message via Meta WhatsApp Business API
 */
private static async sendViaMetaAPI(
  phoneNumber: string,
  message: string,
  config: WhatsAppBusinessAPIConfig
): Promise<WhatsAppAPIResponse> {
  // Format phone number for Meta API (E.164 format: +1234567890)
  const e164Phone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

  const payload = {
    messaging_product: 'whatsapp',
    to: e164Phone,
    type: 'text',
    text: {
      body: message
    }
  };

  const response = await fetch(
    `${config.apiEndpoint}/${config.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json();

  if (response.ok && data.messages && data.messages[0]) {
    return {
      success: true,
      messageId: data.messages[0].id
    };
  } else {
    return {
      success: false,
      error: data.error?.message || 'Failed to send message',
      errorCode: data.error?.code || response.status
    };
  }
}

/**
 * Send message via Twilio WhatsApp API
 */
private static async sendViaTwilioAPI(
  phoneNumber: string,
  message: string,
  config: WhatsAppBusinessAPIConfig
): Promise<WhatsAppAPIResponse> {
  // Format phone number for Twilio (E.164 format: +1234567890)
  const e164Phone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
  const fromNumber = config.fromNumber || `whatsapp:${config.phoneNumberId}`;

  const formData = new URLSearchParams();
  formData.append('From', fromNumber);
  formData.append('To', `whatsapp:${e164Phone}`);
  formData.append('Body', message);

  const credentials = btoa(`${config.accountSid}:${config.apiToken}`);
  
  const response = await fetch(
    `${config.apiEndpoint}/Accounts/${config.accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    }
  );

  const data = await response.json();

  if (response.ok && data.sid) {
    return {
      success: true,
      messageId: data.sid
    };
  } else {
    return {
      success: false,
      error: data.message || 'Failed to send message',
      errorCode: data.code || response.status
    };
  }
}

/**
 * Updated sendMessage method to support both methods
 */
static async sendMessage(options: WhatsAppMessageOptions): Promise<void> {
  const { contact, message, phoneNumber } = options;
  
  const phone = phoneNumber || contact.contactNo;
  if (!phone) {
    throw new Error(`Contact "${contact.name}" does not have a phone number`);
  }

  const formattedPhone = this.formatPhoneNumber(phone);
  if (!formattedPhone) {
    throw new Error(`Invalid phone number format for "${contact.name}"`);
  }

  // Try Business API first if enabled
  if (this.config.useBusinessAPI && this.config.businessAPI) {
    try {
      const result = await this.sendViaBusinessAPI(formattedPhone, message);
      
      if (result.success) {
        // Success! Message sent via API
        console.log('Message sent via WhatsApp Business API:', result.messageId);
        return;
      } else {
        // API failed, fallback to wa.me
        console.warn('Business API failed, falling back to wa.me:', result.error);
        // Continue to wa.me fallback below
      }
    } catch (error) {
      // API error, fallback to wa.me
      console.warn('Business API error, falling back to wa.me:', error);
      // Continue to wa.me fallback below
    }
  }

  // Fallback to wa.me URL scheme
  const url = this.buildWhatsAppURL(formattedPhone, message);
  window.open(url, '_blank');
}
```

---

## Step 3: Add Settings UI

Create `components/settings/WhatsAppBusinessAPISettings.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { WhatsAppService, WhatsAppBusinessAPIConfig } from '../../services/whatsappService';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { useNotification } from '../../context/NotificationContext';

const WhatsAppBusinessAPISettings: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { showAlert, showToast } = useNotification();
  
  // Get current config from app state (we'll add this to AppState)
  const currentConfig = state.whatsAppBusinessAPIConfig || {
    enabled: false,
    provider: 'meta' as const,
    apiEndpoint: '',
    apiToken: '',
    phoneNumberId: '',
    accountSid: '',
    fromNumber: '',
  };

  const [config, setConfig] = useState<WhatsAppBusinessAPIConfig>(currentConfig);
  const [isTesting, setIsTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    // Initialize service with current config
    if (config.enabled) {
      WhatsAppService.initializeBusinessAPI(config);
    }
  }, [config]);

  const handleSave = () => {
    // Validate required fields based on provider
    if (config.enabled) {
      if (!config.apiEndpoint || !config.apiToken) {
        showAlert('Please fill in all required fields');
        return;
      }

      if (config.provider === 'meta' && !config.phoneNumberId) {
        showAlert('Phone Number ID is required for Meta API');
        return;
      }

      if (config.provider === 'twilio' && (!config.accountSid || !config.fromNumber)) {
        showAlert('Account SID and From Number are required for Twilio');
        return;
      }
    }

    // Save to app state (we'll add this action)
    dispatch({
      type: 'UPDATE_WHATSAPP_BUSINESS_API_CONFIG',
      payload: config
    });

    // Initialize service
    if (config.enabled) {
      WhatsAppService.initializeBusinessAPI(config);
    } else {
      WhatsAppService.initialize({ useBusinessAPI: false });
    }

    showToast('WhatsApp Business API settings saved successfully');
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      // Temporarily set config for testing
      WhatsAppService.initializeBusinessAPI(config);
      const result = await WhatsAppService.testConnection();
      
      if (result.success) {
        showAlert(`✅ ${result.message}`, 'success');
      } else {
        showAlert(`❌ ${result.message}`, 'error');
      }
    } catch (error) {
      showAlert(`❌ Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">WhatsApp Business API</h3>
        <p className="text-sm text-blue-700">
          Enable automated WhatsApp messaging without opening WhatsApp Web. 
          Messages will be sent directly via API. Falls back to wa.me if API fails.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="enableAPI"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
          />
          <label htmlFor="enableAPI" className="text-sm font-medium text-gray-700">
            Enable WhatsApp Business API
          </label>
        </div>

        {config.enabled && (
          <>
            <Select
              label="API Provider"
              value={config.provider}
              onChange={(e) => setConfig({ ...config, provider: e.target.value as any })}
            >
              <option value="meta">Meta (Official WhatsApp Business API)</option>
              <option value="twilio">Twilio</option>
              <option value="messagebird">MessageBird</option>
              <option value="custom">Custom Provider</option>
            </Select>

            <Input
              label="API Endpoint"
              type="text"
              value={config.apiEndpoint}
              onChange={(e) => setConfig({ ...config, apiEndpoint: e.target.value })}
              placeholder="https://graph.facebook.com/v18.0"
              required
            />

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  API Token / Access Token
                </label>
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  {showToken ? 'Hide' : 'Show'}
                </button>
              </div>
              <Input
                type={showToken ? 'text' : 'password'}
                value={config.apiToken}
                onChange={(e) => setConfig({ ...config, apiToken: e.target.value })}
                placeholder="Enter your API token"
                required
              />
            </div>

            {config.provider === 'meta' && (
              <Input
                label="Phone Number ID"
                type="text"
                value={config.phoneNumberId || ''}
                onChange={(e) => setConfig({ ...config, phoneNumberId: e.target.value })}
                placeholder="Your WhatsApp Business Phone Number ID"
                required
              />
            )}

            {config.provider === 'twilio' && (
              <>
                <Input
                  label="Account SID"
                  type="text"
                  value={config.accountSid || ''}
                  onChange={(e) => setConfig({ ...config, accountSid: e.target.value })}
                  placeholder="Your Twilio Account SID"
                  required
                />
                <Input
                  label="From Number (WhatsApp Number)"
                  type="text"
                  value={config.fromNumber || ''}
                  onChange={(e) => setConfig({ ...config, fromNumber: e.target.value })}
                  placeholder="whatsapp:+1234567890"
                  required
                />
              </>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                variant="secondary"
                onClick={handleTest}
                disabled={isTesting}
              >
                {isTesting ? 'Testing...' : 'Test Connection'}
              </Button>
              <Button onClick={handleSave}>
                Save Settings
              </Button>
            </div>
          </>
        )}
      </div>

      {!config.enabled && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
          <p className="font-medium mb-2">Current Behavior:</p>
          <p>Messages will open WhatsApp Web/Desktop with pre-filled messages (wa.me URL scheme).</p>
        </div>
      )}
    </div>
  );
};

export default WhatsAppBusinessAPISettings;
```

---

## Step 4: Update App State

Add to `types.ts`:

```typescript
// Add to AppState interface
export interface AppState {
  // ... existing fields ...
  whatsAppBusinessAPIConfig?: WhatsAppBusinessAPIConfig;
}

// Add to AppAction type
export type AppAction =
  // ... existing actions ...
  | { type: 'UPDATE_WHATSAPP_BUSINESS_API_CONFIG'; payload: WhatsAppBusinessAPIConfig };
```

Update `context/AppContext.tsx`:

```typescript
// Add to initialState
const initialState: AppState = {
  // ... existing fields ...
  whatsAppBusinessAPIConfig: {
    enabled: false,
    provider: 'meta',
    apiEndpoint: '',
    apiToken: '',
    phoneNumberId: '',
  },
};

// Add to reducer
case 'UPDATE_WHATSAPP_BUSINESS_API_CONFIG': {
  return {
    ...state,
    whatsAppBusinessAPIConfig: action.payload
  };
}
```

---

## Step 5: Add to Settings Page

Update `components/settings/SettingsPage.tsx`:

```typescript
// Add import
import WhatsAppBusinessAPISettings from './WhatsAppBusinessAPISettings';

// In the preferences section, add:
{activePreferenceModal === 'whatsapp-api' && (
  <Modal
    isOpen={true}
    onClose={() => setActivePreferenceModal(null)}
    title="WhatsApp Business API Settings"
    size="lg"
  >
    <WhatsAppBusinessAPISettings />
  </Modal>
)}

// Add button in preferences section:
<Button
  variant="secondary"
  onClick={() => setActivePreferenceModal('whatsapp-api')}
  className="w-full"
>
  <div className="w-4 h-4 mr-2">{ICONS.whatsapp}</div>
  WhatsApp Business API
</Button>
```

---

## Step 6: Error Handling & Testing

### Error Handling Best Practices:

1. **Always fallback to wa.me** if API fails
2. **Log errors** for debugging
3. **Show user-friendly messages**
4. **Rate limiting** - respect API limits
5. **Retry logic** for transient failures

### Testing Checklist:

- [ ] Test connection with valid credentials
- [ ] Test connection with invalid credentials
- [ ] Send test message via API
- [ ] Verify fallback to wa.me when API fails
- [ ] Test with different providers (Meta, Twilio)
- [ ] Verify phone number formatting
- [ ] Test error messages display correctly

---

## Troubleshooting

### Common Issues:

1. **"Invalid phone number format"**
   - Ensure phone numbers are in E.164 format (+1234567890)
   - Remove leading zeros and special characters

2. **"Authentication failed"**
   - Verify API token is correct
   - Check token expiration
   - Ensure proper permissions

3. **"Rate limit exceeded"**
   - Implement rate limiting
   - Use message queuing for bulk sends

4. **"Phone number not registered"**
   - Recipient must have WhatsApp
   - Number must be in correct format

### Debug Mode:

Add logging to see what's happening:

```typescript
// In sendViaBusinessAPI method
console.log('Sending via Business API:', {
  provider: config.provider,
  phone: formattedPhone,
  messageLength: message.length
});
```

---

## Security Considerations

1. **Never commit API tokens to git**
2. **Encrypt tokens in database** (if storing)
3. **Use environment variables** for sensitive data
4. **Implement token rotation**
5. **Validate webhook signatures** (if using webhooks)

---

## Next Steps

1. **Message Templates**: Use official WhatsApp message templates for better deliverability
2. **Webhooks**: Set up webhooks to receive delivery status
3. **Message History**: Store sent messages and their status
4. **Bulk Messaging**: Implement queue system for bulk sends
5. **Analytics**: Track message delivery rates

---

## Resources

- [Meta WhatsApp Business API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Twilio WhatsApp API Docs](https://www.twilio.com/docs/whatsapp)
- [WhatsApp Business API Pricing](https://developers.facebook.com/docs/whatsapp/pricing)

---

## Support

If you encounter issues:
1. Check API provider documentation
2. Verify credentials are correct
3. Test with API provider's test tools
4. Check browser console for errors
5. Review network requests in DevTools

