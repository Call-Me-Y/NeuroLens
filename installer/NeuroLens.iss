#define MyAppName "NeuroLens"
#define MyAppVersion "0.1.0"

[Setup]
AppId={{E6AA06C9-BC9B-477D-9E45-1425D9EBF721}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={localappdata}\Programs\NeuroLens
DefaultGroupName=NeuroLens
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\build\installer
OutputBaseFilename=NeuroLens-Setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\pic\installer.ico
WizardSmallImageFile=..\pic\installer.png
UninstallDisplayIcon={app}\NeuroLens.exe
DisableProgramGroupPage=yes

[Files]
Source: "..\build\app\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{app}\models"
Name: "{app}\test"
Name: "{app}\outputs"

[Icons]
Name: "{autoprograms}\NeuroLens"; Filename: "{app}\NeuroLens.exe"
Name: "{autodesktop}\NeuroLens"; Filename: "{app}\NeuroLens.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "快捷方式："

[Run]
Filename: "{app}\NeuroLens.exe"; Description: "启动 NeuroLens"; Flags: nowait postinstall skipifsilent
