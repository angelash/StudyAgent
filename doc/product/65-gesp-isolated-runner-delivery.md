# GESP 隔离编程运行器交付

2026-10-21，接续 GESP 教研索引和 `64-gesp-student-programming-development-plan.md`。本批完成 G1：把不可信 C++ 源码编译和执行放到 Windows WSL2 的独立 Linux 命名空间中，并建立可复核收据。学生题族、范围与评分仍待 G2～G5，本批不把运行器视为编程能力评测已经完成。

运行器位于 [run_submission.cjs](../../scripts/gesp/run_submission.cjs)。每次提交使用随机临时目录和独立 user、mount、PID、network、UTS、IPC 命名空间；编译与运行前隐藏 `/mnt`、`/home`、`/root`、`/tmp` 和 `/var/tmp`，只把当前任务目录绑定到命名空间内。限制源码64 KiB、测试40组、输入4 KiB、输出64 KiB、编译12秒、墙钟2秒、CPU 3秒、内存256 MiB、文件大小1 MiB、32个进程和64个打开文件。

程序使用静态 C++17 编译。运行器不返回隐藏测试输入或期望输出，只保存源码哈希、测试包哈希、工具链、资源限制、编译退出码和逐例状态。状态区分 `passed`、`wrong_output`、`timeout`、`runtime_error`、`harness_timeout` 与 `harness_error`；编译失败时立即返回，不创建虚假运行结论。

专项测试覆盖多组正确输出、编译失败、错误输出、死循环超时、Windows 挂载不可读、隐藏期望值不回传和临时目录清理。当前 WSL 工具链为 `g++ 13.3.0`；原始收据保存于 [gesp-runner-runtime.json](../../doc/evidence/2026-10-21/gesp-runner-runtime.json)。

该结果证明本机隔离边界和 fail-closed 工具链可用，不证明学习范围、题面审核、隐藏测试正确性、生产吞吐、其他操作系统或真人编程能力。下一阶段仍需完成独立学生范围、已审题族、提示/复核、报告指导复测、GESP-06 新环境恢复与真实人员验收。
