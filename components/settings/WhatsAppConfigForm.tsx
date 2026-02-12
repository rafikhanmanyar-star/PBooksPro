import React, { useState, useEffect } from 'react';
import { apiClient } from '../../services/api/client';
import { useNotification } from '../../context/NotificationContext';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { ICONS } from '../../constants';
import { devLogger } from '../../utils/devLogger';

interface WhatsAppConfig {
  id?: string;
  tenantId?: string;
  phoneNumberId: string;
  businessAccountId?: string;
  webhookUrl?: string;
  verifyToken?: string;
  isActive: boolean;
  hasApiKey?: boolean; // Flag to indicate API key exists in DB
  createdAt?: string;
  updatedAt?: string;
  configured?: boolean;
}

interface WhatsAppConfigFormProps {
  onClose?: () => void;
}

const WhatsAppConfigForm: React.FC<WhatsAppConfigFormProps> = ({ onClose }) => {
  const { showToast, showAlert, showConfirm } = useNotification();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  
  // Form fields
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');

  // Test message fields
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [testMessage, setTestMessage] = useState('Hello! This is a test message from PBooksPro.');
  const [sendingTest, setSendingTest] = useState(false);
  
  // Received messages
  const [receivedMessages, setReceivedMessages] = useState<Array<{
    id: string;
    phoneNumber: string;
    messageText: string;
    timestamp: string;
    direction: 'incoming' | 'outgoing';
    status: string;
  }>>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Load existing config
  useEffect(() => {
    loadConfig();
  }, []);

  // Load received messages and start polling when connected
  useEffect(() => {
    if (connectionStatus === 'connected' && config) {
      loadReceivedMessages();
      // Poll for new messages every 5 seconds
      const interval = setInterval(() => {
        loadReceivedMessages();
      }, 5000);
      setPollingInterval(interval);
      
      return () => {
        if (interval) clearInterval(interval);
      };
    } else {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    }
  }, [connectionStatus, config]);

  const loadReceivedMessages = async () => {
    if (!config || connectionStatus !== 'connected') return;
    
    const loadId = `load_msgs_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    try {
      devLogger.log(`[WhatsApp Client] [${loadId}] Loading received messages`, {
        testPhoneNumber: testPhoneNumber || 'all',
        timestamp: new Date().toISOString(),
      });
      
      setLoadingMessages(true);
      
      // Get recent messages (last 20, both incoming and outgoing)
      const queryParams = new URLSearchParams();
      queryParams.append('limit', '20');
      queryParams.append('offset', '0');
      if (testPhoneNumber) {
        queryParams.append('phoneNumber', testPhoneNumber.replace(/\D/g, ''));
      }
      
      const messages = await apiClient.get<Array<{
        id: string;
        phone_number?: string;
        phoneNumber?: string;
        message_text?: string;
        messageText?: string;
        timestamp: string | Date;
        direction: 'incoming' | 'outgoing';
        status: string;
      }>>(`/whatsapp/messages?${queryParams.toString()}`);
      
      // Transform to match UI format
      const transformed = messages.map(m => ({
        id: m.id,
        phoneNumber: m.phoneNumber || m.phone_number || '',
        messageText: m.messageText || m.message_text || '',
        timestamp: typeof m.timestamp === 'string' ? m.timestamp : m.timestamp.toISOString(),
        direction: m.direction,
        status: m.status,
      }));
      
      // Sort by timestamp (newest first)
      const sorted = transformed.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      
      setReceivedMessages(sorted);
      
      devLogger.log(`[WhatsApp Client] [${loadId}] ✅ Messages loaded successfully`, {
        totalMessages: messages.length,
        displayedCount: sorted.length,
        testPhoneNumber: testPhoneNumber || 'all',
        hasIncoming: sorted.some(m => m.direction === 'incoming'),
        hasOutgoing: sorted.some(m => m.direction === 'outgoing'),
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error(`[WhatsApp Client] [${loadId}] ❌ Error loading messages`, {
        error: error.message,
        errorStatus: error.status,
        errorResponse: error.response?.data || null,
        timestamp: new Date().toISOString(),
      });
      // Don't show error to user, just log it
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadConfig = async () => {
    const loadId = `load_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();
    
    try {
      devLogger.log(`[WhatsApp Client] [${loadId}] Loading configuration`, {
        timestamp: new Date().toISOString(),
      });
      
      setLoading(true);
      const response = await apiClient.get<WhatsAppConfig>('/whatsapp/config');
      
      const duration = Date.now() - startTime;
      devLogger.log(`[WhatsApp Client] [${loadId}] Configuration loaded from server`, {
        configured: response.configured,
        hasApiKey: response.hasApiKey,
        phoneNumberId: response.phoneNumberId || null,
        businessAccountId: response.businessAccountId || null,
        hasWebhookUrl: !!response.webhookUrl,
        hasVerifyToken: !!response.verifyToken,
        isActive: response.isActive,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
      
      // Check if configuration exists
      if (response.configured === false) {
        // No config yet - this is normal for new tenants
        devLogger.log(`[WhatsApp Client] [${loadId}] No configuration found (new tenant)`, {
          timestamp: new Date().toISOString(),
        });
        setConfig(null);
        setConnectionStatus('unknown');
        return;
      }
      
      setConfig(response);
      setPhoneNumberId(response.phoneNumberId || '');
      setBusinessAccountId(response.businessAccountId || '');
      setWebhookUrl(response.webhookUrl || '');
      setVerifyToken(response.verifyToken || '');
      
      // If API key exists in DB, show placeholder
      if (response.hasApiKey) {
        setApiKey('••••••••••••••••'); // Placeholder to show key exists
        devLogger.log(`[WhatsApp Client] [${loadId}] API key exists in database (showing placeholder)`, {
          timestamp: new Date().toISOString(),
        });
      }
      
      // Auto-test connection status if config exists
      if (response.hasApiKey) {
        devLogger.log(`[WhatsApp Client] [${loadId}] Auto-testing connection status`, {
          timestamp: new Date().toISOString(),
        });
        testConnectionStatus();
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[WhatsApp Client] [${loadId}] Error loading configuration`, {
        error: error.message,
        errorStatus: error.status,
        errorResponse: error.response?.data || null,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
      setConnectionStatus('unknown');
    } finally {
      setLoading(false);
    }
  };

  const testConnectionStatus = async () => {
    const testId = `test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();
    
    try {
      devLogger.log(`[WhatsApp Client] [${testId}] Testing connection status`, {
        timestamp: new Date().toISOString(),
      });
      
      const response = await apiClient.post('/whatsapp/test-connection');
      
      const duration = Date.now() - startTime;
      devLogger.log(`[WhatsApp Client] [${testId}] Connection test successful`, {
        success: response.success,
        message: response.message,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
      
      setConnectionStatus('connected');
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[WhatsApp Client] [${testId}] Connection test failed`, {
        error: error.message,
        errorStatus: error.status,
        errorResponse: error.response?.data || null,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
      setConnectionStatus('disconnected');
    }
  };

  const handleTestConnection = async () => {
    const testId = `test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();
    
    // If API key is placeholder, test with existing config
    if (apiKey === '••••••••••••••••' && config?.hasApiKey) {
      try {
        devLogger.log(`[WhatsApp Client] [${testId}] Testing connection with stored API key`, {
          phoneNumberId,
          businessAccountId: businessAccountId || null,
          timestamp: new Date().toISOString(),
        });
        
        setTesting(true);
        const response = await apiClient.post('/whatsapp/test-connection');
        
        const duration = Date.now() - startTime;
        devLogger.log(`[WhatsApp Client] [${testId}] Connection test successful (stored key)`, {
          success: response.success,
          message: response.message,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString(),
        });
        
        setConnectionStatus('connected');
        showToast('✓ Connected to WhatsApp successfully!', 'success');
      } catch (error: any) {
        const duration = Date.now() - startTime;
        console.error(`[WhatsApp Client] [${testId}] Connection test failed (stored key)`, {
          error: error.message,
          errorStatus: error.status,
          errorResponse: error.response?.data || null,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString(),
        });
        setConnectionStatus('disconnected');
        await showAlert(error.message || 'Connection test failed. Please check your credentials.');
      } finally {
        setTesting(false);
      }
      return;
    }

    // Otherwise, need actual API key
    if (!apiKey || !phoneNumberId) {
      console.warn(`[WhatsApp Client] [${testId}] Missing required fields for connection test`, {
        hasApiKey: !!apiKey,
        hasPhoneNumberId: !!phoneNumberId,
        timestamp: new Date().toISOString(),
      });
      await showAlert('Please enter API Key and Phone Number ID first');
      return;
    }

    try {
      devLogger.log(`[WhatsApp Client] [${testId}] Testing connection with new credentials`, {
        hasApiKey: !!apiKey,
        apiKeyLength: apiKey.length,
        phoneNumberId,
        businessAccountId: businessAccountId || null,
        hasVerifyToken: !!verifyToken,
        timestamp: new Date().toISOString(),
      });
      
      setTesting(true);
      
      // Save config temporarily to test
      devLogger.log(`[WhatsApp Client] [${testId}] Saving configuration before test`, {
        timestamp: new Date().toISOString(),
      });
      
      await apiClient.post('/whatsapp/config', {
        apiKey,
        apiSecret: apiSecret || undefined,
        phoneNumberId,
        businessAccountId: businessAccountId || undefined,
        verifyToken: verifyToken || generateVerifyToken(),
        webhookUrl: webhookUrl || undefined,
      });

      devLogger.log(`[WhatsApp Client] [${testId}] Configuration saved, testing connection`, {
        timestamp: new Date().toISOString(),
      });

      // Test connection
      const response = await apiClient.post('/whatsapp/test-connection');
      
      const duration = Date.now() - startTime;
      devLogger.log(`[WhatsApp Client] [${testId}] Connection test successful (new credentials)`, {
        success: response.success,
        message: response.message,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
      
      setConnectionStatus('connected');
      showToast('✓ Connected to WhatsApp successfully!', 'success');
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[WhatsApp Client] [${testId}] Connection test failed (new credentials)`, {
        error: error.message,
        errorStatus: error.status,
        errorResponse: error.response?.data || null,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
      setConnectionStatus('disconnected');
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
    // If API key is placeholder, don't require it (keep existing key in DB)
    const isPlaceholder = apiKey === '••••••••••••••••';
    
    if (!isPlaceholder && !apiKey) {
      await showAlert('API Key is required');
      return;
    }
    
    if (!phoneNumberId || !verifyToken) {
      await showAlert('Phone Number ID and Verify Token are required');
      return;
    }

    try {
      setLoading(true);
      
      // Only send API key if it's been changed (not placeholder)
      const configData: any = {
        phoneNumberId,
        businessAccountId: businessAccountId || undefined,
        verifyToken,
        webhookUrl: webhookUrl || undefined,
      };
      
      if (!isPlaceholder) {
        configData.apiKey = apiKey;
        configData.apiSecret = apiSecret || undefined;
      }
      
      await apiClient.post('/whatsapp/config', configData);

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
      setConnectionStatus('unknown');
      
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

  const handleSendTestMessage = async () => {
    const sendId = `send_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();
    
    if (!testPhoneNumber || !testMessage) {
      console.warn(`[WhatsApp Client] [${sendId}] Missing required fields for test message`, {
        hasPhoneNumber: !!testPhoneNumber,
        hasMessage: !!testMessage,
        timestamp: new Date().toISOString(),
      });
      await showAlert('Please enter a phone number and message');
      return;
    }

    // Validate phone number format (should be digits only, no + or spaces)
    const cleanPhone = testPhoneNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      console.warn(`[WhatsApp Client] [${sendId}] Invalid phone number format`, {
        original: testPhoneNumber.substring(0, 5) + '***',
        cleaned: cleanPhone.length,
        timestamp: new Date().toISOString(),
      });
      await showAlert('Please enter a valid phone number (minimum 10 digits)');
      return;
    }

    try {
      devLogger.log(`[WhatsApp Client] [${sendId}] Sending test message`, {
        phoneNumber: cleanPhone.substring(0, 5) + '***',
        phoneNumberLength: cleanPhone.length,
        messageLength: testMessage.length,
        messagePreview: testMessage.substring(0, 50) + (testMessage.length > 50 ? '...' : ''),
        timestamp: new Date().toISOString(),
      });
      
      setSendingTest(true);
      
      const response = await apiClient.post('/whatsapp/send', {
        phoneNumber: cleanPhone,
        message: testMessage,
      });
      
      const duration = Date.now() - startTime;
      devLogger.log(`[WhatsApp Client] [${sendId}] Test message sent successfully`, {
        messageId: response.messageId || null,
        wamId: response.wamId || null,
        status: response.status || null,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
      
      showToast('✓ Test message sent successfully!', 'success');
      setTestPhoneNumber('');
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[WhatsApp Client] [${sendId}] Error sending test message`, {
        error: error.message,
        errorStatus: error.status,
        errorResponse: error.response?.data || null,
        phoneNumber: cleanPhone.substring(0, 5) + '***',
        messageLength: testMessage.length,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });
      await showAlert(error.message || 'Failed to send test message. Please check your configuration.');
    } finally {
      setSendingTest(false);
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
      <div className={`border rounded-lg p-4 ${
        connectionStatus === 'connected' 
          ? 'bg-green-50 border-green-200' 
          : connectionStatus === 'disconnected'
          ? 'bg-red-50 border-red-200'
          : 'bg-blue-50 border-blue-200'
      }`}>
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 ${
            connectionStatus === 'connected' 
              ? 'text-green-600' 
              : connectionStatus === 'disconnected'
              ? 'text-red-600'
              : 'text-blue-600'
          }`}>
            {ICONS.whatsapp}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className={`font-semibold ${
                connectionStatus === 'connected' 
                  ? 'text-green-900' 
                  : connectionStatus === 'disconnected'
                  ? 'text-red-900'
                  : 'text-blue-900'
              }`}>
                WhatsApp Business API Integration
              </h3>
              {connectionStatus === 'connected' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Connected
                </span>
              )}
              {connectionStatus === 'disconnected' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                  <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                  Disconnected
                </span>
              )}
            </div>
            <p className={`text-sm ${
              connectionStatus === 'connected' 
                ? 'text-green-700' 
                : connectionStatus === 'disconnected'
                ? 'text-red-700'
                : 'text-blue-700'
            }`}>
              {connectionStatus === 'connected' 
                ? '✓ Successfully connected to WhatsApp Business API. You can send and receive messages.'
                : connectionStatus === 'disconnected'
                ? '✗ Unable to connect to WhatsApp. Please check your credentials and try again.'
                : 'Connect your Meta WhatsApp Business API account to send and receive messages directly from the application.'
              }
              {config && !connectionStatus && (
                <span className="block mt-2 text-blue-600 font-medium">Configuration is active</span>
              )}
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
            placeholder={config?.hasApiKey ? "API key stored securely (leave blank to keep current)" : "Enter your WhatsApp Business API access token"}
            required={!config?.hasApiKey}
            helperText={
              config?.hasApiKey 
                ? "✓ API key is stored securely. Enter a new key only if you want to update it." 
                : "Get this from your Meta App Dashboard under WhatsApp > API Setup"
            }
            autoComplete="off"
            data-form-type="other"
          />
          {config?.hasApiKey && apiKey === '••••••••••••••••' && (
            <p className="mt-1 text-xs text-green-600 font-medium">✓ Using stored API key</p>
          )}
        </div>

        <div>
          <Input
            label="API Secret (Optional)"
            type="password"
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
            placeholder="Enter API secret if required"
            helperText="Optional: Only required if your API provider needs it"
            autoComplete="off"
            data-form-type="other"
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
            placeholder="https://your-api-server.com/api/whatsapp/webhook"
            helperText="Your public API server URL (staging or production) + /api/whatsapp/webhook. For localhost development, use ngrok (see instructions below). Example: https://pbookspro-api-staging.onrender.com/api/whatsapp/webhook"
          />
        </div>
      </div>

      {/* Localhost Development Notice */}
      {(webhookUrl.includes('localhost') || webhookUrl.includes('127.0.0.1') || webhookUrl === '') && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h4 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            Localhost Development Setup Required
          </h4>
          <p className="text-sm text-amber-800 mb-3">
            Meta requires a publicly accessible HTTPS URL for webhooks. For localhost development, you need to use <strong>ngrok</strong> to create a secure tunnel.
          </p>
          <div className="bg-white rounded p-3 border border-amber-200">
            <p className="text-sm font-semibold text-amber-900 mb-2">Quick Setup:</p>
            <ol className="list-decimal list-inside space-y-1 text-sm text-amber-800">
              <li>Install ngrok: <code className="bg-amber-100 px-1 rounded">npm install -g ngrok</code> or download from <a href="https://ngrok.com/download" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">ngrok.com</a></li>
              <li>Start your API server on localhost (e.g., port 3000)</li>
              <li>Run: <code className="bg-amber-100 px-1 rounded">ngrok http 3000</code></li>
              <li>Copy the HTTPS URL from ngrok (e.g., <code className="bg-amber-100 px-1 rounded">https://abc123.ngrok-free.app</code>)</li>
              <li>Enter webhook URL: <code className="bg-amber-100 px-1 rounded">https://abc123.ngrok-free.app/api/whatsapp/webhook</code></li>
            </ol>
            <p className="text-xs text-amber-700 mt-2">
              📖 <strong>Note:</strong> Free ngrok URLs change every restart. For production, deploy to a hosting service (Render, Heroku, etc.) and use the production URL.
            </p>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">Setup Instructions</h4>
        <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
          <li>Get your API credentials from Meta App Dashboard</li>
          <li>Enter your Access Token and Phone Number ID above</li>
          <li>Enter your Webhook URL:
            <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
              <li><strong>Production/Staging:</strong> Your API server URL + /api/whatsapp/webhook (e.g., https://pbookspro-api-staging.onrender.com/api/whatsapp/webhook)</li>
              <li><strong>Localhost:</strong> Use ngrok URL + /api/whatsapp/webhook (e.g., https://abc123.ngrok-free.app/api/whatsapp/webhook)</li>
            </ul>
          </li>
          <li>Copy the Webhook Verify Token and use it in Meta Dashboard</li>
          <li>In Meta App Dashboard, set the Webhook URL and Verify Token from above</li>
          <li>Click "Test Connection" to verify your credentials</li>
          <li>Click "Save Configuration" when ready</li>
        </ol>
      </div>

      {/* Test Message Section */}
      {config && connectionStatus === 'connected' && (
        <>
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <h4 className="font-semibold text-indigo-900 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Send Test Message
            </h4>
            <p className="text-sm text-indigo-700 mb-4">
              Send a test message to verify your WhatsApp integration is working correctly.
            </p>
            <div className="space-y-3">
              <div>
                <Input
                  label="Phone Number"
                  value={testPhoneNumber}
                  onChange={(e) => {
                    setTestPhoneNumber(e.target.value);
                    // Reload messages when phone number changes
                    setTimeout(() => loadReceivedMessages(), 500);
                  }}
                  placeholder="e.g., 1234567890 (no + or spaces)"
                  helperText="Enter phone number in international format without + sign (e.g., 1234567890 for USA, 919876543210 for India)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Message
                </label>
                <textarea
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  placeholder="Enter your test message"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Note: For production, you may need approved message templates for initial messages to new contacts.
                </p>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="primary"
                  onClick={async () => {
                    await handleSendTestMessage();
                    // Reload messages after sending
                    setTimeout(() => loadReceivedMessages(), 1000);
                  }}
                  disabled={sendingTest || !testPhoneNumber || !testMessage}
                  className="w-full sm:w-auto"
                >
                  {sendingTest ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Sending...
                    </span>
                  ) : (
                    'Send Test Message'
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Received Messages Section */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-green-900 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Received Messages
                {loadingMessages && (
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
              </h4>
              <button
                onClick={loadReceivedMessages}
                className="text-xs text-green-700 hover:text-green-900 font-medium"
                disabled={loadingMessages}
              >
                Refresh
              </button>
            </div>
            <p className="text-sm text-green-700 mb-4">
              {testPhoneNumber 
                ? `Messages from ${testPhoneNumber.substring(0, 5)}*** (auto-refreshes every 5 seconds)`
                : 'Recent messages (auto-refreshes every 5 seconds)'}
            </p>
            
            {receivedMessages.length === 0 ? (
              <div className="text-center py-8 text-green-600">
                <p className="text-sm">No messages yet.</p>
                <p className="text-xs mt-1">Send a message or wait for incoming messages.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {receivedMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-3 rounded-lg border ${
                      msg.direction === 'incoming'
                        ? 'bg-white border-green-300 text-left'
                        : 'bg-indigo-50 border-indigo-300 text-right'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-medium ${
                            msg.direction === 'incoming' ? 'text-green-700' : 'text-indigo-700'
                          }`}>
                            {msg.direction === 'incoming' ? '📥 Received' : '📤 Sent'}
                          </span>
                          <span className="text-xs text-slate-500">
                            {msg.phoneNumber.substring(0, 5)}***
                          </span>
                          <span className="text-xs text-slate-400">
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className={`text-sm ${
                          msg.direction === 'incoming' ? 'text-slate-800' : 'text-indigo-800'
                        }`}>
                          {msg.messageText || '(Media message)'}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        msg.status === 'received' || msg.status === 'sent'
                          ? 'bg-green-100 text-green-700'
                          : msg.status === 'delivered'
                          ? 'bg-blue-100 text-blue-700'
                          : msg.status === 'read'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {msg.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {new Date(msg.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

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
            disabled={loading || testing || (!apiKey && !config?.hasApiKey) || !phoneNumberId}
            className="w-full sm:w-auto"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={loading || testing || (!apiKey && !config?.hasApiKey) || !phoneNumberId || !verifyToken}
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
