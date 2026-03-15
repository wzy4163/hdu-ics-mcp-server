# HDU 校园 ICS 课表/考试 MCP

将杭电助手 ICS 日历订阅接入支持 MCP 的客户端，查询杭电课程、考试和校园日程。

## 快速开始

```bash
# 安装依赖
npm install

# 配置 ICS 订阅地址
cp .env.example .env
# 编辑 .env，填入你的 ICS URL
# 可选：调整时区和缓存时间

# 构建
npm run build
```

## 配置 MCP

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "hdu-courses-and-exams": {
      "command": "node",
      "args": ["/absolute/path/to/hdu-ics-mcp-server/dist/index.js"],
      "env": {
        "ICS_URL": "https://api.hduhelp.com/calendar/schedule?staffId=xxxxxxxxxx"
      }
    }
  }
}
```
xxxxxx为你杭电助手订阅链接中的部分
也可以不写 `env`，改用项目根目录的 `.env` 文件配置 `ICS_URL`。
默认按 `Asia/Shanghai` 时区解析“今天 / 未来 N 天”，可用 `CALENDAR_TIMEZONE` 覆盖。
ICS 缓存策略为“同一用户标识优先复用缓存 + 每天首次访问强制刷新 + 4 小时过期刷新”，刷新失败时回退到上次成功缓存。

### Cherry Studio

1. 打开 Cherry Studio，进入 **设置 → MCP 服务器**
2. 点击 **添加服务器**，填写以下信息：
   - **名称**: `hdu-courses-and-exams`
   - **命令**: `node`
   - **参数**: `/absolute/path/to/hdu-ics-mcp-server/dist/index.js`
   - **环境变量**: 添加 `ICS_URL`，值为 `https://api.hduhelp.com/calendar/schedule?staffId=xxxxxx`
   - xxxxxx为你杭电助手订阅链接中的部分
3. 保存后即可在对话中使用日历相关工具

## 可用工具

适合回答“今天有什么课”“这周有哪些考试”“搜索某门课或考试”等校园日程问题。

| 工具 | 说明 | 参数 |
|------|------|------|
| `get_today_courses_and_exams` | 获取今天的杭电课程、考试和日程安排 | 无 |
| `get_upcoming_courses_and_exams` | 获取未来 N 天的杭电课程、考试和日程安排（含今天） | `days` (number, 默认 7) |
| `search_courses_and_exams` | 按课程名、考试名、地点或描述搜索杭电日程 | `keyword` (string) |

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ICS_URL` | ICS 订阅地址 | 无 |
| `CALENDAR_TIMEZONE` | 日历展示与日期范围计算时区 | `Asia/Shanghai` |
| `ICS_CACHE_TTL_MS` | ICS 拉取缓存时长（毫秒） | `14400000` |

## 使用示例

对 Claude 说：

- "今天有什么课？"
- "这周有哪些课程和考试？"
- "搜索高等数学相关的课程或考试"
