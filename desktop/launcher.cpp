#define UNICODE
#define _UNICODE
#include <windows.h>
#include <string>

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int) {
    wchar_t ownPath[MAX_PATH];
    if (!GetModuleFileNameW(nullptr, ownPath, MAX_PATH)) return 1;
    std::wstring root(ownPath);
    root.resize(root.find_last_of(L"\\/"));
    const std::wstring node = root + L"\\runtime\\node.exe";
    const std::wstring script = root + L"\\scripts\\serve.mjs";
    if (GetFileAttributesW(node.c_str()) == INVALID_FILE_ATTRIBUTES ||
        GetFileAttributesW(script.c_str()) == INVALID_FILE_ATTRIBUTES) {
        MessageBoxW(nullptr, L"应用文件不完整，请重新安装 NeuroLens。", L"NeuroLens", MB_ICONERROR);
        return 2;
    }
    SetEnvironmentVariableW(L"NEUROLENS_DESKTOP", L"1");
    SetEnvironmentVariableW(L"PORT", L"4174");
    std::wstring command = L"\"" + node + L"\" \"" + script + L"\"";
    STARTUPINFOW startup = {};
    startup.cb = sizeof(startup);
    PROCESS_INFORMATION process = {};
    if (!CreateProcessW(node.c_str(), command.data(), nullptr, nullptr, FALSE,
                        CREATE_NO_WINDOW, nullptr, root.c_str(), &startup, &process)) {
        MessageBoxW(nullptr, L"无法启动本地网页服务。", L"NeuroLens", MB_ICONERROR);
        return 3;
    }
    CloseHandle(process.hThread);
    WaitForSingleObject(process.hProcess, INFINITE);
    DWORD code = 0;
    GetExitCodeProcess(process.hProcess, &code);
    CloseHandle(process.hProcess);
    return static_cast<int>(code);
}
