# ICS Calendar MCP Server

将杭电助手 ICS 日历订阅接入 Claude，查询每日课程、考试和其他事项。

## 快速开始

```bash
# 安装依赖
npm install

# 配置 ICS 订阅地址
cp .env.example .env
# 编辑 .env，填入你的 ICS URL

# 构建
npm run build
```

## 配置 MCP

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "ics-calendar": {
      "command": "node",
      "args": ["/absolute/path/to/hdu-ics-mcp-server/dist/index.js"],
      "env": {
        "ICS_URL": "https://api.hduhelp.com/calendar/schedule?staffId=你的学号"
      }
    }
  }
}
```

也可以不写 `env`，改用项目根目录的 `.env` 文件配置 `ICS_URL`。

### Cherry Studio

1. 打开 Cherry Studio，进入 **设置 → MCP 服务器**
2. 点击 **添加服务器**，填写以下信息：
   - **名称**: `ics-calendar`
   - **命令**: `node`
   - **参数**: `/absolute/path/to/hdu-ics-mcp-server/dist/index.js`
   - **环境变量**: 添加 `ICS_URL`，值为 `https://api.hduhelp.com/calendar/schedule?staffId=你的学号`
3. 保存后即可在对话中使用日历相关工具

## 可用工具

| 工具 | 说明 | 参数 |
|------|------|------|
| `get_today_events` | 获取今天的所有课程和考试 | 无 |
| `get_upcoming_events` | 获取未来 N 天的事件 | `days` (number, 默认 7) |
| `search_events` | 按关键词搜索事件 | `keyword` (string) |

## 使用示例

对 Claude 说：

- "今天有什么课？"
- "这周有什么安排？"
- "搜索高等数学相关的课程"
