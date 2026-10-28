# Updrama 音乐与配音

依据 https://up.lk888.ai/apidoc 文档实现的声明式协议：

- `updrama-suno-v6`：`suno-v6` 音乐和歌曲。prompt 描述风格，歌词放在 `providerOptions.updrama-suno-v6.lyrics`；其他选项为 `mv`、`make_instrumental`、`vocal_gender`。
- `updrama-gem-tts`：`gem-2.5-tts` 配音。默认 `model_version=pro`、`voice_id=Zephyr`；通过 `audioVoice` 或 `providerOptions.updrama-gem-tts.voice_id` 固定预置音色，不提供声音克隆。

两者均通过 `POST /v1/media/generate` 创建，再通过 `GET /v1/media/status?task_id=...` 轮询。任务状态读取 `state`；中文 `status` 仅用于显示。宿主提供渠道凭据并持久化音频结果。

将 `manifest.json` 放在 ZIP 根目录，命名为 `updrama-audio.yingce-plugin`，在插件中心安装后，为后端模型选择对应协议。目录可用和离线协议测试通过，不代表收费生成已经验收。
