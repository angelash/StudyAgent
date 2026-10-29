param(
  [string]$PlanPath = (Join-Path $PSScriptRoot '../../data/maintenance/2026-10-29-consolidation/deletion-plan.json')
)

# Run only after consolidate-workspace.py predelete succeeds for this exact batch.
# Git for Windows recursively follows junctions during worktree removal here.
# Remove NTFS reparse metadata first; never traverse or delete the shared target.
$ErrorActionPreference = 'Stop'
$repo = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..')).TrimEnd('\')
$archive = Join-Path $repo 'data/maintenance/2026-10-29-consolidation'
$expectedPlan = [System.IO.Path]::GetFullPath((Join-Path $archive 'deletion-plan.json'))
if ([System.IO.Path]::GetFullPath($PlanPath) -ne $expectedPlan) { throw 'Unexpected deletion plan path' }
$plan = Get-Content -LiteralPath $expectedPlan -Raw | ConvertFrom-Json
if (-not $plan.passed -or $plan.keeper -ne $repo -or $plan.archive -ne $archive) { throw 'Verified keeper/archive required' }
$head = (& git -C $repo rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $plan.head) { throw 'Main HEAD changed after preflight' }
$branch = (& git -C $repo branch --show-current).Trim()
if ($branch -ne 'main') { throw 'Main must remain checked out' }
$siblingParent = [System.IO.Path]::GetDirectoryName($repo)
$results = [System.Collections.Generic.List[object]]::new()
$receiptPath = Join-Path $archive 'worktree-removal-receipt.json'

foreach ($target in $plan.targets) {
  $absolute = [System.IO.Path]::GetFullPath($target.path).TrimEnd('\')
  if ($absolute -eq $repo -or [System.IO.Path]::GetDirectoryName($absolute) -ne $siblingParent -or
      -not [System.IO.Path]::GetFileName($absolute).StartsWith('StudyAgent-') -or $absolute -ne $target.path) {
    throw "Target outside the inventoried sibling directories: $absolute"
  }
  if (-not (Test-Path -LiteralPath $absolute)) { throw "Original target unexpectedly absent: $absolute" }
  $rootItem = Get-Item -LiteralPath $absolute -Force
  if ($rootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Worktree root cannot itself be linked' }
  & git -C $repo merge-base --is-ancestor $target.head main
  if ($LASTEXITCODE -ne 0) { throw "Original worktree commit is not reachable from main: $absolute" }
  $currentHead = (& git -C $absolute rev-parse HEAD).Trim()
  if ($currentHead -ne $target.head) { throw "Source HEAD changed: $absolute" }
  $detached = 0
  foreach ($link in $target.links) {
    $linkPath = [System.IO.Path]::GetFullPath((Join-Path $absolute $link.path))
    if (-not $linkPath.StartsWith($absolute + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
      throw 'Link path escapes its original worktree'
    }
    $attributes = [System.IO.File]::GetAttributes($linkPath)
    if (-not ($attributes -band [System.IO.FileAttributes]::ReparsePoint)) { throw "Recorded link changed: $linkPath" }
    $detachOutput = & fsutil reparsepoint delete $linkPath 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Cannot detach reparse metadata: $linkPath $detachOutput" }
    if ([System.IO.File]::GetAttributes($linkPath) -band [System.IO.FileAttributes]::ReparsePoint) {
      throw "Link still active: $linkPath"
    }
    $detached++
  }
  # PowerShell does not follow directory links unless -FollowSymlink is requested.
  $remainingLinks = @(Get-ChildItem -LiteralPath $absolute -Recurse -Force -Attributes ReparsePoint)
  if ($remainingLinks.Count -gt 0) { throw "Unrecorded links remain in $absolute" }
  $log = & git -C $repo -c core.longpaths=true worktree remove --force -- $absolute 2>&1
  $code = $LASTEXITCODE
  $log | Set-Content -LiteralPath (Join-Path $archive ('remove-' + $target.name + '.log'))
  if ($code -ne 0 -or (Test-Path -LiteralPath $absolute)) { throw "Git worktree removal failed: $absolute $log" }
  $result = [ordered]@{ name=$target.name; path=$absolute; originalHead=$target.head; detachedLinks=$detached; removed=$true; at=(Get-Date).ToString('o') }
  $results.Add($result)
  ConvertTo-Json -InputObject @($results.ToArray()) -Depth 5 | Set-Content -LiteralPath $receiptPath
  $result | ConvertTo-Json -Compress
}

$left = @(& git -C $repo worktree list --porcelain | Where-Object { $_ -like 'worktree *' })
if ($left.Count -ne 1 -or $left[0] -ne ('worktree ' + $repo.Replace('\','/'))) { throw 'Unexpected worktrees remain' }
Write-Output ('Removed and independently checked ' + $results.Count + ' original worktree directories.')
