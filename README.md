# 魔镜 Online · 三国重临

《魔镜 Online》大陆后期三国版的浏览器重制。可在 Chrome 创建战士、盗贼、游侠、法师、祭司和商人，选择水月、风火、冥土，从遗迹之岛出发。角色和世界通过真实 WebSocket 同步，战斗、交易和存档由本地服务器处理。游戏内紫晶充值是模拟流程。

**当前为未完成的研发检查点。** 2026-11-11 整理公开交接，完整复刻目标仍暂停。现有人物、地图、动作及后期玩法均有差距；可运行不代表与原作一致。

## 接手与尝试上下文

- [项目现状与待办](docs/handoff/PROJECT_STATE.md)：实现范围、验证记录、已知问题和恢复研发边界。
- [技术路线与尝试历史](docs/handoff/ATTEMPT_HISTORY.md)：程序骨架、部件贴图、RO 参考、开源模型与特效、原资源调查、地图尺度和 Tripo 试样的取舍。
- [公开交接清单与截图](docs/handoff/PUBLICATION.md)：此次保存的内容、未纳入的本地资料及发布验证。
- [资源来源与许可边界](ASSET_NOTICE.md)：分别说明原作参考、生成资产、CC0 资源和第三方运行库；公开不代表全仓库统一使用开放许可。

![Tripo 战士在真实游戏内的静态试用](docs/handoff/images/tripo-game-trial.jpg)

上图为 2026-11-07 的 Chrome 实景。Tripo 模型可连续转向和随真实角色位置移动，但无骨骼、行走/攻击动画及独立装备部件。

## 在 Chrome 运行

需要 Node.js 24、npm 和支持 WebGL 的 Chrome。以下命令在项目根目录运行。

```sh
npm ci
npm run dev
```

在 Chrome 打开 [本地游戏](http://127.0.0.1:5273/)。开发页面监听 5273，游戏 API 和 WebSocket 监听 8877。退出开发服务时在启动终端按 Ctrl+C。Vite 热更新有时会回到选角界面，角色仍可重新进入。

[角色实验室](http://127.0.0.1:5273/model-lab.html)独立验证三维蒙皮、行走与转身，不代表主游戏已切换到该模型。打包后同样可从 `/model-lab.html` 打开。

Tripo 原作参考战士在 `/tripo-lab.html` 查看正侧背；游戏入口加 `?warrior3d=1`，或在设置中开启试样，仅适用于本地男性战士且未骑乘、无翅膀的状态。默认关闭，未增加任何付费生成任务。

可注册账户或直接创建访客角色。访客登录凭证存于当前 Chrome 站点的本地存储，要长期保留可登录的角色请先注册再创建。双人演练时用两个 Chrome 用户配置或普通窗口与无痕窗口，各建一名角色。分别走近遗迹之岛村长，确认能同时看见另一人并进行附近聊天。

| 操作 | 控制 |
| --- | --- |
| 走动、接任务、攻击 | 点击地面、NPC 或怪物。点击任务追踪可连续跨图前往当前目标；点击地面或按 Esc 取消。 |
| 选择、技能、拾取 | Tab 切换敌人，1–8 使用快捷技能，F 拾取，Z 切换自动战斗。 |
| 背包、地图、任务、聊天 | B 或 I 打开背包，M 打开地图，Q 打开任务，Enter 聚焦聊天。 |

要用固定打包版本，先停止本项目的开发进程，再运行以下命令。

```sh
npm run build
npm start
```

Chrome 改开 [本地打包游戏](http://127.0.0.1:8877/)。这两种模式默认使用同一 SQLite 存档，浏览器身份分别按端口保存。要换运行端口或存档，先看 [本地服务器维护](docs/operations/local-server.md)。

## 代码与验证

| 位置 | 职责 |
| --- | --- |
| `client/src/` | Vite、PixiJS 和 DOM HUD。场景渲染、输入和网络连接。 |
| `server/` | HTTP、WebSocket、权威世界、经济和 SQLite 存储。 |
| `shared/` | 内容数据、协议类型、地图布局和导航。 |
| `public/assets/` | 客户端实际使用的图像、音效和字体等静态资源。 |
| `tests/`、`scripts/load-test.ts` | 数据与导航验证、真实 HTTP/WebSocket 集成测试、独立负载基准。 |

```sh
npm run typecheck
npm test
npm run test:load -- 24 30
```

负载测试自起独立服务器并使用临时 SQLite。已验证范围见 [验证记录](docs/verification/progress.md)。[架构决策](docs/architecture/decisions.md)、[地图尺度](docs/research/map-scale.md) 和 [怪物与职业图证](docs/research/monster-fidelity.md) 分别记录实现边界、原版证据与重建参数。恢复研发后，地图、美术和后期玩法仍需逐项实机验证。
