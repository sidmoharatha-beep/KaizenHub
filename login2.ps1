$wr = [System.Net.WebRequest]::Create("https://0d8d2935.kaizenhub.pages.dev/api/auth")
$wr.Method = "POST"
$wr.ContentType = "application/json"
$body = @{"email"="sidmoharatha@gmail.com";"password"="OORJA@2026"} | ConvertTo-Json -Compress
$bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
$wr.ContentLength = $bytes.Length
$rs = $wr.GetRequestStream(); $rs.Write($bytes,0,$bytes.Length); $rs.Close()
try {
    $resp = $wr.GetResponse()
    $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
    Write-Host ("LOGIN:" + $sr.ReadToEnd())
    $sr.Close()
} catch [System.Net.WebException] {
    $err = $_.Exception.Response
    $sr = New-Object System.IO.StreamReader($err.GetResponseStream())
    Write-Host ("LOGIN_ERR:" + $sr.ReadToEnd())
    $sr.Close()
}