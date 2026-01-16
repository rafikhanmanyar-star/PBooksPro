import { BaseAdapter, AdapterResult } from './baseAdapter';

export class QuickBooksAdapter extends BaseAdapter {
  canHandle(_file: File): boolean {
    return false;
  }

  async parse(_file: File): Promise<AdapterResult> {
    throw new Error('QuickBooks adapter is not implemented.');
  }

  getName(): string {
    return 'QuickBooks';
  }

  getDescription(): string {
    return 'QuickBooks file adapter (not implemented).';
  }

  getExampleFormat(): string {
    return 'QuickBooks export (not implemented).';
  }
}
