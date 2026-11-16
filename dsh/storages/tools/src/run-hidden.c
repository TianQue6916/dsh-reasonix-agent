/* run-hidden.c -- 隐藏窗口启动一条完整命令行，等待其退出，转发退出码。
 *
 * 为什么需要它（2026-11-11 实测结论）：
 *   WScript.Shell.Run 会自己解析并重新拼装命令行，嵌套引号在这一步被吃掉 ——
 *     -Command "Set-Location 'C:\x'; & 'y.exe' 1> 'a.log'"  传到子进程变成 6 个 argv 元素。
 *   WMI Win32_Process.Create 在低完整性级别下 GetObject 就失败（0x80041001）。
 *   只有直接 CreateProcessW + STARTUPINFO 才能既保命令行原样、又做到 0 帧隐藏。
 *
 * Task Scheduler 的 Arguments 会原样拼在 exe 路径之后，所以 CRT 给出的 lpCmdLine
 * 恰好就是子进程需要的完整命令行，不需要再做任何引号包装。
 *
 * 编译：gcc -O2 -municode -mwindows -static -o run-hidden.exe run-hidden.c
 *   -mwindows  → GUI subsystem，自身没有 console（这才是 0 帧的关键）
 *   -municode  → 宽字符入口 wWinMain，避免 ANSI 代码页丢中文路径
 *
 * 内存：只有一次 HeapAlloc + 一次 HeapFree，定长拷贝，无缓冲区拼接。
 */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <string.h>

int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE hPrev, PWSTR lpCmdLine, int nShow)
{
    (void)hInst; (void)hPrev; (void)nShow;

    if (lpCmdLine == NULL || *lpCmdLine == L'\0') return 2;

    /* CreateProcessW 会就地修改 lpCommandLine，必须给可写副本 */
    SIZE_T nbytes = (wcslen(lpCmdLine) + 1) * sizeof(wchar_t);
    wchar_t *buf = (wchar_t *)HeapAlloc(GetProcessHeap(), 0, nbytes);
    if (buf == NULL) return 3;
    memcpy(buf, lpCmdLine, nbytes);

    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    ZeroMemory(&pi, sizeof(pi));

    int rc;
    if (CreateProcessW(NULL, buf, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi))
    {
        WaitForSingleObject(pi.hProcess, INFINITE);
        DWORD code = 0;
        if (GetExitCodeProcess(pi.hProcess, &code))
            rc = (int)code;
        else
            rc = (int)GetLastError() + 1000;
        CloseHandle(pi.hThread);
        CloseHandle(pi.hProcess);
    }
    else
    {
        rc = (int)GetLastError() + 2000;
    }

    HeapFree(GetProcessHeap(), 0, buf);
    return rc;
}
