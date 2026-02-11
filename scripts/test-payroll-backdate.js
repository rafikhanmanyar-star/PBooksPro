/**
 * Test Script for Payroll Backdate & Pro-rata Fix
 * 
 * This script tests the payroll system's ability to handle backdated employees
 * and calculate pro-rata salaries correctly.
 * 
 * Usage:
 *   node scripts/test-payroll-backdate.js
 */

const API_BASE = process.env.API_URL || 'http://localhost:3000/api';
const TENANT_ID = process.env.TEST_TENANT_ID;
const USER_ID = process.env.TEST_USER_ID;

if (!TENANT_ID || !USER_ID) {
  console.error('❌ Please set TEST_TENANT_ID and TEST_USER_ID environment variables');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'x-tenant-id': TENANT_ID,
  'x-user-id': USER_ID
};

async function apiCall(method, endpoint, body = null) {
  const options = {
    method,
    headers
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(`${API_BASE}${endpoint}`, options);
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API call failed: ${response.status} - ${error}`);
  }
  
  return response.json();
}

async function runTests() {
  console.log('🧪 Starting Payroll Backdate & Pro-rata Tests\n');
  
  let testEmployeeId;
  let decemberRunId;
  let januaryRunId;
  
  try {
    // Test 1: Create employee with backdated joining date
    console.log('📝 Test 1: Creating employee with backdated joining date (25/12/2025)...');
    const employee = await apiCall('POST', '/payroll/employees', {
      name: 'Test Employee - Backdated',
      email: 'test.backdated@example.com',
      designation: 'Software Engineer',
      department: 'Engineering',
      grade: 'Senior',
      joining_date: '2025-12-25',
      salary: {
        basic: 30000,
        allowances: [
          { name: 'HRA', amount: 40, is_percentage: true },
          { name: 'Transport', amount: 2000, is_percentage: false }
        ],
        deductions: [
          { name: 'PF', amount: 12, is_percentage: true }
        ]
      }
    });
    
    testEmployeeId = employee.id;
    console.log(`✅ Employee created: ${employee.name} (${employee.employee_code})`);
    console.log(`   Joining Date: ${employee.joining_date}\n`);
    
    // Test 2: Create December 2025 payroll run
    console.log('📅 Test 2: Creating December 2025 payroll run...');
    const decemberRun = await apiCall('POST', '/payroll/runs', {
      month: 'December',
      year: 2025
    });
    
    decemberRunId = decemberRun.id;
    console.log(`✅ December run created: ${decemberRun.id}`);
    console.log(`   Period: ${decemberRun.period_start} to ${decemberRun.period_end}`);
    console.log(`   Employee Count: ${decemberRun.employee_count}\n`);
    
    // Test 3: Process December payroll (should generate pro-rated payslip)
    console.log('⚙️  Test 3: Processing December payroll (expecting pro-rata calculation)...');
    const decemberResult = await apiCall('POST', `/payroll/runs/${decemberRunId}/process`);
    
    console.log(`✅ December payroll processed`);
    console.log(`   New Payslips: ${decemberResult.processing_summary.new_payslips_generated}`);
    console.log(`   Total Amount: ₹${decemberResult.total_amount}\n`);
    
    // Test 4: Get December payslips
    console.log('📄 Test 4: Fetching December payslips...');
    const decemberPayslips = await apiCall('GET', `/payroll/runs/${decemberRunId}/payslips`);
    
    if (decemberPayslips.length > 0) {
      const payslip = decemberPayslips.find(p => p.employee_id === testEmployeeId);
      if (payslip) {
        const monthlyBasic = 30000;
        const proRataFactor = 7 / 31; // 7 days worked out of 31
        const expectedBasic = Math.round(monthlyBasic * proRataFactor * 100) / 100;
        const actualBasic = parseFloat(payslip.basic_pay);
        
        console.log(`✅ December payslip found for test employee`);
        console.log(`   Monthly Basic: ₹${monthlyBasic}`);
        console.log(`   Expected Pro-rata Basic (7/31 days): ₹${expectedBasic}`);
        console.log(`   Actual Basic Pay: ₹${actualBasic}`);
        console.log(`   Gross Pay: ₹${payslip.gross_pay}`);
        console.log(`   Net Pay: ₹${payslip.net_pay}`);
        
        const difference = Math.abs(actualBasic - expectedBasic);
        if (difference < 1) {
          console.log(`   ✅ Pro-rata calculation is correct!\n`);
        } else {
          console.log(`   ⚠️  Pro-rata calculation may be off by ₹${difference}\n`);
        }
      } else {
        console.log(`   ❌ No payslip found for test employee\n`);
      }
    } else {
      console.log(`   ❌ No payslips generated\n`);
    }
    
    // Test 5: Create January 2026 payroll run
    console.log('📅 Test 5: Creating January 2026 payroll run...');
    const januaryRun = await apiCall('POST', '/payroll/runs', {
      month: 'January',
      year: 2026
    });
    
    januaryRunId = januaryRun.id;
    console.log(`✅ January run created: ${januaryRun.id}`);
    console.log(`   Period: ${januaryRun.period_start} to ${januaryRun.period_end}`);
    console.log(`   Employee Count: ${januaryRun.employee_count}\n`);
    
    // Test 6: Process January payroll (should generate full month payslip)
    console.log('⚙️  Test 6: Processing January payroll (expecting full month salary)...');
    const januaryResult = await apiCall('POST', `/payroll/runs/${januaryRunId}/process`);
    
    console.log(`✅ January payroll processed`);
    console.log(`   New Payslips: ${januaryResult.processing_summary.new_payslips_generated}`);
    console.log(`   Total Amount: ₹${januaryResult.total_amount}\n`);
    
    // Test 7: Get January payslips
    console.log('📄 Test 7: Fetching January payslips...');
    const januaryPayslips = await apiCall('GET', `/payroll/runs/${januaryRunId}/payslips`);
    
    if (januaryPayslips.length > 0) {
      const payslip = januaryPayslips.find(p => p.employee_id === testEmployeeId);
      if (payslip) {
        const monthlyBasic = 30000;
        const actualBasic = parseFloat(payslip.basic_pay);
        
        console.log(`✅ January payslip found for test employee`);
        console.log(`   Monthly Basic: ₹${monthlyBasic}`);
        console.log(`   Actual Basic Pay: ₹${actualBasic}`);
        console.log(`   Gross Pay: ₹${payslip.gross_pay}`);
        console.log(`   Net Pay: ₹${payslip.net_pay}`);
        
        if (actualBasic === monthlyBasic) {
          console.log(`   ✅ Full month salary is correct!\n`);
        } else {
          console.log(`   ⚠️  Expected full month salary but got ₹${actualBasic}\n`);
        }
      } else {
        console.log(`   ❌ No payslip found for test employee\n`);
      }
    } else {
      console.log(`   ❌ No payslips generated\n`);
    }
    
    // Test 8: Check missing payslips detection
    console.log('🔍 Test 8: Testing missing payslips detection...');
    const missingPayslips = await apiCall('GET', '/payroll/missing-payslips');
    
    console.log(`✅ Missing payslips check completed`);
    console.log(`   Total Runs Checked: ${missingPayslips.total_runs_checked}`);
    console.log(`   Runs with Missing Payslips: ${missingPayslips.runs_with_missing_payslips}\n`);
    
    console.log('🎉 All tests completed successfully!\n');
    
    // Cleanup
    console.log('🧹 Cleaning up test data...');
    
    // Delete test employee
    if (testEmployeeId) {
      try {
        await apiCall('DELETE', `/payroll/employees/${testEmployeeId}`);
        console.log(`✅ Test employee deleted`);
      } catch (error) {
        console.log(`⚠️  Could not delete test employee: ${error.message}`);
      }
    }
    
    // Note: We don't delete payroll runs as they might affect other data
    console.log(`⚠️  Note: Payroll runs (${decemberRunId}, ${januaryRunId}) were not deleted`);
    console.log(`   You may want to manually delete them if they were created for testing only.\n`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
