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
  documentStoragePath?: string | undefined;
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
   * Load settings from cloud DB, with fallback to local DB
   */
  async loadSettings(): Promise<SettingsToSync> {
    const settings: SettingsToSync = {};

    // Try to load from cloud first if authenticated
    if (this.isCloudAvailable()) {
      try {
        console.log('📡 Loading settings from cloud database...');
        const cloudSettings = await this.cloudRepo.findAll();
        
        // Map cloud settings to our settings object
        if (cloudSettings) {
          Object.keys(cloudSettings).forEach(key => {
            try {
              const value = typeof cloudSettings[key] === 'string' 
                ? JSON.parse(cloudSettings[key]) 
                : cloudSettings[key];
              
              // Map keys to settings object
              switch (key) {
                case 'showSystemTransactions':
                case 'enableColorCoding':
                case 'enableBeepOnSave':
                case 'enableDatePreservation':
                case 'defaultProjectId':
                case 'documentStoragePath':
                case 'dashboardConfig':
                case 'printSettings':
                case 'whatsAppTemplates':
                case 'agreementSettings':
                case 'projectAgreementSettings':
                case 'rentalInvoiceSettings':
                case 'projectInvoiceSettings':
                case 'installmentPlans':
                case 'invoiceHtmlTemplate':
                case 'pmCostPercentage':
                case 'lastServiceChargeRun':
                  (settings as any)[key] = value;
                  break;
              }
            } catch (e) {
              console.warn(`⚠️ Failed to parse setting ${key}:`, e);
            }
          });
          
          console.log('✅ Loaded settings from cloud database');
          
          // Also save to local DB for offline access
          this.saveSettingsToLocal(settings);
          
          return settings;
        }
      } catch (error) {
        console.warn('⚠️ Failed to load settings from cloud, falling back to local:', error);
      }
    }

    // Fallback to local DB
    console.log('💾 Loading settings from local database...');
    const localSettings = this.localRepo.loadAllSettings();
    
    // Map local settings to our settings object
    Object.keys(localSettings).forEach(key => {
      switch (key) {
        case 'showSystemTransactions':
        case 'enableColorCoding':
        case 'enableBeepOnSave':
        case 'enableDatePreservation':
        case 'defaultProjectId':
        case 'documentStoragePath':
        case 'dashboardConfig':
        case 'printSettings':
        case 'whatsAppTemplates':
        case 'agreementSettings':
        case 'projectAgreementSettings':
        case 'rentalInvoiceSettings':
        case 'projectInvoiceSettings':
        case 'installmentPlans':
        case 'invoiceHtmlTemplate':
        case 'pmCostPercentage':
        case 'lastServiceChargeRun':
          (settings as any)[key] = localSettings[key];
          break;
      }
    });
    
    console.log('✅ Loaded settings from local database');
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

// Lazy singleton instance - avoids TDZ errors during module initialization
let settingsSyncServiceInstance: SettingsSyncService | null = null;

export const settingsSyncService = {
    get instance(): SettingsSyncService {
        if (!settingsSyncServiceInstance) {
            settingsSyncServiceInstance = new SettingsSyncService();
        }
        return settingsSyncServiceInstance;
    },
    async loadSettings(): Promise<SettingsToSync> {
        return this.instance.loadSettings();
    },
    async saveSettings(settings: Partial<SettingsToSync>): Promise<void> {
        return this.instance.saveSettings(settings);
    },
    async syncToCloud(settings: Partial<SettingsToSync>): Promise<void> {
        return this.instance.syncToCloud(settings);
    },
    async syncFromCloud(): Promise<SettingsToSync> {
        return this.instance.syncFromCloud();
    }
};
