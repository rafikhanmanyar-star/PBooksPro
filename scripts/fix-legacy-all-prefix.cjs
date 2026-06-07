'use strict';
const fs = require('fs');
const path = require('path');

const FIXES = [
  { file: 'components/reports/AgreementExpiryReport.tsx', key: 'buildings', legacy: 'allBuildings' },
  { file: 'components/reports/ServiceChargesDeductionReport.tsx', key: 'buildings', legacy: 'allBuildings' },
  { file: 'components/reports/UnitStatusReport.tsx', key: 'buildings', legacy: 'allBuildings' },
  { file: 'components/rentalAgreements/RentalAgreementForm.tsx', key: 'buildings', legacy: 'allBuildings' },
  { file: 'components/payouts/OwnerPayoutsPage.tsx', key: 'buildings', legacy: 'allBuildings' },
  { file: 'components/vendors/VendorDirectoryPage.tsx', key: 'vendors', legacy: 'allVendors' },
  { file: 'components/vendors/VendorQuotations.tsx', key: 'quotations', legacy: 'allQuotations' },
  { file: 'components/vendors/VendorQuotationsTable.tsx', key: 'quotations', legacy: 'allQuotations' },
  { file: 'components/vendors/AllQuotationsTable.tsx', key: 'quotations', legacy: 'allQuotations' },
  { file: 'components/reports/VendorComparisonReport.tsx', key: 'vendors', legacy: 'allVendors', extraLegacy: ['allQuotations'] },
  { file: 'components/projectManagement/SalesReturnsPage.tsx', key: 'salesReturns', legacy: 'allSalesReturns' },
  { file: 'components/marketing/MarketingPage.tsx', key: 'units', legacy: 'allUnits', extraLegacy: ['allCurrentUser'] },
  { file: 'components/projectManagement/ProjectAgreementsPage.tsx', key: 'units', legacy: 'allUnits' },
];

const root = path.join(__dirname, '..');

for (const fix of FIXES) {
  const fp = path.join(root, fix.file);
  if (!fs.existsSync(fp)) continue;
  let c = fs.readFileSync(fp, 'utf8');
  const alias = `app${fix.key.charAt(0).toUpperCase()}${fix.key.slice(1)}`;
  c = c.replace(new RegExp(`\\b${fix.key}\\b(?=\\s*[,}])`, ''), `${fix.key}: ${alias}`);
  c = c.replace(new RegExp(`\\b${fix.legacy}\\b`, 'g'), alias);
  if (fix.extraLegacy) {
    for (const leg of fix.extraLegacy) {
      const extraKey = leg.replace(/^all/, '').replace(/^./, (x) => x.toLowerCase());
      const extraAlias = `app${extraKey.charAt(0).toUpperCase()}${extraKey.slice(1)}`;
      c = c.replace(new RegExp(`\\b${extraKey}\\b(?=\\s*[,}])`, ''), `${extraKey}: ${extraAlias}`);
      c = c.replace(new RegExp(`\\b${leg}\\b`, 'g'), extraAlias);
    }
  }
  fs.writeFileSync(fp, c, 'utf8');
  console.log('fixed', fix.file);
}
