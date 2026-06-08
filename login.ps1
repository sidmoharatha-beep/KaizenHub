$body = @{"email"="sidmoharatha@gmail.com";"password"="OORJA@2026"} | ConvertTo-Json -Compress
$wr = [System.Net.WebRequest]::Create("https://2bedc2bc.kaizenhub.pages.dev/api/auth")
$wr.Method = "POST"
$wr.ContentType = "application/json"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
$wr.ContentLength = $bytes.Length
$rs = $wr.GetRequestStream(); $rs.Write($bytes,0,$bytes.Length); $rs.Close()
try {
    $resp = $wr.GetResponse()
    $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $content = $sr.ReadToEnd(); $sr.Close()
    Write-Host ("LOGIN:" + $content)
} catch [System.Net.WebException] {
    $err = $_.Exception.Response
    $sr = New-Object System.IO.StreamReader($err.GetResponseStream())
    Write-Host ("LOGIN_ERR:" + $sr.ReadToEnd())
    $sr.Close()
}