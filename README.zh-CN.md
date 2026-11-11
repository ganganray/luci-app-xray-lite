# luci-app-xray-lite

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Build OpenWrt Packages](https://github.com/ganganray/luci-app-xray-lite/actions/workflows/build.yml/badge.svg)](https://github.com/ganganray/luci-app-xray-lite/actions/workflows/build.yml)

[English](README.md) | [简体中文](README.zh-CN.md)

专为 **Xray 作为纯本地出站代理后端** 设计的轻量级、零侵入 OpenWrt / ImmortalWrt LuCI 插件。

专用于以下场景：由透明代理核心（如 **dae**、**sing-box** 或 **mihomo**）接管防火墙流量拦截与分流路由调度，而 Xray 仅作为本地出站协议转换器（在 `127.0.0.1` 监听多个 SOCKS5 端口，如 `47070-47080`，提供 VLESS Reality、XHTTP、VMess 等出站链路）。

---

## 💡 为什么需要 luci-app-xray-lite？

现有的各类 LuCI Xray 插件（如 `yichya/luci-app-xray`、PassWall 等）定位都是“完整透明代理客户端”。它们会修改防火墙规则（iptables / nftables）、劫持系统 DNS（dnsmasq / chinadns-ng）、创建复杂的路由规则。当配合 `dae` 或 `sing-box` 运行时，极易引发防火墙规则抢占冲突、DNS 泄露和路由死循环。

`luci-app-xray-lite` 借鉴了 `luci-app-dae` 极简、纯粹的交互哲学：

| 特性对比 | `luci-app-xray-lite`（本项目） | `yichya/luci-app-xray` / PassWall 等 |
| :--- | :--- | :--- |
| **防火墙改动** | ❌ **零触碰**（不碰任何 nftables / iptables 规则） | ✅ 强制注入复杂的 TPROXY / REDIRECT 规则链 |
| **DNS 劫持** | ❌ **零触碰**（不修改 dnsmasq，不劫持 DNS 端口） | ✅ 接管系统 DNS，建立本地 DNS 转发 |
| **配置模式** | 📝 **原始 JSON 编辑**，带保存前校验与失败自动回滚 | 📋 庞大繁重的 Web 表单转换生成 |
| **生态兼容性** | 🤝 与 `dae`、`sing-box`、`mihomo` 完美协同 | ⚠️ 与其他透明代理核心冲突互斥 |
| **资源消耗** | ⚡ 极致轻量（纯 LuCI JS 前端 + 受控辅助脚本） | 🐘 常驻规则轮询守卫进程 |
| **官方兼容性** | 📦 原生兼容 `openwrt/packages` 官方 `xray-core` UCI 及 init 脚本 | 🧩 依赖专有 UCI 规范与包装脚本 |

---

## 📸 功能截图

| 设置页面 (Settings) | 配置页面 (Configuration) | 日志页面 (Log) |
| :---: | :---: | :---: |
| *(服务运行状态与 UCI 映射)*<br>`docs/screenshots/settings.png` | *(带自动测试回滚的 JSON 编辑器)*<br>`docs/screenshots/config.png` | *(实时日志监控与滚动条)*<br>`docs/screenshots/log.png` |

---

## ✨ 核心特性

1. **服务状态与生命周期管理**：
   - 通过 `ubus service list` 实时轮询运行状态（`RUNNING` / `NOT RUNNING`，智能兼容官方实例名与自定义实例名）。
   - 提供启动、停止、重启控制按钮。
   - 完整映射官方 `xray-core` 的 UCI 选项（`enabled`、`confdir`、`conffiles`、`datadir`、`format`、`dialer`）。
2. **安全的 JSON 配置文件编辑**：
   - 支持多文件下拉切换（自动扫描 `confdir` 与 `conffiles` 目录下的 `.json` 文件）。
   - 32 行等宽字体大文本框，支持 Tab 缩进。
   - **双重校验与自动回滚闭环**：
     - *前端预检*：浏览器端 `JSON.parse` 校验，语法有误时直接拦截报错，绝不向磁盘写入损坏文件。
     - *后端实测*：保存时先调用 `xray run -test` 进行真实配置测试。若测试失败，**自动回滚还原旧文件**并在界面高亮展示 Xray 报错诊断详情，确保现有服务绝不断流。
   - 配置文件权限全程严格保持 `0600`（`-rw-------`）。
3. **实时日志查看**：
   - 实时轮询并展示 `logread` 中 Xray 进程输出的日志（若在 `config.json` 中配置了独立的 `log.error` 文件则优先读取文件）。
   - 提供快速滚动到底部 / 顶部按钮、清屏按钮及行数筛选（100 / 250 / 500 / 1000 行）。
4. **安全与最小权限原则**：
   - 严格遵循现代前端安全规范，零 `innerHTML` 拼接，杜绝 XSS 风险。
   - 最小化 RPCD ACL 授权：仅放行受控辅助脚本 `/usr/libexec/xray-lite-ctl`，不向前端开放任何任意系统命令执行。

---

## 📥 安装方法

从 [GitHub Releases](https://github.com/ganganray/luci-app-xray-lite/releases) 页面下载对应格式的安装包：

### 适用于 ImmortalWrt / OpenWrt SNAPSHOT (apk)
```sh
# 将 .apk 上传到路由器，免签名安装：
apk add --allow-untrusted luci-app-xray-lite-*.apk
```

### 适用于 OpenWrt 24.10 / opkg 系统 (ipk)
```sh
opkg update
opkg install luci-app-xray-lite_*.ipk
```

安装完成后，刷新浏览器或清理 LuCI 缓存即可在菜单中看到【服务】→【Xray】：
```sh
rm -f /tmp/luci-indexcache*
```

---

## ⚙️ 典型网络拓扑

```mermaid
flowchart LR
    Client([局域网客户端]) --> Router["路由器 (ImmortalWrt / OpenWrt)"]
    Router --> DAE["dae / sing-box (透明代理核心 / DNS / 分流路由)"]
    DAE -- "本地 SOCKS5 (127.0.0.1:47070-47080)" --> XRAY["Xray-core (luci-app-xray-lite)"]
    XRAY -- "代理出站 (VLESS Reality / XHTTP / VMess)" --> VPS([远端节点 / 互联网])
```

---

## 📜 开源协议

本项目采用 [Apache License, Version 2.0](LICENSE) 开源协议。
