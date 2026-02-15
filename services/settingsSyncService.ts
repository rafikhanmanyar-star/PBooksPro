/**
 * Settings Sync Service
 * Handles syncing user and organization settings between local and cloud databases
 */

import { AppSettingsApiRepository } from './api/repositories/appSettingsApi';
import { AppSettingsRepository } from './database/repositories/index';
import { isAuthenticatedSafe } from './api/client';

export interface SettingsToSync {
  // General settings (user-based)
  showSystemTransactions?: boolean;
  enableColorCoding?: boolean;
  enableBeepOnSave?: boolean;
  enableDatePreservation?: boolean;
  defaultProjectId?: string | undefined;
  dashboardConfig?: any;
  
  // Communication settings (organization-based)
  printSettings?: any;
  whatsAppTemplates?: any;
  
  // Other settings
  agreementSettings?: any;
  projectAgreementSettings?: any;
  rentalInvoiceSettings?: any;
  projectInvoiceSettings?: any;
  installmentPlans?: any[];
  invoiceHtmlTemplate?: string;
  pmCostPercentage?: number;
  lastServiceChargeRun?: string;
}

class SettingsSyncService {
  private cloudRepo: AppSettingsApiRepository;
  private localRepo: AppSettingsRepository;
  private isInitialized = false;

  constructor() {
    this.cloudRepo = new AppSettingsApiRepository();
    this.localRepo = new AppSettingsRepository();
  }

  /**
   * Check if cloud sync is available (user is authenticated)
   */
  private isCloudAvailable(): boolean {
    return isAuthenticatedSafe();
  }

  /**
   * Map raw cloud/local record to SettingsToSync (shared helper)
   */
  private mapToSettings(raw: Record<string, any>): SettingsToSync {
    const settings: SettingsToSync = {};
    const keys = [
      'showSystemTransactions', 'enableColorCoding', 'enableBeepOnSave', 'enableDatePreservation',
      'defaultProjectId', 'dashboardConfig', 'printSettings', 'whatsAppTemplates',
      'agreementSettings', 'projectAgreementSettings', 'rentalInvoiceSettings', 'projectInvoiceSettings',
      'installmentPlans', 'invoiceHtmlTemplate', 'pmCostPercentage', 'lastServiceChargeRun'
    ];
    keys.forEach(key => {
      if (raw[key] === undefined) return;
      try {
        (settings as any)[key] = typeof raw[key] === 'string' ? JSON.parse(raw[key]) : raw[key];
      } catch (e) {
        console.warn(`⚠️ Failed to parse setting ${key}:`, e);
      }
    });
    return settings;
  }

  /**
   * Load settings (offline-first): load from local DB immediately, then refresh from cloud in background
   */
  async loadSettings(): Promise<SettingsToSync> {
    // Step 1: Load from local first so UI can render immediately
    console.log('💾 Loading settings from local database...');
    const localSettings = this.localRepo.loadAllSettings();
    const settings = this.mapToSettings(localSettings);
    console.log('✅ Loaded settings from local database');

    // Step 2: Refresh from cloud in background; persist to local and notify if changed
    if (this.isCloudAvailable()) {
      (async () => {
        try {
          console.log('📡 Refreshing settings from cloud (background)...');
          const cloudSettings = await this.cloudRepo.findAll();
          if (cloudSettings && Object.keys(cloudSettings).length > 0) {
            const cloudMapped = this.mapToSettings(cloudSettings);
            this.saveSettingsToLocal(cloudMapped);
            console.log('✅ Settings refreshed from cloud and saved locally');
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('load-cloud-settings', { detail: cloudMapped }));
            }
          }
        } catch (error) {
          console.warn('⚠️ Failed to refresh settings from cloud (using local):', error);
        }
      })();
    }

    return settings;
  }

  /**
   * Save settings to local DB
   */
  private saveSettingsToLocal(settings: SettingsToSync): void {
    try {
      const settingsToSave: any = {};
      Object.keys(settings).forEach(key => {
        const value = (settings as any)[key];
        if (value !== undefined && value !== null) {
          settingsToSave[key] = value;
        }
      });
      this.localRepo.saveAllSettings(settingsToSave);
    } catch (error) {
      console.error('❌ Failed to save settings to local DB:', error);
    }
  }

  /**
   * Save a single setting to both cloud and local DB
   */
  async saveSetting(key: string, value: any): Promise<void> {
    // Try to save to local first for immediate availability
    try {
      this.localRepo.setSetting(key, value);
    } catch (localError) {
      console.warn(`⚠️ Failed to save setting ${key} locally (database may not be ready):`, localError);
    }

    // Try to save to cloud if available
    if (this.isCloudAvailable()) {
      try {
        await this.cloudRepo.setSetting(key, value);
        console.log(`✅ Saved setting ${key} to cloud database`);
      } catch (error) {
        console.warn(`⚠️ Failed to save setting ${key} to cloud, saved locally only:`, error);
      }
    }
  }

  /**
   * Save multiple settings to both cloud and local DB
   */
  async saveSettings(settings: SettingsToSync): Promise<void> {
    // Try to save to local first
    try {
      this.saveSettingsToLocal(settings);
    } catch (localError) {
      console.warn('⚠️ Failed to save settings locally (database may not be ready):', localError);
    }

    // Try to save to cloud if available
    if (this.isCloudAvailable()) {
      try {
        console.log('📡 Saving settings to cloud database...');
        const settingsToSave: any = {};
        Object.keys(settings).forEach(key => {
          const value = (settings as any)[key];
          if (value !== undefined && value !== null) {
            settingsToSave[key] = value;
          }
        });

        // Save each setting to cloud
        for (const [key, value] of Object.entries(settingsToSave)) {
          await this.cloudRepo.setSetting(key, value);
        }
        
        console.log('✅ Saved settings to cloud database');
      } catch (error) {
        console.warn('⚠️ Failed to save settings to cloud, saved locally only:', error);
      }
    }
  }

  /**
   * Sync settings from cloud to local (called on login)
   */
  async syncFromCloud(): Promise<SettingsToSync> {
    return this.loadSettings();
  }
}

// Export singleton instance
export const settingsSyncService = new SettingsSyncService();
