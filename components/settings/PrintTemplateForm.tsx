
import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { PrintSettings } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import { ICONS } from '../../constants';
import { useNotification } from '../../context/NotificationContext';

const PrintTemplateForm: React.FC = () => {
    const { state, dispatch } = useAppContext();
    const { showToast, showConfirm } = useNotification();
    const [settings, setSettings] = useState<PrintSettings>(state.printSettings);
    const [invoiceHtml, setInvoiceHtml] = useState(state.invoiceHtmlTemplate || '');
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (state.invoiceHtmlTemplate) {
            setInvoiceHtml(state.invoiceHtmlTemplate);
        }
    }, [state.invoiceHtmlTemplate]);

    const handleChange = (field: keyof PrintSettings, value: any) => {
        setSettings(prev => ({ ...prev, [field]: value }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                handleChange('logoUrl', reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = () => {
        dispatch({ type: 'UPDATE_PRINT_SETTINGS', payload: settings });
        dispatch({ type: 'UPDATE_INVOICE_TEMPLATE', payload: invoiceHtml });
        showToast('Print template settings saved!', 'success');
    };

    const handleResetInvoiceTemplate = async () => {
        if (await showConfirm('Reset invoice template to system default? This will discard your custom HTML.', { title: 'Reset Template', confirmLabel: 'Reset' })) {
             const defaultTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Invoice {invoiceNumber}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&family=Work+Sans:wght@400;500;600;700&display=swap');
        
        /* A4 Page Setup with Standard Margins */
        @page {
            size: A4;
            margin: 12.7mm;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Nunito', 'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
            color: #374151;
            line-height: 1.6;
            background: #ffffff;
            width: 100%;
            max-width: 100%;
            padding: 0;
            margin: 0;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            text-rendering: optimizeLegibility;
        }
        
        .print-container {
            width: 100%;
            max-width: 100%;
            margin: 0 auto;
            padding: 0;
        }
        
        /* Header Section */
        .header-section {
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e2e8f0;
        }
        
        .header-text {
            text-align: center;
            font-size: 11px;
            color: #64748b;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 15px;
            padding: 8px;
            background-color: #f8fafc;
            border-radius: 4px;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 30px;
        }
        
        .company-info {
            flex: 1;
        }
        
        .company-info h1 {
            margin: 0 0 8px 0;
            color: #4f46e5;
            font-size: 22px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .company-info p {
            margin: 3px 0;
            font-size: 13px;
            color: #64748b;
            white-space: pre-line;
            line-height: 1.5;
        }
        
        .logo-container {
            margin-bottom: 12px;
        }
        
        .logo-container img {
            max-height: 70px;
            width: auto;
            display: block;
        }
        
        .invoice-title {
            text-align: right;
            flex-shrink: 0;
        }
        
        .invoice-title h2 {
            margin: 0;
            font-size: 28px;
            color: #1e293b;
            font-weight: 800;
            letter-spacing: -0.5px;
            margin-bottom: 12px;
        }
        
        .invoice-meta {
            font-size: 13px;
        }
        
        .meta-row {
            display: flex;
            justify-content: flex-end;
            gap: 15px;
            margin-bottom: 5px;
        }
        
        .label {
            color: #64748b;
            font-weight: 600;
            min-width: 80px;
            text-align: right;
        }
        
        .value {
            font-weight: 500;
            color: #0f172a;
            min-width: 100px;
            text-align: left;
        }
        
        /* Bill To Section */
        .bill-to-section {
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
            gap: 30px;
        }
        
        .bill-to {
            flex: 1;
        }
        
        .bill-to h3 {
            font-size: 11px;
            text-transform: uppercase;
            color: #94a3b8;
            letter-spacing: 1px;
            margin-bottom: 10px;
            font-weight: 600;
        }
        
        .bill-to p {
            margin: 3px 0;
            font-weight: 500;
            color: #0f172a;
            font-size: 13px;
        }
        
        .client-name {
            font-size: 16px;
            font-weight: 700;
            margin-bottom: 6px !important;
            color: #1e293b;
        }
        
        /* Table Styles */
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
        }
        
        thead th {
            text-align: left;
            padding: 12px 14px;
            background-color: #f8fafc;
            color: #475569;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 2px solid #e2e8f0;
            font-weight: 600;
        }
        
        tbody td {
            padding: 14px;
            border-bottom: 1px solid #f1f5f9;
            font-size: 13px;
            color: #334155;
        }
        
        .amount-col {
            text-align: right;
            font-weight: 600;
            color: #0f172a;
            width: 140px;
        }
        
        /* Totals Section */
        .totals-section {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 30px;
        }
        
        .totals-table {
            width: 280px;
            border-collapse: collapse;
        }
        
        .totals-table td {
            padding: 8px 0;
            border-bottom: 1px solid #f1f5f9;
            font-size: 13px;
        }
        
        .totals-table .total-row td {
            border-top: 2px solid #0f172a;
            border-bottom: none;
            padding-top: 14px;
            padding-bottom: 4px;
            font-size: 15px;
            font-weight: 700;
            color: #0f172a;
        }
        
        .totals-table .label {
            color: #64748b;
            font-weight: 500;
        }
        
        .totals-table .value {
            text-align: right;
            font-weight: 600;
            color: #0f172a;
        }
        
        /* Footer Section */
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            text-align: center;
            font-size: 12px;
            color: #64748b;
        }
        
        .footer p {
            margin: 5px 0;
            line-height: 1.6;
        }
        
        .footer .footer-text {
            font-weight: 500;
            color: #475569;
        }
        
        .footer .printed-date {
            font-size: 11px;
            color: #94a3b8;
            margin-top: 8px;
        }
        
        /* Status Stamp */
        .status-stamp {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-15deg);
            border: 4px solid rgba(220, 38, 38, 0.15);
            color: rgba(220, 38, 38, 0.15);
            font-size: 72px;
            font-weight: 900;
            text-transform: uppercase;
            padding: 30px 50px;
            pointer-events: none;
            z-index: -1;
            font-family: 'Nunito', 'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        
        .status-paid {
            border-color: rgba(16, 185, 129, 0.15);
            color: rgba(16, 185, 129, 0.15);
        }
        
        /* Barcode font for invoices */
        .barcode {
            font-family: 'IDAutomationHC39M', 'Courier New', 'Courier', monospace;
            font-weight: normal;
            letter-spacing: 0.15em;
            font-size: 1.1em;
        }
        
        /* Print Specific Styles */
        @media print {
            @page {
                size: A4;
                margin: 12.7mm;
            }
            
            body {
                background: #ffffff;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            
            .print-container {
                width: 100%;
                max-width: 100%;
            }
            
            /* Ensure colors print */
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            
            /* Prevent page breaks inside important sections */
            .header-section,
            .bill-to-section,
            .totals-section {
                page-break-inside: avoid;
            }
            
            table {
                page-break-inside: auto;
            }
            
            tr {
                page-break-inside: avoid;
                page-break-after: auto;
            }
        }
    </style>
</head>
<body>
    <div class="print-container">
        {statusStamp}
        
        {headerTextSection}
        
        <div class="header-section">
            <div class="header">
                <div class="company-info">
                    <div class="logo-container">{logoImg}</div>
                    <h1>{companyName}</h1>
                    <p>{companyAddress}</p>
                    <p>{companyContact}</p>
                </div>
                <div class="invoice-title">
                    <h2>INVOICE</h2>
                    <div class="invoice-meta">
                        <div class="meta-row">
                            <span class="label">Invoice #</span>
                            <span class="value">{invoiceNumber}</span>
                        </div>
                        <div class="meta-row">
                            <span class="label">Date</span>
                            <span class="value">{issueDate}</span>
                        </div>
                        <div class="meta-row">
                            <span class="label">Due Date</span>
                            <span class="value">{dueDate}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="bill-to-section">
            <div class="bill-to">
                <h3>Bill To</h3>
                <p class="client-name">{contactName}</p>
                {contactPhoneSection}
                {contactAddressSection}
            </div>
            <div class="bill-to" style="text-align: right;">
                <h3>Property / Unit</h3>
                {contextNameSection}
                {contextSubSection}
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Description</th>
                    <th class="amount-col">Amount</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>
                        <strong>{invoiceType}</strong>
                        {descriptionSection}
                    </td>
                    <td class="amount-col">{amount}</td>
                </tr>
                {extraRows}
            </tbody>
        </table>

        <div class="totals-section">
            <table class="totals-table">
                <tr>
                    <td class="label">Subtotal</td>
                    <td class="value">{amount}</td>
                </tr>
                <tr>
                    <td class="label">Amount Paid</td>
                    <td class="value" style="color: #10b981;">{paidAmount}</td>
                </tr>
                <tr class="total-row">
                    <td>Balance Due</td>
                    <td class="value">{balanceDue}</td>
                </tr>
            </table>
        </div>

        <div class="footer">
            {footerTextSection}
            {printedDateSection}
        </div>
    </div>
</body>
</html>`;
             setInvoiceHtml(defaultTemplate);
             dispatch({ type: 'UPDATE_INVOICE_TEMPLATE', payload: defaultTemplate });
             showToast('Template reset to default.');
        }
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-slate-800">Company Details</h3>
                    <Input
                        label="Company Name"
                        value={settings.companyName}
                        onChange={e => handleChange('companyName', e.target.value)}
                        placeholder="Your Business Name"
                    />
                     <Textarea
                        label="Address"
                        value={settings.companyAddress}
                        onChange={e => handleChange('companyAddress', e.target.value)}
                        placeholder="123 Business St, City, Country"
                        rows={3}
                    />
                    <Input
                        label="Contact Information"
                        value={settings.companyContact}
                        onChange={e => handleChange('companyContact', e.target.value)}
                        placeholder="Phone, Email, Website"
                    />
                </div>

                <div className="space-y-4">
                     <h3 className="text-lg font-semibold text-slate-800">Logo & Branding</h3>
                     <div className="flex items-start gap-4">
                        <div className="flex-grow">
                            <label className="block text-sm font-medium text-slate-600 mb-1">Company Logo</label>
                            <div className="flex items-center gap-2">
                                <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} size="sm">
                                    Upload Logo
                                </Button>
                                {settings.logoUrl && (
                                    <Button type="button" variant="ghost" className="text-danger" onClick={() => handleChange('logoUrl', '')} size="sm">
                                        Remove
                                    </Button>
                                )}
                            </div>
                             <input 
                                type="file" 
                                ref={fileInputRef} 
                                onChange={handleFileChange} 
                                className="hidden" 
                                accept="image/*"
                            />
                            <div className="mt-2">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={settings.showLogo} 
                                        onChange={e => handleChange('showLogo', e.target.checked)}
                                        className="rounded text-accent focus:ring-accent"
                                    />
                                    <span className="text-sm text-slate-700">Show logo on reports</span>
                                </label>
                            </div>
                        </div>
                        {settings.logoUrl && (
                            <div className="border p-1 rounded bg-white shadow-sm">
                                <img src={settings.logoUrl} alt="Logo Preview" className="h-20 w-auto object-contain" />
                            </div>
                        )}
                     </div>
                </div>
            </div>
            
            <div className="space-y-4 border-t pt-4">
                 <h3 className="text-lg font-semibold text-slate-800">Header & Footer</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                        label="Custom Header Text (Optional)"
                        value={settings.headerText}
                        onChange={e => handleChange('headerText', e.target.value)}
                        placeholder="e.g., Confidential"
                    />
                    <Input
                        label="Custom Footer Text (Optional)"
                        value={settings.footerText}
                        onChange={e => handleChange('footerText', e.target.value)}
                        placeholder="e.g., Thank you for your business!"
                    />
                    <div className="md:col-span-2">
                         <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={settings.showDatePrinted} 
                                onChange={e => handleChange('showDatePrinted', e.target.checked)}
                                className="rounded text-accent focus:ring-accent"
                            />
                            <span className="text-sm text-slate-700">Show "Printed on [Date]" in footer</span>
                        </label>
                    </div>
                 </div>
            </div>
            
            <div className="space-y-4 border-t pt-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-slate-800">Invoice HTML Template</h3>
                    <Button variant="ghost" size="sm" onClick={handleResetInvoiceTemplate} className="text-rose-600 hover:bg-rose-50">Reset to Default</Button>
                </div>
                <p className="text-sm text-slate-500">
                    Customize the HTML structure used when printing invoices. 
                    Supported placeholders: 
                    <code className="bg-slate-100 px-1 rounded text-xs">{`{companyName}`}</code>, 
                    <code className="bg-slate-100 px-1 rounded text-xs">{`{companyAddress}`}</code>, 
                    <code className="bg-slate-100 px-1 rounded text-xs">{`{invoiceNumber}`}</code>, 
                    <code className="bg-slate-100 px-1 rounded text-xs">{`{contactName}`}</code>, 
                    <code className="bg-slate-100 px-1 rounded text-xs">{`{amount}`}</code>, 
                    <code className="bg-slate-100 px-1 rounded text-xs">{`{logoImg}`}</code>, etc.
                </p>
                <Textarea 
                    label="" 
                    value={invoiceHtml} 
                    onChange={(e) => setInvoiceHtml(e.target.value)}
                    rows={15}
                    className="font-mono text-xs"
                    placeholder="<html>...</html>"
                />
            </div>

            <div className="flex justify-end pt-4 border-t">
                <Button onClick={handleSave}>Save Settings</Button>
            </div>
        </div>
    );
};

export default PrintTemplateForm;
