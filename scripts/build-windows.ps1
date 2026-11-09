param([switch]$SkipWebBuild)
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$buildRoot = Join-Path $project 'build'
$appRoot = Join-Path $buildRoot 'app'
$installerRoot = Join-Path $buildRoot 'installer'
New-Item -ItemType Directory -Force $buildRoot | Out-Null
if (-not $SkipWebBuild) {
  Push-Location $project
  try { npm run build; if ($LASTEXITCODE -ne 0) { throw 'Web build failed' } }
  finally { Pop-Location }
}
if (Test-Path -LiteralPath $appRoot) {
  $resolved = (Resolve-Path -LiteralPath $appRoot).Path
  if (-not $resolved.StartsWith($buildRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe app build path' }
  $runningNode = Join-Path $resolved 'runtime\node.exe'
  if (Test-Path -LiteralPath $runningNode) {
    try {
      $handle = [IO.File]::Open($runningNode, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
      $handle.Dispose()
    } catch { throw 'NeuroLens is still running from build/app. Close its background service before packaging.' }
  }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
New-Item -ItemType Directory -Force $appRoot,$installerRoot,(Join-Path $appRoot 'apps\web'),(Join-Path $appRoot 'runtime'),(Join-Path $appRoot 'scripts'),(Join-Path $appRoot 'engine'),(Join-Path $appRoot 'data'),(Join-Path $appRoot 'pic'),(Join-Path $appRoot 'models'),(Join-Path $appRoot 'test'),(Join-Path $appRoot 'outputs') | Out-Null
Copy-Item -LiteralPath (Join-Path $project 'apps\web\dist') -Destination (Join-Path $appRoot 'apps\web\dist') -Recurse -Force
Copy-Item -Path (Join-Path $project 'pic\*') -Destination (Join-Path $appRoot 'pic') -Force
$runtimeScripts = @('serve.mjs','engine-service.mjs','api-safety-service.mjs','ner-service.mjs','local-records-service.mjs','evaluation-models.mjs','runtime-python.mjs','runtime-service.mjs','model-download-service.mjs','dataset-service.mjs')
foreach ($name in $runtimeScripts) { Copy-Item -LiteralPath (Join-Path $project "scripts\$name") -Destination (Join-Path $appRoot "scripts\$name") -Force }
Get-ChildItem (Join-Path $project 'engine') -File -Filter '*.py' | Where-Object { $_.Name -notlike 'test_*' } | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $appRoot 'engine') -Force }
$dataSource = Join-Path $project 'data'
Get-ChildItem $dataSource -Recurse -File | Where-Object { $_.Name -ne 'datasets.config.json' -and $_.Extension -in '.csv','.jsonl','.raw' -or $_.Name -eq 'LICENSE' } | ForEach-Object {
  $relative = $_.FullName.Substring($dataSource.Length).TrimStart('\')
  $destination = Join-Path (Join-Path $appRoot 'data') $relative
  New-Item -ItemType Directory -Force (Split-Path $destination -Parent) | Out-Null
  Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
}
$node = (Get-Command node.exe -ErrorAction Stop).Source
Copy-Item -LiteralPath $node -Destination (Join-Path $appRoot 'runtime\node.exe') -Force
$compiler = (Get-Command g++.exe -ErrorAction Stop).Source
$windres = (Get-Command windres.exe -ErrorAction Stop).Source
$iconPath = (Join-Path $project 'pic\icon.ico').Replace('\','/')
$resourceFile = Join-Path $buildRoot 'launcher-icon.rc'
$resourceObject = Join-Path $buildRoot 'launcher-icon.o'
"1 ICON `"$iconPath`"" | Set-Content -LiteralPath $resourceFile -Encoding ascii
& $windres '-i' $resourceFile '-o' $resourceObject
if ($LASTEXITCODE -ne 0) { throw 'Launcher icon compilation failed' }
& $compiler (Join-Path $project 'desktop\launcher.cpp') $resourceObject '-std=c++17' '-municode' '-mwindows' '-static-libgcc' '-static-libstdc++' '-o' (Join-Path $appRoot 'NeuroLens.exe')
if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed' }
$files = @(Get-ChildItem $appRoot -Recurse -File)
$forbidden = @($files | Where-Object { $_.FullName -match '\\(models|test|\.venv|node_modules)\\' -or $_.Extension -in '.safetensors','.gguf','.bin','.pt','.pth' })
if ($forbidden.Count) { throw "Forbidden package files: $($forbidden.FullName -join ', ')" }
$manifest = [ordered]@{ version='0.1.0'; generatedAt=(Get-Date).ToUniversalTime().ToString('o'); files=@($files | ForEach-Object { [ordered]@{ path=$_.FullName.Substring($appRoot.Length).TrimStart('\').Replace('\','/'); bytes=$_.Length } }); totalBytes=($files | Measure-Object -Property Length -Sum).Sum }
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $buildRoot 'manifest.json') -Encoding utf8
$iscc = 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe'
if (-not (Test-Path -LiteralPath $iscc)) { throw 'Inno Setup 6 not found' }
& $iscc (Join-Path $project 'installer\NeuroLens.iss')
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed' }
Write-Output "App: $appRoot"
Write-Output "Installer: $(Join-Path $installerRoot 'NeuroLens-Setup-0.1.0.exe')"
