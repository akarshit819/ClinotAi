$headers = @{
    "Content-Type" = "application/json"
    "X-Hub-Signature-256" = "sha256=test"
}
$body = @{
    object = "whatsapp_business_account"
    entry = @(@{
        id = "123456789"
        changes = @(@{
            value = @{
                messaging_product = "whatsapp"
                metadata = @{
                    display_phone_number = "15551234567"
                    phone_number_id = "1225389950661885"
                }
                contacts = @(@{
                    profile = @{name = "Test Patient"}
                    wa_id = "15551234567"
                })
                messages = @(@{
                    from = "15551234567"
                    id = "wamid.test123"
                    timestamp = "1724400000"
                    text = @{body = "I want to book an appointment"}
                    type = "text"
                })
            }
            field = "messages"
        })
    }
} | ConvertTo-Json -Depth 10

$response = Invoke-RestMethod -Uri "https://clinot-production.up.railway.app/api/webhooks/whatsapp" -Method Post -Headers $headers -Body $body -ContentType "application/json"
$response | ConvertTo-Json -Depth 5