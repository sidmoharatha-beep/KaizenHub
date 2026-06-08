$token = "c9c9f95a-e850-4e03-bac9-e8115affc3a2"
$body = @{"employee_id"="TST555";"full_name"="Test 555";"email"="tst555@tvs-e.in";"password"="OORJA@2026";"role_name"="Operator";"designation"="Tester";"section"="QA"} | ConvertTo-Json -Compress
$wr = [System.Net.WebRequest]::Create("https://2bedc2bc.kaizenhub.pages.dev/api/users")
$wr.Method = "POST"
$wr.ContentType = "application/json"
$wr.Headers.Add("Authorization", "Bearer " + $token)
$bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
$wr.ContentLength = $bytes.Length
$rs = $wr.GetRequestStream(); $rs.Write($bytes,0,$bytes.Length); $rs.Close()
try {
    $resp = $wr.GetResponse()
    $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $content = $sr.ReadToEnd(); $sr.Close()
    Write-Host ("Status: " + $resp.StatusCode)
    Write-Host ("Body: " + $content)
} catch [System.Net.WebException] {
    $err = $_.Exception.Response
    $sr = New-Object System.IO.StreamReader($err.GetResponseStream())
    $bodyErr = $sr.ReadToEnd(); $sr.Close()
    Write-Host ("Status: " + [int]$err.StatusCode)
    Write-Host ("Body: " + $bodyErr)
}