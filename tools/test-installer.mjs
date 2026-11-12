import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

if (process.platform !== 'win32') throw new Error('Installer tests require Windows.');
const compiler = process.env.NSIS_EXE ?? join(process.env.LOCALAPPDATA, 'tauri', 'NSIS', 'makensis.exe');
const folder = mkdtempSync(join(tmpdir(), 'sintaxtrama-installer-test-'));
const registryRoot = 'Software\\G9C_Studios\\InstallerTests\\' + randomUUID();
const source = readFileSync(new URL('../src-tauri/windows/hooks.nsh', import.meta.url), 'utf8');
// Use the production control flow with only registry namespaces redirected.
const isolated = source.replaceAll('Software\\', registryRoot + '\\');
const hooks = join(folder, 'hooks.nsh'); writeFileSync(hooks, isolated);
const own = `'"$INSTDIR\\pliegra.exe" "%1"'`;
const foreign = `'"C:\\OtherInstallation\\pliegra.exe" "%1"'`;
const logicIf = '$' + '{If}', logicEndIf = '$' + '{EndIf}';
try {
  for (const ownedApplication of [false, true]) {
    const file = join(folder, 'test.nsi');
    const exe = join(folder, 'test.exe');
    writeFileSync(file, `Unicode true
!include LogicLib.nsh
!include "${hooks}"
Name "SintaxTrama isolated association test"
OutFile "${exe}"
RequestExecutionLevel user
SilentInstall silent
Section
  StrCpy $INSTDIR "$TEMP\\SintaxTramaOwnedInstallation"
  WriteRegStr HKCU "${registryRoot}\\Classes\\Applications\\pliegra.exe\\shell\\open\\command" "" ${ownedApplication ? own : foreign}
  WriteRegStr HKCU "${registryRoot}\\Classes\\Pliegra.Markdown\\shell\\open\\command" "" ${own}
  WriteRegStr HKCU "${registryRoot}\\Classes\\Linde.Markdown\\shell\\open\\command" "" ${foreign}
  WriteRegStr HKCU "${registryRoot}\\Classes\\.md\\OpenWithProgids" "Pliegra.Markdown" "test"
  WriteRegStr HKCU "${registryRoot}\\Pliegra\\Capabilities" "ApplicationName" "Other or owned"
  WriteRegStr HKCU "${registryRoot}\\RegisteredApplications" "Pliegra" "capabilities"
  !insertmacro NSIS_HOOK_POSTUNINSTALL
  ReadRegStr $1 HKCU "${registryRoot}\\Classes\\Pliegra.Markdown\\shell\\open\\command" ""
  ${logicIf} $1 != ""
    Goto failed
  ${logicEndIf}
  ReadRegStr $1 HKCU "${registryRoot}\\Classes\\Linde.Markdown\\shell\\open\\command" ""
  ${logicIf} $1 != ${foreign}
    Goto failed
  ${logicEndIf}
  ReadRegStr $1 HKCU "${registryRoot}\\Classes\\.md\\OpenWithProgids" "Pliegra.Markdown"
  ${logicIf} $1 != ""
    Goto failed
  ${logicEndIf}
  ReadRegStr $1 HKCU "${registryRoot}\\RegisteredApplications" "Pliegra"
  ${logicIf} $1 ${ownedApplication ? '!=' : '=='} ""
    Goto failed
  ${logicEndIf}
  DeleteRegKey HKCU "${registryRoot}"
  SetErrorLevel 0
  Quit
failed:
  DeleteRegKey HKCU "${registryRoot}"
  SetErrorLevel 1
SectionEnd
`);
    const compiled = spawnSync(compiler, ['/V2', file], { encoding: 'utf8', windowsHide: true });
    if (compiled.status !== 0) throw new Error(compiled.stdout + compiled.stderr);
    const run = spawnSync(exe, ['/S'], { windowsHide: true });
    if (run.status !== 0) throw new Error('Association ownership check failed: '+run.status);
    console.log('PASS: '+(ownedApplication ? 'owned associations removed' : 'foreign installation retained'));
  }
} finally {
  if (dirname(resolve(folder)) !== resolve(tmpdir()) || !basename(folder).startsWith('sintaxtrama-installer-test-')) throw new Error('Unexpected temporary path.');
  rmSync(folder, { recursive: true, force: true });
}
