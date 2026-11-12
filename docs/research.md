# `luci-app-xray-lite` 前期调研报告

## 1. 上游 `net/xray-core` 包结构核实（OpenWrt & ImmortalWrt）

我们对 `openwrt/packages` 与 `immortalwrt/packages` 的 `master`（OpenWrt 25.x）及 `openwrt-24.10` 分支下的 `net/xray-core` 进行了源码级比对，并结合两台测试设备（`n100-openwrt` 标准 ImmortalWrt 25.12 环境与 `jdcloud` 自定义环境）进行了实机核验。

### 1.1 `xray-core` 实际安装的文件清单（来自 `Makefile` 与 `n100-openwrt` 实测）

在 `n100-openwrt`（ImmortalWrt 25.12.2 `x86_64`）上通过 `apk info -L xray-core` 核实，`xray-core` 包安装以下文件（声明 `conffiles` 为 `/etc/xray/` 和 `/etc/config/xray`）：
- `/usr/bin/xray`：Xray 核心二进制文件
- `/etc/config/xray`：UCI 配置文件（源文件 `files/xray.conf`）
- `/etc/init.d/xray`：procd 启动脚本（源文件 `files/xray.init`）
- `/etc/xray/config.json.example`：示例 JSON 配置文件
- `/lib/upgrade/keep.d/xray-core`：系统升级保留配置声明

### 1.2 `/etc/config/xray` 的 UCI 结构与选项

上游 `files/xray.conf` 包含 **两个命名 section**（类型均为 `xray`，名称分别为 `'enabled'` 和 `'config'`，不同于 `dae` 将所有选项放在单一 `config` section 中）：

```uci
config xray 'enabled'
	option enabled '0'

config xray 'config'
	option confdir '/etc/xray'
	list conffiles '/etc/xray/config.json'
	option datadir '/usr/share/xray'
	option dialer ''
	option format 'json'
```

| Section 名称 | 选项名 | 类型 | 默认值（OpenWrt） | 默认值（ImmortalWrt） | 作用说明 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `enabled` | `enabled` | boolean (`0`/`1`) | `'0'` | `'0'` | 服务总开关（`xray.enabled.enabled`） |
| `config` | `confdir` | string (directory) | `'/etc/xray'` | `'/etc/xray'` | 多配置文件目录，对应 `-confdir <dir>` |
| `config` | `conffiles` | list of strings | `'/etc/xray/config.json'` | `'/etc/xray/config.json'` | 单个或多个配置文件路径列表，逐个追加 `-config <file>` |
| `config` | `datadir` | string (directory) | `'/usr/share/xray'` | `'/usr/share/v2ray'` | GeoIP/GeoSite 资源目录，注入环境变量 `XRAY_LOCATION_ASSET` |
| `config` | `dialer` | string | `''` | `''` | 浏览器转发地址，非空时注入环境变量 `XRAY_BROWSER_DIALER` |
| `config` | `format` | string | `'json'` | `'json'` | 配置文件格式，对应 `-format <format>`（如 `json`、`jsonv4`、`toml`、`yaml`） |

> [!WARNING]
> **差异与潜在坑点 1（`datadir` 默认值）**：
> - 在 `n100-openwrt`（标准 ImmortalWrt 25.12.2）上，`/usr/share/v2ray` 与 `/usr/share/xray`（软链接到 `../v2ray/*.dat`）均存在，因此默认 `/usr/share/v2ray` 或 `/usr/share/xray` 均可工作。
> - 在 `jdcloud`（非标准环境）上，仅存在 `/usr/share/xray`（软链接到 `/usr/share/dae/*.dat`），`/usr/share/v2ray` 不存在。
> - **兼容策略**：当自动初始化或校验时，若 UCI 配置的 `datadir` 目录不存在，自动回退探测 `/usr/share/xray` 与 `/usr/share/v2ray`。
>
> **差异与潜在坑点 2（`confdir` 与 `conffiles` 同时生效）**：
> 官方 `xray.init` 中，如果 `confdir` 和 `conffiles` 同时非空，启动参数会同时附加 `-confdir /etc/xray -config /etc/xray/config.json`。当 `/etc/xray/config.json` 位于 `/etc/xray` 目录内时，Xray 会将同一个 `config.json` 读取两次并合并（带 `tag` 的 `inbounds`/`outbounds` 会按 tag 覆盖更新，但无 `tag` 的数组如 `routing.rules` 可能重复追加）。因此：
> - 若单文件模式：建议设置 `conffiles '/etc/xray/config.json'` 并置空 `confdir`（或反过来只设 `confdir '/etc/xray'` 不设 `conffiles`）。
> - 在 LuCI 设置页中，我们将完整映射上述全部官方 UCI 选项，并在帮助文字中提示两者的关系。

### 1.3 `/etc/init.d/xray` 启动逻辑、实例名差异与日志输出

上游 `files/xray.init`（`START=99`，`USE_PROCD=1`）核心逻辑如下：
1. 读取 `config_get_bool enabled "enabled" "enabled" "0"`，若不为 `1` 则直接 `return 1` 退出。
2. 读取 `"config"` section 下的 `confdir`、`conffiles`、`datadir`（缺省 `/usr/share/xray`）、`dialer`、`format`（缺省 `json`）。
3. 组装命令：
   ```sh
   /usr/bin/xray run [-confdir "$confdir"] [-config "$i" ...] [-format "$format"]
   ```
