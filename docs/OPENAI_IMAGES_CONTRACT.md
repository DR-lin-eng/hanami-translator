# OpenAI Images API 契约

## Endpoint

```text
POST {api_base}/images/edits
Content-Type: multipart/form-data
Authorization: Bearer <key from the app-private credential file>
```

表单字段：

| 字段 | 值 |
| --- | --- |
| `model` | 默认 `gpt-image-2` |
| `image[]` | 本地生成的 PNG 请求图 |
| `mask` | 可选，带 alpha 通道且与请求图同尺寸 |
| `prompt` | 页面类型、源语言、目标语言、保持项和用户附加要求 |
| `quality` | `low` / `medium` / `high` / `auto` |
| `size` | `gpt-image-2` 使用按原图比例计算并对齐到 16 像素的尺寸；旧模型使用受支持的横/竖/方形尺寸 |

响应读取 `data[0].b64_json`，解码验证后作为 PNG 数据返回前端。非 2xx 响应提取 `error.message` 和 `x-request-id`，显示在对应页面，不让整批任务失败。

## Prompt 原则

提示词要求模型在一个步骤中识别、翻译、清除原文并排版译文，同时明确保持分镜、气泡、插图、人物、颜色、纹理和所有非文字细节。用户附加要求作为补充约束，不改变系统生成的保持项。

## Mask 语义

透明区域允许编辑，不透明区域应保持。OpenAI 官方文档说明 mask 是提示性引导，不能保证严格遵守形状。因此：

- 文字编辑范围使用 API mask，提高局部编辑稳定性。
- 隐私遮挡不使用 API mask 作为保密措施，而是在请求前直接替换原始像素。
- 返回结果中的隐私区域不会被信任，导出时始终用本地原图回填。

## 密钥

密钥只在 Rust 进程内从应用数据目录的 `credentials/openai-api.key` 读取，用于构造 Authorization header。目录权限为 `0700`，文件权限为 `0600`；前端只能查询“是否已配置”，不能读取密钥内容。旧版 Keychain 项只用于一次性迁移，迁移完成后会删除。
