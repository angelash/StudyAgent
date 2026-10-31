"""Contain a renderer's process tree, including abrupt supervisor termination.

Windows children start suspended, join a kill-on-close Job Object, then resume.
No child can spawn outside that job before assignment. Other hosts fail closed
until an equivalent parent-death containment mechanism is actually implemented.
"""
import ctypes
import os
import subprocess
import sys
import time
from ctypes import wintypes


class RendererJob:
    def __init__(self):
        if sys.platform != 'win32': raise ValueError('paper_export_renderer_unavailable')
        kernel = self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        signatures = {
            'CreateJobObjectW': ([ctypes.c_void_p, wintypes.LPCWSTR], wintypes.HANDLE),
            'SetInformationJobObject': ([wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD], wintypes.BOOL),
            'QueryInformationJobObject': ([wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD, ctypes.c_void_p], wintypes.BOOL),
            'AssignProcessToJobObject': ([wintypes.HANDLE, wintypes.HANDLE], wintypes.BOOL),
            'TerminateJobObject': ([wintypes.HANDLE, wintypes.UINT], wintypes.BOOL),
            'OpenProcess': ([wintypes.DWORD, wintypes.BOOL, wintypes.DWORD], wintypes.HANDLE),
            'CloseHandle': ([wintypes.HANDLE], wintypes.BOOL),
        }
        for name, (arguments, result) in signatures.items():
            function = getattr(kernel, name); function.argtypes, function.restype = arguments, result

        class Limits(ctypes.Structure):
            _fields_ = [('PerProcessUserTimeLimit', ctypes.c_longlong), ('PerJobUserTimeLimit', ctypes.c_longlong),
                        ('LimitFlags', wintypes.DWORD), ('MinimumWorkingSetSize', ctypes.c_size_t), ('MaximumWorkingSetSize', ctypes.c_size_t),
                        ('ActiveProcessLimit', wintypes.DWORD), ('Affinity', ctypes.c_size_t), ('PriorityClass', wintypes.DWORD), ('SchedulingClass', wintypes.DWORD)]

        class Io(ctypes.Structure):
            _fields_ = [(name, ctypes.c_ulonglong) for name in ['ReadOperationCount', 'WriteOperationCount', 'OtherOperationCount', 'ReadTransferCount', 'WriteTransferCount', 'OtherTransferCount']]

        class Extended(ctypes.Structure):
            _fields_ = [('BasicLimitInformation', Limits), ('IoInfo', Io), ('ProcessMemoryLimit', ctypes.c_size_t),
                        ('JobMemoryLimit', ctypes.c_size_t), ('PeakProcessMemoryUsed', ctypes.c_size_t), ('PeakJobMemoryUsed', ctypes.c_size_t)]

        self.handle = kernel.CreateJobObjectW(None, None)
        if not self.handle: raise ValueError('paper_export_renderer_unavailable')
        settings = Extended(); settings.BasicLimitInformation.LimitFlags = 0x2000 | 0x8 | 0x200
        settings.BasicLimitInformation.ActiveProcessLimit = 16
        settings.JobMemoryLimit = 1536 * 1024 * 1024
        if not kernel.SetInformationJobObject(self.handle, 9, ctypes.byref(settings), ctypes.sizeof(settings)):
            kernel.CloseHandle(self.handle); self.handle = None
            raise ValueError('paper_export_renderer_unavailable')

    def start(self, arguments, **kwargs):
        process = subprocess.Popen(arguments, creationflags=subprocess.CREATE_NO_WINDOW | 0x4, **kwargs)
        handle = self.kernel.OpenProcess(0x0100 | 0x0001 | 0x1000 | 0x0800, False, process.pid)
        try:
            if not handle or not self.kernel.AssignProcessToJobObject(self.handle, handle):
                raise ValueError('paper_export_renderer_unavailable')
            native = ctypes.WinDLL('ntdll')
            native.NtResumeProcess.argtypes = [wintypes.HANDLE]; native.NtResumeProcess.restype = ctypes.c_long
            if native.NtResumeProcess(handle) != 0: raise ValueError('paper_export_renderer_unavailable')
        except BaseException:
            process.kill(); process.wait(timeout=5)
            raise
        finally:
            if handle: self.kernel.CloseHandle(handle)
        return process

    def accounting(self):
        class Accounting(ctypes.Structure):
            _fields_ = [(name, ctypes.c_longlong) for name in ['TotalUserTime', 'TotalKernelTime', 'ThisPeriodTotalUserTime', 'ThisPeriodTotalKernelTime']] + [
                (name, wintypes.DWORD) for name in ['TotalPageFaultCount', 'TotalProcesses', 'ActiveProcesses', 'TotalTerminatedProcesses']]
        value = Accounting()
        if not self.kernel.QueryInformationJobObject(self.handle, 1, ctypes.byref(value), ctypes.sizeof(value), None):
            raise ValueError('paper_export_process_cleanup_failed')
        return {'totalProcesses': value.TotalProcesses, 'activeProcesses': value.ActiveProcesses, 'terminatedProcesses': value.TotalTerminatedProcesses}

    def terminate(self):
        if self.handle and not self.kernel.TerminateJobObject(self.handle, 74):
            raise ValueError('paper_export_process_cleanup_failed')

    def process_ids(self):
        class ProcessIds(ctypes.Structure):
            _fields_ = [('assigned', wintypes.DWORD), ('count', wintypes.DWORD), ('ids', ctypes.c_size_t * 32)]
        value = ProcessIds()
        if not self.kernel.QueryInformationJobObject(self.handle, 3, ctypes.byref(value), ctypes.sizeof(value), None):
            raise ValueError('paper_export_process_cleanup_failed')
        if value.count > 32: raise ValueError('paper_export_process_cleanup_failed')
        return list(value.ids[:value.count])

    def close(self):
        if not self.handle: return
        try:
            before = self.accounting()
            if before['activeProcesses']: self.terminate()
            deadline = time.monotonic() + 5
            after = self.accounting()
            while after['activeProcesses'] and time.monotonic() < deadline:
                time.sleep(0.05); after = self.accounting()
            if after['activeProcesses']: raise ValueError('paper_export_process_cleanup_failed')
            return {'before': before, 'after': after, 'killOnSupervisorExit': True, 'assignedBeforeResume': True}
        finally:
            self.kernel.CloseHandle(self.handle); self.handle = None
