import React, { useState, useEffect } from 'react';
import { apiClient } from '../../services/api/client';
import { useNotification } from '../../context/NotificationContext';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { ICONS } from '../../constants';

interface WhatsAppConfig {
  id?: string;
  tenantId?: string;
  phoneNumberId: string;
  businessAccountId?: string;
  webhookUrl?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface WhatsAppConfigFormProps {
  onClose?: () => void;
}

const WhatsAppConfigForm: React.FC<WhatsAppConfigFormProps> = ({ onClose }) => {
  const { showToast, showAlert } = useNotification();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  
  // Form fields
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');

  // Load existing config
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<WhatsAppConfig>('/whatsapp/config');
      setConfig(response);
      setPhoneNumberId(response.phoneNumberId || '');
      setBusinessAccountId(response.businessAccountId || '');
      setWebhookUrl(response.webhookUrl || '');
      
      // Don't load API key/secret for security (they're encrypted on server)
      // User needs to re-enter if they want to update
    } catch (error: any) {
      // Config doesn't exist yet (404) - that's okay
      if (error.status !== 404) {
        console.error('Error loading WhatsApp config:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!apiKey || !phoneNumberId) {
      await showAlert('Please enter API Key and Phone Number ID first');
      return;
    }

    try {
      setTesting(true);
      // Save config temporarily to test
      await apiClient.post('/whatsapp/config', {
        apiKey,
        apiSecret: apiSecret || undefined,
        phoneNumberId,
        businessAccountId: businessAccountId || undefined,
        verifyToken: verifyToken || generateVerifyToken(),
        webhookUrl: webhookUrl || undefined,
      });

      // Test connection
      await apiClient.post('/whatsapp/test-connection');
      
      showToast('Connection successful!', 'success');
    } catch (error: any) {
      console.error('Connection test failed:', error);
      await showAlert(error.message || 'Connection test failed. Please check your credentials.');
    } finally {
      setTesting(false);
    }
  };

  const generateVerifyToken = (): string => {
    // Generate a random token for webhook verification
    return `whatsapp_verify_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  };

  const handleSave = async () => {
    if (!apiKey || !phoneNumberId || !verifyToken) {
      await showAlert('API Key, Phone Number ID, and Verify Token are required');
      return;
    }

    try {
      setLoading(true);
      await apiClient.post('/whatsapp/config', {
        apiKey,
        apiSecret: apiSecret || undefined,
        phoneNumberId,
        businessAccountId: businessAccountId || undefined,
        verifyToken,
        webhookUrl: webhookUrl || undefined,
      });

      showToast('WhatsApp configuration saved successfully!', 'success');
      await loadConfig();
      if (onClose) {
        onClose();
      }
    } catch (error: any) {
      console.error('Error saving WhatsApp config:', error);
      await showAlert(error.message || 'Failed to save WhatsApp configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await showConfirm(
      'Are you sure you want to disconnect WhatsApp API? This will remove all configuration and you will need to set it up again.',
      { title: 'Disconnect WhatsApp API' }
    );

    if (!confirmed) return;

    try {
      setLoading(true);
      await apiClient.delete('/whatsapp/config');
      showToast('WhatsApp configuration deleted', 'success');
      
      // Reset form
      setConfig(null);
      setApiKey('');
      setApiSecret('');
      setPhoneNumberId('');
      setBusinessAccountId('');
      setVerifyToken('');
      setWebhookUrl('');
      
      if (onClose) {
        onClose();
      }
    } catch (error: any) {
      console.error('Error deleting WhatsApp config:', error);
      await showAlert(error.message || 'Failed to delete WhatsApp configuration');
    } finally {
      setLoading(false);
    }
  };

  // Generate verify token on mount if not set
  useEffect(() => {
    if (!verifyToken) {
      setVerifyToken(generateVerifyToken());
    }
  }, []);

  if (loading && !config) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="text-slate-500">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="text-green-600 mt-0.5">{ICONS.whatsapp}</div>
          <div className="flex-1">
            <h3 className="font-semibold text-green-900 mb-1">WhatsApp Business API Integration</h3>
            <p className="text-sm text-green-700">
              Connect your Meta WhatsApp Business API account to send and receive messages directly from the application.
              {config && <span className="block mt-2 text-green-600 font-medium">✓ Configuration is active</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Input
            label="Access Token (API Key)"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your WhatsApp Business API access token"
            required
            helperText="Get this from your Meta App Dashboard under WhatsApp > API Setup"
          />
        </div>

        <div>
          <Input
            label="API Secret (Optional)"
            type="password"
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
            placeholder="Enter API secret if required"
            helperText="Optional: Only required if your API provider needs it"
          />
        </div>

        <div>
          <Input
            label="Phone Number ID"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="Enter your WhatsApp Business Phone Number ID"
            required
            helperText="Find this in your Meta App Dashboard under WhatsApp > API Setup"
          />
        </div>

        <div>
          <Input
            label="Business Account ID (Optional)"
            value={businessAccountId}
            onChange={(e) => setBusinessAccountId(e.target.value)}
            placeholder="Enter Business Account ID if required"
            helperText="Optional: Only needed for some configurations"
          />
        </div>

        <div>
          <Input
            label="Webhook Verify Token"
            value={verifyToken}
            onChange={(e) => setVerifyToken(e.target.value)}
            placeholder="Enter a random token for webhook verification"
            required
            helperText="Use this token when configuring webhook URL in Meta App Dashboard. Keep it secure."
          />
          <button
            type="button"
            onClick={() => setVerifyToken(generateVerifyToken())}
            className="mt-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Generate New Token
          </button>
        </div>

        <div>
          <Input
            label="Webhook URL"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://your-domain.com/api/whatsapp/webhook"
            helperText="The public URL where Meta will send webhook events. Configure this in Meta App Dashboard."
          />
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">Setup Instructions</h4>
        <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
          <li>Get your API credentials from Meta App Dashboard</li>
          <li>Enter your Access Token and Phone Number ID above</li>
          <li>Copy the Webhook Verify Token and use it in Meta Dashboard</li>
          <li>Set the Webhook URL in Meta Dashboard to: <code className="bg-blue-100 px-1 rounded">{webhookUrl || 'https://your-domain.com/api/whatsapp/webhook'}</code></li>
          <li>Click "Test Connection" to verify your credentials</li>
          <li>Click "Save Configuration" when ready</li>
        </ol>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-4 border-t">
        <div>
          {config && (
            <Button
              type="button"
              variant="danger"
              onClick={handleDelete}
              disabled={loading || testing}
              className="w-full sm:w-auto"
            >
              Disconnect
            </Button>
          )}
        </div>
        <div className="flex flex-col sm:flex-row justify-end gap-2 w-full sm:w-auto">
          <Button
            type="button"
            variant="secondary"
            onClick={handleTestConnection}
            disabled={loading || testing || !apiKey || !phoneNumberId}
            className="w-full sm:w-auto"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={loading || testing || !apiKey || !phoneNumberId || !verifyToken}
            className="w-full sm:w-auto"
          >
            {loading ? 'Saving...' : config ? 'Update Configuration' : 'Save Configuration'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppConfigForm;
