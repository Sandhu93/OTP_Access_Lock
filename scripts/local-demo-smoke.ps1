$ErrorActionPreference = 'Stop'

function Assert-Status {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [Parameter(Mandatory = $true)][int]$ExpectedStatus
    )

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -Method Get
        $actualStatus = [int]$response.StatusCode
    } catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
            $actualStatus = [int]$_.Exception.Response.StatusCode
        } else {
            throw "Request failed for $Uri : $($_.Exception.Message)"
        }
    }

    if ($actualStatus -ne $ExpectedStatus) {
        throw "Expected HTTP $ExpectedStatus from $Uri but received HTTP $actualStatus"
    }
    Write-Host "PASS $actualStatus $Uri"
}

Assert-Status -Uri 'http://localhost:8000/api/v1/healthz' -ExpectedStatus 200
Assert-Status -Uri 'http://localhost:8081/realms/access-lock/.well-known/openid-configuration' -ExpectedStatus 200
Assert-Status -Uri 'http://localhost:8000/api/v1/mobile/unlock-requests' -ExpectedStatus 401

Write-Host 'Local demo smoke check passed.'
