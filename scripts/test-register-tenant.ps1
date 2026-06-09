$body = @{
  companyName = 'RK Soft'
  email = 'rafi.uswati@yahoo.com'
  adminUsername = 'Rafi'
  adminPassword = 'Test1234'
  adminName = 'Rafi Ullah Khan'
  requestedTenantId = 'rksoft'
  legalAcceptances = @(
    @{ documentType = 'terms_of_service'; documentVersion = '2026-06-07' }
    @{ documentType = 'privacy_policy'; documentVersion = '2026-06-07' }
  )
} | ConvertTo-Json -Depth 5

try {
  $result = Invoke-RestMethod -Uri 'https://api.pbookspro.com/api/auth/register-tenant' -Method POST -ContentType 'application/json' -Body $body
  $result | ConvertTo-Json -Depth 5
} catch {
  Write-Host "Status:" $_.Exception.Response.StatusCode.value__
  $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
  Write-Host $reader.ReadToEnd()
}
