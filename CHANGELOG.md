# 更新说明 / Changelog

## v1.1.0 - 2026-03-15

### 功能增强 / Enhancements

- 将服务从通用 ICS 事件查询收敛为更贴近杭电场景的课表、考试与校园日程查询。 / Refocus the service from generic ICS event lookup to an HDU-oriented courses, exams, and campus schedule query tool.
- MCP 服务名更新为 `hdu-courses-and-exams`，工具名同步调整为更明确的课程/考试语义。 / Rename the MCP server to `hdu-courses-and-exams` and update tool names to better reflect course and exam semantics.
- README 补充 Claude Desktop、Claude Code 与 Cherry Studio 的接入示例与使用说明。 / Expand the README with integration examples and usage instructions for Claude Desktop, Claude Code, and Cherry Studio.

### 日历与时间处理 / Calendar and Time Handling

- 新增 `CALENDAR_TIMEZONE` 配置，默认使用 `Asia/Shanghai` 计算“今天”和“未来 N 天”的查询范围。 / Add `CALENDAR_TIMEZONE`, defaulting to `Asia/Shanghai`, for computing the ranges of “today” and “the next N days”.
- 重写日期边界计算逻辑，避免依赖运行机器本地时区导致结果偏移。 / Rework day-boundary calculations to avoid drift caused by the host machine's local timezone.
- 修正“未来 N 天（含今天）”的范围计算方式，使返回结果与参数语义一致。 / Fix the “next N days (including today)” range logic so the returned results match the parameter semantics.

### 缓存与稳定性 / Caching and Reliability

- 新增内存 + 磁盘双层缓存，缓存文件位于 `.cache/ics-cache.json`。 / Add a two-layer cache using both memory and disk, with the cache stored at `.cache/ics-cache.json`.
- 缓存策略升级为：同一用户标识优先复用、每天首次访问强制刷新、TTL 过期刷新。 / Upgrade the cache strategy to prefer reuse for the same user identity, force a refresh on the first access each day, and refresh on TTL expiry.
- 当刷新 ICS 失败但本地仍有上次成功缓存时，自动回退到旧缓存，提升可用性。 / Automatically fall back to the last successful cache when ICS refresh fails, improving availability.
- 增加 `ICS_CACHE_TTL_MS` 配置，默认缓存时长为 4 小时。 / Add `ICS_CACHE_TTL_MS` with a default cache duration of 4 hours.

### 错误处理 / Error Handling

- 为各个 MCP 工具补充统一错误兜底，网络或解析失败时返回明确的提示信息。 / Add consistent fallback error handling for all MCP tools so network or parsing failures return clear messages.
- 启动时继续强制校验 `ICS_URL`，避免未配置情况下服务静默异常。 / Keep strict startup validation for `ICS_URL` to avoid silent failures when configuration is missing.

### 配置与工程化 / Configuration and Project Setup

- `.env.example` 增加时区与缓存配置示例。 / Extend `.env.example` with timezone and cache configuration examples.
- `.gitignore` 增加 `.cache/`，避免运行时缓存被误提交。 / Add `.cache/` to `.gitignore` so runtime cache files are not committed accidentally.
- `package.json` 描述同步更新，锁文件与当前依赖状态保持一致。 / Update the `package.json` description and keep the lockfile aligned with the current dependency state.
