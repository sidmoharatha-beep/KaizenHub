$token = "7e6f979f-3d0c-4fb5-880c-7fd524274392"
$body = @{"employee_id"="WORKS555";"full_name"="Works Five";"email"="works555@tvs-e.in";"password"="OORJA@2026";"role_name"="Operator";"designation"="Tester";"section"="QA"} | ConvertTo-Json -Compress
$wr = [System.Net.WebRequest]::Create("https://5ca6a517.kaizenhub.pages.dev/api/users")
$wr.Method = "POST"
$wr.ContentType = "application/json"
$wr.Headers.Add("Authorization", "Bearer " + $token)
$bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
$wr.ContentLength = $bytes.Length
$rs = $wr.GetRequestStream(); $rs.Write($bytes,0,$bytes.Length); $rs.Close()
try {
    $resp = $wr.GetResponse()
    $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
    Write-Host ("Status: " + $resp.StatusCode)
    Write-Host ("Body: " + $sr.ReadToEnd())
    $sr.Close()
} catch [System.Net.WebException] {
    $err = $_.Exception.Response
    $sr = New-Object System.IO.StreamReader($err.GetResponseStream())
    $bodyErr = $sr.ReadToEnd(); $sr.Close()
    Write-Host ("Status: " + [int]$err.StatusCode)
    Write-Host ("Body: " + $bodyErr)
}