# 花见翻译

[![Build macOS](https://github.com/DR-lin-eng/hanami-translator/actions/workflows/build.yml/badge.svg)](https://github.com/DR-lin-eng/hanami-translator/actions/workflows/build.yml)

花见翻译是一个面向漫画、海报和图片文档的 macOS 批量翻译嵌字工具。应用不包含独立 OCR 或文本翻译流程，页面识别、翻译和嵌字由 OpenAI 图像编辑完成，支持 Images Edit API 和 Responses API 的绘图工具。

## 功能

- 导入图片、图片文件夹和 PDF，多页统一进入处理队列
- 通过 `gpt-image-2` `/v1/images/edits` 直接生成翻译后的成品图
- 可切换到 `/v1/responses`，强制调用 `image_generation` 工具编辑图片；主模型与图像模型分别配置
- 批处理支持 1-8 页并发，单页失败不会中断其他任务
- “处理当前页”每次点击直接创建独立请求，不受批处理并发数限制
- 可选文字编辑范围；框外像素在上传前移除，返回后从原图回填
- 隐私遮挡范围在上传前由本机移除，导出时从原图回填
- 文字与隐私范围支持拖动、八向缩放和方向键微调
- `gpt-image-2` 请求按原图比例选择明确画布尺寸，导出时使用归一化坐标对齐不同分辨率
- 文字框与隐私回填边缘使用局部泊松融合，隐私核心区域仍保持原图原始像素
- 支持导出单页 PNG、顺序 PNG 图集或按队列原始顺序合并的多页 PDF
- PNG 与 PDF 导出显示准备、逐页处理、写入和完成进度，PDF 最终整理阶段使用持续动画提示仍在工作
- API Key 保存在应用私有数据目录；API 地址、接口模式、Responses 主模型、图像模型和质量配置也会在本机自动恢复
- 处理期间可中断任务；已完成页面保留，未完成页面可继续重试
- API Key 不进入前端存储或项目文件；凭据文件使用当前用户专属的 `0600` 权限
- 明暗模式、键盘焦点、缩减动效和紧凑窗口布局

## 运行 Demo

从 GitHub Actions 的最新成功构建中下载 DMG，或按照下方步骤从源码运行。挂载 DMG 并打开应用后，在“API 与模型”中存入自己的 OpenAI API Key，即可处理内置演示页或导入素材。Actions 产物使用 ad-hoc 签名，未使用 Apple Developer ID 公证。

PDF 导入使用随应用编译的 PDFium，首次导入时会将内置渲染库解压到当前用户的缓存目录。运行时无需网络，也无需另行安装 Poppler 或 `pdftoppm`。

在“API 与模型”中选择 **Responses**，设置支持绘图工具的主模型（默认 `gpt-5`）和图像模型（默认 `gpt-image-2`）。图像模型放在工具的 `model` 参数，主模型放在 Responses 请求顶层。使用中转服务时，顶层模型填写服务支持的路由模型，应用按原值发送。文字隔离、隐私遮挡、局部回填、并发与中断对两种接口都有效。Responses 请求使用 `store: false`，不创建文件上传或依赖历史会话。中转服务须返回 `image_generation_call.result`，普通文本或未完成的工具调用会显示错误。“测试连接”只检查所选模型可访问，实际绘图能力以处理结果为准。

## 开发

环境要求：Node.js 20+、Rust 1.96（由 `rust-toolchain.toml` 固定）、macOS 13+、Apple Command Line Tools。

```bash
npm install
npm run tauri:dev
```

生产构建：

```bash
npm run tauri:build
```

本仓库当前机器的 Rust 工具链安装在项目内 `.cargo/` 和 `.rustup/`，两者已被忽略。若系统没有全局 Rust，可临时使用：

```bash
RUSTUP_HOME="$PWD/.rustup" CARGO_HOME="$PWD/.cargo" PATH="$PWD/.cargo/bin:$PATH" npm run tauri:build
```

## 验证

```bash
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm audit
```

GitHub Actions 会在推送到 `main`、创建 Pull Request 或手动触发时执行前端测试、Rust 测试和 macOS Tauri 构建，并保存 DMG 构建产物。依赖、编译缓存和本地安装包均不会提交到仓库。

真实 Images API 位置回归测试默认跳过。它会读取应用已保存的 Key，只上传测试页左上角的隔离对白框，并将结果写入系统临时目录：

```bash
HANAMI_LIVE_TEST_IMAGE="/absolute/path/to/page.webp" \
HANAMI_LIVE_TEST_API_BASE="https://api.openai.com/v1" \
cargo test --manifest-path src-tauri/Cargo.toml \
  openai::tests::live_text_region_edit_preserves_every_pixel_outside_the_region \
  -- --ignored --exact --nocapture
```

Responses 真实接口测试也默认跳过，只使用安全的内置演示页：

```bash
HANAMI_LIVE_TEST_IMAGE="$PWD/public/demo-manga.png" \
HANAMI_LIVE_TEST_API_BASE="https://api.openai.com/v1" \
HANAMI_LIVE_TEST_RESPONSES_MODEL="gpt-5" \
HANAMI_LIVE_TEST_OUTPUT="/private/tmp/hanami-responses-live" \
cargo test --manifest-path src-tauri/Cargo.toml \
  openai::tests::live_responses_demo_edit_returns_png \
  -- --ignored --exact --nocapture
```

## 文档

- [架构与数据流](docs/ARCHITECTURE.md)
- [Images / Responses API 契约](docs/OPENAI_IMAGES_CONTRACT.md)

OpenAI 图像编辑参考：[Image generation guide](https://developers.openai.com/api/docs/guides/image-generation#edit-images)。图像编辑 mask 是模型引导，并非像素级保证；花见翻译会在请求前直接移除文字框外及隐私框内像素，不依赖模型遵循 mask，并在本机导出时回填原图。

## 许可

本项目采用 [MIT License](LICENSE)，允许商业使用、修改、二次开发和再发布。复制或分发本软件及其重要组成部分时，必须保留原作者版权声明和 MIT 许可声明。

PDF 渲染使用 [PDFium](https://pdfium.googlesource.com/pdfium/)，其以 BSD 式许可证发布；Rust 绑定层 `pdfium-render` 与 `pdfium-bundled` 以 MIT 或 Apache-2.0 许可证发布。
