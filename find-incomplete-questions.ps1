$path = Join-Path $PSScriptRoot 'web\questions.json'
$json = Get-Content -Raw -LiteralPath $path | ConvertFrom-Json

$results = foreach ($q in $json.questions) {
    $text = [string]$q.questionText
    $matches = [regex]::Matches($text, '\(([A-D])\)')
    $present = @($matches | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)

    if ($present.Count -lt 4) {
        [pscustomobject]@{
            id          = $q.id
            sourceOrder = $q.sourceOrder
            answer      = $q.answer
            optionCount = $present.Count
            optionsSeen = ($present -join ',')
            questionText = $text
        }
    }
}

$results | Sort-Object sourceOrder | Format-Table -AutoSize
""
"Total incomplete questions: $($results.Count)"
