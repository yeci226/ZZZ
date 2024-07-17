# Edited version of starrailstation.com's method
# based on repo https://github.com/yeci226/HSR
Add-Type -AssemblyName System.Web
$ProgressPreference = 'SilentlyContinue'

# Find Player log
$logContent = Get-Content -Path "$([Environment]::GetFolderPath('ApplicationData'))\..\LocalLow\miHoYo\ZenlessZoneZero\Player.log"
# Find Game Folder
foreach ($line in $logContent) {
    if ($line -ne $null -and $line.StartsWith("[Subsystems] Discovering subsystems at path ")) {
        $gamePath = $line.replace("[Subsystems] Discovering subsystems at path ", "").replace("UnitySubsystems", "")
        break
    }
}

if ($gamePath -ne $null) {
	# Get Current Game Version
	$version = Get-ChildItem -Path "$gamePath/webCaches" -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    # Find Gacha Url
    Write-Output "Finding Gacha Url..."
    # Copy the target file. Therefore the script can be run while game is opened. refer issue #3
    Copy-Item -Path "$gamePath/webCaches/$version/Cache/Cache_Data/data_2" -Destination "$gamePath/webCaches/$version/Cache/Cache_Data/data_2_copy"
    $cacheDataLines = Get-Content -Path "$gamePath/webCaches/$version/Cache/Cache_Data/data_2_copy" -Raw -Encoding UTF8 -PipelineVariable cacheData |
    ForEach-Object {
        $_ -split '1/0/'
    }
    # remove the copy after read
    Remove-Item -Path "$gamePath/webCaches/$version/Cache/Cache_Data/data_2_copy"
    $foundUrl = $false

    foreach ($line in $cacheDataLines) {
		if ($line -match '^http.*getGachaLog') {
			$url = ($line -split "\0")[0]

			$response = Invoke-WebRequest -Uri $url -ContentType "application/json" -UseBasicParsing | ConvertFrom-Json

			if ($response.retcode -eq 0) {
				Write-Output $url
				Set-Clipboard -Value $url
				Write-Output "Warp History Url has been saved to clipboard."
				$foundUrl = $true
				break
			}
		}
	}

    if (-not $foundUrl) {
        Write-Output "Unable to find Gacha Url. Please open warp history in-game."
    }
	
} else {
    Write-Output "Unable to find Game Path. Please try re-opening the game."
}

# Remove variables from memory
$appData=$logPath=$logContent=$gamePath=$cacheData=$cacheDataLines=$null

Write-Output "End of script"