4. 环境变量与 procd 参数：
   - `XRAY_LOCATION_ASSET="$datadir"`
   - `[ -n "$dialer" ] && procd_set_param env XRAY_BROWSER_DIALER="$dialer"`
   - `procd_set_param file $conffiles`
   - `procd_set_param limits core="unlimited"` 与 `nofile="1000000 1000000"`
   - `procd_set_param stdout 1` 与 `procd_set_param stderr 1`
   - `procd_set_param respawn`
5. **Procd 实例名称差异（重要实机发现）**：
   - 官方 `xray.init` 调用 `procd_open_instance "$CONF"`，因此 `ubus call service list '{"name":"xray"}'` 返回的实例键名为 `instances.xray`。
   - `n100-openwrt` 当前的自定义 `/etc/init.d/xray` 调用了无参的 `procd_open_instance`，因此 `ubus` 返回的实例键名为 `instances.instance1`。
   - **兼容策略**：前端 `settings.js` 判断运行状态时，不硬编码 `instances['xray']`，而是遍历 `res.xray.instances` 下所有实例（`Object.values(instances).some(i => i.running)`），从而同时兼容官方脚本与各类自定义 init 脚本。
6. **日志去向**：
   - 由于设置了 `stdout 1` 和 `stderr 1`，当 `config.json` 的 `log.access` / `log.error` 未指定文件路径（默认输出到 stdout/stderr）时，所有日志均由 `procd` 捕获并写入系统环形缓冲区，可通过 `logread -e xray` 读取。
   - 若用户在 `config.json` 的 `log.error` 中显式配置了文件路径（且不为 `"none"`），Xray 会直接写入对应文件。

---

## 2. Xray 配置校验命令核实

在真机上实测 `xray help run` 及 `-test` 参数：

### 2.1 命令行参数
- 单文件校验：
  ```sh
  XRAY_LOCATION_ASSET=/usr/share/xray /usr/bin/xray run -test -config /etc/xray/config.json -format json
  ```
- 多文件目录校验：
  ```sh
  XRAY_LOCATION_ASSET=/usr/share/xray /usr/bin/xray run -test -confdir /etc/xray -format json
  ```
- 与 `xray.init` 完全一致的组合校验：
  按照 UCI `/etc/config/xray` 中的 `datadir`、`confdir`、`conffiles`、`format` 组装相同参数（若在非标准环境下 UCI 未配置 `conffiles` 与 `confdir`，则直接针对当前编辑的目标文件 `-config <filepath>` 进行校验），仅在 `run` 后增加 `-test`。

### 2.2 退出码与输出格式
- **校验成功**：退出码为 `0`，标准输出末尾包含 `Configuration OK.`。
- **校验失败**：退出码为非 `0`（通常为 `23`），标准输出/标准错误输出包含具体错误原因（如 JSON 语法错误行号、outbound/inbound 配置非法、找不到 `geoip.dat` 等）。
- **环境变量依赖**：校验时**必须**传入有效的 `XRAY_LOCATION_ASSET`，否则当配置中引用了 `geoip:` 或 `geosite:` 规则时，`-test` 会因找不到资源文件而误报失败。

---

## 3. OpenWrt 25.x（apk）与 24.10（ipk）及双测试机环境对比

### 3.1 LuCI 前端 JS API 对比
在 OpenWrt 24.10、ImmortalWrt 25.12（`n100-openwrt`）与 OpenWrt 25.x（`jdcloud`）中，客户端 LuCI JS 框架（`luci-base`）的核心模块 API **完全一致，无破坏性差异**：
- `view` (`LuCI.view.extend({ load, render, handleSave, handleSaveApply, handleReset })`)
- `form` (`form.Map`, `form.NamedSection`, `form.TypedSection`, `form.Flag`, `form.Value`, `form.ListValue`, `form.DynamicList`, `form.TextValue`, `form.DummyValue`, `form.Button`)
- `rpc` (`rpc.declare({ object, method, params, expect })`)
- `uci` (`uci.load`, `uci.get`, `uci.set`, `uci.save`, `uci.apply`)
- `fs` (`fs.read_direct`, `fs.write`, `fs.exec`, `fs.exec_direct`, `fs.list`, `fs.stat`)
- `poll` (`poll.add`, `poll.remove`)
- `ui` (`ui.addNotification`, `ui.showModal`, `ui.hideModal`)
- `dom` (`dom.content`, `E()`)

### 3.2 两台测试机环境对比总结

| 维度 | `n100-openwrt`（主测试机：标准 ImmortalWrt 环境） | `jdcloud` (`172.22.77.3`：扩展兼容性测试机) |
| :--- | :--- | :--- |
| **系统版本与架构** | ImmortalWrt 25.12.2 (`x86_64`, `apk`) | ImmortalWrt 25.x (`aarch64_cortex-a53`, `apk`) |
| **`xray-core` 包状态** | 已通过 `apk` 官方安装 (`xray-core-26.3.27-r1`) | 手动放置 `/usr/bin/xray` (`26.10.31`)，无 `apk` 包记录 |
| **`/etc/config/xray`** | 已存在（官方默认模板） | 不存在 |
| **`/etc/init.d/xray`** | 自定义脚本（可还原为官方 `xray.init` 进行标准测试） | 自定义脚本（硬编码 `-c /etc/xray/config.json`） |
| **Geo 数据目录** | `/usr/share/v2ray` 与 `/usr/share/xray` 均存在 | 仅 `/usr/share/xray` 存在 |
| **测试定位** | 验证官方 `xray-core` + 标准 UCI + `.apk` 直接安装全流程 | 验证非标准环境（无 `/etc/config/xray`、自定义 init 脚本）的自愈与兼容能力 |
